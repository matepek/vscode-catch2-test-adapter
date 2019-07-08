import * as c2fs from './FSWrapper';
import { Catch2TestSuiteInfo } from './Catch2TestSuiteInfo';
import { GoogleTestSuiteInfo } from './GoogleTestSuiteInfo';
import { SharedVariables } from './SharedVariables';

interface TestFrameworkInfo {
  type: 'catch2' | 'google';
  version: [number, number, number];
}

export class TestSuiteInfoFactory {
  public constructor(
    private readonly _shared: SharedVariables,
    private readonly _label: string,
    private readonly _description: string | undefined,
    private readonly _execPath: string,
    private readonly _execOptions: c2fs.SpawnOptions,
  ) {}

  public create(): Promise<Catch2TestSuiteInfo | GoogleTestSuiteInfo> {
    return this._determineTestTypeOfExecutable(this._shared.execParsingTimeout).then((framework: TestFrameworkInfo) => {
      if (framework.type === 'google')
        return new GoogleTestSuiteInfo(this._shared, this._label, this._description, this._execPath, this._execOptions);
      else if (framework.type === 'catch2')
        return new Catch2TestSuiteInfo(
          this._shared,
          this._label,
          this._description,
          this._execPath,
          this._execOptions,
          [framework.version[0], framework.version[1], framework.version[2]],
        );
      else throw Error('Unknown error:' + framework.type);
    });
  }

  private _determineTestTypeOfExecutable(execParsingTimeout: number): Promise<TestFrameworkInfo> {
    return TestSuiteInfoFactory.determineTestTypeOfExecutable(execParsingTimeout, this._execPath, this._execOptions);
  }

  public static determineTestTypeOfExecutable(
    execParsingTimeout: number,
    execPath: string,
    execOptions: c2fs.SpawnOptions,
  ): Promise<TestFrameworkInfo> {
    return c2fs.isNativeExecutableAsync(execPath).then(() => {
      return c2fs.spawnAsync(execPath, ['--help'], execOptions, execParsingTimeout).then(
        (res): TestFrameworkInfo => {
          const catch2 = res.stdout.match(/Catch v([0-9]+)\.([0-9]+)\.([0-9]+)\s?/);
          if (catch2 && catch2.length == 4) {
            return { type: 'catch2', version: [Number(catch2[1]), Number(catch2[2]), Number(catch2[3])] };
          }
          const google = res.stdout.match(/This program contains tests written using Google Test./);
          if (google) {
            return { type: 'google', version: [0, 0, 0] };
          }
          throw new Error('Not a supported test executable: ' + execPath + '\n output: ' + res);
        },
      );
    });
  }
}
