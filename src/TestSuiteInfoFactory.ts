import * as vscode from 'vscode';
import * as fs from 'fs';

import * as c2fs from './FSWrapper';
import { TestSuiteExecutionInfo } from './TestSuiteExecutionInfo';
import { AbstractTestSuiteInfo } from './AbstractTestSuiteInfo';
import { Catch2TestSuiteInfo } from './framework/Catch2TestSuiteInfo';
import { GoogleTestSuiteInfo } from './framework/GoogleTestSuiteInfo';
import { DOCTestSuiteInfo } from './framework/DOCTestSuiteInfo';
import { SharedVariables } from './SharedVariables';
import { promisify } from 'util';
import { TestExecutableInfoFrameworkSpecific } from './TestExecutableInfo';

type VersionT = [number, number, number];

class GoogleTestVersion {
  private constructor() {}

  private static readonly _versions: [number, VersionT][] = [
    [47254, [1, 0, 1]],
    [48592, [1, 0, 0]],
    [48150, [1, 1, 0]],
    // [51083, [1, 2, 0]],
    [51083, [1, 2, 1]], // !! Same as prev !! but good enough
    [54267, [1, 3, 0]],
    [74007, [1, 4, 0]],
    [77844, [1, 5, 0]],
    [82450, [1, 6, 0]],
    [85459, [1, 8, 0]],
    [88434, [1, 7, 0]],
    [89088, [1, 8, 1]],
    [93924, [1, 10, 0]],
  ];

  private static _version: Promise<VersionT | undefined> | undefined = undefined;

  public static Get(shared: SharedVariables): Promise<VersionT | undefined> {
    if (this._version === undefined) {
      const cancellation = new vscode.CancellationTokenSource();

      promisify(setTimeout)(5000).finally(() => cancellation.cancel());

      this._version = new Promise<vscode.Uri[]>(resolve =>
        vscode.workspace
          .findFiles('**/include/gtest/gtest.h', '**/node_modules/**', 3, cancellation.token)
          .then(resolve),
      )
        .finally(() => cancellation.dispose())
        .then(async gtests => {
          if (gtests.length === 0) {
            shared.log.warn('Google Test version not found');
            return undefined;
          }

          if (gtests.length > 1) {
            shared.log.warn(
              'Google Test version: more than 1 has found',
              gtests.map(x => x.fsPath),
            );
          }

          const gtestPath =
            gtests.length === 1
              ? gtests[0].fsPath
              : gtests.reduce((prev: vscode.Uri, current: vscode.Uri) =>
                  prev.fsPath.length <= current.fsPath.length ? prev : current,
                ).fsPath;

          const stats = await promisify(fs.stat)(gtestPath);
          const fileSizeInBytes = stats['size'];
          const found = GoogleTestVersion._versions.find(x => x[0] === fileSizeInBytes);

          if (found) {
            return found[1];
          } else {
            const distance = (current: [number, VersionT]) => Math.abs(current[0] - fileSizeInBytes);

            const res = GoogleTestVersion._versions.reduce((prev, current) =>
              distance(prev) <= distance(current) ? prev : current,
            );

            const resDistance = distance(res);

            if (resDistance < 50) {
              shared.log.warn('Google Test version is not an exact match', fileSizeInBytes, resDistance, gtestPath);
              return res[1];
            } else {
              shared.log.warn('Google Test version size is not a match', fileSizeInBytes, resDistance, gtestPath);
              return undefined;
            }
          }
        })
        .catch(e => {
          shared.log.exception(e);
          return undefined;
        });
    }

    return this._version;
  }
}

interface TestFrameworkInfo {
  type: 'catch2' | 'google' | 'doc';
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

  public create(): Promise<AbstractTestSuiteInfo> {
    return this._shared.taskPool
      .scheduleTask(() => {
        return this._determineTestTypeOfExecutable();
      })
      .then((framework: TestFrameworkInfo) => {
        switch (framework.type) {
          case 'google':
            return new GoogleTestSuiteInfo(
              this._shared,
              this._label,
              this._description,
              new TestSuiteExecutionInfo(
                this._execPath,
                this._execOptions,
                this._gtest.additionalRunArguments ? this._gtest.additionalRunArguments : [],
                this._gtest.ignoreTestEnumerationStdErr === true,
              ),
              GoogleTestVersion.Get(this._shared),
            );
          case 'catch2':
            return new Catch2TestSuiteInfo(
              this._shared,
              this._label,
              this._description,
              new TestSuiteExecutionInfo(
                this._execPath,
                this._execOptions,
                this._catch2.additionalRunArguments ? this._catch2.additionalRunArguments : [],
                this._catch2.ignoreTestEnumerationStdErr === true,
              ),
              framework.version,
            );
          case 'doc':
            return new DOCTestSuiteInfo(
              this._shared,
              this._label,
              this._description,
              new TestSuiteExecutionInfo(
                this._execPath,
                this._execOptions,
                this._doctest.additionalRunArguments ? this._doctest.additionalRunArguments : [],
                this._doctest.ignoreTestEnumerationStdErr === true,
              ),
              framework.version,
            );
        }
        throw Error('Unknown framework error:' + framework.type);
      });
  }

  private async _determineTestTypeOfExecutable(): Promise<TestFrameworkInfo> {
    await c2fs.isNativeExecutableAsync(this._execPath);

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
        return { type: 'google', version: this._parseVersion(google) };
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
        return { type: 'doc', version: this._parseVersion(doc) };
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
