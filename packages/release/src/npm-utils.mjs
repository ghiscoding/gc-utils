import { execAsyncPiped, logExecDryRunCommand, spawnStreaming } from './child-process.mjs';

/**
 * Run `npm publish`
 * @param {String} [publishTagName] - optional publish tag (alpha, beta, ...)
 * @param {{ cwd: String, dryRun: Boolean}} options
 * @returns {Promise<any>}
 */
export function publishPackage(publishTagName, { cwd, otp, dryRun, provenance, stream, npmClient = 'npm' }) {
  const execArgs = ['publish'];
  if (publishTagName) {
    execArgs.push('--tag', publishTagName);
  }
  if (otp) {
    execArgs.push('--otp', otp);
  }
  if (dryRun) {
    execArgs.push('--dry-run');
  }
  if (provenance) {
    execArgs.push('--provenance');
  }

  if (npmClient === 'pnpm') {
    // pnpm will not allow you to make a publish if you have changes in the repository
    execArgs.push('--no-git-checks');
  }

  // in dry-run mode, we are still executing the actual command, but let's log it as well to the console
  if (dryRun) {
    logExecDryRunCommand(npmClient, execArgs);
  }

  if (stream) {
    return spawnStreaming(npmClient, execArgs, { cwd });
  }
  return execAsyncPiped(npmClient, execArgs, { cwd });
}

/**
 * @param {{ cwd: String, dryRun: Boolean}} options
 * @returns {Promise<any>}
 */
export function syncLockFile({ cwd, dryRun, npmClient = 'npm' }) {
  if (npmClient === 'pnpm') {
    return execAsyncPiped('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], { cwd }, dryRun);
  }
  return execAsyncPiped('npm', ['install', '--package-lock-only', '--legacy-peer-deps'], { cwd }, dryRun);
}