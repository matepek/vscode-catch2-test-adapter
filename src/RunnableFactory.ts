import * as c2fs from './util/FSWrapper';
import { RunnableProperties } from './RunnableProperties';
import { AbstractRunnable } from './AbstractRunnable';
import { Catch2Runnable } from './framework/Catch2Runnable';
import { GoogleTestRunnable } from './framework/GoogleTestRunnable';
import { DOCRunnable } from './framework/DOCRunnable';
import { SharedVariables } from './SharedVariables';
import { FrameworkSpecific, RunTask } from './AdvancedExecutableInterface';
import { Version } from './Util';
import { RootSuite } from './RootSuite';
import { Spawner, SpawnOptionsWithoutStdio, SpawnReturns } from './Spawner';
import { GoogleBenchmarkRunnable } from './framework/GoogleBenchmarkRunnable';
import { ResolveRuleAsync } from './util/ResolveRule';

export class RunnableFactory {
  public constructor(
    private readonly _shared: SharedVariables,
    private readonly _execName: string | undefined,
    private readonly _execDescription: string | undefined,
    private readonly _rootSuite: RootSuite,
    private readonly _execPath: string,
    private readonly _execOptions: SpawnOptionsWithoutStdio,
    private readonly _varToValue: ResolveRuleAsync[],
    private readonly _catch2: FrameworkSpecific,
    private readonly _gtest: FrameworkSpecific,
    private readonly _doctest: FrameworkSpecific,
    private readonly _gbenchmark: FrameworkSpecific,
    private readonly _parallelizationLimit: number,
    private readonly _markAsSkipped: boolean,
    private readonly _runTask: RunTask,
    private readonly _spawner: Spawner,
    private readonly _sourceFileMap: Record<string, string>,
  ) {}

  public create(checkIsNativeExecutable: boolean): Promise<AbstractRunnable> {
    return this._shared.taskPool
      .scheduleTask(async () => {
        if (checkIsNativeExecutable) await c2fs.isNativeExecutableAsync(this._execPath);

        return this._spawner.spawnAsync(this._execPath, ['--help'], this._execOptions, this._shared.execParsingTimeout);
      })
      .then((runWithHelpRes: SpawnReturns) => {
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
        // s: dotAll
        // u: unicode
        const regexFlags = 'su';
        {
          if (this._catch2.helpRegex) this._shared.log.info('Custom regex', 'catch2', this._catch2.helpRegex);

          const catch2 = runWithHelpRes.stdout.match(
            this._catch2.helpRegex ? new RegExp(this._catch2.helpRegex, regexFlags) : /Catch v(\d+)\.(\d+)\.(\d+)\s?/,
          );
          if (catch2) {
            return new Catch2Runnable(
              this._shared,
              this._rootSuite,
              new RunnableProperties(
                this._execName,
                this._execDescription,
                this._varToValue,
                this._execPath,
                this._execOptions,
                this._catch2,
                this._parallelizationLimit,
                this._markAsSkipped,
                this._runTask,
                this._spawner,
                this._sourceFileMap,
              ),
              this._parseVersion(catch2),
            );
          }
        }
        {
          if (this._gtest.helpRegex) this._shared.log.info('Custom regex', 'gtest', this._gtest.helpRegex);

          const gtest = runWithHelpRes.stdout.match(
            this._gtest.helpRegex
              ? new RegExp(this._gtest.helpRegex, regexFlags)
              : /This program contains tests written using .*--(\w+)list_tests.*List the names of all tests instead of running them/s,
          );
          if (gtest) {
            return new GoogleTestRunnable(
              this._shared,
              this._rootSuite,
              new RunnableProperties(
                this._execName,
                this._execDescription,
                this._varToValue,
                this._execPath,
                this._execOptions,
                this._gtest,
                this._parallelizationLimit,
                this._markAsSkipped,
                this._runTask,
                this._spawner,
                this._sourceFileMap,
              ),
              gtest[1] ?? 'gtest_',
              Promise.resolve(undefined), //Util: GoogleTestVersionFinder
            );
          }

          const gtestGoogleInsider = runWithHelpRes.stdout.match(/Try --helpfull to get a list of all flags./);
          if (gtestGoogleInsider) {
            // https://github.com/matepek/vscode-catch2-test-adapter/pull/191
            this._shared.log.info('Special - Google Co. related - gtest output is detected.', this._execPath);

            return new GoogleTestRunnable(
              this._shared,
              this._rootSuite,
              new RunnableProperties(
                this._execName,
                this._execDescription,
                this._varToValue,
                this._execPath,
                this._execOptions,
                this._gtest,
                this._parallelizationLimit,
                this._markAsSkipped,
                this._runTask,
                this._spawner,
                this._sourceFileMap,
              ),
              'gunit_',
              Promise.resolve(undefined),
            );
          }
        }
        {
          if (this._doctest.helpRegex) this._shared.log.info('Custom regex', 'doctest', this._doctest.helpRegex);

          const doc = runWithHelpRes.stdout.match(
            this._doctest.helpRegex
              ? new RegExp(this._doctest.helpRegex, regexFlags)
              : /doctest version is "(\d+)\.(\d+)\.(\d+)"/,
          );
          if (doc) {
            return new DOCRunnable(
              this._shared,
              this._rootSuite,
              new RunnableProperties(
                this._execName,
                this._execDescription,
                this._varToValue,
                this._execPath,
                this._execOptions,
                this._doctest,
                this._parallelizationLimit,
                this._markAsSkipped,
                this._runTask,
                this._spawner,
                this._sourceFileMap,
              ),
              this._parseVersion(doc),
            );
          }
        }

        {
          if (this._gbenchmark.helpRegex)
            this._shared.log.info('Custom regex', 'gbenchmark', this._gbenchmark.helpRegex);

          const gbenchmark = runWithHelpRes.stdout.match(
            this._gbenchmark.helpRegex
              ? new RegExp(this._gbenchmark.helpRegex, regexFlags)
              : /benchmark \[--benchmark_list_tests=\{true\|false\}\]/,
          );

          if (gbenchmark) {
            return new GoogleBenchmarkRunnable(
              this._shared,
              this._rootSuite,
              new RunnableProperties(
                this._execName,
                this._execDescription,
                this._varToValue,
                this._execPath,
                this._execOptions,
                this._gbenchmark,
                this._parallelizationLimit,
                this._markAsSkipped,
                this._runTask,
                this._spawner,
                this._sourceFileMap,
              ),
              Promise.resolve(undefined),
            );
          }
        }

        throw new Error(
          'Not a supported test executable: ' +
            this._spawner +
            this._execPath +
            '\n stdout: ' +
            runWithHelpRes.stdout +
            '\n stderr: ' +
            runWithHelpRes.stderr,
        );
      });
  }

  private _parseVersion(match: RegExpMatchArray): Version | undefined {
    if (
      match &&
      match.length === 4 &&
      Number(match[1]) !== NaN &&
      Number(match[2]) !== NaN &&
      Number(match[3]) !== NaN
    ) {
      return new Version(Number(match[1]), Number(match[2]), Number(match[3]));
    } else {
      return undefined;
    }
  }
}
