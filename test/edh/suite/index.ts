/**
 * Mocha runner inside the Extension Development Host.
 *
 * VS Code's test runner imports this module from the launched Extension
 * Host process; we configure Mocha here and load every *.test.ts under
 * this directory.
 */

import * as path from 'path';
import Mocha from 'mocha';
import * as fs from 'fs';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 120_000,             // EDH startup + daemon spawn is slow
    reporter: 'spec',
  });

  const testsRoot = __dirname;

  return new Promise((resolve, reject) => {
    try {
      for (const file of walk(testsRoot)) {
        if (file.endsWith('.test.js')) {
          mocha.addFile(file);
        }
      }
      mocha.run(failures => {
        if (failures > 0) reject(new Error(`${failures} EDH smoke test(s) failed`));
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

function* walk(dir: string): Generator<string> {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}
