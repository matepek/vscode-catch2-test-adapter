import * as c2fs from './FSWrapper';
import { RunnableSuiteProperties } from './RunnableSuiteProperties';
import { AbstractRunnable } from './AbstractRunnable';
import { Catch2Runnable } from './framework/Catch2Runnable';
import { GoogleRunnable } from './framework/GoogleRunnable';
import { DOCRunnable } from './framework/DOCRunnable';
import { SharedVariables } from './SharedVariables';
import { ExecutableConfigFrameworkSpecific } from './ExecutableConfig';
import { Version, ResolveRulePair } from './Util';
import { Suite } from './Suite';

export class RunnableSuiteFactory {
  public constructor(
    private readonly _shared: SharedVariables,
    private readonly _execName: string | undefined,
    private readonly _execDescription: string | undefined,
    private readonly _rootSuite: Suite,
    private readonly _execPath: string,
    private readonly _execOptions: c2fs.SpawnOptions,
    private readonly _varToValue: ResolveRulePair[],
    private readonly _catch2: ExecutableConfigFrameworkSpecific,
    private readonly _gtest: ExecutableConfigFrameworkSpecific,
    private readonly _doctest: ExecutableConfigFrameworkSpecific,
    private readonly _parallelizationLimit: number,
  ) {}

  public create(checkIsNativeExecutable: boolean): Promise<AbstractRunnable> {
    return this._shared.taskPool
      .scheduleTask(async () => {
        if (checkIsNativeExecutable) await c2fs.isNativeExecutableAsync(this._execPath);

        return c2fs.spawnAsync(this._execPath, ['--help'], this._execOptions, this._shared.execParsingTimeout);
      })
      .then((runWithHelpRes: c2fs.SpawnReturns) => {
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
              new RunnableSuiteProperties(
                this._execName,
                this._execDescription,
                this._varToValue,
                this._execPath,
                this._execOptions,
                this._catch2,
                this._parallelizationLimit,
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
              : /This program contains tests written using .*--(\w+)list_tests.*List the names of all tests instead of running them./s,
          );
          if (gtest) {
            return new GoogleRunnable(
              this._shared,
              this._rootSuite,
              new RunnableSuiteProperties(
                this._execName,
                this._execDescription,
                this._varToValue,
                this._execPath,
                this._execOptions,
                this._gtest,
                this._parallelizationLimit,
              ),
              gtest[1] ?? 'gtest_',
              Promise.resolve(undefined), //Util: GoogleTestVersionFinder
            );
          }

          const gtestGoogleInsider = runWithHelpRes.stdout.match(/Try --helpfull to get a list of all flags./);
          if (gtestGoogleInsider) {
            // https://github.com/matepek/vscode-catch2-test-adapter/pull/191
            this._shared.log.info('Special - Google Co. related - gtest output is detected.', this._execPath);

            return new GoogleRunnable(
              this._shared,
              this._rootSuite,
              new RunnableSuiteProperties(
                this._execName,
                this._execDescription,
                this._varToValue,
                this._execPath,
                this._execOptions,
                this._gtest,
                this._parallelizationLimit,
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
              new RunnableSuiteProperties(
                this._execName,
                this._execDescription,
                this._varToValue,
                this._execPath,
                this._execOptions,
                this._doctest,
                this._parallelizationLimit,
              ),
              this._parseVersion(doc),
            );
          }
        }

        throw new Error('Not a supported test executable: ' + this._execPath + '\n output: ' + runWithHelpRes.stdout);
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
