#!/usr/bin/env node
/**
 * CodeMore CLI launcher.
 *
 * Resolution order (first match wins):
 *   1. lib/daemon/cli/index.js      — produced by `tsc -p tsconfig.publish.json`.
 *                                     This is the path shipped to npm.
 *   2. daemon/dist/cli/index.js     — produced by `npm run compile` (webpack).
 *                                     Used by the VS Code extension dev loop.
 *   3. ts-node + daemon/cli/index.ts — dev fallback. Requires ts-node, which
 *                                     lives in devDependencies of THIS repo
 *                                     but is NOT a runtime dep of the npm pkg.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const candidates = [
  path.resolve(__dirname, 'lib', 'daemon', 'cli', 'index.js'),
  path.resolve(__dirname, 'daemon', 'dist', 'cli', 'index.js'),
];

async function run() {
  let mod;
  const compiled = candidates.find((p) => fs.existsSync(p));

  if (compiled) {
    mod = require(compiled);
  } else {
    process.env.TS_NODE_PROJECT = path.resolve(__dirname, 'daemon', 'tsconfig.json');
    process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || '1';
    try {
      require('ts-node/register');
    } catch (err) {
      console.error(
        'codemore: no compiled CLI found and ts-node is not installed.\n' +
        '  Run `npm run build:publish` to build (or `npm run compile` for the dev bundle),\n' +
        '  or install ts-node for dev mode.',
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
