import { FrameworkSpecific, RunTask } from './AdvancedExecutableInterface';
import { TestGrouping } from './TestGroupingInterface';
import { ResolveRule } from './util/ResolveRule';
import { TaskPool } from './TaskPool';
import { Spawner, SpawnOptionsWithoutStdio } from './Spawner';

export class RunnableProperties {
  public constructor(
    public readonly name: string | undefined,
    public readonly description: string | undefined,
    public readonly varToValue: readonly ResolveRule[],
    public readonly path: string,
    public readonly options: SpawnOptionsWithoutStdio,
    private readonly _frameworkSpecific: FrameworkSpecific,
    _parallelizationLimit: number,
    public readonly runTask: RunTask,
    public readonly spawner: Spawner,
  ) {
    this.parallelizationPool = new TaskPool(_parallelizationLimit);
  }

  public readonly parallelizationPool: TaskPool;

  public get testGrouping(): TestGrouping | undefined {
    return this._frameworkSpecific.testGrouping;
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

  public get enableDebugColouring(): boolean {
    return this._frameworkSpecific['debug.enableOutputColouring'] === true;
  }
}
