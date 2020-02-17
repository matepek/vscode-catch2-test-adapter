import * as fs from 'fs';
import { inspect, promisify } from 'util';
import { TestEvent } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';

import * as c2fs from '../FSWrapper';
import { TestSuiteExecutionInfo } from '../TestSuiteExecutionInfo';
import { AbstractTestSuiteInfo } from '../AbstractTestSuiteInfo';
import { Catch2TestInfo } from './Catch2TestInfo';
import { SharedVariables } from '../SharedVariables';
import { RunningTestExecutableInfo, ProcessResult } from '../RunningTestExecutableInfo';

interface XmlObject {
  [prop: string]: any; //eslint-disable-line
}

export class Catch2TestSuiteInfo extends AbstractTestSuiteInfo {
  public children: Catch2TestInfo[] = [];

  public constructor(
    shared: SharedVariables,
    label: string,
    desciption: string | undefined,
    execInfo: TestSuiteExecutionInfo,
    catch2Version: [number, number, number] | undefined,
  ) {
    super(shared, label, desciption, execInfo, 'Catch2', Promise.resolve(catch2Version));
  }

  private _reloadFromString(testListOutput: string, oldChildren: Catch2TestInfo[]): void {
    let lines = testListOutput.split(/\r?\n/);

    const startRe = /Matching test cases:/;
    const endRe = /[0-9]+ matching test cases?/;

    let i = 0;

    while (i < lines.length) {
      const m = lines[i++].match(startRe);
      if (m !== null) break;
    }

    if (i >= lines.length) {
      this._shared.log.error('Wrong test list output format #1', testListOutput);
      throw Error('Wrong test list output format');
    }

    while (i < lines.length) {
      const m = lines[i].match(endRe);
      if (m !== null) break;

      if (!lines[i].startsWith('  ')) this._shared.log.error('Wrong test list output format', i, lines);

      if (lines[i].startsWith('    ')) {
        this._shared.log.warn('Probably too long test name', i, lines);
        this.children = [];
        const test = this.addChild(
          new Catch2TestInfo(this._shared, undefined, 'Check the test output message for details ⚠️', '', [], '', 0),
        );
        this._shared.sendTestEventEmitter.fire([
          {
            type: 'test',
            test: test,
            state: 'errored',
            message: [
              '⚠️ Probably too long test name or the test name starts with space characters!',
              '🛠 - Try to define `CATCH_CONFIG_CONSOLE_WIDTH 300` before `catch2.hpp` is included.',
              '🛠 - Remove whitespace characters from the beggining of test "' + lines[i].substr(2) + '"',
            ].join('\n'),
          },
        ]);
        return;
      }
      const testNameAsId = lines[i++].substr(2);

      let filePath = '';
      let line = 1;
      {
        const fileLine = lines[i++].substr(4);
        const match = fileLine.match(/(?:(.+):([0-9]+)|(.+)\(([0-9]+)\))/);

        if (match && match.length == 5) {
          const matchedPath = match[1] ? match[1] : match[3];
          filePath = this._findFilePath(matchedPath);
          line = Number(match[2] ? match[2] : match[4]);
        }
      }

      let description = lines[i++].substr(4);
      if (description.startsWith('(NO DESCRIPTION)')) description = '';

      let tags: string[] = [];
      if (i < lines.length && lines[i].length > 6 && lines[i][6] === '[') {
        tags = lines[i].trim().split(']');
        tags.pop();
        for (let j = 0; j < tags.length; ++j) tags[j] += ']';
        ++i;
      }

      const index = oldChildren.findIndex(c => c.testNameAsId == testNameAsId);

      this.addChild(
        new Catch2TestInfo(
          this._shared,
          index != -1 ? oldChildren[index].id : undefined,
          testNameAsId,
          description,
          tags,
          filePath,
          line - 1,
          index != -1 ? oldChildren[index].sections : undefined,
        ),
      );
    }

    if (i >= lines.length) this._shared.log.error('Wrong test list output format #2', lines);
  }

  protected async _reloadChildren(): Promise<void> {
    const oldChildren = this.children;
    this.children = [];
    this.label = this.origLabel;

    const cacheFile = this.execInfo.path + '.cache.txt';

    if (this._shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.execInfo.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this._shared.log.info('loading from cache: ', cacheFile);
          const content = await promisify(fs.readFile)(cacheFile, 'utf8');

          if (content === '') {
            this._shared.log.debug('loading from cache failed because file is empty');
          } else {
            this._reloadFromString(content, oldChildren);

            return;
          }
        }
      } catch (e) {
        this._shared.log.warn('coudnt use cache', e);
      }
    }

    const catch2TestListOutput = await c2fs.spawnAsync(
      this.execInfo.path,
      ['[.],*', '--verbosity', 'high', '--list-tests', '--use-colour', 'no'],
      this.execInfo.options,
      30000,
    );

    if (catch2TestListOutput.stderr && !this.execInfo.ignoreTestEnumerationStdErr) {
      this._shared.log.warn('reloadChildren -> catch2TestListOutput.stderr', catch2TestListOutput);
      const test = this.addChild(
        new Catch2TestInfo(this._shared, undefined, 'Check the test output message for details ⚠️', '', [], '', 0),
      );
      this._shared.sendTestEventEmitter.fire([
        {
          type: 'test',
          test: test,
          state: 'errored',
          message: `❗️Unexpected stderr!\nspawn\nstout:\n${catch2TestListOutput.stdout}\nstderr:\n${catch2TestListOutput.stderr}`,
        },
      ]);
      return Promise.resolve();
    }

    if (catch2TestListOutput.stdout.length === 0) {
      this._shared.log.debug(catch2TestListOutput);
      throw Error('stoud is empty');
    }

    this._reloadFromString(catch2TestListOutput.stdout, oldChildren);

    if (this._shared.enabledTestListCaching) {
      return promisify(fs.writeFile)(cacheFile, catch2TestListOutput.stdout).catch(err =>
        this._shared.log.warn('couldnt write cache file:', err),
      );
    }
  }

  protected _getRunParams(childrenToRun: 'runAllTestsExceptSkipped' | Set<Catch2TestInfo>): string[] {
    const execParams: string[] = [];

    if (childrenToRun !== 'runAllTestsExceptSkipped') {
      const testNames = [...childrenToRun].map(c => c.getEscapedTestName());
      execParams.push(testNames.join(','));
    }

    execParams.push('--reporter');
    execParams.push('xml');
    execParams.push('--durations');
    execParams.push('yes');

    if (this._shared.isNoThrow) execParams.push('--nothrow');

    if (this._shared.rngSeed !== null) {
      execParams.push('--order');
      execParams.push('rand');
      execParams.push('--rng-seed');
      execParams.push(this._shared.rngSeed.toString());
    }

    return execParams;
  }

  protected _handleProcess(runInfo: RunningTestExecutableInfo): Promise<void> {
    const data = new (class {
      public buffer: string = '';
      public inTestCase: boolean = false;
      public currentChild: Catch2TestInfo | undefined = undefined;
      public beforeFirstTestCase: boolean = true;
      public rngSeed: number | undefined = undefined;
      public unprocessedXmlTestCases: string[] = [];
      public processedTestCases: Catch2TestInfo[] = [];
    })();

    const testCaseTagRe = /<TestCase(?:\s+[^\n\r]+)?>/;

    return new Promise<ProcessResult>(resolve => {
      const chunks: string[] = [];
      const processChunk = (chunk: string): void => {
        chunks.push(chunk);
        data.buffer = data.buffer + chunk;
        let invariant = 99999;
        do {
          if (!data.inTestCase) {
            const b = data.buffer.indexOf('<TestCase');
            if (b == -1) return;

            const m = data.buffer.match(testCaseTagRe);
            if (m == null || m.length != 1) return;

            data.inTestCase = true;

            let name = '';
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

            if (data.beforeFirstTestCase) {
              const ri = data.buffer.match(/<Randomness\s+seed="([0-9]+)"\s*\/?>/);
              if (ri != null && ri.length == 2) {
                data.rngSeed = Number(ri[1]);
              }
            }

            data.beforeFirstTestCase = false;
            data.currentChild = this.children.find((v: Catch2TestInfo) => {
              // xml output trimmes the name of the test
              return v.testNameAsId.trim() == name;
            });

            if (data.currentChild !== undefined) {
              this._shared.log.info('Test', data.currentChild.testNameAsId, 'has started.');
              this._shared.testStatesEmitter.fire(data.currentChild.getStartEvent());
            } else {
              this._shared.log.info('TestCase not found in children', name);
            }

            data.buffer = data.buffer.substr(b);
          } else {
            const endTestCase = '</TestCase>';
            const b = data.buffer.indexOf(endTestCase);
            if (b == -1) return;

            const testCaseXml = data.buffer.substring(0, b + endTestCase.length);

            if (data.currentChild !== undefined) {
              this._shared.log.info('Test ', data.currentChild.testNameAsId, 'has finished.');
              try {
                const ev: TestEvent = data.currentChild.parseAndProcessTestCase(testCaseXml, data.rngSeed, runInfo);
                data.processedTestCases.push(data.currentChild);
                this._shared.testStatesEmitter.fire(ev);
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
              this._shared.log.info('<TestCase> found without TestInfo', this, testCaseXml);
              data.unprocessedXmlTestCases.push(testCaseXml);
            }

            data.inTestCase = false;
            data.currentChild = undefined;
            data.buffer = data.buffer.substr(b + endTestCase.length);
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

        if (data.inTestCase) {
          if (data.currentChild !== undefined) {
            this._shared.log.info('data.currentChild !== undefined', data);
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

              ev.message += runInfo.stderr ? '\n' + runInfo.stderr : '';
            }

            data.currentChild.lastRunEvent = ev;
            this._shared.testStatesEmitter.fire(ev);
          } else {
            this._shared.log.warn('data.inTestCase: ', data);
          }
        }

        const isTestRemoved =
          runInfo.timeout === null &&
          result.error === undefined &&
          ((runInfo.childrenToRun === 'runAllTestsExceptSkipped' &&
            this.getTestInfoCount(false) > data.processedTestCases.length) ||
            (runInfo.childrenToRun !== 'runAllTestsExceptSkipped' && data.processedTestCases.length == 0));

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

                const currentChild = this.children.find((v: Catch2TestInfo) => {
                  // xml output trimmes the name of the test
                  return v.testNameAsId.trim() == name;
                });
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

  public addChild(test: Catch2TestInfo): Catch2TestInfo {
    super.addChild(test);
    return test;
  }
}
