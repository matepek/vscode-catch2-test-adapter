//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as fs from 'fs';
import { inspect, promisify } from 'util';
import { TestEvent } from 'vscode-test-adapter-api';

import { GoogleTestInfo } from './GoogleTestInfo';
import * as c2fs from './FSWrapper';
import { AbstractTestInfo } from './AbstractTestInfo';
import { AbstractTestSuiteInfo } from './AbstractTestSuiteInfo';
import { Parser } from 'xml2js';
import { SharedVariables } from './SharedVariables';
import { AbstractTestSuiteInfoBase } from './AbstractTestSuiteInfoBase';
import { TestSuiteInfoFactory } from './TestSuiteInfoFactory';
import { RunningTestExecutableInfo, ProcessResult } from './RunningTestExecutableInfo';

class GoogleTestGroupSuiteInfo extends AbstractTestSuiteInfoBase {
  public children: GoogleTestInfo[] = [];

  public constructor(shared: SharedVariables, label: string, id?: string) {
    super(shared, label, undefined, id);
  }

  public addChild(test: GoogleTestInfo): void {
    super.addChild(test);
  }
}

export class GoogleTestSuiteInfo extends AbstractTestSuiteInfo {
  public children: GoogleTestGroupSuiteInfo[] = [];

  public constructor(
    shared: SharedVariables,
    label: string,
    desciption: string | undefined,
    execPath: string,
    execOptions: c2fs.SpawnOptions,
  ) {
    super(shared, label, desciption, execPath, execOptions);
  }

  public reloadChildren(): Promise<void> {
    this._shared.log.info('reloadChildren', this.label);
    return TestSuiteInfoFactory.determineTestTypeOfExecutable(this.execPath, this.execOptions).then(testInfo => {
      if (testInfo.type === 'google') {
        return this._reloadGoogleTests();
      }
      throw Error('Not a google test executable: ' + this.execPath);
    });
  }

  private _reloadFromXml(xmlStr: string, oldChildren: GoogleTestGroupSuiteInfo[]): void {
    interface XmlObject {
      [prop: string]: any; //eslint-disable-line
    }

    let xml: XmlObject = {};

    new Parser({ explicitArray: true }).parseString(xmlStr, (err: Error, result: object) => {
      if (err) {
        throw err;
      } else {
        xml = result;
      }
    });

    for (let i = 0; i < xml.testsuites.testsuite.length; ++i) {
      const suiteName = xml.testsuites.testsuite[i].$.name;

      const oldGroup = oldChildren.find(v => v.origLabel === suiteName);
      const oldGroupId = oldGroup ? oldGroup.id : undefined;
      const oldGroupChildren = oldGroup ? oldGroup.children : [];

      // we need the oldGroup.id because that preserves the node's expanded/collapsed state
      const group = new GoogleTestGroupSuiteInfo(this._shared, suiteName, oldGroupId);
      this.addChild(group);

      for (let j = 0; j < xml.testsuites.testsuite[i].testcase.length; j++) {
        const test = xml.testsuites.testsuite[i].testcase[j];
        const testName = test.$.name.startsWith('DISABLED_') ? test.$.name.substr(9) : test.$.name;
        const testNameAsId = suiteName + '.' + test.$.name;
        let typeParam: string | undefined = undefined;
        let valueParam: string | undefined = undefined;
        if (test.$.hasOwnProperty('type_param')) typeParam = test.$.type_param;
        if (test.$.hasOwnProperty('value_param')) valueParam = test.$.value_param;

        const old = this.findTestInfoInArray(oldGroupChildren, v => v.testNameAsId === testNameAsId);

        const file = test.$.file ? this._findFilePath(test.$.file) : undefined;
        const line = test.$.line ? test.$.line - 1 : undefined;

        group.addChild(
          new GoogleTestInfo(
            this._shared,
            old ? old.id : undefined,
            testNameAsId,
            testName,
            typeParam,
            valueParam,
            file,
            line,
          ),
        );
      }
    }
  }

  private _reloadFromStdOut(stdOutStr: string, oldChildren: GoogleTestGroupSuiteInfo[]): void {
    this.children = [];

    let lines = stdOutStr.split(/\r?\n/);

    const testGroupRe = /^([A-z][\/A-z0-9_\-]*)\.(?:\s+(# TypeParam = \s*(.+)))?$/;
    const testRe = /^  ([A-z0-9][\/A-z0-9_\-]*)(?:\s+(# GetParam\(\) = \s*(.+)))?$/;

    let lineCount = lines.length;

    while (lineCount > 0 && lines[lineCount - 1].match(testRe) === null) lineCount--;

    let lineNum = 0;

    // gtest_main.cc
    while (lineCount > lineNum && lines[lineNum].match(testGroupRe) === null) lineNum++;

    if (lineCount - lineNum === 0) throw Error('Wrong test list.');

    let testGroupMatch = lineCount > lineNum ? lines[lineNum].match(testGroupRe) : null;

    while (testGroupMatch) {
      lineNum++;

      const testGroupNameWithDot = testGroupMatch[0];
      const suiteName = testGroupMatch[1];
      const typeParam: string | undefined = testGroupMatch[3];

      const oldGroup = oldChildren.find(v => v.origLabel === suiteName);
      const oldGroupId = oldGroup ? oldGroup.id : undefined;
      const oldGroupChildren = oldGroup ? oldGroup.children : [];

      const group = new GoogleTestGroupSuiteInfo(this._shared, suiteName, oldGroupId);

      let testMatch = lineCount > lineNum ? lines[lineNum].match(testRe) : null;

      while (testMatch) {
        lineNum++;

        const testName = testMatch[1].startsWith('DISABLED_') ? testMatch[1].substr(9) : testMatch[1];
        const valueParam: string | undefined = testMatch[3];
        const testNameAsId = testGroupNameWithDot + testMatch[1];

        const old = this.findTestInfoInArray(oldGroupChildren, v => v.testNameAsId === testNameAsId);

        group.addChild(
          new GoogleTestInfo(
            this._shared,
            old ? old.id : undefined,
            testNameAsId,
            testName,
            typeParam,
            valueParam,
            undefined,
            undefined,
          ),
        );

        testMatch = lineCount > lineNum ? lines[lineNum].match(testRe) : null;
      }

      if (group.children.length > 0) this.addChild(group);
      else this._shared.log.error('group without test', this, group, lines);

      testGroupMatch = lineCount > lineNum ? lines[lineNum].match(testGroupRe) : null;
    }
  }

  private async _reloadGoogleTests(): Promise<void> {
    const oldChildren = this.children;
    this.children = [];
    this.label = this.origLabel;

    const cacheFile = this.execPath + '.cache.xml';

    if (this._shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.execPath);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this._shared.log.info('loading from cache: ', cacheFile);
          const xmlStr = await promisify(fs.readFile)(cacheFile, 'utf8');

          this._reloadFromXml(xmlStr, oldChildren);
          return Promise.resolve();
        }
      } catch (e) {
        this._shared.log.warn('coudnt use cache', e);
      }
    }

    return c2fs
      .spawnAsync(this.execPath, ['--gtest_list_tests', '--gtest_output=xml:' + cacheFile], this.execOptions, 30000)
      .then(async googleTestListOutput => {
        const oldChildren = this.children;
        this.children = [];
        this.label = this.origLabel;

        if (googleTestListOutput.stderr) {
          this._shared.log.warn('reloadChildren -> googleTestListOutput.stderr: ', googleTestListOutput);
          const test = new GoogleTestInfo(
            this._shared,
            undefined,
            '<dummy>',
            'Check the test output message for details ⚠️',
            '',
            undefined,
            undefined,
            undefined,
          );
          super.addChild(test);
          this._shared.sendTestEventEmitter.fire([
            { type: 'test', test: test, state: 'errored', message: googleTestListOutput.stderr },
          ]);
          return;
        }

        try {
          const xmlStr = await promisify(fs.readFile)(cacheFile, 'utf8');

          this._reloadFromXml(xmlStr, oldChildren);

          if (!this._shared.enabledTestListCaching) {
            fs.unlink(cacheFile, (err: Error | null) => {
              err && this._shared.log.warn("Couldn't remove: " + cacheFile, err);
            });
          }

          return;
        } catch (e) {
          this._shared.log.warn(
            "Couldn't parse output file. Possibly it is an older version of Google Test framework. It is trying to parse the output:",
            googleTestListOutput,
            'Catched:',
            e,
          );

          this._reloadFromStdOut(googleTestListOutput.stdout, oldChildren);
        }
      });
  }

  protected _getRunParams(childrenToRun: 'runAllTestsExceptSkipped' | Set<GoogleTestInfo>): string[] {
    const execParams: string[] = ['--gtest_color=no'];

    if (childrenToRun !== 'runAllTestsExceptSkipped') {
      const testNames = [...childrenToRun].map(c => c.testNameAsId);

      execParams.push('--gtest_filter=' + testNames.join(':'));

      execParams.push('--gtest_also_run_disabled_tests');
    }

    if (this._shared.rngSeed !== null) {
      execParams.push('--gtest_shuffle');
      execParams.push(
        '--gtest_random_seed=' + (this._shared.rngSeed === 'time' ? '0' : this._shared.rngSeed.toString()),
      );
    }

    return execParams;
  }

  protected _handleProcess(runInfo: RunningTestExecutableInfo): Promise<void> {
    const data = new (class {
      public buffer: string = '';
      public currentTestCaseNameFull: string | undefined = undefined;
      public currentChild: GoogleTestInfo | undefined = undefined;
      public group: GoogleTestGroupSuiteInfo | undefined = undefined;
      public beforeFirstTestCase: boolean = true;
      public unprocessedTestCases: string[] = [];
      public processedTestCases: GoogleTestInfo[] = [];
    })();

    const testBeginRe = /^\[ RUN      \] ((.+)\.(.+))$/m;

    return new Promise<ProcessResult>(resolve => {
      const processChunk = (chunk: string): void => {
        data.buffer = data.buffer + chunk;
        let invariant = 99999;
        do {
          if (data.currentTestCaseNameFull === undefined) {
            const m = data.buffer.match(testBeginRe);
            if (m == null) return;

            data.currentTestCaseNameFull = m[1];

            const groupName = m[2];
            const group = this.children.find(c => c.label == groupName);
            if (group) {
              if (data.group !== group) {
                if (data.group) this._shared.testStatesEmitter.fire(data.group.getCompletedEvent());

                data.group = group;
                this._shared.testStatesEmitter.fire(group.getRunningEvent());
              }
            } else {
              this._shared.log.error('should have found group', groupName, this);
            }

            data.beforeFirstTestCase = false;
            data.currentChild = this.findTestInfo(v => v.testNameAsId == data.currentTestCaseNameFull);

            if (data.currentChild !== undefined) {
              this._shared.log.info('Test', data.currentChild.testNameAsId, 'has started.');
              this._shared.testStatesEmitter.fire(data.currentChild.getStartEvent());
            } else {
              this._shared.log.warn('TestCase not found in children:', data.currentTestCaseNameFull);
            }

            data.buffer = data.buffer.substr(m.index!);
          } else {
            const testEndRe = new RegExp(
              '^(?!\\[ RUN      \\])\\[..........\\] ' + data.currentTestCaseNameFull.replace('.', '\\.') + '.*$',
              'm',
            );

            const m = data.buffer.match(testEndRe);
            if (m == null) return;

            const testCase = data.buffer.substring(0, m.index! + m[0].length);

            if (data.currentChild !== undefined) {
              this._shared.log.info('Test ', data.currentChild.testNameAsId, 'has finished.');
              try {
                const ev: TestEvent = data.currentChild.parseAndProcessTestCase(testCase, runInfo);

                this._shared.testStatesEmitter.fire(ev);

                data.processedTestCases.push(data.currentChild);
              } catch (e) {
                this._shared.log.error('parsing and processing test', e, data);

                data.currentChild.lastRunState = 'errored';

                this._shared.testStatesEmitter.fire({
                  type: 'test',
                  test: data.currentChild,
                  state: 'errored',
                  message: '😱 Unexpected error under parsing output !! Error: ' + inspect(e) + '\n',
                });
              }
            } else {
              this._shared.log.info('Test case found without TestInfo: ', this, '; ' + testCase);
              data.unprocessedTestCases.push(testCase);
            }

            data.currentTestCaseNameFull = undefined;
            data.currentChild = undefined;
            data.buffer = data.buffer.substr(m.index! + m[0].length);
          }
        } while (data.buffer.length > 0 && --invariant > 0);
        if (invariant == 0) {
          this._shared.log.error('invariant==0', this, runInfo, data);
          resolve({ error: new Error('Possible infinite loop of this extension') });
          runInfo.killProcess();
        }
      };

      runInfo.process!.stdout!.on('data', (chunk: Uint8Array) => {
        processChunk(chunk.toLocaleString());
      });

      runInfo.process!.once('close', (code: number | null, signal: string | null) => {
        if (code !== null && code !== undefined) resolve(ProcessResult.createFromErrorCode(code));
        else if (signal !== null && signal !== undefined) resolve(ProcessResult.createFromSignal(signal));
        else resolve({ error: new Error('unknown sfngvdlfkxdvgn') });
      });
    })
      .catch((reason: Error) => {
        this._shared.log.error(reason);
        return { error: reason };
      })
      .then((result: ProcessResult) => {
        result.error && this._shared.log.warn(result, runInfo, this, data);

        if (data.currentTestCaseNameFull !== undefined) {
          if (data.currentChild !== undefined) {
            this._shared.log.warn('data.currentChild !== undefined: ', data);

            let ev: TestEvent;

            if (runInfo.timeout !== null) {
              ev = data.currentChild.getTimeoutEvent(runInfo.timeout);
            } else {
              ev = data.currentChild.getFailedEventBase();

              ev.message = '😱 Unexpected error !!\n';

              if (result.error) {
                ev.state = 'errored';
                ev.message += result.error.message;
              }
            }

            data.currentChild.lastRunState = ev.state;
            this._shared.testStatesEmitter.fire(ev);
          } else {
            this._shared.log.warn('data.inTestCase: ', data);
          }
        }

        if (data.group) {
          this._shared.testStatesEmitter.fire(data.group.getCompletedEvent());
        }

        const isTestRemoved =
          runInfo.timeout === null &&
          result.error === undefined &&
          ((runInfo.childrenToRun === 'runAllTestsExceptSkipped' &&
            this.getTestInfoCount(false) > data.processedTestCases.length) ||
            (runInfo.childrenToRun !== 'runAllTestsExceptSkipped' && data.processedTestCases.length == 0));

        if (data.unprocessedTestCases.length > 0 || isTestRemoved) {
          new Promise<void>((resolve, reject) => {
            this._shared.loadWithTaskEmitter.fire(() => {
              return this.reloadChildren().then(resolve, reject);
            });
          }).then(
            () => {
              // we have test results for the newly detected tests
              // after reload we can set the results
              const events: TestEvent[] = [];

              for (let i = 0; i < data.unprocessedTestCases.length; i++) {
                const testCase = data.unprocessedTestCases[i];

                const m = testCase.match(testBeginRe);
                if (m == null) break;

                const testNameAsId = m[1];

                const currentChild = this.findTestInfo(v => v.testNameAsId == testNameAsId);
                if (currentChild === undefined) break;
                try {
                  const ev = currentChild.parseAndProcessTestCase(testCase, runInfo);
                  events.push(ev);
                } catch (e) {
                  this._shared.log.error('parsing and processing test: ' + testCase);
                }
              }
              events.length && this._shared.sendTestEventEmitter.fire(events);
            },
            (reason: Error) => {
              // Suite possibly deleted: It is a dead suite.
              this._shared.log.error('reloading-error: ', reason);
            },
          );
        }
      });
  }

  public addChild(group: GoogleTestGroupSuiteInfo): void {
    super.addChild(group);
  }

  public findTestInfo(pred: (v: GoogleTestInfo) => boolean): GoogleTestInfo | undefined {
    return super.findTestInfo(pred as (v: AbstractTestInfo) => boolean) as GoogleTestInfo;
  }
}
