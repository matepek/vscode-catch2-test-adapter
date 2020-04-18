import * as fs from 'fs';
import { inspect, promisify } from 'util';
import { TestEvent } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';

import * as c2fs from '../FSWrapper';
import { AbstractRunnableSuite } from '../AbstractRunnableSuite';
import { AbstractTest } from '../AbstractTest';
import { Suite } from '../Suite';
import { DOCTest } from './DOCTest';
import { SharedVariables } from '../SharedVariables';
import { RunningTestExecutableInfo, ProcessResult } from '../RunningTestExecutableInfo';
import { RunnableSuiteProperties } from '../RunnableSuiteProperties';
import { Version } from '../Util';

interface XmlObject {
  [prop: string]: any; //eslint-disable-line
}

export class DOCSuite extends AbstractRunnableSuite {
  public constructor(
    shared: SharedVariables,
    label: string,
    desciption: string | undefined,
    execInfo: RunnableSuiteProperties,
    docVersion: Version,
  ) {
    super(shared, label, desciption, execInfo, 'doctest', Promise.resolve(docVersion));
  }

  private _reloadFromString(testListOutput: string, oldChildren: (Suite | AbstractTest)[]): void {
    let res: XmlObject = {};
    new xml2js.Parser({ explicitArray: true }).parseString(testListOutput, (err: Error, result: XmlObject) => {
      if (err) {
        throw err;
      } else {
        res = result;
      }
    });

    for (let i = 0; i < res.doctest.TestCase.length; ++i) {
      const testCase = res.doctest.TestCase[i].$;

      const testName = testCase.name;
      const filePath: string | undefined = testCase.filename ? this._findFilePath(testCase.filename) : undefined;
      const line: number | undefined = testCase.line !== undefined ? Number(testCase.line) - 1 : undefined;
      const skipped: boolean | undefined = testCase.skipped !== undefined ? testCase.skipped === 'true' : undefined;
      const suite: string | undefined = testCase.testsuite !== undefined ? testCase.testsuite : undefined;

      const [old] = Suite.findRouteToTestInArray(oldChildren, v => v.testName === testName);

      const test = new DOCTest(
        this._shared,
        undefined,
        testName,
        skipped,
        filePath,
        line,
        suite !== undefined ? [`${suite}`] : [],
        old as DOCTest,
      );

      this.createAndAddToSubSuite(test, oldChildren);
    }
  }

  protected async _reloadChildren(): Promise<void> {
    const oldChildren = this.children;
    this.children = [];

    const cacheFile = this.execInfo.path + '.cache.txt';

    if (this._shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.execInfo.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this._shared.log.info('loading from cache: ', cacheFile);
          const content = await promisify(fs.readFile)(cacheFile, 'utf8');

          this._reloadFromString(content, oldChildren);
          return Promise.resolve();
        }
      } catch (e) {
        this._shared.log.warn('coudnt use cache', e);
      }
    }

    return c2fs
      .spawnAsync(
        this.execInfo.path,
        this.execInfo.prependTestListingArgs.concat([
          '--list-test-cases',
          '--reporters=xml',
          '--no-skip=true',
          '--no-color=true',
        ]),
        this.execInfo.options,
        30000,
      )
      .then(docTestListOutput => {
        if (docTestListOutput.stderr && !this.execInfo.ignoreTestEnumerationStdErr) {
          this._shared.log.warn(
            'reloadChildren -> docTestListOutput.stderr',
            docTestListOutput.stdout,
            docTestListOutput.stderr,
            docTestListOutput.error,
            docTestListOutput.status,
          );
          this._addUnexpectedStdError(docTestListOutput.stdout, docTestListOutput.stderr);
          return Promise.resolve();
        }

        this._reloadFromString(docTestListOutput.stdout, oldChildren);

        if (this._shared.enabledTestListCaching) {
          return promisify(fs.writeFile)(cacheFile, docTestListOutput.stdout).catch(err =>
            this._shared.log.warn('couldnt write cache file:', err),
          );
        }
        return Promise.resolve();
      });
  }

  protected _getRunParams(childrenToRun: ReadonlyArray<DOCTest>): string[] {
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

  protected _handleProcess(runInfo: RunningTestExecutableInfo): Promise<void> {
    const data = new (class {
      public buffer = '';
      public inTestCase = false;
      public currentChild: AbstractTest | undefined = undefined;
      public route: Suite[] = [];
      public beforeFirstTestCase = true;
      public rngSeed: number | undefined = undefined;
      public unprocessedXmlTestCases: string[] = [];
      public processedTestCases: AbstractTest[] = [];
    })();

    const testCaseTagRe = /<TestCase(\s+[^\n\r]+)[^\/](\/)?>/;

    return new Promise<ProcessResult>(resolve => {
      const chunks: string[] = [];
      const processChunk = (chunk: string): void => {
        chunks.push(chunk);
        data.buffer = data.buffer + chunk;
        let invariant = 99999;
        do {
          if (!data.inTestCase) {
            if (data.beforeFirstTestCase && data.rngSeed === undefined) {
              const ri = data.buffer.match(/<Options\s+[^>\n]*rand_seed="([0-9]+)"/);
              if (ri != null && ri.length == 2) {
                data.rngSeed = Number(ri[1]);
              }
            }

            const m = data.buffer.match(testCaseTagRe);
            if (m == null) return;

            const skipped = m[2] === '/';
            data.inTestCase = true;
            let name = '';

            if (skipped) {
              new xml2js.Parser({ explicitArray: true }).parseString(m[0], (err: Error, result: XmlObject) => {
                if (err) {
                  this._shared.log.exception(err);
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
                    this._shared.log.exception(err);
                    throw err;
                  } else {
                    name = result.TestCase.$.name;
                  }
                },
              );
            }

            data.beforeFirstTestCase = false;

            const [testInfo, route] = this.findRouteToTest(v => v.testName == name);

            if (testInfo !== undefined) {
              this.sendMinimalEventsIfNeeded(data.route, route);
              data.route = route;

              data.currentChild = testInfo;
              this._shared.log.info('Test', data.currentChild.testName, 'has started.');

              if (!skipped) {
                this._shared.testStatesEmitter.fire(data.currentChild.getStartEvent());
                data.buffer = data.buffer.substr(m.index!);
              } else {
                this._shared.log.info('Test ', data.currentChild.testName, 'has skipped.');

                // this always comes so we skip it
                //const testCaseXml = m[0];
                //this._shared.testStatesEmitter.fire(data.currentChild.getStartEvent());
                // try {
                //   const ev: TestEvent = data.currentChild.parseAndProcessTestCase(testCaseXml, data.rngSeed, runInfo);
                //   data.processedTestCases.push(data.currentChild);
                //   this._shared.testStatesEmitter.fire(ev);
                // } catch (e) {
                //   this._shared.log.error('parsing and processing test', e, data, testCaseXml);
                //   this._shared.testStatesEmitter.fire({
                //     type: 'test',
                //     test: data.currentChild,
                //     state: 'errored',
                //     message: '😱 Unexpected error under parsing output !! Error: ' + inspect(e) + '\n',
                //   });
                // }

                data.inTestCase = false;
                data.currentChild = undefined;
                data.buffer = data.buffer.substr(m.index! + m[0].length);
              }
            } else {
              this._shared.log.info('TestCase not found in children', name);
            }
          } else {
            const endTestCase = '</TestCase>';
            const b = data.buffer.indexOf(endTestCase);

            if (b == -1) return;

            const testCaseXml = data.buffer.substring(0, b + endTestCase.length);

            if (data.currentChild !== undefined) {
              this._shared.log.info('Test ', data.currentChild.testName, 'has finished.');
              try {
                const ev = data.currentChild.parseAndProcessTestCase(testCaseXml, data.rngSeed, runInfo);

                this._shared.testStatesEmitter.fire(ev);

                data.processedTestCases.push(data.currentChild);
              } catch (e) {
                this._shared.log.error('parsing and processing test', e, data, chunks, testCaseXml);
                this._shared.testStatesEmitter.fire({
                  type: 'test',
                  test: data.currentChild,
                  state: 'errored',
                  message: [
                    '😱 Unexpected error under parsing output !! Error: ' + inspect(e),
                    'Consider opening an issue: https://github.com/matepek/vscode-catch2-test-adapter/issues/new/choose',
                    '=== Output ===',
                    testCaseXml,
                    '==============',
                  ].join('\n'),
                });
              }
            } else {
              this._shared.log.info('<TestCase> found without TestInfo: ', this, '; ', testCaseXml);
              data.unprocessedXmlTestCases.push(testCaseXml);
            }

            data.inTestCase = false;
            data.currentChild = undefined;
            // do not clear data.route
            data.buffer = data.buffer.substr(b + endTestCase.length);
          }
        } while (data.buffer.length > 0 && --invariant > 0);
        if (invariant == 0) {
          this._shared.log.error('invariant==0', this, runInfo, data, chunks);
          resolve(ProcessResult.error('Possible infinite loop of this extension'));
          runInfo.killProcess();
        }
      };

      runInfo.process.stdout!.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));
      runInfo.process.stderr!.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));

      runInfo.process.once('close', (code: number | null, signal: string | null) => {
        if (this.isCancelled()) {
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
        if ((reason as any).code === undefined) this._shared.log.exception(reason);

        return new ProcessResult(reason);
      })
      .then((result: ProcessResult) => {
        result.error && this._shared.log.info(result.error.toString(), result, runInfo, this, data);

        if (data.inTestCase) {
          if (data.currentChild !== undefined) {
            this._shared.log.info('data.currentChild !== undefined: ', data);
            let ev: TestEvent;

            if (this.isCancelled()) {
              ev = data.currentChild.getCancelledEvent(data.buffer);
            } else if (runInfo.timeout !== null) {
              ev = data.currentChild.getTimeoutEvent(runInfo.timeout);
            } else {
              ev = data.currentChild.getFailedEventBase();

              ev.message = '😱 Unexpected error !!';

              if (result.error) {
                ev.state = 'errored';
                ev.message += '\n' + result.error.message;
              }

              ev.message += runInfo.stderr ? '\n' + runInfo.stderr : '';
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
          !this.isCancelled() &&
          result.error === undefined &&
          data.processedTestCases.length < runInfo.childrenToRun.length;

        if (data.unprocessedXmlTestCases.length > 0 || isTestRemoved) {
          new Promise<void>((resolve, reject) => {
            this._shared.loadWithTaskEmitter.fire(() => {
              return this.reloadTests(this._shared.taskPool).then(resolve, reject);
            });
          }).then(
            () => {
              // we have test results for the newly detected tests
              // after reload we can set the results
              const events: TestEvent[] = [];

              for (let i = 0; i < data.unprocessedXmlTestCases.length; i++) {
                const testCaseXml = data.unprocessedXmlTestCases[i];

                const m = testCaseXml.match(testCaseTagRe);
                if (m == null || m.length != 1) break;

                let name: string | undefined = undefined;
                new xml2js.Parser({ explicitArray: true }).parseString(
                  m[0] + '</TestCase>',
                  (err: Error, result: XmlObject) => {
                    if (err) {
                      this._shared.log.exception(err);
                    } else {
                      name = result.TestCase.$.name;
                    }
                  },
                );
                if (name === undefined) break;

                // xml output trimmes the name of the test
                const [currentChild] = this.findRouteToTest(v => v.testName === name);

                if (currentChild === undefined) break;

                try {
                  const ev = currentChild.parseAndProcessTestCase(testCaseXml, data.rngSeed, runInfo);
                  events.push(ev);
                } catch (e) {
                  this._shared.log.error('parsing and processing test', e, testCaseXml);
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
