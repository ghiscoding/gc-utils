#!/usr/bin/env node

import yargs from 'yargs/yargs';

import { startReleasing } from './index.mjs';

const cli = yargs(process.argv.slice(2));
const argv = cli
    .command('[option]', 'Run a release by bumping package version ')
    .option('create-release', {
        type: 'string',
        description: 'create an official GitHub',
    })
    .option('dry-run', {
        type: 'boolean',
        description: 'dry-run',
    })
    .option('build-script', {
        type: 'string',
        description: 'optional npm build script',
    })
    .option('npm-client', {
        type: 'string',
        description: 'npm client',
    })
    .help('help')
    .alias('help', 'h')
    .alias('version', 'v')
    .version('0.1.6')
    .parse();

// start the release
startReleasing(argv);
