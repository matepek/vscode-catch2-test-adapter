import * as c2fs from './FSWrapper';
import { RunnableTestSuiteProperties } from './RunnableTestSuiteProperties';
import { AbstractRunnableTestSuiteInfo } from './AbstractRunnableTestSuiteInfo';
import { Catch2TestSuiteInfo } from './framework/Catch2TestSuiteInfo';
import { GoogleTestSuiteInfo } from './framework/GoogleTestSuiteInfo';
import { DOCTestSuiteInfo } from './framework/DOCTestSuiteInfo';
import { SharedVariables } from './SharedVariables';
import { TestExecutableInfoFrameworkSpecific } from './TestExecutableInfo';

interface TestFrameworkInfo {
  type: 'catch2' | 'gtest' | 'doctest';
  version: [number, number, number] | undefined;
}

export class TestSuiteInfoFactory {
  public constructor(
    private readonly _shared: SharedVariables,
    private readonly _label: string,
    private readonly _description: string | undefined,
    private readonly _execPath: string,
    private readonly _execOptions: c2fs.SpawnOptions,
    private readonly _catch2: TestExecutableInfoFrameworkSpecific,
    private readonly _gtest: TestExecutableInfoFrameworkSpecific,
    private readonly _doctest: TestExecutableInfoFrameworkSpecific,
  ) {}

  public create(checkIsNativeExecutable: boolean): Promise<AbstractRunnableTestSuiteInfo> {
    return this._shared.taskPool
      .scheduleTask(() => {
        return this._determineTestTypeOfExecutable(checkIsNativeExecutable);
      })
      .then((framework: TestFrameworkInfo) => {
        switch (framework.type) {
          case 'gtest':
            return new GoogleTestSuiteInfo(
              this._shared,
              this._label,
              this._description,
              new RunnableTestSuiteProperties(this._execPath, this._execOptions, this._gtest),
              Promise.resolve(undefined), //Util: GoogleTestVersionFinder
            );
          case 'catch2':
            return new Catch2TestSuiteInfo(
              this._shared,
              this._label,
              this._description,
              new RunnableTestSuiteProperties(this._execPath, this._execOptions, this._catch2),
              framework.version,
            );
          case 'doctest':
            return new DOCTestSuiteInfo(
              this._shared,
              this._label,
              this._description,
              new RunnableTestSuiteProperties(this._execPath, this._execOptions, this._doctest),
              framework.version,
            );
        }
        throw Error('Unknown framework error:' + framework.type);
      });
  }

  private async _determineTestTypeOfExecutable(checkIsNativeExecutable: boolean): Promise<TestFrameworkInfo> {
    if (checkIsNativeExecutable) await c2fs.isNativeExecutableAsync(this._execPath);

    const res = await c2fs.spawnAsync(this._execPath, ['--help'], this._execOptions, this._shared.execParsingTimeout);

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
    // s: dotAll
    // u: unicode
    const regexFlags = 'su';
    {
      if (this._catch2.helpRegex) this._shared.log.info('Custom regex', 'catch2', this._catch2.helpRegex);

      const catch2 = res.stdout.match(
        this._catch2.helpRegex
          ? new RegExp(this._catch2.helpRegex, regexFlags)
          : /Catch v([0-9]+)\.([0-9]+)\.([0-9]+)\s?/,
      );
      if (catch2) {
        return { type: 'catch2', version: this._parseVersion(catch2) };
      }
    }
    {
      if (this._gtest.helpRegex) this._shared.log.info('Custom regex', 'gtest', this._gtest.helpRegex);

      const google = res.stdout.match(
        this._gtest.helpRegex
          ? new RegExp(this._gtest.helpRegex, regexFlags)
          : /This program contains tests written using Google Test./,
      );
      if (google) {
        return { type: 'gtest', version: this._parseVersion(google) };
      }
    }
    {
      if (this._doctest.helpRegex) this._shared.log.info('Custom regex', 'doctest', this._doctest.helpRegex);

      const doc = res.stdout.match(
        this._doctest.helpRegex
          ? new RegExp(this._doctest.helpRegex, regexFlags)
          : /doctest version is "([0-9]+)\.([0-9]+)\.([0-9]+)"/,
      );
      if (doc) {
        return { type: 'doctest', version: this._parseVersion(doc) };
      }
    }

    throw new Error('Not a supported test executable: ' + this._execPath + '\n output: ' + res);
  }

  private _parseVersion(match: RegExpMatchArray): [number, number, number] | undefined {
    if (
      match &&
      match.length === 4 &&
      Number(match[1]) !== NaN &&
      Number(match[2]) !== NaN &&
      Number(match[3]) !== NaN
    ) {
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    } else {
      return undefined;
    }
  }
}
