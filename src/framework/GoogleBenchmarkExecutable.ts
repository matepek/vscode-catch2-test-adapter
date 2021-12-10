import * as vscode from 'vscode';
import * as fs from 'fs';
import { promisify } from 'util';

import { AbstractExecutable, HandleProcessResult } from '../AbstractExecutable';
import { GoogleBenchmarkTest } from './GoogleBenchmarkTest';
import { RunnableProperties } from '../RunnableProperties';
import { WorkspaceShared } from '../WorkspaceShared';
import { RunningExecutable } from '../RunningExecutable';
import { AbstractTest } from '../AbstractTest';
import { CancellationFlag } from '../Util';
import { TestGrouping } from '../TestGroupingInterface';
import { TestResultBuilder } from '../TestResultBuilder';
import { LoggerWrapper } from '../LoggerWrapper';
import { TestItemParent } from '../TestItemManager';

export class GoogleBenchmarkExecutable extends AbstractExecutable<GoogleBenchmarkTest> {
  constructor(shared: WorkspaceShared, execInfo: RunnableProperties) {
    super(shared, execInfo, 'GoogleBenchmark', undefined);
  }

  private getTestGrouping(): TestGrouping {
    if (this.properties.testGrouping) {
      return this.properties.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      return grouping;
    }
  }

  //TODO:release streaming would be more efficient
  private async _reloadFromString(stdOutStr: string, cancellationFlag: CancellationFlag): Promise<void> {
    const lines = stdOutStr.split(/\r?\n/);

    const filteredLines = lines.filter(x => x.length > 0);

    for (const line of filteredLines) {
      if (cancellationFlag.isCancellationRequested) return;

      this._createAndAddTest(line);
    }
  }

  private readonly _createAndAddTest = (testName: string): Promise<GoogleBenchmarkTest> => {
    return this._createTreeAndAddTest(
      this.getTestGrouping(),
      testName,
      undefined,
      [],
      undefined,
      (parent: TestItemParent) =>
        new GoogleBenchmarkTest(this.shared, this, parent, testName, this.properties.failIfExceedsLimitNs),
      (test: GoogleBenchmarkTest) => test.update2(this.properties.failIfExceedsLimitNs),
    );
  };

  protected async _reloadChildren(cancellationFlag: CancellationFlag): Promise<void> {
    const cacheFile = this.properties.path + '.TestMate.testListCache.xml';

    if (this.shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.properties.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this.shared.log.info('loading from cache: ', cacheFile);
          const str = await promisify(fs.readFile)(cacheFile, 'utf8');

          return await this._reloadFromString(str, cancellationFlag);
        }
      } catch (e) {
        this.shared.log.info('coudnt use cache', e);
      }
    }

    const args = this.properties.prependTestListingArgs.concat([`--benchmark_list_tests=true`]);

    this.shared.log.info('discovering tests', this.properties.path, args, this.properties.options.cwd);
    const listOutput = await this.properties.spawner.spawnAsync(
      this.properties.path,
      args,
      this.properties.options,
      30000,
    );

    if (listOutput.stderr && !this.properties.ignoreTestEnumerationStdErr) {
      this.shared.log.warn('reloadChildren -> googleBenchmarkTestListOutput.stderr: ', listOutput);
      return await this._createAndAddUnexpectedStdError(listOutput.stdout, listOutput.stderr);
    } else {
      try {
        const result = await this._reloadFromString(listOutput.stdout, cancellationFlag);

        if (this.shared.enabledTestListCaching) {
          promisify(fs.writeFile)(cacheFile, listOutput.stdout).catch(err =>
            this.shared.log.warn('couldnt write cache file:', err),
          );
        }

        return result;
      } catch (e) {
        this.shared.log.info('GoogleBenchmark._reloadFromStdOut error', e, listOutput);
        throw e;
      }
    }
  }

  private _getRunParamsCommon(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    const execParams: string[] = [];

    const testNames = childrenToRun.map(c => c.id);

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

  protected async _handleProcess(testRun: vscode.TestRun, runInfo: RunningExecutable): Promise<HandleProcessResult> {
    // at first it's good enough
    runInfo.childrenToRun.forEach(test => testRun.started(test.item));

    const unexpectedTests: GoogleBenchmarkTest[] = [];
    const expectedToRunAndFoundTests: GoogleBenchmarkTest[] = [];

    const data = new (class {
      sequentialProcessP = Promise.resolve();
      context: Record<string, unknown> | undefined = undefined;
      benchmarksJson = '';
      lastProcessedBenchmarkIndex = -1;
    })();

    const processChunk = async (chunk: string): Promise<void> => {
      data.benchmarksJson = data.benchmarksJson + chunk;

      if (data.context === undefined) {
        const benchmarkStartIndex = data.benchmarksJson.indexOf('"benchmarks"');
        if (benchmarkStartIndex !== -1) {
          const contextJson = data.benchmarksJson.substring(0, benchmarkStartIndex) + '"colonfixer": null }';
          try {
            data.context = JSON.parse(contextJson)['context'];
            data.benchmarksJson = '{' + data.benchmarksJson.substring(benchmarkStartIndex);
          } catch (e) {
            this.shared.log.errorS("couldn't parse context", e, data.benchmarksJson);
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

          if (typeof benchmark['name'] != 'string') {
            this.shared.log.errorS('missing benchamrk[name]', benchmark);
            continue;
          }

          const testName = benchmark['name'];
          let test = this._getTest(testName);

          if (!test) {
            this.shared.log.info('Test not found in children', testName);
            test = await this._createAndAddTest(testName);
            unexpectedTests.push(test);
          } else {
            expectedToRunAndFoundTests.push(test);
          }

          const builder = new TestResultBuilder(test, testRun, runInfo.runPrefix, true);
          parseAndProcessTestCase(this.shared.log, builder, benchmark);

          data.lastProcessedBenchmarkIndex = i;
        }
      } catch (e) {
        this.shared.log.errorS('parinsg error', e, benchmarksJson, finished);
      }
    };

    runInfo.process.stdout.on('data', (chunk: Uint8Array) => {
      data.sequentialProcessP = data.sequentialProcessP.then(() => processChunk(chunk.toLocaleString()));
    });
    runInfo.process.stderr.on('data', (chunk: Uint8Array) =>
      this.processStdErr(testRun, runInfo.runPrefix, chunk.toLocaleString()),
    );

    await runInfo.result;

    return {
      unexpectedTests,
      expectedToRunAndFoundTests,
      leftBehindBuilder: undefined, // currently we cannot detect the start of a benchmark so this we don't know
    };
  }
}

function parseAndProcessTestCase(
  log: LoggerWrapper,
  builder: TestResultBuilder<GoogleBenchmarkTest>,
  metric: Record<string, unknown>,
): void {
  builder.started();
  builder.passed();

  try {
    if (metric['error_occurred']) {
      builder.addOutputLine('❌ Error occurred:', (metric['error_occurred'] as string).toString());
      builder.errored();
    }

    const metricType = ['cpu_time', 'cpu_coefficient', 'rms'];
    const key = metricType.find(m => metric[m]);
    const value: number | undefined = key && typeof metric[key] === 'number' ? (metric[key] as number) : undefined;

    if (value !== undefined) {
      const [timeUnitMultiplier, _timeUnit] = getTimeUnitMultiplier(metric);

      if (
        typeof builder.test.failIfExceedsLimitNs === 'number' &&
        builder.test.failIfExceedsLimitNs < value * timeUnitMultiplier
      ) {
        builder.addOutputLine(1, `❌ Failed: "${key}" exceeded limit: ${builder.test.failIfExceedsLimitNs} ns.`);
        builder.addOutputLine(1, ' ');
        builder.failed();
      }
    }

    Object.keys(metric).forEach(key => {
      const value = metric[key];
      const value2 = typeof value === 'string' ? '"' + value + '"' : value;
      builder.addOutputLine(1, key + ': ' + value2);
    });
  } catch (e) {
    log.exceptionS(e, metric);

    builder.addOutputLine(
      '❌ Unexpected ERROR while parsing',
      `Exception: "${e}"`,
      '(If you think it should work then file an issue)',
      JSON.stringify(metric),
    );

    builder.errored();
  }

  builder.build();
}

const getTimeUnitMultiplier = (metric: Record<string, unknown>): [number, string] => {
  if (metric['time_unit'] === 'ns') {
    return [1, 'ns'];
  } else if (metric['time_unit'] === 'ms') {
    return [1000000, 'ms'];
  } else if (metric['time_unit'] === 'us') {
    return [1000, 'μs'];
  } else {
    return [1, '?'];
  }
};
