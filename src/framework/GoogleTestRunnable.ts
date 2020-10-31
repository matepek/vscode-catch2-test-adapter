import * as fs from 'fs';
import { inspect, promisify } from 'util';

import { Suite } from '../Suite';
import { AbstractRunnable, RunnableReloadResult } from '../AbstractRunnable';
import { GoogleTestTest } from './GoogleTestTest';
import { Parser } from 'xml2js';
import { RunnableProperties } from '../RunnableProperties';
import { SharedVariables } from '../SharedVariables';
import { RunningRunnable, ProcessResult } from '../RunningRunnable';
import { AbstractTest, AbstractTestEvent } from '../AbstractTest';
import { Version } from '../Util';
import { TestGrouping } from '../TestGroupingInterface';
import { RootSuite } from '../RootSuite';

export class GoogleTestRunnable extends AbstractRunnable {
  public constructor(
    shared: SharedVariables,
    rootSuite: RootSuite,
    execInfo: RunnableProperties,
    private readonly _argumentPrefix: string,
    version: Promise<Version | undefined>,
  ) {
    super(shared, rootSuite, execInfo, 'GoogleTest', version);
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

  private async _reloadFromXml(xmlStr: string): Promise<RunnableReloadResult> {
    const testGrouping = this.getTestGrouping();

    interface XmlObject {
      [prop: string]: any; //eslint-disable-line
    }

    let xml: XmlObject = {};

    new Parser({ explicitArray: true }).parseString(xmlStr, (err: Error, result: Record<string, unknown>) => {
      if (err) {
        throw err;
      } else {
        xml = result;
      }
    });

    const reloadResult = new RunnableReloadResult();

    for (let i = 0; i < xml.testsuites.testsuite.length; ++i) {
      const suiteName = xml.testsuites.testsuite[i].$.name;

      for (let j = 0; j < xml.testsuites.testsuite[i].testcase.length; j++) {
        const testCase = xml.testsuites.testsuite[i].testcase[j];
        const testName = testCase.$.name.startsWith('DISABLED_') ? testCase.$.name.substr(9) : testCase.$.name;
        const testNameAsId = suiteName + '.' + testCase.$.name;
        const typeParam: string | undefined = testCase.$.type_param;
        const valueParam: string | undefined = testCase.$.value_param;

        const file = testCase.$.file ? await this._resolveSourceFilePath(testCase.$.file) : undefined;
        const line = testCase.$.line ? testCase.$.line - 1 : undefined;

        reloadResult.add(
          ...(await this._createSubtreeAndAddTest(
            testGrouping,
            testNameAsId,
            testName,
            file,
            [suiteName],
            (parent: Suite) =>
              new GoogleTestTest(this._shared, this, parent, testNameAsId, testName, typeParam, valueParam, file, line),
            (old: AbstractTest) => (old as GoogleTestTest).update(typeParam, valueParam, file, line),
          )),
        );
      }
    }

    return reloadResult;
  }

  private async _reloadFromString(stdOutStr: string): Promise<RunnableReloadResult> {
    const testGrouping = this.getTestGrouping();

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

    const reloadResult = new RunnableReloadResult();

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
        const testNameAsId = testGroupName + '.' + testMatch[1];

        reloadResult.add(
          ...(await this._createSubtreeAndAddTest(
            testGrouping,
            testNameAsId,
            testName,
            undefined,
            [suiteName],
            (parent: Suite) =>
              new GoogleTestTest(
                this._shared,
                this,
                parent,
                testNameAsId,
                testName,
                typeParam,
                valueParam,
                undefined,
                undefined,
              ),
            (old: AbstractTest) => (old as GoogleTestTest).update(typeParam, valueParam, undefined, undefined),
          )),
        );

        testMatch = lineCount > lineNum ? lines[lineNum].match(testRe) : null;
      }

      testGroupMatch = lineCount > lineNum ? lines[lineNum].match(testGroupRe) : null;
    }

    return reloadResult;
  }

  protected async _reloadChildren(): Promise<RunnableReloadResult> {
    const cacheFile = this.properties.path + '.TestMate.testListCache.xml';

    if (this._shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.properties.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this._shared.log.info('loading from cache: ', cacheFile);
          const xmlStr = await promisify(fs.readFile)(cacheFile, 'utf8');

          return await this._reloadFromXml(xmlStr);
        }
      } catch (e) {
        this._shared.log.info('coudnt use cache', e);
      }
    }

    const args = this.properties.prependTestListingArgs.concat([
      `--${this._argumentPrefix}list_tests`,
      `--${this._argumentPrefix}output=xml:${cacheFile}`,
    ]);

    this._shared.log.info('discovering tests', this.properties.path, args, this.properties.options.cwd);
    const googleTestListOutput = await this.properties.spawner.spawnAsync(
      this.properties.path,
      args,
      this.properties.options,
      30000,
    );

    if (googleTestListOutput.stderr && !this.properties.ignoreTestEnumerationStdErr) {
      this._shared.log.warn('reloadChildren -> googleTestListOutput.stderr: ', googleTestListOutput);
      return await this._createAndAddUnexpectedStdError(googleTestListOutput.stdout, googleTestListOutput.stderr);
    } else {
      const hasXmlFile = await promisify(fs.exists)(cacheFile);

      if (hasXmlFile) {
        const xmlStr = await promisify(fs.readFile)(cacheFile, 'utf8');

        const result = await this._reloadFromXml(xmlStr);

        if (!this._shared.enabledTestListCaching) {
          fs.unlink(cacheFile, (err: Error | null) => {
            err && this._shared.log.warn("Couldn't remove: ", cacheFile, err);
          });
        }

        return result;
      } else {
        this._shared.log.info(
          "Couldn't parse output file. Possibly it is an older version of Google Test framework. It is trying to parse the output",
        );

        try {
          return await this._reloadFromString(googleTestListOutput.stdout);
        } catch (e) {
          this._shared.log.info('GoogleTest._reloadFromStdOut error', e, googleTestListOutput);
          throw e;
        }
      }
    }
  }

  private _getRunParamsCommon(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    const execParams: string[] = [];

    const testNames = childrenToRun.map(c => c.testNameAsId);

    execParams.push(`--${this._argumentPrefix}filter=` + testNames.join(':'));

    execParams.push(`--${this._argumentPrefix}also_run_disabled_tests`);

    if (this._shared.rngSeed !== null) {
      execParams.push(`--${this._argumentPrefix}shuffle`);
      execParams.push(
        `--${this._argumentPrefix}random_seed=` +
          (this._shared.rngSeed === 'time' ? '0' : this._shared.rngSeed.toString()),
      );
    }

    if (this._shared.googleTestGMockVerbose !== 'default') {
      execParams.push('--gmock_verbose=' + this._shared.googleTestGMockVerbose);
    }

    return execParams;
  }

  protected _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    return [`--${this._argumentPrefix}color=no`, ...this._getRunParamsCommon(childrenToRun)];
  }

  protected _getDebugParamsInner(childrenToRun: readonly Readonly<AbstractTest>[], breakOnFailure: boolean): string[] {
    const colouring = this.properties.enableDebugColouring ? 'yes' : 'no';
    const debugParams = [`--${this._argumentPrefix}color=${colouring}`, ...this._getRunParamsCommon(childrenToRun)];
    if (breakOnFailure) debugParams.push(`--${this._argumentPrefix}break_on_failure`);
    return debugParams;
  }

  protected _handleProcess(testRunId: string, runInfo: RunningRunnable): Promise<void> {
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

            const test = this._findTest(v => v.testNameAsId == data.currentTestCaseNameFull);

            if (test) {
              const route = [...test.route()];
              this.sendMinimalEventsIfNeeded(testRunId, data.route, route);
              data.route = route;

              data.currentChild = test;
              this._shared.log.info('Test', data.currentChild.testNameAsId, 'has started.');
              this._shared.sendTestRunEvent(data.currentChild.getStartEvent(testRunId));
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
              this._shared.log.info('Test ', data.currentChild.testNameAsId, 'has finished.');
              try {
                const ev = data.currentChild.parseAndProcessTestCase(
                  testRunId,
                  testCase,
                  rngSeed,
                  runInfo.timeout,
                  undefined,
                );

                this._shared.sendTestRunEvent(ev);

                data.processedTestCases.push(data.currentChild);
              } catch (e) {
                this._shared.log.error('parsing and processing test', e, data);

                data.currentChild.lastRunEvent = {
                  testRunId,
                  type: 'test',
                  test: data.currentChild.id,
                  state: 'errored',
                  message: [
                    '😱 Unexpected error under parsing output !! Error: ' + inspect(e),
                    'Consider opening an issue: https://github.com/matepek/vscode-catch2-test-adapter/issues/new/choose',
                    `Please attach the output of: "${runInfo.process.spawnfile} ${runInfo.process.spawnargs}"`,
                    '=== Output ===',
                    testCase,
                    '==============',
                    '⬇ stdoutAndErrBuffer:',
                    data.stdoutAndErrBuffer,
                    '⬆ stdoutAndErrBuffer',
                    '⬇ std::cout:',
                    runInfo.process.stdout,
                    '⬆ std::cout',
                    '⬇ std::cerr:',
                    runInfo.process.stderr,
                    '⬆ std::cerr',
                  ].join('\n'),
                };

                this._shared.sendTestRunEvent(data.currentChild.lastRunEvent);
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

            let ev: AbstractTestEvent;

            if (runInfo.isCancelled) {
              ev = data.currentChild.getCancelledEvent(testRunId, data.stdoutAndErrBuffer);
            } else if (runInfo.timeout !== null) {
              ev = data.currentChild.getTimeoutEvent(testRunId, runInfo.timeout);
            } else {
              ev = data.currentChild.getFailedEventBase(testRunId);

              ev.message = '😱 Unexpected error !!';

              if (result.error) {
                ev.state = 'errored';
                ev.message += '\n' + result.error.message;
              }

              ev.message += data.stdoutAndErrBuffer ? `\n\n>>>${data.stdoutAndErrBuffer}<<<` : '';
            }

            data.currentChild.lastRunEvent = ev;
            this._shared.sendTestRunEvent(ev);
          } else {
            this._shared.log.warn('data.inTestCase: ', data);
          }
        }

        this.sendMinimalEventsIfNeeded(testRunId, data.route, []);
        data.route = [];

        const isTestRemoved =
          runInfo.timeout === null &&
          !runInfo.isCancelled &&
          result.error === undefined &&
          data.processedTestCases.length < runInfo.childrenToRun.length;

        if (data.unprocessedTestCases.length > 0 || isTestRemoved) {
          this.reloadTests(this._shared.taskPool).then(
            () => {
              // we have test results for the newly detected tests
              // after reload we can set the results
              const events: AbstractTestEvent[] = [];

              for (let i = 0; i < data.unprocessedTestCases.length; i++) {
                const testCase = data.unprocessedTestCases[i];

                const m = testCase.match(testBeginRe);
                if (m == null) break;

                const testNameAsId = m[1];

                const currentChild = this._findTest(v => v.compare(testNameAsId));

                if (currentChild === undefined) break;
                try {
                  const ev = currentChild.parseAndProcessTestCase(
                    testRunId,
                    testCase,
                    rngSeed,
                    runInfo.timeout,
                    undefined,
                  );
                  events.push(ev);
                } catch (e) {
                  this._shared.log.error('parsing and processing test', e, testCase);
                }
              }
              events.length && this._shared.sendTestEvents(events);
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
