import { FrameworkSpecific, RunTask } from './AdvancedExecutableInterface';
import { TestGrouping } from './TestGroupingInterface';
import { ResolveRuleAsync } from './util/ResolveRule';
import { TaskPool } from './util/TaskPool';
import { Spawner, SpawnOptionsWithoutStdio } from './Spawner';

export class RunnableProperties {
  constructor(
    readonly name: string | undefined,
    readonly description: string | undefined,
    readonly varToValue: readonly ResolveRuleAsync[],
    readonly path: string,
    readonly options: SpawnOptionsWithoutStdio,
    private readonly _frameworkSpecific: FrameworkSpecific,
    _parallelizationLimit: number,
    readonly markAsSkipped: boolean,
    readonly runTask: RunTask,
    readonly spawner: Spawner,
    readonly sourceFileMap: Record<string, string>,
  ) {
    this.parallelizationPool = new TaskPool(_parallelizationLimit);
  }

  readonly parallelizationPool: TaskPool;

  get testGrouping(): TestGrouping | undefined {
    return this._frameworkSpecific.testGrouping;
  }

  get prependTestRunningArgs(): string[] {
    return this._frameworkSpecific.prependTestRunningArgs ? this._frameworkSpecific.prependTestRunningArgs : [];
  }

  get prependTestListingArgs(): string[] {
    return this._frameworkSpecific.prependTestListingArgs ? this._frameworkSpecific.prependTestListingArgs : [];
  }

  get ignoreTestEnumerationStdErr(): boolean {
    return this._frameworkSpecific.ignoreTestEnumerationStdErr === true;
  }

  get enableDebugColouring(): boolean {
    return this._frameworkSpecific['debug.enableOutputColouring'] === true;
  }

  get failIfExceedsLimitNs(): number | undefined {
    return this._frameworkSpecific.failIfExceedsLimitNs;
  }
}
