import * as fs from 'fs-extra';
import { inspect } from 'util';
import { mergeFiles } from 'junit-report-merger';
import { Suite } from '../Suite';
import { AbstractRunnable, RunnableReloadResult } from '../AbstractRunnable';
import { CppUTestTest } from './CppUTestTest';
import { Parser } from 'xml2js';
import { RunnableProperties } from '../RunnableProperties';
import { SharedVariables } from '../SharedVariables';
import { RunningRunnable, ProcessResult } from '../RunningRunnable';
import { AbstractTest, AbstractTestEvent } from '../AbstractTest';
import { CancellationFlag, Version } from '../Util';
import { TestGrouping } from '../TestGroupingInterface';
import { RootSuite } from '../RootSuite';

export class CppUTestRunnable extends AbstractRunnable {
  public constructor(
    shared: SharedVariables,
    rootSuite: RootSuite,
    execInfo: RunnableProperties,
    version: Promise<Version | undefined>,
  ) {
    super(shared, rootSuite, execInfo, 'CppUTest', version);
  }

  private getTestGrouping(): TestGrouping {
    if (this.properties.testGrouping) {
      return this.properties.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      return grouping;
    }
  }

  private async _reloadFromXml(xmlStr: string, cancellationFlag: CancellationFlag): Promise<RunnableReloadResult> {
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

    const processTestcases = async (testsuite: XmlObject, reloadResult: RunnableReloadResult): Promise<void> => {
      const suiteName = testsuite.$.name;
      for (let i = 0; i < testsuite.testcase.length; i++) {
        if (cancellationFlag.isCancellationRequested) return;

        const testCase = testsuite.testcase[i];
        const testName = testCase.$.name.startsWith('DISABLED_') ? testCase.$.name.substr(9) : testCase.$.name;
        const testNameAsId = suiteName + '.' + testCase.$.name;

        const file = testCase.$.file ? await this._resolveSourceFilePath(testCase.$.file) : undefined;
        const line = testCase.$.line ? testCase.$.line - 1 : undefined;

        reloadResult.add(
          ...(await this._createSubtreeAndAddTest(
            testGrouping,
            testNameAsId,
            testName,
            file,
            [suiteName],
            (parent: Suite) => new CppUTestTest(this._shared, this, parent, testNameAsId, testName, file, line),
            (old: AbstractTest) => (old as CppUTestTest).update(testNameAsId, file, line),
          )),
        );
      }
    };

    if (xml.testsuites !== undefined) {
      for (let i = 0; i < xml.testsuites.testsuite.length; ++i) {
        await processTestcases(xml.testsuites.testsuite[i], reloadResult).catch(err =>
          this._shared.log.info('Error', err),
        );
      }
    } else {
      await processTestcases(xml.testsuite, reloadResult);
    }

    return reloadResult;
  }

  private async _reloadFromString(
    stdOutStr: string,
    cancellationFlag: CancellationFlag,
  ): Promise<RunnableReloadResult> {
    const testGrouping = this.getTestGrouping();
    const lines = stdOutStr.split(' ');

    const reloadResult = new RunnableReloadResult();

    for (let i = 0; i < lines.length; i++) {
      if (cancellationFlag.isCancellationRequested) return reloadResult;
      const suiteName = lines[i].split('.')[0];
      const testName = lines[i].split('.')[1];
      const testNameAsId = suiteName + '.' + testName;

      reloadResult.add(
        ...(await this._createSubtreeAndAddTest(
          testGrouping,
          testNameAsId,
          testName,
          undefined,
          [suiteName],
          (parent: Suite) => new CppUTestTest(this._shared, this, parent, testNameAsId, testName, undefined, undefined),
          (old: AbstractTest) => (old as CppUTestTest).update(testNameAsId, undefined, undefined),
        )),
      );
    }
    return reloadResult;
  }

  protected async _reloadChildren(cancellationFlag: CancellationFlag): Promise<RunnableReloadResult> {
    const cacheFile = this.properties.path + '.TestMate.testListCache.xml';

    if (this._shared.enabledTestListCaching) {
      try {
        const cacheStat = await fs.stat(cacheFile);
        const execStat = await fs.stat(this.properties.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this._shared.log.info('loading from cache: ', cacheFile);
          const xmlStr = await fs.readFile(cacheFile, 'utf8');

          return await this._reloadFromXml(xmlStr, cancellationFlag);
        }
      } catch (e) {
        this._shared.log.info('coudnt use cache', e);
      }
    }

    const args = this.properties.prependTestListingArgs.concat(['-ln']);

    this._shared.log.info('discovering tests', this.properties.path, args, this.properties.options.cwd);
    const cppUTestListOutput = await this.properties.spawner.spawnAsync(
      this.properties.path,
      args,
      this.properties.options,
      30000,
    );

    if (cppUTestListOutput.stderr && !this.properties.ignoreTestEnumerationStdErr) {
      this._shared.log.warn('reloadChildren -> cppUTestListOutput.stderr: ', cppUTestListOutput);
      return await this._createAndAddUnexpectedStdError(cppUTestListOutput.stdout, cppUTestListOutput.stderr);
    }

    if (cppUTestListOutput.stdout.length === 0) {
      this._shared.log.debug(cppUTestListOutput);
      throw Error('stoud is empty');
    }

    const result = this._reloadFromString(cppUTestListOutput.stdout, cancellationFlag);

    if (this._shared.enabledTestListCaching) {
      //Generate xmls folder
      const junitXmlsFolderPath = this.properties.path + '_junit_xmls';
      fs.mkdir(junitXmlsFolderPath)
        .then(() => this._shared.log.info('junit-xmls folder created', junitXmlsFolderPath))
        .catch(err => this._shared.log.error('error creating xmls folder: ', junitXmlsFolderPath, err));
      //Generate xml files
      const args = this.properties.prependTestListingArgs.concat(['-ojunit']);
      const options = { cwd: junitXmlsFolderPath };
      await this.properties.spawner
        .spawnAsync(this.properties.path, args, options, 30000)
        .then(() => this._shared.log.info('create cpputest xmls', this.properties.path, args, options.cwd));
      //Merge xmls into single xml
      fs.readdir(junitXmlsFolderPath, (err, files) => {
        if (files.length > 1) {
          mergeFiles(cacheFile, [junitXmlsFolderPath + '/*.xml'])
            .then(() => this._shared.log.info('cache xml written', cacheFile))
            .catch(err => this._shared.log.warn('combine xml cache file could not create: ', cacheFile, err));
        } else {
          fs.copyFile(junitXmlsFolderPath + '/' + files[0], cacheFile);
        }
      });
      //Delete xmls folder
      fs.remove(junitXmlsFolderPath)
        .then(() => this._shared.log.info('junit-xmls folder deleted', junitXmlsFolderPath))
        .catch(err => this._shared.log.error('error deleting xmls folder: ', junitXmlsFolderPath, err));
    }
    return result;
  }

  protected _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    // TODO: Add multiple options
    const execParams: string[] = [];
    childrenToRun.forEach(t => {
      execParams.push(`TEST(${t.testNameAsId.split('.')[0]}, ${t.testNameAsId.split('.')[1]})`);
    });
    execParams.push('-c');
    execParams.push('-v');
    return execParams;
  }

  protected _getDebugParamsInner(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    // TODO: Proper debug options
    // TODO: colouring 'debug.enableOutputColouring'
    // TODO: Add multiple options
    const execParams: string[] = [];
    childrenToRun.forEach(t => {
      execParams.push(`TEST(${t.testNameAsId.split('.')[0]}, ${t.testNameAsId.split('.')[1]})`);
    });
    execParams.push('-c');
    execParams.push('-v');

    return execParams;
  }

  protected _handleProcess(testRunId: string, runInfo: RunningRunnable): Promise<void> {
    const data = new (class {
      public stdoutAndErrBuffer = '';
      public currentTestCaseNameFull: string | undefined = undefined;
      public currentChild: AbstractTest | undefined = undefined;
      public route: Suite[] = [];
      public unprocessedTestCases: string[] = [];
      public processedTestCases: AbstractTest[] = [];
    })();

    const testBeginRe = /^TEST\(((.+?)\,\s*(.+?))\)/m;
    const rngSeed: number | undefined = typeof this._shared.rngSeed === 'number' ? this._shared.rngSeed : undefined;

    return new Promise<ProcessResult>(resolve => {
      const chunks: string[] = [];
      const processChunk = (chunk: string): void => {
        chunks.push(chunk);
        data.stdoutAndErrBuffer = data.stdoutAndErrBuffer + chunk;
        let invariant = 99999;
        do {
          if (runInfo.cancellationToken.isCancellationRequested) return;

          if (data.currentTestCaseNameFull === undefined) {
            const m = data.stdoutAndErrBuffer.match(testBeginRe);
            if (m == null) return;

            data.currentTestCaseNameFull = m[2] + '.' + m[3];

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
            const testEndRe = / - \d+ ms$/m;
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
            data.stdoutAndErrBuffer = data.stdoutAndErrBuffer.substr(m.index! + m[0].length);
          }
        } while (data.stdoutAndErrBuffer.length > 0 && --invariant > 0);
        if (invariant == 0) {
          this._shared.log.error('invariant==0', this, runInfo, data, chunks);
          resolve(ProcessResult.error('Possible infinite loop of this extension'));
          runInfo.killProcess();
        }
      };

      runInfo.process.stdout.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));
      runInfo.process.stderr.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));

      runInfo.process.once('close', (code: number | null, signal: string | null) => {
        if (runInfo.cancellationToken.isCancellationRequested) {
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

            if (runInfo.cancellationToken.isCancellationRequested) {
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
          !runInfo.cancellationToken.isCancellationRequested &&
          result.error === undefined &&
          data.processedTestCases.length < runInfo.childrenToRun.length;

        if (data.unprocessedTestCases.length > 0 || isTestRemoved) {
          this.reloadTests(this._shared.taskPool, runInfo.cancellationToken).then(
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
                  this._shared.log.error('parsing and processing test failed', e, testCase);
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
