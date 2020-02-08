import * as path from 'path';
import * as fse from 'fs-extra';

import { runTests } from 'vscode-test';

const out = path.join(__dirname, '..');

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.join(__dirname, '../../');
    const extensionTestsPath = path.join(__dirname, '.');
    const testWorkspace = path.join(out, 'tmp', 'workspaceFolder');

    await fse.mkdirp(testWorkspace);

    console.log('Working directory has been created', testWorkspace);

    await runTests({
      version: process.env['VSCODE_VERSION'] === 'latest' ? undefined : process.env['VSCODE_VERSION'],
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testWorkspace, '--disable-extensions'],
      extensionTestsEnv: { C2_DEBUG: 'true' },
    });

    process.exit(0);
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(-1);
  }
}

main();
