import * as fs from 'fs';
import { inspect, promisify } from 'util';
import * as xml2js from 'xml2js';

import { AbstractRunnable, RunnableReloadResult } from '../AbstractRunnable';
import { AbstractTest, AbstractTestEvent } from '../AbstractTest';
import { Suite } from '../Suite';
import { DOCTest } from './DOCTest';
import { SharedVariables } from '../SharedVariables';
import { RunningRunnable, ProcessResult } from '../RunningRunnable';
import { RunnableProperties } from '../RunnableProperties';
import { Version } from '../Util';
import { TestGrouping } from '../TestGroupingInterface';
import { RootSuite } from '../RootSuite';

interface XmlObject {
  [prop: string]: any; //eslint-disable-line
}

export class DOCRunnable extends AbstractRunnable {
  public constructor(
    shared: SharedVariables,
    rootSuite: RootSuite,
    execInfo: RunnableProperties,
    docVersion: Version | undefined,
  ) {
    super(shared, rootSuite, execInfo, 'doctest', Promise.resolve(docVersion));
  }

  private getTestGrouping(): TestGrouping {
    if (this.properties.testGrouping) {
      return this.properties.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      return grouping;
    }
  }

  private _reloadFromString(testListOutput: string): RunnableReloadResult {
    const testGrouping = this.getTestGrouping();
    let res: XmlObject = {};
    new xml2js.Parser({ explicitArray: true }).parseString(testListOutput, (err: Error, result: XmlObject) => {
      if (err) {
        throw err;
      } else {
        res = result;
      }
    });

    const reloadResult = new RunnableReloadResult();

    for (let i = 0; i < res.doctest.TestCase.length; ++i) {
      const testCase = res.doctest.TestCase[i].$;

      const testName = testCase.name;
      const filePath: string | undefined = testCase.filename ? this._findFilePath(testCase.filename) : undefined;
      const line: number | undefined = testCase.line !== undefined ? Number(testCase.line) - 1 : undefined;
      const skippedOpt: boolean | undefined = testCase.skipped !== undefined ? testCase.skipped === 'true' : undefined;
      const suite: string | undefined = testCase.testsuite !== undefined ? testCase.testsuite : undefined;

      const tags = suite !== undefined ? [`${suite}`] : [];
      const skipped = skippedOpt !== undefined ? skippedOpt : false;

      reloadResult.add(
        ...this._createSubtreeAndAddTest(
          testGrouping,
          testName,
          testName,
          filePath,
          [],
          (parent: Suite) => new DOCTest(this._shared, this, parent, testName, skipped, filePath, line, tags),
          (old: AbstractTest): boolean => (old as DOCTest).update(filePath, line, tags, skipped),
        ),
      );
    }

    return reloadResult;
  }

  protected async _reloadChildren(): Promise<RunnableReloadResult> {
    const cacheFile = this.properties.path + '.TestMate.testListCache.txt';

    if (this._shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.properties.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this._shared.log.info('loading from cache: ', cacheFile);
          const content = await promisify(fs.readFile)(cacheFile, 'utf8');

          return await this._reloadFromString(content);
        }
      } catch (e) {
        this._shared.log.warn('coudnt use cache', e);
      }
    }

    const args = this.properties.prependTestListingArgs.concat([
      '--list-test-cases',
      '--reporters=xml',
      '--no-skip=true',
      '--no-color=true',
    ]);

    this._shared.log.info('discovering tests', this.properties.path, args, this.properties.options.cwd);
    const docTestListOutput = await this.properties.spawner.spawnAsync(
      this.properties.path,
      args,
      this.properties.options,
      30000,
    );

    if (docTestListOutput.stderr && !this.properties.ignoreTestEnumerationStdErr) {
      this._shared.log.warn(
        'reloadChildren -> docTestListOutput.stderr',
        docTestListOutput.stdout,
        docTestListOutput.stderr,
        docTestListOutput.error,
        docTestListOutput.status,
      );
      return await this._createAndAddUnexpectedStdError(docTestListOutput.stdout, docTestListOutput.stderr);
    }

    const result = await this._reloadFromString(docTestListOutput.stdout);

    if (this._shared.enabledTestListCaching) {
      promisify(fs.writeFile)(cacheFile, docTestListOutput.stdout).catch(err =>
        this._shared.log.warn('couldnt write cache file:', err),
      );
    }

    return result;
  }

  protected _getRunParams(childrenToRun: readonly Readonly<DOCTest>[]): string[] {
    const execParams: string[] = [];

    const testNames = childrenToRun.map(c => c.getEscapedTestName());
    execParams.push('--test-case=' + testNames.join(','));
    execParams.push('--no-skip=true');

    execParams.push('--case-sensitive=true');
    execParams.push('--reporters=xml');
    execParams.push('--duration=true');

    if (this._shared.isNoThrow) execParams.push('--no-throw=true');

    if (this._shared.rngSeed !== null) {
      execParams.push('--order-by=rand');
      execParams.push('--rand-seed=' + this._shared.rngSeed.toString());
    }

    return execParams;
  }

  // eslint-disable-next-line
  public getDebugParams(childrenToRun: readonly Readonly<AbstractTest>[], breakOnFailure: boolean): string[] {
    const params = this._getRunParams(childrenToRun as readonly Readonly<DOCTest>[]);
    return params;
  }

  protected _handleProcess(testRunId: string, runInfo: RunningRunnable): Promise<void> {
    const data = new (class {
      public stdoutBuffer = '';
      public stderrBuffer = '';
      public inTestCase = false;
      public currentChild: AbstractTest | undefined = undefined;
      public route: Suite[] = [];
      public beforeFirstTestCase = true;
      public rngSeed: number | undefined = undefined;
      public unprocessedXmlTestCases: [string, string][] = [];
      public processedTestCases: AbstractTest[] = [];
    })();

    const testCaseTagRe = /<TestCase(\s+[^\n\r]+)[^\/](\/)?>/;

    return new Promise<ProcessResult>(resolve => {
      const chunks: string[] = [];
      const processChunk = (chunk: string): void => {
        chunks.push(chunk);
        data.stdoutBuffer = data.stdoutBuffer + chunk;
        let invariant = 99999;
        do {
          if (!data.inTestCase) {
            if (data.beforeFirstTestCase && data.rngSeed === undefined) {
              const ri = data.stdoutBuffer.match(/<Options\s+[^>\n]*rand_seed="([0-9]+)"/);
              if (ri != null && ri.length == 2) {
                data.rngSeed = Number(ri[1]);
              }
            }

            const m = data.stdoutBuffer.match(testCaseTagRe);
            if (m == null) return;

            const skipped = m[2] === '/';
            data.inTestCase = true;
            let name = '';

            if (skipped) {
              new xml2js.Parser({ explicitArray: true }).parseString(m[0], (err: Error, result: XmlObject) => {
                if (err) {
                  this._shared.log.exceptionS(err);
                  throw err;
                } else {
                  name = result.TestCase.$.name;
                }
              });
            } else {
              new xml2js.Parser({ explicitArray: true }).parseString(
                m[0] + '</TestCase>',
                (err: Error, result: XmlObject) => {
                  if (err) {
                    this._shared.log.exceptionS(err);
                    throw err;
                  } else {
                    name = result.TestCase.$.name;
                  }
                },
              );
            }

            data.beforeFirstTestCase = false;

            const test = this._findTest(v => v.compare(name));

            if (test) {
              const route = [...test.route()];
              this.sendMinimalEventsIfNeeded(testRunId, data.route, route);
              data.route = route;

              data.currentChild = test;
              this._shared.log.info('Test', data.currentChild.testNameAsId, 'has started.');

              if (!skipped) {
                this._shared.sendTestRunEvent(data.currentChild.getStartEvent(testRunId));
                data.stdoutBuffer = data.stdoutBuffer.substr(m.index!);
              } else {
                this._shared.log.info('Test ', data.currentChild.testNameAsId, 'has skipped.');

                // this always comes so we skip it
                //const testCaseXml = m[0];
                //this._shared.sendTestEvent(data.currentChild.getStartEvent());
                // try {
                //   const ev: TestEvent = data.currentChild.parseAndProcessTestCase(testCaseXml, data.rngSeed, runInfo);
                //   data.processedTestCases.push(data.currentChild);
                //   this._shared.sendTestEvent(ev);
                // } catch (e) {
                //   this._shared.log.error('parsing and processing test', e, data, testCaseXml);
                //   this._shared.sendTestEvent({
                //     type: 'test',
                //     test: data.currentChild,
                //     state: 'errored',
                //     message: '😱 Unexpected error under parsing output !! Error: ' + inspect(e) + '\n',
                //   });
                // }

                data.inTestCase = false;
                data.currentChild = undefined;
                data.stdoutBuffer = data.stdoutBuffer.substr(m.index! + m[0].length);
              }
            } else {
              this._shared.log.info('TestCase not found in children', name);
            }
          } else {
            const endTestCase = '</TestCase>';
            const b = data.stdoutBuffer.indexOf(endTestCase);

            if (b == -1) return;

            const testCaseXml = data.stdoutBuffer.substring(0, b + endTestCase.length);

            if (data.currentChild !== undefined) {
              this._shared.log.info('Test ', data.currentChild.testNameAsId, 'has finished.');
              try {
                const ev = data.currentChild.parseAndProcessTestCase(
                  testRunId,
                  testCaseXml,
                  data.rngSeed,
                  runInfo.timeout,
                  data.stderrBuffer,
                );

                this._shared.sendTestRunEvent(ev);

                data.processedTestCases.push(data.currentChild);
              } catch (e) {
                this._shared.log.error('parsing and processing test', e, data, chunks, testCaseXml);
                this._shared.sendTestRunEvent({
                  type: 'test',
                  test: data.currentChild,
                  state: 'errored',
                  message: [
                    '😱 Unexpected error under parsing output !! Error: ' + inspect(e),
                    'Consider opening an issue: https://github.com/matepek/vscode-catch2-test-adapter/issues/new/choose',
                    `Please attach the output of: "${runInfo.process.spawnfile} ${runInfo.process.spawnargs}"`,
                    '',
                    '⬇ std::cout:',
                    runInfo.process.stdout,
                    '⬆ std::cout',
                    '⬇ stdoutBuffer:',
                    data.stdoutBuffer,
                    '⬆ stdoutBuffer',
                    '⬇ std::cerr:',
                    runInfo.process.stderr,
                    '⬆ std::cerr',
                    '⬇ stderrBuffer:',
                    data.stderrBuffer,
                    '⬆ stderrBuffer',
                  ].join('\n'),
                });
              }
            } else {
              this._shared.log.info('<TestCase> found without TestInfo: ', this, '; ', testCaseXml);
              data.unprocessedXmlTestCases.push([testCaseXml, data.stderrBuffer]);
            }

            data.inTestCase = false;
            data.currentChild = undefined;
            // do not clear data.route
            data.stdoutBuffer = data.stdoutBuffer.substr(b + endTestCase.length);
            data.stderrBuffer = '';
          }
        } while (data.stdoutBuffer.length > 0 && --invariant > 0);
        if (invariant == 0) {
          this._shared.log.error('invariant==0', this, runInfo, data, chunks);
          resolve(ProcessResult.error('Possible infinite loop of this extension'));
          runInfo.killProcess();
        }
      };

      runInfo.process.stdout!.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));
      runInfo.process.stderr!.on('data', (chunk: Uint8Array) => (data.stderrBuffer += chunk.toLocaleString()));

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

        if (data.inTestCase) {
          if (data.currentChild !== undefined) {
            this._shared.log.info('data.currentChild !== undefined: ', data);
            let ev: AbstractTestEvent;

            if (runInfo.isCancelled) {
              ev = data.currentChild.getCancelledEvent(testRunId, data.stdoutBuffer);
            } else if (runInfo.timeout !== null) {
              ev = data.currentChild.getTimeoutEvent(testRunId, runInfo.timeout);
            } else {
              ev = data.currentChild.getFailedEventBase(testRunId);

              ev.message = '😱 Unexpected error !!';

              if (result.error) {
                ev.state = 'errored';
                ev.message += '\n' + result.error.message;
              }

              ev.message += [
                '',
                '⬇ std::cout:',
                data.stdoutBuffer,
                '⬆ std::cout',
                '⬇ std::cerr:',
                data.stderrBuffer,
                '⬆ std::cerr',
              ].join('\n');
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

        if (data.unprocessedXmlTestCases.length > 0 || isTestRemoved) {
          this.reloadTests(this._shared.taskPool).then(
            () => {
              // we have test results for the newly detected tests
              // after reload we can set the results
              const events: AbstractTestEvent[] = [];

              for (let i = 0; i < data.unprocessedXmlTestCases.length; i++) {
                const [testCaseXml, stderr] = data.unprocessedXmlTestCases[i];

                const m = testCaseXml.match(testCaseTagRe);
                if (m == null || m.length != 1) break;

                let name: string | undefined = undefined;
                new xml2js.Parser({ explicitArray: true }).parseString(
                  m[0] + '</TestCase>',
                  (err: Error, result: XmlObject) => {
                    if (err) {
                      this._shared.log.exceptionS(err);
                    } else {
                      name = result.TestCase.$.name;
                    }
                  },
                );
                if (name === undefined) break;

                // xml output trimmes the name of the test
                const currentChild = this._findTest(v => v.compare(name!));

                if (currentChild === undefined) break;

                try {
                  const ev = currentChild.parseAndProcessTestCase(
                    testRunId,
                    testCaseXml,
                    data.rngSeed,
                    runInfo.timeout,
                    stderr,
                  );
                  events.push(ev);
                } catch (e) {
                  this._shared.log.error('parsing and processing test', e, testCaseXml);
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
