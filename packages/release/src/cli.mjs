#!/usr/bin/env node

import { startReleasing } from './index.mjs';
import { parseArgs } from './parse-args.mjs';

const options = {
  createRelease: {
    type: 'string',
    description: 'create an official GitHub release',
  },
  dryRun: {
    type: 'boolean',
    description: 'test the release process without making any changes or publishing any packages',
  },
  buildScript: {
    type: 'string',
    description: 'optional npm build script',
  },
  npmClient: {
    type: 'string',
    description: 'npm client currently used (npm, yarn, pnpm)',
    default: 'npm',
  },
  provenance: {
    type: 'boolean',
    description: 'generate provenance statements for the packages you publish'
  },
  skipChecks: {
    type: 'boolean',
    description: 'skip git checks like uncommitted changes, etc.',
  },
};

const argv = parseArgs(options);

// start the release
startReleasing(argv);
