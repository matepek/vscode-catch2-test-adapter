import * as fs from 'fs';
import { inspect, promisify } from 'util';
import { TestEvent } from 'vscode-test-adapter-api';

import * as c2fs from '../FSWrapper';
import { AbstractSuite } from '../AbstractSuite';
import { GroupSuite } from '../GroupSuite';
import { AbstractRunnableSuite } from '../AbstractRunnableSuite';
import { GoogleTest } from './GoogleTest';
import { Parser } from 'xml2js';
import { RunnableSuiteProperties } from '../RunnableSuiteProperties';
import { SharedVariables } from '../SharedVariables';
import { RunningTestExecutableInfo, ProcessResult } from '../RunningTestExecutableInfo';
import { AbstractTest } from '../AbstractTest';

export class GoogleSuite extends AbstractRunnableSuite {
  public children: GroupSuite[] = [];

  public constructor(
    shared: SharedVariables,
    label: string,
    desciption: string | undefined,
    execInfo: RunnableSuiteProperties,
    version: Promise<[number, number, number] | undefined>,
  ) {
    super(shared, label, desciption, execInfo, 'GoogleTest', version);
  }

  private _reloadFromXml(xmlStr: string, oldChildren: GroupSuite[]): void {
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

      const oldFixtureGroup = this.findChildSuiteInArray(oldChildren, v => v.label === suiteName);
      const oldFixtureGroupChildren: (AbstractSuite | AbstractTest)[] = oldFixtureGroup ? oldFixtureGroup.children : [];

      // we need the oldFixtureGroup.id because that preserves the node's expanded/collapsed state
      const fixtureGroup = new GroupSuite(this._shared, suiteName, oldFixtureGroup);
      this.addChild(fixtureGroup);

      for (let j = 0; j < xml.testsuites.testsuite[i].testcase.length; j++) {
        const test = xml.testsuites.testsuite[i].testcase[j];
        const testName = test.$.name.startsWith('DISABLED_') ? test.$.name.substr(9) : test.$.name;
        const testNameAsId = suiteName + '.' + test.$.name;
        const typeParam: string | undefined = test.$.type_param;
        const valueParam: string | undefined = test.$.value_param;

        const file = test.$.file ? this._findFilePath(test.$.file) : undefined;
        const line = test.$.line ? test.$.line - 1 : undefined;

        let group: AbstractSuite = fixtureGroup;
        let oldGroupChildren: (AbstractSuite | AbstractTest)[] = oldFixtureGroupChildren;

        const addNewSubGroup = (label: string): void => {
          const oldGroup = this.findChildSuiteInArray(oldGroupChildren, v => v.label === label);
          group = group.addChild(new GroupSuite(this._shared, label, oldGroup));
          oldGroupChildren = oldGroup ? oldGroup.children : [];
        };

        const setUngroupableGroup = (): void => {
          if (this.execInfo.groupUngroupablesTo) {
            const found = group.children.find(v => v.type === 'suite' && v.label === this.execInfo.groupUngroupablesTo);
            if (found && found.type == 'suite') {
              group = found;
            } else {
              addNewSubGroup(this.execInfo.groupUngroupablesTo);
            }
          }
        };

        if (this.execInfo.groupBySource) {
          if (file) {
            this._shared.log.info('groupBySource');
            const fileStr = this.execInfo.getSourcePartForGrouping(file);
            const found = group.findChildSuite(v => v.label === fileStr);
            if (fileStr.length > 0 && found) {
              group = found;
            } else {
              addNewSubGroup(fileStr);
            }
          } else if (this.execInfo.groupUngroupablesTo) {
            setUngroupableGroup();
          }
        }

        if (this.execInfo.groupBySingleRegex) {
          this._shared.log.info('groupBySingleRegex');
          const match = testName.match(this.execInfo.groupBySingleRegex);
          if (match && match[1]) {
            const firstMatchGroup = match[1];
            const found = group.findChildSuite(v => v.label === firstMatchGroup);
            if (found) {
              group = found;
            } else {
              addNewSubGroup(firstMatchGroup);
            }
          } else if (this.execInfo.groupUngroupablesTo) {
            setUngroupableGroup();
          }
        }

        const old = this.findTestInfoInArray(oldGroupChildren, v => v.testName === testNameAsId);

        group.addChild(
          new GoogleTest(
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

  private _reloadFromStdOut(stdOutStr: string, oldChildren: GroupSuite[]): void {
    this.children = [];

    const lines = stdOutStr.split(/\r?\n/);

    const testGroupRe = /^([A-z][\/A-z0-9_\-]*)\.(?:\s+(#\s+TypeParam(?:\(\))?\s+=\s*(.+)))?$/;
    const testRe = /^\s+([A-z0-9][\/A-z0-9_\-]*)(?:\s+(#\s+GetParam(?:\(\))?\s+=\s*(.+)))?$/;

    let lineCount = lines.length;

    while (lineCount > 0 && lines[lineCount - 1].match(testRe) === null) lineCount--;

    let lineNum = 0;

    // gtest_main.cc
    while (lineCount > lineNum && lines[lineNum].match(testGroupRe) === null) lineNum++;

    if (lineCount - lineNum === 0) throw Error('Wrong test list.');

    let testGroupMatch = lineCount > lineNum ? lines[lineNum].match(testGroupRe) : null;

    while (testGroupMatch) {
      lineNum++;

      const testGroupName = testGroupMatch[1];
      const suiteName = testGroupMatch[1];
      const typeParam: string | undefined = testGroupMatch[3];

      const oldGroup = oldChildren.find(v => v.label === suiteName);
      const oldGroupChildren = oldGroup ? oldGroup.children : [];

      const group = new GroupSuite(this._shared, suiteName, oldGroup);

      let testMatch = lineCount > lineNum ? lines[lineNum].match(testRe) : null;

      while (testMatch) {
        lineNum++;

        const testName = testMatch[1].startsWith('DISABLED_') ? testMatch[1].substr(9) : testMatch[1];
        const valueParam: string | undefined = testMatch[3];
        const testNameAsId = testGroupName + '.' + testMatch[1];

        const old = this.findTestInfoInArray(oldGroupChildren, v => v.testName === testNameAsId);

        group.addChild(
          new GoogleTest(
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

  protected async _reloadChildren(): Promise<void> {
    const oldChildren = this.children;
    this.children = [];

    const cacheFile = this.execInfo.path + '.cache.xml';

    if (this._shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.execInfo.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this._shared.log.info('loading from cache: ', cacheFile);
          const xmlStr = await promisify(fs.readFile)(cacheFile, 'utf8');

          this._reloadFromXml(xmlStr, oldChildren);
          return Promise.resolve();
        }
      } catch (e) {
        this._shared.log.info('coudnt use cache', e);
      }
    }

    return c2fs
      .spawnAsync(
        this.execInfo.path,
        this.execInfo.prependTestListingArgs.concat(['--gtest_list_tests', '--gtest_output=xml:' + cacheFile]),
        this.execInfo.options,
        30000,
      )
      .then(async googleTestListOutput => {
        this.children = [];

        if (googleTestListOutput.stderr && !this.execInfo.ignoreTestEnumerationStdErr) {
          this._shared.log.warn('reloadChildren -> googleTestListOutput.stderr: ', googleTestListOutput);
          const test = this.addChild(
            new GoogleTest(
              this._shared,
              undefined,
              '<dummy>',
              'Check the test output message for details ⚠️',
              '',
              undefined,
              undefined,
              undefined,
            ),
          );
          this._shared.sendTestEventEmitter.fire([
            {
              type: 'test',
              test: test,
              state: 'errored',
              message: [
                `❗️Unexpected stderr!`,
                `(One might can use ignoreTestEnumerationStdErr as the LAST RESORT. Check README for details.)`,
                `spawn`,
                `stout:`,
                `${googleTestListOutput.stdout}`,
                `stderr:`,
                `${googleTestListOutput.stderr}`,
              ].join('\n'),
            },
          ]);
        } else {
          const hasXmlFile = await promisify(fs.exists)(cacheFile);

          if (hasXmlFile) {
            const xmlStr = await promisify(fs.readFile)(cacheFile, 'utf8');

            this._reloadFromXml(xmlStr, oldChildren);

            if (!this._shared.enabledTestListCaching) {
              fs.unlink(cacheFile, (err: Error | null) => {
                err && this._shared.log.warn("Couldn't remove: ", cacheFile, err);
              });
            }
          } else {
            this._shared.log.info(
              "Couldn't parse output file. Possibly it is an older version of Google Test framework. It is trying to parse the output",
            );

            try {
              this._reloadFromStdOut(googleTestListOutput.stdout, oldChildren);
            } catch (e) {
              this._shared.log.info('GoogleTest._reloadFromStdOut error', e, googleTestListOutput);
              throw e;
            }
          }
        }
      });
  }

  protected _getRunParams(childrenToRun: 'runAllTestsExceptSkipped' | Set<GoogleTest>): string[] {
    const execParams: string[] = ['--gtest_color=no'];

    if (childrenToRun !== 'runAllTestsExceptSkipped') {
      const testNames = [...childrenToRun].map(c => c.testName);

      execParams.push('--gtest_filter=' + testNames.join(':'));

      execParams.push('--gtest_also_run_disabled_tests');
    }

    if (this._shared.rngSeed !== null) {
      execParams.push('--gtest_shuffle');
      execParams.push(
        '--gtest_random_seed=' + (this._shared.rngSeed === 'time' ? '0' : this._shared.rngSeed.toString()),
      );
    }

    if (this._shared.googleTestGMockVerbose !== 'default') {
      execParams.push('--gmock_verbose=' + this._shared.googleTestGMockVerbose);
    }

    return execParams;
  }

  protected _handleProcess(runInfo: RunningTestExecutableInfo): Promise<void> {
    const data = new (class {
      public buffer = '';
      public currentTestCaseNameFull: string | undefined = undefined;
      public currentChild: AbstractTest | undefined = undefined;
      public route: AbstractSuite[] = [];
      public unprocessedTestCases: string[] = [];
      public processedTestCases: AbstractTest[] = [];
    })();

    const testBeginRe = /^\[ RUN      \] ((.+)\.(.+))$/m;
    const rngSeed: number | undefined = typeof this._shared.rngSeed === 'number' ? this._shared.rngSeed : undefined;

    return new Promise<ProcessResult>(resolve => {
      const chunks: string[] = [];
      const processChunk = (chunk: string): void => {
        chunks.push(chunk);
        data.buffer = data.buffer + chunk;
        let invariant = 99999;
        do {
          if (data.currentTestCaseNameFull === undefined) {
            const m = data.buffer.match(testBeginRe);
            if (m == null) return;

            data.currentTestCaseNameFull = m[1];

            const [route, testInfo] = this.findRouteToTestInfo(v => v.testName == data.currentTestCaseNameFull);

            if (testInfo !== undefined) {
              this.sendMinimalEventsIfNeeded(data.route, route);
              data.route = route;

              data.currentChild = testInfo;
              this._shared.log.info('Test', data.currentChild.testName, 'has started.');
              this._shared.testStatesEmitter.fire(data.currentChild.getStartEvent());
            } else {
              this._shared.log.info('TestCase not found in children', data.currentTestCaseNameFull);
            }

            data.buffer = data.buffer.substr(m.index!);
          } else {
            const testEndRe = new RegExp(
              '(?!\\[ RUN      \\])\\[..........\\] ' + data.currentTestCaseNameFull.replace('.', '\\.') + '.*$',
              'm',
            );

            const m = data.buffer.match(testEndRe);
            if (m == null) return;

            const testCase = data.buffer.substring(0, m.index! + m[0].length);

            if (data.currentChild !== undefined) {
              this._shared.log.info('Test ', data.currentChild.testName, 'has finished.');
              try {
                const ev: TestEvent = data.currentChild.parseAndProcessTestCase(testCase, rngSeed, runInfo);

                this._shared.testStatesEmitter.fire(ev);

                data.processedTestCases.push(data.currentChild);
              } catch (e) {
                this._shared.log.error('parsing and processing test', e, data);

                data.currentChild.lastRunEvent = {
                  type: 'test',
                  test: data.currentChild,
                  state: 'errored',
                  message: [
                    '😱 Unexpected error under parsing output !! Error: ' + inspect(e),
                    'Consider opening an issue: https://github.com/matepek/vscode-catch2-test-adapter/issues/new/choose',
                    '=== Output ===',
                    testCase,
                    '==============',
                  ].join('\n'),
                };

                this._shared.testStatesEmitter.fire(data.currentChild.lastRunEvent);
              }
            } else {
              this._shared.log.info('Test case found without TestInfo: ', this, '; ' + testCase);
              data.unprocessedTestCases.push(testCase);
            }

            data.currentTestCaseNameFull = undefined;
            data.currentChild = undefined;
            // do not clear data.route
            data.buffer = data.buffer.substr(m.index! + m[0].length);
          }
        } while (data.buffer.length > 0 && --invariant > 0);
        if (invariant == 0) {
          this._shared.log.error('invariant==0', this, runInfo, data, chunks);
          resolve({ error: new Error('Possible infinite loop of this extension') });
          runInfo.killProcess();
        }
      };

      runInfo.process.stdout!.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));
      runInfo.process.stderr!.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));

      runInfo.process.once('close', (code: number | null, signal: string | null) => {
        if (code !== null && code !== undefined) resolve(ProcessResult.createFromErrorCode(code));
        else if (signal !== null && signal !== undefined) resolve(ProcessResult.createFromSignal(signal));
        else resolve({ error: new Error('unknown sfngvdlfkxdvgn') });
      });
    })
      .catch((reason: Error) => {
        // eslint-disable-next-line
        if ((reason as any).code === undefined) this._shared.log.exception(reason);

        return { error: reason };
      })
      .then((result: ProcessResult) => {
        result.error && this._shared.log.info(result.error.toString(), result, runInfo, this, data);

        if (data.currentTestCaseNameFull !== undefined) {
          if (data.currentChild !== undefined) {
            this._shared.log.info('data.currentChild !== undefined: ', data);

            let ev: TestEvent;

            if (runInfo.timeout !== null) {
              ev = data.currentChild.getTimeoutEvent(runInfo.timeout);
            } else {
              ev = data.currentChild.getFailedEventBase();

              ev.message = '😱 Unexpected error !!';

              if (result.error) {
                ev.state = 'errored';
                ev.message += '\n' + result.error.message;
              }

              ev.message += data.buffer ? '\n' + data.buffer : '';
            }

            data.currentChild.lastRunEvent = ev;
            this._shared.testStatesEmitter.fire(ev);
          } else {
            this._shared.log.warn('data.inTestCase: ', data);
          }
        }

        this.sendMinimalEventsIfNeeded(data.route, []);
        data.route = [];

        const isTestRemoved =
          runInfo.timeout === null &&
          result.error === undefined &&
          ((runInfo.childrenToRun === 'runAllTestsExceptSkipped' &&
            this.getTestInfoCount(false) > data.processedTestCases.length) ||
            (runInfo.childrenToRun !== 'runAllTestsExceptSkipped' && data.processedTestCases.length == 0));

        if (data.unprocessedTestCases.length > 0 || isTestRemoved) {
          new Promise<void>((resolve, reject) => {
            this._shared.loadWithTaskEmitter.fire(() => {
              return this.reloadTests(this._shared.taskPool).then(resolve, reject);
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

                const currentChild = this.findTestInfo(v => v.testName == testNameAsId);
                if (currentChild === undefined) break;
                try {
                  const ev = currentChild.parseAndProcessTestCase(testCase, rngSeed, runInfo);
                  events.push(ev);
                } catch (e) {
                  this._shared.log.error('parsing and processing test', e, testCase);
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
}
