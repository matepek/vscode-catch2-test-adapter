import * as fs from 'fs';
import { inspect, promisify } from 'util';
import * as xml2js from 'xml2js';

import * as c2fs from '../FSWrapper';
import { RunnableProperties } from '../RunnableProperties';
import { AbstractRunnable, RunnableReloadResult } from '../AbstractRunnable';
import { Suite } from '../Suite';
import { Catch2Test } from './Catch2Test';
import { SharedVariables } from '../SharedVariables';
import { RunningRunnable, ProcessResult } from '../RunningRunnable';
import { AbstractTest, AbstractTestEvent } from '../AbstractTest';
import { Version } from '../Util';
import { TestGrouping } from '../TestGroupingInterface';
import { RootSuite } from '../RootSuite';

interface XmlObject {
  [prop: string]: any; //eslint-disable-line
}

export class Catch2Runnable extends AbstractRunnable {
  public constructor(
    shared: SharedVariables,
    rootSuite: RootSuite,
    execInfo: RunnableProperties,
    private readonly _catch2Version: Version | undefined,
  ) {
    super(shared, rootSuite, execInfo, 'Catch2', Promise.resolve(_catch2Version));
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
    const lines = testListOutput.split(/\r?\n/);

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

    const reloadResult = new RunnableReloadResult();

    while (i < lines.length) {
      const m = lines[i].match(endRe);
      if (m !== null) break;

      if (!lines[i].startsWith('  ')) this._shared.log.error('Wrong test list output format', i, lines);

      if (lines[i].startsWith('    ')) {
        this._shared.log.warn('Probably too long test name', i, lines);

        return this._createAndAddError(
          `⚡️ Too long test name`,
          [
            '⚠️ Probably too long test name or the test name starts with space characters!',
            '🛠 - Try to define `CATCH_CONFIG_CONSOLE_WIDTH 300` before `catch2.hpp` is included.',
            '🛠 - Remove whitespace characters from the beggining of test "' + lines[i].substr(2) + '"',
          ].join('\n'),
        );
      }
      const testName = lines[i++].substr(2);

      let filePath: string | undefined = undefined;
      let line: number | undefined = undefined;
      {
        const fileLine = lines[i++].substr(4);
        const fileLineRe = /(?:(.+):([0-9]+)|(.+)\(([0-9]+)\))/;
        const match = fileLine.match(fileLineRe);

        if (match && match.length == 5) {
          const matchedPath = match[1] ? match[1] : match[3];
          filePath = this._findFilePath(matchedPath);
          line = Number(match[2] ? match[2] : match[4]) - 1;
        } else {
          if (i < lines.length) {
            const match = (fileLine + lines[i].substr(4)).match(fileLineRe);
            if (match && match.length == 5) {
              const matchedPath = match[1] ? match[1] : match[3];
              filePath = this._findFilePath(matchedPath);
              line = Number(match[2] ? match[2] : match[4]) - 1;
              i += 1;
            } else {
              if (i + 1 < lines.length) {
                const match = (fileLine + lines[i].substr(4) + lines[i + 1].substr(4)).match(fileLineRe);
                if (match && match.length == 5) {
                  const matchedPath = match[1] ? match[1] : match[3];
                  filePath = this._findFilePath(matchedPath);
                  line = Number(match[2] ? match[2] : match[4]) - 1;
                  i += 2;
                } else {
                  this._shared.log.error('Could not find catch2 file info3', lines);
                }
              } else {
                this._shared.log.error('Could not find catch2 file info2', lines);
              }
            }
          } else {
            this._shared.log.error('Could not find catch2 file info1', lines);
          }
        }
      }

      let description = lines[i++].substr(4);
      if (description.startsWith('(NO DESCRIPTION)')) description = '';

      const tags: string[] = [];
      if (i < lines.length && lines[i].startsWith('      [')) {
        const matches = lines[i].match(/\[[^\[\]]+\]/g);
        if (matches) matches.forEach(t => tags.push(t.substring(1, t.length - 1)));
        ++i;
      }

      reloadResult.add(
        ...this._createSubtreeAndAddTest(
          this.getTestGrouping(),
          testName,
          testName,
          filePath,
          tags,
          (parent: Suite) =>
            new Catch2Test(
              this._shared,
              this,
              parent,
              this._catch2Version,
              testName,
              tags,
              filePath,
              line,
              description,
            ),
          (old: AbstractTest): boolean => (old as Catch2Test).update(tags, filePath, line, description),
        ),
      );
    }

    if (i >= lines.length) this._shared.log.error('Wrong test list output format #2', lines);

    return reloadResult;
  }

  private _reloadFromXml(testListOutput: string): RunnableReloadResult {
    let res: XmlObject = {};
    new xml2js.Parser({ explicitArray: false }).parseString(testListOutput, (err: Error, result: XmlObject) => {
      if (err) {
        throw err;
      } else {
        res = result;
      }
    });

    const reloadResult = new RunnableReloadResult();

    const testCases = res.MatchingTests.TestCase;
    for (let i = 0; i < testCases.length; ++i) {
      const testCase = testCases[i];

      const testName = testCase.Name;
      const filePath = testCase?.SourceInfo ? this._findFilePath(testCase?.SourceInfo.File) : undefined;
      const line = testCase?.SourceInfo ? Number(testCase?.SourceInfo.Line) - 1 : undefined;
      const className = testCase.ClassName ? testCase.ClassName : undefined;

      const tags: string[] = [];
      if (testCase.Tags) {
        const matches = testCase.Tags.match(/\[[^\[\]]+\]/g);
        if (matches) matches.forEach((t: string) => tags.push(t.substring(1, t.length - 1)));
        ++i;
      }

      reloadResult.add(
        ...this._createSubtreeAndAddTest(
          this.getTestGrouping(),
          testName,
          testName,
          filePath,
          tags,
          (parent: Suite) =>
            new Catch2Test(this._shared, this, parent, this._catch2Version, testName, tags, filePath, line, className),
          (old: AbstractTest): boolean => (old as Catch2Test).update(tags, filePath, line, className),
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

          if (content === '') {
            this._shared.log.debug('loading from cache failed because file is empty');
          } else {
            return this._catch2Version && this._catch2Version.major >= 3
              ? await this._reloadFromXml(content)
              : await this._reloadFromString(content);
          }
        }
      } catch (e) {
        this._shared.log.warn('coudnt use cache', e);
      }
    }

    const args = this.properties.prependTestListingArgs.concat([
      '[.],*',
      '--verbosity',
      'high',
      '--list-tests',
      '--use-colour',
      'no',
    ]);

    if (this._catch2Version && this._catch2Version.major >= 3) args.push('--reporter', 'xml');

    const catch2TestListOutput = await c2fs.spawnAsync(this.properties.path, args, this.properties.options, 30000);

    if (catch2TestListOutput.stderr && !this.properties.ignoreTestEnumerationStdErr) {
      this._shared.log.warn('reloadChildren -> catch2TestListOutput.stderr', catch2TestListOutput);
      return await this._createAndAddUnexpectedStdError(catch2TestListOutput.stdout, catch2TestListOutput.stderr);
    }

    if (catch2TestListOutput.stdout.length === 0) {
      this._shared.log.debug(catch2TestListOutput);
      throw Error('stoud is empty');
    }

    const result =
      this._catch2Version && this._catch2Version.major >= 3
        ? await this._reloadFromXml(catch2TestListOutput.stdout)
        : await this._reloadFromString(catch2TestListOutput.stdout);

    if (this._shared.enabledTestListCaching) {
      promisify(fs.writeFile)(cacheFile, catch2TestListOutput.stdout).catch(err =>
        this._shared.log.warn('couldnt write cache file:', err),
      );
    }

    return result;
  }

  protected _getRunParams(childrenToRun: readonly Readonly<Catch2Test>[]): string[] {
    const execParams: string[] = [];

    const testNames = childrenToRun.map(c => c.getEscapedTestName());
    execParams.push(testNames.join(','));

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

  public getDebugParams(childrenToRun: readonly AbstractTest[], breakOnFailure: boolean): string[] {
    const debugParams: string[] = [];

    const testNames = childrenToRun.map(c => (c as Catch2Test).getEscapedTestName());
    debugParams.push(testNames.join(','));

    debugParams.push('--reporter');
    debugParams.push('console');
    debugParams.push('--durations');
    debugParams.push('yes');

    if (this._shared.isNoThrow) debugParams.push('--nothrow');

    if (this._shared.rngSeed !== null) {
      debugParams.push('--order');
      debugParams.push('rand');
      debugParams.push('--rng-seed');
      debugParams.push(this._shared.rngSeed.toString());
    }

    // TODO colouring 'debug.enableOutputColouring'

    if (breakOnFailure) debugParams.push('--break');
    return debugParams;
  }

  protected _handleProcess(runInfo: RunningRunnable): Promise<void> {
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

    const testCaseTagRe = /<TestCase(?:\s+[^\n\r]+)?>/;

    return new Promise<ProcessResult>(resolve => {
      const chunks: string[] = [];
      const processChunk = (chunk: string): void => {
        chunks.push(chunk);
        data.stdoutBuffer = data.stdoutBuffer + chunk;
        let invariant = 99999;
        do {
          if (!data.inTestCase) {
            const b = data.stdoutBuffer.indexOf('<TestCase');
            if (b == -1) return;

            const m = data.stdoutBuffer.match(testCaseTagRe);
            if (m == null || m.length != 1) return;

            data.inTestCase = true;

            let name = '';
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

            if (data.beforeFirstTestCase) {
              const ri = data.stdoutBuffer.match(/<Randomness\s+seed="([0-9]+)"\s*\/?>/);
              if (ri != null && ri.length == 2) {
                data.rngSeed = Number(ri[1]);
              }
            }

            data.beforeFirstTestCase = false;

            const test = this._findTest(v => v.compare(name));

            if (test) {
              const route = [...test.route()];
              this.sendMinimalEventsIfNeeded(data.route, route);
              data.route = route;

              data.currentChild = test;
              this._shared.log.info('Test', data.currentChild.testNameAsId, 'has started.');
              this._shared.sendTestRunEvent(data.currentChild.getStartEvent());
            } else {
              this._shared.log.info('TestCase not found in children', name);
            }

            data.stdoutBuffer = data.stdoutBuffer.substr(b);
          } else {
            const endTestCase = '</TestCase>';
            const b = data.stdoutBuffer.indexOf(endTestCase);
            if (b == -1) return;

            const testCaseXml = data.stdoutBuffer.substring(0, b + endTestCase.length);

            if (data.currentChild !== undefined) {
              this._shared.log.info('Test ', data.currentChild.testNameAsId, 'has finished.');
              try {
                const ev = data.currentChild.parseAndProcessTestCase(
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
                    '',
                    '⬇ std::cout:',
                    data.stdoutBuffer,
                    '⬆ std::cout',
                    '⬇ std::cerr:',
                    data.stderrBuffer,
                    '⬆ std::cerr',
                  ].join('\n'),
                });
              }
            } else {
              this._shared.log.info('<TestCase> found without TestInfo', this, testCaseXml);
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
            this._shared.log.info('data.currentChild !== undefined', data);
            let ev: AbstractTestEvent;

            if (runInfo.isCancelled) {
              ev = data.currentChild.getCancelledEvent(data.stdoutBuffer);
            } else if (runInfo.timeout !== null) {
              ev = data.currentChild.getTimeoutEvent(runInfo.timeout);
            } else {
              ev = data.currentChild.getFailedEventBase();

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

        this.sendMinimalEventsIfNeeded(data.route, []);
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

                const currentChild = this._findTest(v => v.compare(name!));

                if (currentChild === undefined) break;

                try {
                  const ev = currentChild.parseAndProcessTestCase(testCaseXml, data.rngSeed, runInfo.timeout, stderr);
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
