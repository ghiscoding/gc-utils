import { readJsonSync, writeJsonSync } from '@gc-utils/fs-extra';
import { copyFileSync, renameSync, rmSync } from 'node:fs';
import { join as pJoin, resolve as pResolve } from 'node:path';
import readline from 'node:readline';
import { styleText } from 'node:util';
import semver from 'semver';

import { updateChangelog } from './changelog.mjs';
import { execAsyncPiped, spawnStreaming } from './child-process.mjs';
import { createRelease, createReleaseClient, parseGitRepo } from './github-release.mjs';
import { gitAdd, gitCommit, gitTag, gitTagPushRemote, gitPushToCurrentBranch, hasUncommittedChanges } from './git-utils.mjs';
import { publishPackage, syncLockFile } from './npm-utils.mjs';

const PUBLISH_CLEAN_FIELDS = ['devDependencies', 'scripts'];
const TAG_PREFIX = '';
// const VERSION_PREFIX = 'v';
const RELEASE_COMMIT_MSG = 'chore(release): publish version %s';

const cwd = process.cwd();
const projectRootPath = process.cwd();
const pkg = readJsonSync(pJoin(projectRootPath, 'package.json'));

/**
 * Use semver to increment the version given a bump type
 * @param {String} bump
 * @returns {String}
 */
function bumpVersion(bump) {
  const isPreReleased = bump.startsWith('pre');
  const oldVersion = pkg.version;

  if (isPreReleased) {
    if (bump.includes('.alpha') || bump.includes('.beta')) {
      const [semverBump, preReleaseType] = bump.split('.');
      // const [oldSemVersion] = oldVersion.match(/^(\d\.\d\.\d)(\-)?((alpha|beta|next)\.\d)?$/) || [];

      if (
        (preReleaseType === 'alpha' && oldVersion.includes('alpha.')) ||
        (preReleaseType === 'beta' && oldVersion.includes('beta.')) ||
        (preReleaseType === 'beta' && oldVersion.includes('alpha.'))
      ) {
        return semver.inc(oldVersion, 'prerelease', preReleaseType);
      }
      return semver.inc(oldVersion, semverBump, true, preReleaseType);
    } else {
      return semver.inc(oldVersion, bump, true, 'alpha');
    }
  }
  return semver.inc(oldVersion, bump);
}

/**
 * Update version property into "package.json"
 * @param {String} newVersion
 */
function updatePackageVersion(newVersion, dryRun) {
  pkg.version = newVersion;

  if (dryRun) {
    console.log(styleText('magenta', '[dry-run]'));
  }
  writeJsonSync(pResolve(projectRootPath, 'package.json'), pkg, { spaces: 2 });

  console.log('-- updating "package.json" --');
  console.log(` "version": "${pkg.version}"`);
  console.log('---------------------------\n');
}

/**
 * Get console input using the 'readLine' lib
 * @param {String} promptText - prompt question message
 * @returns {Promise<String>} - the entered input
 */
function getConsoleInput(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(promptText, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

/**
 * Simple function to select an item from a passed list of choices
 * @param {String} message - prompt question message
 * @param {Array<String>} [choices] - prompt list of choices, defaults to Yes/No
 * @param {Number} [defaultIndex]
 * @returns {Promise<String>} - value property of selected choice
 * @returns
 */
async function promptConfirmation(message, choices, defaultIndex) {
  if (!choices) {
    choices = [
      { key: 'y', name: 'Yes', value: true },
      { key: 'n', name: 'No', value: false },
    ];
    if (defaultIndex === undefined) {
      defaultIndex = 0;
    }
  }

  // display propmpt message and choices
  console.log(message.trim());
  for (var i = 0; i < choices.length; i++) {
    console.log(' ' + (i + 1) + ' - ' + choices[i].name);
  }

  // get and process input
  const input = await getConsoleInput(`Enter value (default ${defaultIndex + 1}): `);
  var index = !isNaN(input) && !isNaN(parseFloat(input)) ? +input - 1 : defaultIndex;
  if (index < 0 || index >= choices.length) {
    throw Error(`The input ${input} could not be matched to a selection`);
  }
  return choices[index].value;
}

async function promptOtp(dryRunPrefix = '') {
  const otp = await getConsoleInput(
    `${styleText('bgMagenta', dryRunPrefix)} If you have an OTP (One-Time-Password), type it now or press "Enter" to continue: \n`
  );
  if (!otp) {
    console.log('No OTP provided, continuing to next step...');
  } else if (otp.length > 0 && otp.length < 6) {
    throw new Error('OTP must be exactly 6 digits.');
  }
  return otp;
}

/** Method that will create a backup copy of the original "package.json", remove some fields (devDependencies, scripts) */
async function cleanPublishPackage() {
  console.log(`Make a copy of "package.json" and rename it to "package.json.backup".`);
  copyFileSync(pJoin(projectRootPath, 'package.json'), pJoin(projectRootPath, 'package.json.backup'));

  // remove (devDependencies & scripts) fields from "package.json"
  for (let field of PUBLISH_CLEAN_FIELDS) {
    await execAsyncPiped('npm', ['pkg', 'delete', field]);
  }
}

/**
 * Main entry, this script will execute the following steps
 * 1. Ask for version bump type
 * 2. Delete (empty) dist folder
 * 3. Bump version in "package.json"
 * 4. Run a prod build npm script when provided
 * 5. Create/Update changelog.md
 * 6. Update (sync) npm lock file with new version
 * 7. Add all changed files to Git ("package.json", "CHANGELOG.md" and all minified files)
 * 8. Create git tag of the new release
 * 9. Commit all files changed to git
 * 10. Push git tags and all commits to origin
 * 11. NPM publish
 * 12. Create GitHub Release
 */
export async function startReleasing(options) {
  let dryRunPrefix = options.dryRun ? '[dry-run]' : '';
  let newTag;
  if (options.dryRun) {
    console.info(`-- ${styleText('bgMagenta', 'DRY-RUN')} mode --`);
  }

  // check if it has any uncommited changes (or skipped in dry-run mode)
  await hasUncommittedChanges(options);

  const repo = await parseGitRepo();
  console.log(`🚀 Let's create a new release for "${repo.owner}/${repo.name}" (currently at ${pkg.version})\n`);

  // 1. choose bump type
  const bumpTypes = [
    { bump: 'patch', desc: ' - Bug Fixes' },
    { bump: 'minor', desc: ' - Features & Fixes' },
    { bump: 'major', desc: ' - Breaking Change' },
    { bump: 'preminor.alpha', desc: '' },
    { bump: 'preminor.beta', desc: '' },
    { bump: 'premajor.alpha', desc: '' },
    { bump: 'premajor.beta', desc: '' },
  ];
  const versionIncrements = [];
  for (const bumpType of bumpTypes) {
    versionIncrements.push({
      key: bumpType.bump,
      name: `${bumpType.bump} (${styleText(['bold', 'magenta'], bumpVersion(bumpType.bump, false))}) ${bumpType.desc}`,
      value: bumpType.bump,
    });
  }
  versionIncrements.push({ key: 'o', name: 'Other, please specify...', value: 'other' }, { key: 'q', name: 'QUIT', value: 'quit' });

  const defaultIdx = versionIncrements.length - 1;
  const whichBumpType = await promptConfirmation(
    `${styleText('bgMagenta', dryRunPrefix)} Select increment to apply (next version)`,
    versionIncrements,
    defaultIdx
  );

  if (whichBumpType !== 'quit') {
    let newVersion = '';
    if (whichBumpType === 'other') {
      newVersion = await getConsoleInput('Please enter a valid version number (or type "q" to quit):');
      if (newVersion === 'q') {
        return;
      }
    } else {
      newVersion = bumpVersion(whichBumpType, false);
    }

    newTag = `${TAG_PREFIX}${newVersion}`;
    console.log(`${styleText('bgMagenta', dryRunPrefix)} Bumping new version to "${newTag}"`);

    console.log('Disable Husky');
    execAsyncPiped('HUSKY=0');

    // 2. delete (empty) dist folder
    console.log('Emptying dist folder');
    rmSync('dist', { recursive: true, force: true });

    // 3. update package.json with new version
    await updatePackageVersion(newVersion);

    // 4. run a prod build
    if (options.buildScript) {
      console.log('Run Prod Build');
      await spawnStreaming(options.npmClient || 'npm', ['run', options.buildScript], { cwd: projectRootPath });
    }

    // 5. Create/Update changelog.md
    console.log('Updating Changelog');
    const { newEntry: newChangelogEntry } = await updateChangelog({
      infile: './CHANGELOG.md',
      tagPrefix: TAG_PREFIX,
    }, newVersion);

    // 6. Update (sync) npm lock file
    await syncLockFile({ cwd, dryRun: options.dryRun, npmClient: options.npmClient });

    // 7. "git add ." all changed files
    await gitAdd(null, { cwd, dryRun: options.dryRun });

    // show git changes to user so he can confirm the changes are ok
    const shouldCommitChanges = await promptConfirmation(
      `${styleText('bgMagenta', dryRunPrefix)} Ready to release a version "${newTag}" and push commits to remote? Choose No to cancel.`
    );
    if (shouldCommitChanges) {
      // 8. create git tag of new release
      await gitTag(newTag, { cwd, dryRun: options.dryRun });

      // 9. Commit all files changed to git
      await gitCommit(RELEASE_COMMIT_MSG.replace(/%s/g, newVersion), { cwd, dryRun: options.dryRun });

      // 10. Push git tags and all commits to origin
      await gitTagPushRemote(newTag, 'origin', { cwd, dryRun: options.dryRun });
      await gitPushToCurrentBranch('origin', { cwd, dryRun: options.dryRun });

      // 11. NPM publish
      if (await promptConfirmation(`${styleText('bgMagenta', dryRunPrefix)} Are you ready to publish "${newTag}" to npm?`)) {
        // create a copy of "package.json" to "package.json.backup" and remove (devDependencies, scripts) from "package.json"
        await cleanPublishPackage();

        // add publish --tag when version is alpha/beta
        let publishTagName;
        if (whichBumpType.includes('alpha')) {
          publishTagName = 'alpha';
        } else if (whichBumpType.includes('beta')) {
          publishTagName = 'beta';
        }

        const otp = await promptOtp(dryRunPrefix);
        await publishPackage(publishTagName, {
          cwd,
          otp,
          dryRun: !!options.dryRun,
          npmClient: options.npmClient,
          provenance: !!options.provenance,
          stream: true
        });

        // rename backup to original filename "package.json"
        console.log(`Renaming "package.json" backup file to its original name.`);
        renameSync(pJoin(projectRootPath, 'package.json.backup'), pJoin(projectRootPath, 'package.json'));

        console.log(`${styleText('bgMagenta', dryRunPrefix)} 📦 Published to NPM - 🔗 https://www.npmjs.com/package/${pkg.name}`.trim());
      }

      // 12. Create GitHub Release
      if (options.createRelease) {
        const releaseNote = { name: pkg.name, notes: newChangelogEntry };
        const releaseClient = createReleaseClient(options.createRelease);
        await createRelease(
          releaseClient,
          { tag: newTag, releaseNote },
          { gitRemote: 'origin', execOpts: { cwd } },
          options.dryRun
        );
      }

      // 13. Git sync/push all changes
      await gitPushToCurrentBranch('origin', { cwd, dryRun: options.dryRun });

      // END
      console.log(`🏁 Done (in ${Math.floor(process.uptime())}s.)`);
    }
  }
  process.exit();
}