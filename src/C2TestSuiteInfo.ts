//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import * as path from 'path';
import * as fsx from 'fs-extra';
import { promisify, inspect } from 'util';
import { TestEvent, TestSuiteInfo } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';

import { C2AllTestSuiteInfo } from './C2AllTestSuiteInfo';
import { Catch2TestInfo, GoogleTestInfo, TestInfoBase } from './C2TestInfo';
import * as c2fs from './FsWrapper';
import { generateUniqueId } from './IdGenerator';
import { TaskPool } from './TaskPool';

export abstract class TestSuiteInfoBase implements TestSuiteInfo {
  readonly type: 'suite' = 'suite';
  readonly id: string;
  label: string;
  children: TestInfoBase[] = [];
  file?: string;
  line?: number;

  private _isKill: boolean = false;
  private _proc: ChildProcess | undefined = undefined;

  constructor(
    public readonly origLabel: string,
    public readonly allTests: C2AllTestSuiteInfo,
    public readonly execPath: string,
    public readonly execOptions: SpawnOptions) {
    this.label = origLabel;
    this.id = generateUniqueId();
  }

  static determineTestType(execPath: string):
    Promise<{ type: 'catch2' | 'google' | undefined; version: [number, number, number]; }> {
    return c2fs.spawnAsync(execPath, ['--help'])
      .then((res): any => {
        const catch2 = res.stdout.match(/Catch v([0-9]+)\.([0-9]+)\.([0-9]+)\s?/);
        if (catch2 && catch2.length == 4) {
          return { type: 'catch2', version: [Number(catch2[1]), Number(catch2[2]), Number(catch2[3])] };
        }
        const google = res.stdout.match(/This program contains tests written using Google Test./);
        if (google) {
          return { type: 'google', version: [0, 0, 0] };
        }
        return { type: undefined, version: [0, 0, 0] };
      }).catch(() => { return { type: undefined, version: [0, 0, 0] }; });
  }

  static create(origLabel: string,
    allTests: C2AllTestSuiteInfo,
    execPath: string,
    execOptions: SpawnOptions): Promise<TestSuiteInfoBase> {
    return this.determineTestType(execPath).then((result) => {
      if (result.type === 'google')
        return new GoogleTestSuiteInfo(origLabel, allTests, execPath, execOptions);
      else if (result.type === 'catch2')
        return new Catch2TestSuiteInfo(origLabel, allTests, execPath, execOptions,
          [result.version[0], result.version[1], result.version[2]]);
      else
        throw Error('createTestSuiteInfo: ' + path + ': not test executable.');
    });
  }

  cancel(): void {
    this.allTests.log.info(
      'canceled: ' + inspect([this.id, this.label, this._proc != undefined]));

    this._isKill = true;

    if (this._proc != undefined) {
      this._proc.kill();
      this._proc = undefined;
    }
  }

  abstract reloadChildren(): Promise<void>;

  run(tests: Set<string>, taskPool: TaskPool): Promise<void> {
    this._isKill = false;
    this._proc = undefined;

    let childrenToRun: 'all' | TestInfoBase[] = 'all';

    if (tests.delete(this.id)) {
      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        tests.delete(c.id);
      }
    } else {
      childrenToRun = [];

      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        if (tests.delete(c.id)) childrenToRun.push(c);
      }

      if (childrenToRun.length == 0) return Promise.resolve();
    }

    return this._runInner(childrenToRun, taskPool);
  }

  protected abstract _getExecParams(childrenToRun: TestInfoBase[] | 'all'): string[];

  private _runInner(childrenToRun: TestInfoBase[] | 'all', taskPool: TaskPool):
    Promise<void> {
    if (this._isKill) return Promise.reject(Error('Test was killed.'));

    if (!taskPool.acquire()) {
      return new Promise<void>(resolve => setTimeout(resolve, 64)).then(() => {
        return this._runInner(childrenToRun, taskPool);
      });
    }

    this.allTests.testStatesEmitter.fire(
      { type: 'suite', suite: this, state: 'running' });

    if (childrenToRun === 'all') {
      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        if (c.skipped) {
          this.allTests.testStatesEmitter.fire(c.getStartEvent());
          this.allTests.testStatesEmitter.fire(c.getSkippedEvent());
        }
      }
    }

    const execParams = this._getExecParams(childrenToRun);

    this._proc = spawn(this.execPath, execParams, this.execOptions);
    let process: ChildProcess | undefined = this._proc;

    this.allTests.log.info('proc started: ' + inspect([this.execPath, execParams]));

    const startTime = Date.now();
    const killIfTimout = (): Promise<void> => {
      if (process === undefined) { return Promise.resolve(); }
      else if (this.allTests.execRunningTimeout !== null
        && Date.now() - startTime > this.allTests.execRunningTimeout) {
        process.kill();
        return Promise.resolve();
      } else {
        return promisify(setTimeout)(1000).then(killIfTimout);
      }
    };
    promisify(setTimeout)(1000).then(killIfTimout);

    return this._handleProcess(process, childrenToRun)
      .catch((reason: any) => {
        this.allTests.log.error(inspect(reason));
      })
      .then(() => {
        this.allTests.log.info('proc finished: ' + inspect(this.execPath));
        this.allTests.testStatesEmitter.fire({ type: 'suite', suite: this, state: 'completed' });

        taskPool.release();
        this._proc = undefined;
        process = undefined;
      });
  }

  protected abstract _handleProcess(process: ChildProcess, childrenToRun: TestInfoBase[] | 'all'): Promise<void>;

  protected _sendTestStateEventsWithParent(events: TestEvent[]) {
    this.allTests.sendTestSuiteStateEventsWithParent([
      { type: 'suite', suite: this, state: 'running' },
      ...events,
      { type: 'suite', suite: this, state: 'completed' },
    ]);
  }

  protected _findFilePath(matchedPath: string): string {
    let filePath = matchedPath;
    try {
      filePath = path.join(this.allTests.workspaceFolder.uri.fsPath, matchedPath);
      if (!c2fs.existsSync(filePath) && this.execOptions.cwd) {
        filePath = path.join(this.execOptions.cwd, matchedPath);
      }
      if (!c2fs.existsSync(filePath)) {
        let parent = path.dirname(this.execPath);
        filePath = path.join(parent, matchedPath);
        let parentParent = path.dirname(parent);
        while (!c2fs.existsSync(filePath) && parent != parentParent) {
          parent = parentParent;
          filePath = path.join(parent, matchedPath);
          parentParent = path.dirname(parent);
        }
      }
      if (!c2fs.existsSync(filePath)) {
        filePath = matchedPath;
      }
    } catch (e) {
      filePath = path.resolve(this.allTests.workspaceFolder.uri.fsPath, matchedPath);
    }
    return filePath;
  }
}

export class Catch2TestSuiteInfo extends TestSuiteInfoBase {
  children: Catch2TestInfo[] = [];
  ;

  constructor(
    public readonly origLabel: string,
    public readonly allTests: C2AllTestSuiteInfo,
    public readonly execPath: string,
    public readonly execOptions: SpawnOptions,
    public catch2Version: [number, number, number] | undefined) {
    super(origLabel, allTests, execPath, execOptions);
  }

  reloadChildren(): Promise<void> {
    return TestSuiteInfoBase.determineTestType(this.execPath).then((testInfo) => {
      if (testInfo.type === 'catch2') {
        this.catch2Version = testInfo.version;
        if (this.catch2Version[0] > 2 || this.catch2Version[0] < 2)
          this.allTests.log.warn('Unsupported Cathc2 version: ' + inspect(this.catch2Version));
        return this._reloadCatch2Tests();
      }
      throw Error('Not a catch2 test executable: ' + this.execPath);
    });
  }

  private _reloadCatch2Tests(): Promise<void> {
    return c2fs
      .spawnAsync(
        this.execPath,
        [
          "[.],*", "--verbosity", "high", "--list-tests",
          "--use-colour", "no"
        ],
        this.execOptions)
      .then((catch2TestListOutput) => {
        const oldChildren = this.children;
        this.children = [];

        if (catch2TestListOutput.stderr) {
          this.allTests.log.warn('reloadChildren -> catch2TestListOutput.stderr: ' + inspect(catch2TestListOutput));
          this._createCatch2TestInfo(undefined, '!! ' + catch2TestListOutput.stderr.split('\n')[0].trim(), '', [], '', 1);
          return;
        }

        let lines = catch2TestListOutput.stdout.split(/\r?\n/);

        while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

        if (lines.length == 0) throw Error('Wrong test list.');

        // first line: 'Matching test cases:'
        for (let i = 1; i < lines.length - 1;) {
          if (lines[i][0] != ' ')
            this.allTests.log.error(
              'Wrong test list output format: ' + lines.toString());

          const testNameFull = lines[i++].substr(2);

          let filePath = '';
          let line = 0;
          {
            const fileLine = lines[i++].substr(4);
            const match =
              fileLine.match(/(?:(.+):([0-9]+)|(.+)\(([0-9]+)\))/);

            if (match && match.length == 5) {
              const matchedPath = match[1] ? match[1] : match[3];
              filePath = this._findFilePath(matchedPath);
              line = Number(match[2] ? match[2] : match[4]);
            }
          }

          let description = lines[i++].substr(4);
          if (description.startsWith('(NO DESCRIPTION)'))
            description = '';

          let tags: string[] = [];
          if (lines[i].length > 6 && lines[i][6] === '[') {
            tags = lines[i].trim().split(']');
            tags.pop();
            for (let j = 0; j < tags.length; ++j) tags[j] += ']';
            ++i;
          }

          const index = oldChildren.findIndex(c => c.testNameFull == testNameFull);
          this._createCatch2TestInfo(index != -1 ? oldChildren[index].id : undefined,
            testNameFull, description, tags, filePath, line);
        }
      });
  }

  private _createCatch2TestInfo(
    id: string | undefined, testName: string, description: string,
    tags: string[], file: string, line: number): Catch2TestInfo {
    const test =
      new Catch2TestInfo(id, testName, description, tags, file, line - 1, this);

    if (this.children.length == 0) {
      this.file = file;
      this.line = 0;
    } else if (this.file != file) {
      this.file = undefined;
      this.line = undefined;
    }

    let i = this.children.findIndex((v: Catch2TestInfo) => {
      if (test.file && v.file && test.line && v.line) {
        const f = test.file.trim().localeCompare(v.file.trim());
        if (f != 0)
          return f < 0;
        else
          return test.line < v.line;
      } else {
        return false;
      }
    });
    if (i == -1) i = this.children.length;
    this.children.splice(i, 0, test);

    return test;
  }

  protected _getExecParams(childrenToRun: TestInfoBase[] | 'all'): string[] {
    const execParams: string[] = [];

    if (childrenToRun !== 'all') {
      let testNames: string[] = [];
      for (let i = 0; i < childrenToRun.length; i++) {
        const c = childrenToRun[i];
        testNames.push(c.getEscapedTestName());
      }
      execParams.push(testNames.join(','));
    }

    execParams.push('--reporter');
    execParams.push('xml');
    execParams.push('--durations')
    execParams.push('yes');

    if (this.allTests.isNoThrow) execParams.push('--nothrow');

    if (this.allTests.rngSeed !== null) {
      execParams.push('--rng-seed');
      execParams.push(this.allTests.rngSeed.toString());
    }

    return execParams;
  }

  protected _handleProcess(process: ChildProcess, childrenToRun: TestInfoBase[] | 'all'): Promise<void> {
    const data = new class {
      process: ChildProcess | undefined = process;
      buffer: string = '';
      inTestCase: boolean = false;
      currentChild: Catch2TestInfo | undefined = undefined;
      beforeFirstTestCase: boolean = true;
      rngSeed: number | undefined = undefined;
      unprocessedXmlTestCases: string[] = [];
      processedTestCases: Catch2TestInfo[] = [];
    }();

    const testCaseTagRe = /<TestCase(?:\s+[^\n\r]+)?>/;

    return new Promise<number | string | any>((resolve, reject) => {

      const processChunk = (chunk: string) => {
        data.buffer = data.buffer + chunk;
        let invariant = 99999;
        do {
          if (!data.inTestCase) {
            const b = data.buffer.indexOf('<TestCase');
            if (b == -1) return;

            const m = data.buffer.match(testCaseTagRe);
            if (m == null || m.length != 1) return;

            data.inTestCase = true;

            let name: string = '';
            new xml2js.Parser({ explicitArray: true })
              .parseString(m[0] + '</TestCase>', (err: any, result: any) => {
                if (err) {
                  this.allTests.log.error(err.toString());
                  throw err;
                } else {
                  name = result.TestCase.$.name;
                }
              });

            if (data.beforeFirstTestCase) {
              const ri =
                data.buffer.match(/<Randomness\s+seed="([0-9]+)"\s*\/?>/);
              if (ri != null && ri.length == 2) {
                data.rngSeed = Number(ri[1]);
              }
            }

            data.beforeFirstTestCase = false;
            data.currentChild = this.children.find((v: Catch2TestInfo) => {
              // xml output trimmes the name of the test
              return v.testNameFull.trim() == name;
            });

            if (data.currentChild !== undefined) {
              const ev = data.currentChild.getStartEvent();
              this.allTests.testStatesEmitter.fire(ev);
            } else {
              this.allTests.log.error('TestCase not found in children: ' + name);
            }

            data.buffer = data.buffer.substr(b);
          } else {
            const endTestCase = '</TestCase>';
            const b = data.buffer.indexOf(endTestCase);
            if (b == -1) return;

            const testCaseXml = data.buffer.substring(0, b + endTestCase.length);

            if (data.currentChild !== undefined) {
              try {
                const ev: TestEvent = data.currentChild.parseAndProcessTestCase(
                  testCaseXml, data.rngSeed);
                if (!this.allTests.isEnabledSourceDecoration)
                  ev.decorations = undefined;
                this.allTests.testStatesEmitter.fire(ev);
                data.processedTestCases.push(data.currentChild);
              } catch (e) {
                this.allTests.log.error(
                  'parsing and processing test: ' + data.currentChild.label);
              }
            } else {
              this.allTests.log.info(
                '<TestCase> found without TestInfo: ' + inspect(this, true, 1) +
                '; ' + testCaseXml);
              data.unprocessedXmlTestCases.push(testCaseXml);
            }

            data.inTestCase = false;
            data.currentChild = undefined;
            data.buffer = data.buffer.substr(b + endTestCase.length);
          }
        } while (data.buffer.length > 0 && --invariant > 0);
        if (invariant == 0) {
          process.kill();
          reject('Possible infinite loop of this extension');
        }
      };

      process.stdout.on('data', (chunk: Uint8Array) => {
        const xml = chunk.toLocaleString();
        processChunk(xml);
      });

      process.on('error', (err: Error) => {
        reject(err);
      });

      process.on('close', (code: number | null, signal: string | null) => {
        data.process = undefined;

        if (code !== null && code !== undefined)
          resolve(code);
        if (signal !== null && signal !== undefined)
          reject(signal);
        else
          reject('unknown');
      });

    }).catch(
      (reason: any) => {
        process.kill();
        this.allTests.log.warn(inspect([reason, this, data], true, 2));
        return reason;
      }).then((codeOrReason: number | string | any) => {
        if (data.inTestCase) {
          if (data.currentChild !== undefined) {
            this.allTests.log.warn('data.currentChild !== undefined: ' + inspect(data));
            this.allTests.testStatesEmitter.fire({
              type: 'test',
              test: data.currentChild!,
              state: 'failed',
              message: 'Fatal error: Wrong Catch2 xml output. Error: ' + inspect(codeOrReason) + '\n',
            });
          } else {
            this.allTests.log.warn('data.inTestCase: ' + inspect(data));
          }
        }

        const isTestRemoved = (childrenToRun === 'all' &&
          this.children.filter(c => !c.skipped).length >
          data.processedTestCases.length) ||
          (childrenToRun !== 'all' && data.processedTestCases.length == 0);

        if (data.unprocessedXmlTestCases.length > 0 || isTestRemoved) {
          this.allTests
            .sendLoadEvents(() => {
              return this.reloadChildren().catch(e => {
                this.allTests.log.error('reloading-error: ' + inspect(e));
                // Suite possibly deleted: It is a dead suite.
              });
            })
            .then(() => {
              // we have test results for the newly detected tests
              // after reload we can set the results
              const events: TestEvent[] = [];

              for (let i = 0; i < data.unprocessedXmlTestCases.length; i++) {
                const testCaseXml = data.unprocessedXmlTestCases[i];

                const m = testCaseXml.match(testCaseTagRe);
                if (m == null || m.length != 1) break;

                let name: string | undefined = undefined;
                new xml2js.Parser({ explicitArray: true })
                  .parseString(
                    m[0] + '</TestCase>', (err: any, result: any) => {
                      if (err) {
                        this.allTests.log.error(err.toString());
                      } else {
                        name = result.TestCase.$.name;
                      }
                    });
                if (name === undefined) break;

                const currentChild = this.children.find((v: Catch2TestInfo) => {
                  // xml output trimmes the name of the test
                  return v.testNameFull.trim() == name;
                });
                if (currentChild === undefined) break;

                const ev = currentChild.parseAndProcessTestCase(
                  testCaseXml, data.rngSeed);
                events.push(currentChild.getStartEvent());
                events.push(ev);
              }
              events.length && this._sendTestStateEventsWithParent(events);
            });
        }
      });
  }
}

export class GoogleTestSuiteInfo extends TestSuiteInfoBase {
  children: GoogleTestInfo[] = [];

  constructor(
    public readonly origLabel: string,
    public readonly allTests: C2AllTestSuiteInfo,
    public readonly execPath: string,
    public readonly execOptions: SpawnOptions) {
    super(origLabel, allTests, execPath, execOptions);
  }

  reloadChildren(): Promise<void> {
    return TestSuiteInfoBase.determineTestType(this.execPath).then((testInfo) => {
      if (testInfo.type === 'google') {
        return this._reloadGoogleTests();
      }
      throw Error('Not a google test executable: ' + this.execPath);
    });
  }

  private _createGoogleTestInfo(
    id: string | undefined, testName: string, file: string | undefined, line: number | undefined): GoogleTestInfo {
    const test =
      new GoogleTestInfo(id, testName, file, line, this);

    if (this.children.length == 0) {
      this.file = file;
      this.line = 0;
    } else if (this.file != file) {
      this.file = undefined;
      this.line = undefined;
    }

    let i = this.children.findIndex((v: GoogleTestInfo) => {
      if (test.file && test.line && v.file && v.line) {
        const f = test.file.trim().localeCompare(v.file.trim());
        if (f != 0)
          return f < 0;
        else
          return test.line < v.line;
      } else {
        return false;
      }
    });
    if (i == -1) i = this.children.length;
    this.children.splice(i, 0, test);

    return test;
  }

  private _reloadGoogleTests(): Promise<void> {
    const tmpFilePath = (this.execOptions.cwd || '.') + '/gtest_output.json';
    return c2fs
      .spawnAsync(
        this.execPath,
        [
          "--gtest_list_tests",
          "--gtest_output=json:" + tmpFilePath
        ],
        this.execOptions)
      .then((googleTestListOutput) => {
        const oldChildren = this.children;
        this.children = [];

        if (googleTestListOutput.stderr) {
          this.allTests.log.warn('reloadChildren -> googleTestListOutput.stderr: ' + inspect(googleTestListOutput));
          this._createGoogleTestInfo(undefined, '!! ' + googleTestListOutput.stderr.split('\n')[0].trim(), undefined, undefined);
          return;
        }
        try {
          const testOutputJson = fsx.readJSONSync(tmpFilePath);
          fsx.remove(tmpFilePath);

          for (let i = 0; i < testOutputJson.testsuites.length; ++i) {
            const suiteName = testOutputJson.testsuites[i].name;
            for (let j = 0; j < testOutputJson.testsuites[i].testsuite.length; j++) {
              const test = testOutputJson.testsuites[i].testsuite[j];
              const testNameFull = suiteName + '.' + test.name;

              const index = oldChildren.findIndex(c => c.testNameFull == testNameFull);
              this._createGoogleTestInfo(index != -1 ? oldChildren[index].id : undefined,
                testNameFull, this._findFilePath(test.file), test.line - 1);
            }
          }

        } catch (e) {
          this.children = [];

          let lines = googleTestListOutput.stdout.split(/\r?\n/);

          while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

          if (lines.length == 0) throw Error('Wrong test list.');

          for (let i = 1; i < lines.length;) {
            if (lines[i][0] == ' ')
              this.allTests.log.error(
                'Wrong test list output format: ' + lines.toString());

            const testClassNameFull = lines[i++];

            while (i < lines.length && lines[i].startsWith('  ')) {
              const testNameFull = testClassNameFull + lines[i].trim();

              const index = oldChildren.findIndex(c => c.testNameFull == testNameFull);
              this._createGoogleTestInfo(index != -1 ? oldChildren[index].id : undefined,
                testNameFull, undefined, undefined);
              ++i;
            }
          }
        }
      });
  }

  protected _getExecParams(childrenToRun: TestInfoBase[] | 'all'): string[] {
    const execParams: string[] = [];

    if (childrenToRun !== 'all') {
      let testNames: string[] = [];
      for (let i = 0; i < childrenToRun.length; i++) {
        const c = childrenToRun[i];
        testNames.push(c.getEscapedTestName());
      }
      execParams.push('--gtest_filter=' + testNames.join(':'));

      execParams.push('--gtest_also_run_disabled_tests');
    }

    if (this.allTests.rngSeed !== null) {
      execParams.push('--gtest_random_seed='
        + (this.allTests.rngSeed === 'time' ? '0' : this.allTests.rngSeed.toString()));
    }

    return execParams;
  }

  protected _handleProcess(process: ChildProcess, childrenToRun: TestInfoBase[] | 'all'): Promise<void> {
    const data = new class {
      process: ChildProcess | undefined = process;
      buffer: string = '';
      inTestCase: boolean = false;
      currentChild: GoogleTestInfo | undefined = undefined;
      beforeFirstTestCase: boolean = true;
      unprocessedTestCases: string[] = [];
      processedTestCases: GoogleTestInfo[] = [];
    }();

    const testBeginRe = /^\[ RUN      \] (.+)$/m;

    return new Promise<number | string | any>((resolve, reject) => {

      const processChunk = (chunk: string) => {
        data.buffer = data.buffer + chunk;
        let invariant = 99999;
        do {
          if (!data.inTestCase) {
            const m = data.buffer.match(testBeginRe);
            if (m == null) return;

            data.inTestCase = true;

            const testNameFull: string = m[1];

            data.beforeFirstTestCase = false;
            data.currentChild = this.children.find((v: GoogleTestInfo) => {
              return v.testNameFull == testNameFull;
            });

            if (data.currentChild !== undefined) {
              const ev = data.currentChild.getStartEvent();
              this.allTests.testStatesEmitter.fire(ev);
            } else {
              this.allTests.log.warn('TestCase not found in children: ' + testNameFull);
            }

            data.buffer = data.buffer.substr(m.index!);
          } else {
            const testEndRe = /^(\[       OK \]|\[  FAILED  \]) (.+) \(.+\)$/m;
            const m = data.buffer.match(testEndRe);
            if (m == null) return;

            const testCase = data.buffer.substring(0, m.index! + m[0].length);

            if (data.currentChild !== undefined) {
              try {
                const ev: TestEvent = data.currentChild.parseAndProcessTestCase(testCase);
                if (!this.allTests.isEnabledSourceDecoration)
                  ev.decorations = undefined;
                this.allTests.testStatesEmitter.fire(ev);
                data.processedTestCases.push(data.currentChild);
              } catch (e) {
                this.allTests.log.error(
                  'parsing and processing test: ' + data.currentChild.label);
              }
            } else {
              this.allTests.log.info(
                'Test case found without TestInfo: ' + inspect(this, true, 1) +
                '; ' + testCase);
              data.unprocessedTestCases.push(testCase);
            }

            data.inTestCase = false;
            data.currentChild = undefined;
            data.buffer = data.buffer.substr(m.index! + m[0].length);
          }
        } while (data.buffer.length > 0 && --invariant > 0);
        if (invariant == 0) {
          process.kill();
          reject('Possible infinite loop of this extension');
        }
      };

      process.stdout.on('data', (chunk: Uint8Array) => {
        const xml = chunk.toLocaleString();
        processChunk(xml);
      });

      process.on('error', (err: Error) => {
        reject(err);
      });

      process.on('close', (code: number | null, signal: string | null) => {
        data.process = undefined;

        if (code !== null && code !== undefined)
          resolve(code);
        if (signal !== null && signal !== undefined)
          reject(signal);
        else
          reject('unknown');
      });

    }).catch(
      (reason: any) => {
        process.kill();

        this.allTests.log.warn(inspect([reason, this, data], true, 2));
        return reason;
      }).then((codeOrReason: number | string | any) => {
        if (data.inTestCase) {
          if (data.currentChild !== undefined) {
            this.allTests.log.warn('data.currentChild !== undefined: ' + inspect(data));
            this.allTests.testStatesEmitter.fire({
              type: 'test',
              test: data.currentChild!,
              state: 'failed',
              message: 'Fatal error: Wrong Catch2 xml output. Error: ' + inspect(codeOrReason) + '\n',
            });
          } else {
            this.allTests.log.warn('data.inTestCase: ' + inspect(data));
          }
        }

        const isTestRemoved = (childrenToRun === 'all' &&
          this.children.filter(c => !c.skipped).length >
          data.processedTestCases.length) ||
          (childrenToRun !== 'all' && data.processedTestCases.length == 0);

        if (data.unprocessedTestCases.length > 0 || isTestRemoved) {
          this.allTests
            .sendLoadEvents(() => {
              return this.reloadChildren().catch(e => {
                this.allTests.log.error('reloading-error: ' + inspect(e));
                // Suite possibly deleted: It is a dead suite.
              });
            })
            .then(() => {
              // we have test results for the newly detected tests
              // after reload we can set the results
              const events: TestEvent[] = [];

              for (let i = 0; i < data.unprocessedTestCases.length; i++) {
                const testCase = data.unprocessedTestCases[i];

                const m = testCase.match(testBeginRe);
                if (m == null) break;

                const testNameFull = m[1];

                const currentChild = this.children.find((v: GoogleTestInfo) => {
                  return v.testNameFull == testNameFull;
                });
                if (currentChild === undefined) break;

                const ev = currentChild.parseAndProcessTestCase(testCase);
                events.push(currentChild.getStartEvent());
                events.push(ev);
              }
              events.length && this._sendTestStateEventsWithParent(events);
            });
        }
      });
  }
}
