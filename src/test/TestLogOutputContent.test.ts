//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';
import { settings } from './TestCommon';

///

const aggregatedLogFilePath = path.join(settings.workspaceFolderUri.fsPath, 'alltestlogs.txt');
const failedTestLogDir = path.join(settings.workspaceFolderUri.fsPath, 'FailedTestLogs');
let counter = 1;
let currentLogfilePath: string;

// this "global" before. it will run before all tests
before(function() {
  fse.removeSync(aggregatedLogFilePath);
  fse.removeSync(failedTestLogDir);
  fse.mkdirSync(failedTestLogDir);
});

beforeEach(function() {
  currentLogfilePath = path.join(failedTestLogDir, 'log_' + counter++ + '.txt');

  const w = fse.createWriteStream(currentLogfilePath, { flags: 'w' });
  let title = this.currentTest ? this.currentTest.titlePath().join(': ') : '<unknown>';
  w.write('\n' + '#'.repeat(title.length + 6) + '\n## ' + title + ' ##\n' + '#'.repeat(title.length + 6) + '\n');

  return settings.updateConfig('logfile', currentLogfilePath);
});

afterEach(async function() {
  this.timeout(2000);
  {
    // append the aggregated log file
    const r = fse.createReadStream(currentLogfilePath);
    const w = fse.createWriteStream(aggregatedLogFilePath, { flags: 'a' });
    r.pipe(w);

    await new Promise<void>(resolve => w.on('close', resolve));
  }

  // remove passed or skipped test logs
  if (this.currentTest && this.currentTest.state !== 'failed') {
    fse.removeSync(currentLogfilePath);
  }
});

after(async function() {
  this.timeout(2000);

  let warningCount = 0;
  const errorLines: string[] = [];

  {
    const inputStream = fse.createReadStream(aggregatedLogFilePath);
    const inputLineStream = readline.createInterface(inputStream);

    inputLineStream.on('line', (line: string) => {
      const index = line.indexOf('[ERROR]');
      if (index != -1) {
        errorLines.push(line.substr(index));
      } else if (line.substr(26, 6) === '[WARN]') {
        ++warningCount;
      }
    });

    await new Promise<void>(resolve => inputLineStream.on('close', resolve));
  }

  if (errorLines.length >= 3) {
    // so the deal is that we dont expect more errors than these
    assert.deepStrictEqual(
      errorLines,
      [
        // test: 'should run with not existing test id'
        "[ERROR] Some tests have remained:  Set { 'not existing id' }",
        // test: 'should run with not existing test id'
        "[ERROR] Some tests have remained:  Set { 'not existing id' }",
        // test: 'should be debugged'
        '[ERROR] Failed starting the debug session - aborting. Maybe something wrong with "catch2TestExplorer.debugConfigTemplate"; 1; undefined',
      ],
      warningCount.toString(),
    );
  }
});
