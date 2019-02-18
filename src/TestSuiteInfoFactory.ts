//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as c2fs from './FsWrapper';
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
    private readonly _execPath: string,
    private readonly _execOptions: c2fs.SpawnOptions,
  ) {}

  public create(): Promise<Catch2TestSuiteInfo | GoogleTestSuiteInfo> {
    return this._determineTestTypeOfExecutable().then((framework: TestFrameworkInfo) => {
      if (framework.type === 'google')
        return new GoogleTestSuiteInfo(this._shared, this._label, this._execPath, this._execOptions);
      else if (framework.type === 'catch2')
        return new Catch2TestSuiteInfo(this._shared, this._label, this._execPath, this._execOptions, [
          framework.version[0],
          framework.version[1],
          framework.version[2],
        ]);
      else throw Error('Unknown error:' + framework.type);
    });
  }

  private _determineTestTypeOfExecutable(): Promise<TestFrameworkInfo> {
    return TestSuiteInfoFactory.determineTestTypeOfExecutable(this._execPath, this._execOptions);
  }

  public static determineTestTypeOfExecutable(
    execPath: string,
    execOptions: c2fs.SpawnOptions,
  ): Promise<TestFrameworkInfo> {
    return c2fs.isNativeExecutableAsync(execPath).then(() => {
      return c2fs.spawnAsync(execPath, ['--help'], execOptions, 5000).then(
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
