import * as c2fs from './FSWrapper';
import { ExecutableConfigFrameworkSpecific } from './ExecutableConfig';
import { TestGrouping } from './TestGroupingInterface';
import { ResolveRulePair } from './Util';

export class RunnableSuiteProperties {
  public constructor(
    public readonly name: string | undefined,
    public readonly description: string | undefined,
    public readonly varToValue: readonly ResolveRulePair[],
    public readonly path: string,
    public readonly options: c2fs.SpawnOptions,
    private readonly _frameworkSpecific: ExecutableConfigFrameworkSpecific,
  ) {}

  public get prependTestRunningArgs(): string[] {
    return this._frameworkSpecific.prependTestRunningArgs ? this._frameworkSpecific.prependTestRunningArgs : [];
  }

  public get prependTestListingArgs(): string[] {
    return this._frameworkSpecific.prependTestListingArgs ? this._frameworkSpecific.prependTestListingArgs : [];
  }

  public get ignoreTestEnumerationStdErr(): boolean {
    return this._frameworkSpecific.ignoreTestEnumerationStdErr === true;
  }

  public get testGrouping(): TestGrouping | undefined {
    return this._frameworkSpecific.testGrouping;
  }
}
