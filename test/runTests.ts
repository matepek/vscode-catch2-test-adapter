import * as path from 'path';
import * as fse from 'fs-extra';
import * as os from 'os';

import { runTests } from '@vscode/test-electron';

const extensionDevelopmentPath = path.join(__dirname, '../../');

function getMinimumSupportedVersion(): string {
  const packageJson = fse.readJSONSync(path.join(extensionDevelopmentPath, 'package.json'));
  const pVersion = packageJson['engines']['vscode'] as string;
  if (pVersion.startsWith('^')) return pVersion.substring(1);
  else return pVersion;
}

async function main(): Promise<void> {
  try {
    const out = path.join(__dirname, '..');
    const extensionTestsPath = path.join(__dirname, '.');
    const testWorkspace = path.join(out, 'tmp', 'workspaceFolder');

    await fse.mkdirp(testWorkspace);

    console.log('Working directory has been created', testWorkspace);

    const version =
      process.env['VSCODE_VERSION'] === 'minimum' ? getMinimumSupportedVersion() : process.env['VSCODE_VERSION'];

    /* To fix: 
      WARNING: IPC handle "/Users/runner/work/vscode-catch2-test-adapter/vscode-catch2-test-adapter/.vscode-test/user-data/1.12-main.sock" is longer than 103 chars, try a shorter --user-data-dir
      [main 2026-07-03T09:04:19.264Z] Error: listen EINVAL: invalid argument /Users/runner/work/vscode-catch2-test-adapter/vscode-catch2-test-adapter/.vscode-test/user-data/1.12-main.sock 
    */
    const userDataDir = path.join(os.tmpdir(), 'vsc-test-user');

    await runTests({
      version,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testWorkspace, '--disable-extensions', `--user-data-dir=${userDataDir}`],
      extensionTestsEnv: { TESTMATE_DEBUG: 'true' },
    });

    process.exit(0);
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(-1);
  }
}

main();
