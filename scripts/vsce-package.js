#!/usr/bin/env node
/* codemore-ignore-file: core-quality-leftover-console */

/**
 * vsce (2.24+) refuses to run when package.json has both a "files" array
 * and a .vscodeignore file present, since it can't tell which packaging
 * strategy is intended. This repo needs both: "files" is the npm-publish
 * allowlist for the CLI (see B1), .vscodeignore is the VSIX denylist
 * (see B2) — they ship different things (bin/** must be in the npm
 * tarball, must NOT be in the VSIX). This wrapper strips "files" only for
 * the duration of the vsce call and restores it afterward, success or fail.
 *
 * Usage: node scripts/vsce-package.js <package|publish> [...vsce args]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const pkgPath = path.join(__dirname, '..', 'package.json');
const original = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(original);

if (!('files' in pkg)) {
  console.error('scripts/vsce-package.js: no "files" field in package.json — nothing to strip, running vsce directly.');
}

delete pkg.files;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

let result;
try {
  result = spawnSync('npx', ['vsce', ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: true,
  });
} finally {
  fs.writeFileSync(pkgPath, original);
}

process.exit(result.status === null ? 1 : result.status);
