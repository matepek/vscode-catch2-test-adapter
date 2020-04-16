import * as c2fs from './FSWrapper';
import { TestExecutableInfoFrameworkSpecific } from './Executable';

export class RunnableSuiteProperties {
  public constructor(
    public readonly path: string,
    public readonly options: c2fs.SpawnOptions,
    private readonly _frameworkSpecific: TestExecutableInfoFrameworkSpecific,
  ) {
    this.groupBySingleRegex = _frameworkSpecific.groupBySingleRegex
      ? new RegExp(_frameworkSpecific.groupBySingleRegex)
      : undefined;
  }

  public get prependTestRunningArgs(): string[] {
    return this._frameworkSpecific.prependTestRunningArgs ? this._frameworkSpecific.prependTestRunningArgs : [];
  }

  public get prependTestListingArgs(): string[] {
    return this._frameworkSpecific.prependTestListingArgs ? this._frameworkSpecific.prependTestListingArgs : [];
  }

  public get ignoreTestEnumerationStdErr(): boolean {
    return this._frameworkSpecific.ignoreTestEnumerationStdErr === true;
  }

  public get groupBySource(): boolean {
    return this._frameworkSpecific.groupBySource === true;
  }

  public get groupByTags(): boolean {
    return this._frameworkSpecific.groupByTags === true;
  }

  public readonly groupBySingleRegex: RegExp | undefined;
}
