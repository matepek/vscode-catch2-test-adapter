import { FrameworkSpecific, RunTask } from './AdvancedExecutableInterface';
import { TestGrouping } from './TestGroupingInterface';
import { ResolveRuleAsync } from './util/ResolveRule';
import { TaskPool } from './util/TaskPool';
import { Spawner, SpawnOptionsWithoutStdio } from './Spawner';
import { WorkspaceShared } from './WorkspaceShared';

export class SharedVarOfExec {
  constructor(
    readonly shared: WorkspaceShared,
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

  ///

  readonly log = this.shared.log;
  readonly workspaceFolder = this.shared.workspaceFolder;
  readonly testController = this.shared.testController;

  ///

  get rngSeed(): 'time' | number | null {
    return this.shared.rngSeed;
  }
  get execWatchTimeout(): number {
    return this.shared.execWatchTimeout;
  }
  get execParsingTimeout(): number {
    return this.shared.execParsingTimeout;
  }
  get isNoThrow(): boolean {
    return this.shared.isNoThrow;
  }
  get enabledTestListCaching(): boolean {
    return this.shared.enabledTestListCaching;
  }
  get enabledSubTestListing(): boolean {
    return this._frameworkSpecific['test.enabledSubTestListing'] ?? this.shared.enabledSubTestListing;
  }
  get enabledStrictPattern(): boolean {
    return this.shared.enabledStrictPattern;
  }
  get googleTestTreatGMockWarningAs(): 'nothing' | 'failure' {
    return this.shared.googleTestTreatGMockWarningAs;
  }
  get googleTestGMockVerbose(): 'default' | 'info' | 'warning' | 'error' {
    return this.shared.googleTestGMockVerbose;
  }
}
