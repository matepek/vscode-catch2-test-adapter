import * as fs from 'fs';
import { inspect, promisify } from 'util';
import { TestEvent } from 'vscode-test-adapter-api';

import * as c2fs from '../FSWrapper';
import { Suite } from '../Suite';
import { AbstractRunnable } from '../AbstractRunnable';
import { GoogleTest } from './GoogleTest';
import { Parser } from 'xml2js';
import { RunnableSuiteProperties } from '../RunnableSuiteProperties';
import { SharedVariables } from '../SharedVariables';
import { RunningRunnable, ProcessResult } from '../RunningRunnable';
import { AbstractTest } from '../AbstractTest';
import { Version } from '../Util';
import { TestGrouping } from '../TestGroupingInterface';

export class GoogleRunnable extends AbstractRunnable {
  public children: Suite[] = [];

  private readonly _flagPrefix: string;

  public constructor(
    shared: SharedVariables,
    rootSuite: Suite,
    execInfo: RunnableSuiteProperties,
    version: Promise<Version | undefined>,
  ) {
    super(shared, rootSuite, execInfo, 'GoogleTest', version);
    this._flagPrefix = shared.useGoogleInternalFlags ? 'gunit' : 'gtest';
  }

  private getTestGrouping(): TestGrouping {
    if (this.properties.testGrouping) {
      return this.properties.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      grouping.groupByExecutable.groupByTags = { tags: [], tagFormat: '${tag}' };
      return grouping;
    }
  }

  private _reloadFromXml(xmlStr: string): void {
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

      for (let j = 0; j < xml.testsuites.testsuite[i].testcase.length; j++) {
        const testCase = xml.testsuites.testsuite[i].testcase[j];
        const testName = testCase.$.name.startsWith('DISABLED_') ? testCase.$.name.substr(9) : testCase.$.name;
        const testNameInOutput = suiteName + '.' + testCase.$.name;
        const typeParam: string | undefined = testCase.$.type_param;
        const valueParam: string | undefined = testCase.$.value_param;

        const file = testCase.$.file ? this._findFilePath(testCase.$.file) : undefined;
        const line = testCase.$.line ? testCase.$.line - 1 : undefined;

        this._createSubtreeAndAddTest(
          testName,
          testNameInOutput,
          file,
          [suiteName],
          this.getTestGrouping(),
          (parent: Suite, old: AbstractTest | undefined) =>
            new GoogleTest(
              this._shared,
              this,
              parent,
              testNameInOutput,
              testName,
              typeParam,
              valueParam,
              file,
              line,
              old,
            ),
        );
      }
    }
  }

  private _reloadFromStdOut(stdOutStr: string): void {
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

      let testMatch = lineCount > lineNum ? lines[lineNum].match(testRe) : null;

      while (testMatch) {
        lineNum++;

        const testName = testMatch[1].startsWith('DISABLED_') ? testMatch[1].substr(9) : testMatch[1];
        const valueParam: string | undefined = testMatch[3];
        const testNameInOutput = testGroupName + '.' + testMatch[1];

        this._createSubtreeAndAddTest(
          testName,
          testNameInOutput,
          undefined,
          [suiteName],
          this.getTestGrouping(),
          (parent: Suite, old: AbstractTest | undefined) =>
            new GoogleTest(
              this._shared,
              this,
              parent,
              testNameInOutput,
              testName,
              typeParam,
              valueParam,
              undefined,
              undefined,
              old,
            ),
        );

        testMatch = lineCount > lineNum ? lines[lineNum].match(testRe) : null;
      }

      testGroupMatch = lineCount > lineNum ? lines[lineNum].match(testGroupRe) : null;
    }
  }

  protected async _reloadChildren(): Promise<void> {
    const cacheFile = this.properties.path + '.TestMate.testListCache.xml';

    if (this._shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.properties.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this._shared.log.info('loading from cache: ', cacheFile);
          const xmlStr = await promisify(fs.readFile)(cacheFile, 'utf8');

          this._reloadFromXml(xmlStr);
          return Promise.resolve();
        }
      } catch (e) {
        this._shared.log.info('coudnt use cache', e);
      }
    }

    return c2fs
      .spawnAsync(
        this.properties.path,
        this.properties.prependTestListingArgs.concat([
          `--${this._flagPrefix}_list_tests`,
          `--${this._flagPrefix}_output=xml:` + cacheFile,
        ]),
        this.properties.options,
        30000,
      )
      .then(async googleTestListOutput => {
        this.children = [];

        if (googleTestListOutput.stderr && !this.properties.ignoreTestEnumerationStdErr) {
          this._shared.log.warn('reloadChildren -> googleTestListOutput.stderr: ', googleTestListOutput);
          this._createAndAddUnexpectedStdError(googleTestListOutput.stdout, googleTestListOutput.stderr);
        } else {
          const hasXmlFile = await promisify(fs.exists)(cacheFile);

          if (hasXmlFile) {
            const xmlStr = await promisify(fs.readFile)(cacheFile, 'utf8');

            this._reloadFromXml(xmlStr);

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
              this._reloadFromStdOut(googleTestListOutput.stdout);
            } catch (e) {
              this._shared.log.info('GoogleTest._reloadFromStdOut error', e, googleTestListOutput);
              throw e;
            }
          }
        }
      });
  }

  protected _getRunParams(childrenToRun: readonly Readonly<GoogleTest>[]): string[] {
    const execParams: string[] = [`--${this._flagPrefix}_color=no`];

    const testNames = childrenToRun.map(c => c.testName);

    execParams.push(`--${this._flagPrefix}_filter=` + testNames.join(':'));

    execParams.push(`--${this._flagPrefix}_also_run_disabled_tests`);

    if (this._shared.rngSeed !== null) {
      execParams.push(`--${this._flagPrefix}_shuffle`);
      const randomSeed = this._shared.rngSeed === 'time' ? '0' : this._shared.rngSeed.toString();
      execParams.push(`--${this._flagPrefix}_random_seed=` + randomSeed);
    }

    if (this._shared.googleTestGMockVerbose !== 'default') {
      execParams.push('--gmock_verbose=' + this._shared.googleTestGMockVerbose);
    }

    return execParams;
  }

  public getDebugParams(childrenToRun: readonly Readonly<AbstractTest>[], breakOnFailure: boolean): string[] {
    const debugParams = this._getRunParams(childrenToRun as readonly Readonly<GoogleTest>[]);
    if (breakOnFailure) debugParams.push(`--${this._flagPrefix}_break_on_failure`);
    return debugParams;
  }

  protected _handleProcess(runInfo: RunningRunnable): Promise<void> {
    const data = new (class {
      public stdoutAndErrBuffer = ''; // no reason to separate
      public currentTestCaseNameFull: string | undefined = undefined;
      public currentChild: AbstractTest | undefined = undefined;
      public route: Suite[] = [];
      public unprocessedTestCases: string[] = [];
      public processedTestCases: AbstractTest[] = [];
    })();

    const testBeginRe = /^\[ RUN      \] ((.+)\.(.+))$/m;
    const rngSeed: number | undefined = typeof this._shared.rngSeed === 'number' ? this._shared.rngSeed : undefined;

    return new Promise<ProcessResult>(resolve => {
      const chunks: string[] = [];
      const processChunk = (chunk: string): void => {
        chunks.push(chunk);
        data.stdoutAndErrBuffer = data.stdoutAndErrBuffer + chunk;
        let invariant = 99999;
        do {
          if (data.currentTestCaseNameFull === undefined) {
            const m = data.stdoutAndErrBuffer.match(testBeginRe);
            if (m == null) return;

            data.currentTestCaseNameFull = m[1];

            const test = this._findTest(v => v.testName == data.currentTestCaseNameFull);

            if (test) {
              const route = [...test.route()];
              this.sendMinimalEventsIfNeeded(data.route, route);
              data.route = route;

              data.currentChild = test;
              this._shared.log.info('Test', data.currentChild.testName, 'has started.');
              this._shared.testStatesEmitter.fire(data.currentChild.getStartEvent());
            } else {
              this._shared.log.info('TestCase not found in children', data.currentTestCaseNameFull);
            }

            data.stdoutAndErrBuffer = data.stdoutAndErrBuffer.substr(m.index!);
          } else {
            const testEndRe = new RegExp(
              '(?!\\[ RUN      \\])\\[..........\\] ' + data.currentTestCaseNameFull.replace('.', '\\.') + '.*$',
              'm',
            );

            const m = data.stdoutAndErrBuffer.match(testEndRe);
            if (m == null) return;

            const testCase = data.stdoutAndErrBuffer.substring(0, m.index! + m[0].length);

            if (data.currentChild !== undefined) {
              this._shared.log.info('Test ', data.currentChild.testName, 'has finished.');
              try {
                const ev = data.currentChild.parseAndProcessTestCase(testCase, rngSeed, runInfo.timeout, undefined);

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
            data.stdoutAndErrBuffer = data.stdoutAndErrBuffer.substr(m.index! + m[0].length);
          }
        } while (data.stdoutAndErrBuffer.length > 0 && --invariant > 0);
        if (invariant == 0) {
          this._shared.log.error('invariant==0', this, runInfo, data, chunks);
          resolve(ProcessResult.error('Possible infinite loop of this extension'));
          runInfo.killProcess();
        }
      };

      runInfo.process.stdout!.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));
      runInfo.process.stderr!.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));

      runInfo.process.once('close', (code: number | null, signal: string | null) => {
        if (runInfo.isCancelled) {
          resolve(ProcessResult.ok());
        } else {
          if (code !== null && code !== undefined) resolve(ProcessResult.createFromErrorCode(code));
          else if (signal !== null && signal !== undefined) resolve(ProcessResult.createFromSignal(signal));
          else resolve(ProcessResult.error('unknown sfngvdlfkxdvgn'));
        }
      });
    })
      .catch((reason: Error) => {
        // eslint-disable-next-line
        if ((reason as any).code === undefined) this._shared.log.exceptionS(reason);

        return new ProcessResult(reason);
      })
      .then((result: ProcessResult) => {
        result.error && this._shared.log.info(result.error.toString(), result, runInfo, this, data);

        if (data.currentTestCaseNameFull !== undefined) {
          if (data.currentChild !== undefined) {
            this._shared.log.info('data.currentChild !== undefined: ', data);

            let ev: TestEvent;

            if (runInfo.isCancelled) {
              ev = data.currentChild.getCancelledEvent(data.stdoutAndErrBuffer);
            } else if (runInfo.timeout !== null) {
              ev = data.currentChild.getTimeoutEvent(runInfo.timeout);
            } else {
              ev = data.currentChild.getFailedEventBase();

              ev.message = '😱 Unexpected error !!';

              if (result.error) {
                ev.state = 'errored';
                ev.message += '\n' + result.error.message;
              }

              ev.message += data.stdoutAndErrBuffer ? `\n\n>>>${data.stdoutAndErrBuffer}<<<` : '';
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
          !runInfo.isCancelled &&
          result.error === undefined &&
          data.processedTestCases.length < runInfo.childrenToRun.length;

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

                const testNameInOutput = m[1];

                const currentChild = this._findTest(v => v.compare(testNameInOutput));

                if (currentChild === undefined) break;
                try {
                  const ev = currentChild.parseAndProcessTestCase(testCase, rngSeed, runInfo.timeout, undefined);
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
