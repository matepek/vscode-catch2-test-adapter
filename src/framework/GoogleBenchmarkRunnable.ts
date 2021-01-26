import * as fs from 'fs';
import { promisify } from 'util';

import { Suite } from '../Suite';
import { AbstractRunnable, RunnableReloadResult } from '../AbstractRunnable';
import { GoogleBenchmarkTest } from './GoogleBenchmarkTest';
import { RunnableProperties } from '../RunnableProperties';
import { SharedVariables } from '../SharedVariables';
import { RunningRunnable, ProcessResult } from '../RunningRunnable';
import { AbstractTest } from '../AbstractTest';
import { CancellationFlag, Version } from '../Util';
import { TestGrouping } from '../TestGroupingInterface';
import { RootSuite } from '../RootSuite';

export class GoogleBenchmarkRunnable extends AbstractRunnable {
  public constructor(
    shared: SharedVariables,
    rootSuite: RootSuite,
    execInfo: RunnableProperties,
    version: Promise<Version | undefined>,
  ) {
    super(shared, rootSuite, execInfo, 'GoogleBenchmark', version);
  }

  private getTestGrouping(): TestGrouping {
    if (this.properties.testGrouping) {
      return this.properties.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      return grouping;
    }
  }

  private async _reloadFromString(
    stdOutStr: string,
    cancellationFlag: CancellationFlag,
  ): Promise<RunnableReloadResult> {
    const testGrouping = this.getTestGrouping();
    const lines = stdOutStr.split(/\r?\n/);

    const reloadResult = new RunnableReloadResult();

    const filteredLines = lines.filter(x => x.length > 0);

    for (const line of filteredLines) {
      if (cancellationFlag.isCancellationRequested) return reloadResult;

      reloadResult.add(
        ...(await this._createSubtreeAndAddTest(
          testGrouping,
          line,
          line,
          undefined,
          [],
          (parent: Suite) =>
            new GoogleBenchmarkTest(this._shared, this, parent, line, this.properties.failIfExceedsLimitNs),
          (old: AbstractTest) => (old as GoogleBenchmarkTest).update(this.properties.failIfExceedsLimitNs),
        )),
      );
    }

    return reloadResult;
  }

  protected async _reloadChildren(cancellationFlag: CancellationFlag): Promise<RunnableReloadResult> {
    const cacheFile = this.properties.path + '.TestMate.testListCache.xml';

    if (this._shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.properties.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this._shared.log.info('loading from cache: ', cacheFile);
          const str = await promisify(fs.readFile)(cacheFile, 'utf8');

          return await this._reloadFromString(str, cancellationFlag);
        }
      } catch (e) {
        this._shared.log.info('coudnt use cache', e);
      }
    }

    const args = this.properties.prependTestListingArgs.concat([`--benchmark_list_tests=true`]);

    this._shared.log.info('discovering tests', this.properties.path, args, this.properties.options.cwd);
    const listOutput = await this.properties.spawner.spawnAsync(
      this.properties.path,
      args,
      this.properties.options,
      30000,
    );

    if (listOutput.stderr && !this.properties.ignoreTestEnumerationStdErr) {
      this._shared.log.warn('reloadChildren -> googleBenchmarkTestListOutput.stderr: ', listOutput);
      return await this._createAndAddUnexpectedStdError(listOutput.stdout, listOutput.stderr);
    } else {
      try {
        const result = await this._reloadFromString(listOutput.stdout, cancellationFlag);

        if (this._shared.enabledTestListCaching) {
          promisify(fs.writeFile)(cacheFile, listOutput.stdout).catch(err =>
            this._shared.log.warn('couldnt write cache file:', err),
          );
        }

        return result;
      } catch (e) {
        this._shared.log.info('GoogleBenchmark._reloadFromStdOut error', e, listOutput);
        throw e;
      }
    }
  }

  private _getRunParamsCommon(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    const execParams: string[] = [];

    const testNames = childrenToRun.map(c => c.testNameAsId);

    execParams.push(`--benchmark_filter=` + testNames.join('|'));

    return execParams;
  }

  protected _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    return [`--benchmark_color=false`, '--benchmark_format=json', ...this._getRunParamsCommon(childrenToRun)];
  }

  protected _getDebugParamsInner(
    childrenToRun: readonly Readonly<AbstractTest>[], // breakOnFailure:boolean
  ): string[] {
    const colouring = this.properties.enableDebugColouring ? 'true' : 'false';
    const debugParams = [`--benchmark_color=${colouring}`, ...this._getRunParamsCommon(childrenToRun)];
    return debugParams;
  }

  protected _handleProcess(testRunId: string, runInfo: RunningRunnable): Promise<void> {
    // at frist its good enough
    runInfo.childrenToRun.forEach(test => {
      this._shared.sendTestRunEvent(test.getStartEvent(testRunId));
    });

    const data = new (class {
      public processedTestCases: AbstractTest[] = [];
      public context: Record<string, unknown> | undefined = undefined;
      public benchmarksJson = '';
      public lastProcessedBenchmarkIndex = -1;
      public route: Suite[] = [];
    })();

    return new Promise<ProcessResult>(resolve => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const processChunk = (chunk: string, type: 'stdout' | 'stderr'): void => {
        if (type === 'stderr') {
          stderr.push(chunk);
          return;
        }

        stdout.push(chunk);
        data.benchmarksJson = data.benchmarksJson + chunk;

        if (data.context === undefined) {
          const benchmarkStartIndex = data.benchmarksJson.indexOf('"benchmarks"');
          if (benchmarkStartIndex !== -1) {
            const contextJson = data.benchmarksJson.substring(0, benchmarkStartIndex) + '"colonfixer": null }';
            try {
              data.context = JSON.parse(contextJson)['context'];
              data.benchmarksJson = '{' + data.benchmarksJson.substring(benchmarkStartIndex);
            } catch (e) {
              this._shared.log.errorS("couldn't parse context", e, data.benchmarksJson);
              throw e;
            }
          } else {
            return;
          }
        }

        const finished = data.benchmarksJson.match(/\]\s*\}\s*$/) !== null;
        const benchmarksJson = data.benchmarksJson + (finished ? '' : ']}');
        try {
          const benchmarks = JSON.parse(benchmarksJson)['benchmarks'] as Record<string, unknown>[];

          for (let i = data.lastProcessedBenchmarkIndex + 1; i < benchmarks.length; ++i) {
            if (runInfo.cancellationToken.isCancellationRequested) return;

            const benchmark = benchmarks[i];
            const test = this._findTest(v => v.testNameAsId == benchmark['name']);

            if (test) {
              const route = [...test.route()];
              this.sendMinimalEventsIfNeeded(testRunId, data.route, route);
              data.route = route;

              const ev = test.parseAndProcessTestCase(
                testRunId,
                JSON.stringify(benchmark),
                undefined,
                null,
                stderr.join(''),
              );
              this._shared.sendTestRunEvent(ev);
              data.processedTestCases.push(test);
            } else {
              this._shared.log.warnS('missing test for gbenchmark. binary might be changed');
            }

            data.lastProcessedBenchmarkIndex = i;
          }
        } catch (e) {
          this._shared.log.errorS('parinsg error', e, benchmarksJson, finished);
        }
      };

      runInfo.process.stdout.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString(), 'stdout'));
      runInfo.process.stderr.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString(), 'stderr'));

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

        this.sendMinimalEventsIfNeeded(testRunId, data.route, []);
        data.route = [];

        const isTestRemoved =
          runInfo.timeout === null &&
          !runInfo.cancellationToken.isCancellationRequested &&
          result.error === undefined &&
          data.processedTestCases.length < runInfo.childrenToRun.length;

        if (isTestRemoved) {
          this.reloadTests(this._shared.taskPool, runInfo.cancellationToken);
        }
      });
  }
}
