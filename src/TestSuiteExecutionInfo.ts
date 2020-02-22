import * as c2fs from './FSWrapper';

export class TestSuiteExecutionInfo {
  public constructor(
    public readonly path: string,
    public readonly options: c2fs.SpawnOptions,
    public readonly additionalRunArguments: string[],
    public readonly ignoreTestEnumerationStdErr: boolean,
  ) {}
}
