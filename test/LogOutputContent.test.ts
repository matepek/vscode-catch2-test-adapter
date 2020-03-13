import * as assert from 'assert';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';
import { settings, globalExpectedLoggedErrorLine } from './Common';

///

const aggregatedLogFilePath = path.join(settings.workspaceFolderUri.fsPath, 'alltestlogs.txt');
const failedTestLogDir = path.join(settings.workspaceFolderUri.fsPath, 'FailedTestLogs');

let counter = 1;
let currentLogfilePath: string;

///

// this is "global". it will run before every test
before(function() {
  fse.removeSync(aggregatedLogFilePath);
  fse.removeSync(failedTestLogDir);
  fse.mkdirSync(failedTestLogDir);
});

beforeEach(function() {
  globalExpectedLoggedErrorLine.clear();
  currentLogfilePath = path.join(failedTestLogDir, 'log_' + counter++ + '.txt');

  const w = fse.createWriteStream(currentLogfilePath, { flags: 'w' });
  const title = this.currentTest ? this.currentTest.titlePath().join(': ') : '<unknown>';
  w.write('\n' + '#'.repeat(title.length + 6) + '\n## ' + title + ' ##\n' + '#'.repeat(title.length + 6) + '\n');

  return settings.updateConfig('logfile', currentLogfilePath);
});

afterEach(async function() {
  this.timeout(2000);

  // function(){
  //   // append the aggregated log file
  //   const r = fse.createReadStream(currentLogfilePath);
  //   const w = fse.createWriteStream(aggregatedLogFilePath, { flags: 'a' });
  //   r.pipe(w);
  //   await new Promise<void>(resolve => w.on('close', resolve));
  // }();

  assert.notStrictEqual(this.currentTest, undefined);
  const currentTest = this.currentTest!;
  const title = currentTest.titlePath().join(' -> ');

  if (currentTest.state === 'passed') {
    const inputLineStream = readline.createInterface(fse.createReadStream(currentLogfilePath));

    const exceptions: Error[] = [];

    inputLineStream.on('line', (line: string) => {
      try {
        const index = line.indexOf('[ERROR]');
        if (index != -1) {
          const error = line
            .substr(index)
            .split(']')
            .filter((v, i) => i !== 1)
            .join(']');
          assert.notStrictEqual(globalExpectedLoggedErrorLine, undefined, title + ': ' + error);
          assert.ok(globalExpectedLoggedErrorLine.has(error), title + ': ' + error);
        } else if (line.substr(26, 6) === '[WARN]') {
          // we could test this once
        }
      } catch (e) {
        exceptions.push(e);
      }
    });

    await new Promise<void>(resolve => inputLineStream.on('close', resolve));
    assert.deepStrictEqual(exceptions, []);
  }

  // removing passed or skipped test logs
  if (this.currentTest && this.currentTest.state !== 'failed') {
    fse.removeSync(currentLogfilePath);
  }
});
