import * as c2fs from './FSWrapper';

export class TestSuiteExecutionInfo {
  public constructor(
    public readonly path: string,
    public readonly options: c2fs.SpawnOptions,
    public readonly prependTestRunningArgs: string[],
    public readonly prependTestListingArgs: string[],
    public readonly ignoreTestEnumerationStdErr: boolean,
  ) {}
}
