#!/usr/bin/env node

import { startReleasing } from './index.mjs';
import { parseArgs } from './parse-args.mjs';

const options = {
  createRelease: {
    type: 'string',
    description: 'create an official GitHub',
  },
  dryRun: {
    type: 'boolean',
    description: 'dry-run',
  },
  buildScript: {
    type: 'string',
    description: 'optional npm build script',
  },
  npmClient: {
    type: 'string',
    description: 'npm client',
  },
  skipChecks: {
    type: 'boolean',
    description: 'skip git checks',
  },
};

const argv = parseArgs(options);

// start the release
startReleasing(argv);
