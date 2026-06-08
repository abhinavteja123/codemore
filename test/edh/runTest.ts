/**
 * Extension Development Host smoke runner.
 *
 * Downloads a known-good VS Code build (cached in .vscode-test/) and
 * launches it with our extension loaded, pointed at the synthetic
 * `realistic-vibe-app` so we can assert end-to-end that the extension
 * → daemon → registry pipeline produces the same 12-issue output we
 * see from the CLI.
 *
 * Not part of `npm run test:unit`; invoked via `npm run test:edh`.
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { runTests } from '@vscode/test-electron';

/**
 * Resolve a Windows path to its 8.3 short-name form. Required when the
 * path contains a space (e.g. "ABHINAV TEJA") — vscode-test-electron
 * passes paths through Code.exe's CLI parser, which splits args on
 * whitespace and crashes ("Cannot find module 'c:\\Users\\ABHINAV'").
 *
 * The short-name form ("c:\\USERSE~1\\ABHINAV~1\\...") contains no
 * spaces and is interchangeable for filesystem access on NTFS.
 */
function shortPath(p: string): string {
  try {
    const out = execSync(`cmd /c for %A in ("${p}") do @echo %~sA`, { encoding: 'utf8' });
    return out.trim();
  } catch {
    return p;
  }
}

async function main() {
  try {
    // VS Code's CLI parser splits paths at the first space, so any path
    // containing the "ABHINAV TEJA" username breaks the extension-test
    // launch. Prefer a space-free junction (default "C:\\codemore") and
    // fall back to 8.3 short-name (only works if the volume supports it).
    const envRoot     = process.env.CODEMORE_EDH_ROOT;
    const realRoot    = path.resolve(__dirname, '..', '..');
    const junction    = 'C:\\codemore';
    const repoRootForVsCode =
      envRoot && fs.existsSync(envRoot)         ? envRoot :
      fs.existsSync(junction)                   ? junction :
      shortPath(realRoot);

    const extensionDevelopmentPath = repoRootForVsCode;
    const extensionTestsPath        = path.join(repoRootForVsCode, 'out', 'test', 'edh', 'suite', 'index');

    const workspaceFolder = process.env.CODEMORE_EDH_WORKSPACE
      ?? 'C:/tmp/realistic-vibe-app';

    // On this Windows machine, USERPROFILE = "C:\Users\ABHINAV TEJA".
    // Electron / Chromium's internal path joins truncate at the space,
    // so when VS Code (under Chromium) computes cache / network-state
    // paths from USERPROFILE, it ends up trying to mkdir "C:\Users\ABHINAV"
    // and dies with EPERM. Even passing `--user-data-dir` doesn't help
    // because Chromium's network sandbox uses USERPROFILE directly.
    //
    // Fix: redirect the relevant env vars to a space-free path before
    // forking Code.exe. Also pin `--user-data-dir` / `--extensions-dir`
    // for VS Code's own state.
    const sandboxHome   = 'C:\\tmp\\codemore-edh';
    const userDataDir   = path.join(sandboxHome, 'user-data');
    const extensionsDir = path.join(sandboxHome, 'extensions');
    fs.mkdirSync(userDataDir,   { recursive: true });
    fs.mkdirSync(extensionsDir, { recursive: true });
    fs.mkdirSync(path.join(sandboxHome, 'Network'), { recursive: true });
    fs.mkdirSync(path.join(sandboxHome, 'Code Cache'), { recursive: true });

    // Mutate THIS process's env before runTests forks Code.exe — the
    // child inherits the parent's env. (runTests' own extensionTestsEnv
    // option only reaches the EDH worker, not the parent Code.exe.)
    process.env.USERPROFILE  = sandboxHome;
    process.env.HOME         = sandboxHome;
    process.env.APPDATA      = path.join(sandboxHome, 'AppData', 'Roaming');
    process.env.LOCALAPPDATA = path.join(sandboxHome, 'AppData', 'Local');
    process.env.TEMP         = path.join(sandboxHome, 'Temp');
    process.env.TMP          = path.join(sandboxHome, 'Temp');
    fs.mkdirSync(process.env.APPDATA!,      { recursive: true });
    fs.mkdirSync(process.env.LOCALAPPDATA!, { recursive: true });
    fs.mkdirSync(process.env.TEMP!,         { recursive: true });

    const sandboxEnv = {
      ...process.env,
      CODEMORE_EDH: '1',
      CODEMORE_EDH_WORKSPACE: workspaceFolder,
      NODE_ENV: 'production',
    };

    const code = await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspaceFolder,
        '--user-data-dir',  userDataDir,
        '--extensions-dir', extensionsDir,
        '--disable-extensions',
        '--disable-workspace-trust',
        '--disable-gpu',
        '--no-sandbox',
      ],
      extensionTestsEnv: sandboxEnv,
    });

    process.exit(code);
  } catch (err) {
    console.error('EDH smoke test failed to run:', err);
    process.exit(1);
  }
}

main();
