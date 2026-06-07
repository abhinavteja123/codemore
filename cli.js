#!/usr/bin/env node
/**
 * CodeMore CLI launcher.
 *
 * Resolution strategy:
 *   1. If a compiled CLI bundle exists at daemon/dist/cli/index.js, use it.
 *      This is the path used after `npm run compile` and in published builds.
 *   2. Otherwise fall back to ts-node and run from source. This is the dev
 *      path; ts-node lives in devDependencies.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const compiled = path.resolve(__dirname, 'daemon', 'dist', 'cli', 'index.js');

async function run() {
  let mod;
  if (fs.existsSync(compiled)) {
    mod = require(compiled);
  } else {
    process.env.TS_NODE_PROJECT = path.resolve(__dirname, 'daemon', 'tsconfig.json');
    process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || '1';
    try {
      require('ts-node/register');
    } catch (err) {
      console.error(
        'codemore: no compiled CLI found and ts-node is not installed.\n' +
        '  Run `npm run compile` to build, or install ts-node for dev mode.',
      );
      process.exit(2);
    }
    mod = require(path.resolve(__dirname, 'daemon', 'cli', 'index.ts'));
  }

  if (typeof mod.main !== 'function') {
    console.error('codemore: CLI module is missing main(). Build may be stale.');
    process.exit(2);
  }
  const code = await mod.main(process.argv);
  process.exit(code);
}

run().catch((err) => {
  console.error('codemore: unexpected error');
  console.error(err && err.stack ? err.stack : err);
  process.exit(2);
});
