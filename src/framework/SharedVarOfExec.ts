import * as vscode from 'vscode';
import { FrameworkSpecificConfig, RunTaskConfig } from '../AdvancedExecutableInterface';
import { TestGroupingConfig } from '../TestGroupingInterface';
import { ResolveRuleAsync } from '../util/ResolveRule';
import { TaskPool } from '../util/TaskPool';
import { Spawner, SpawnOptionsWithoutStdioEx } from '../Spawner';
import { WorkspaceShared } from '../WorkspaceShared';
import { DebugConfigData } from '../DebugConfigType';
import { createHash } from 'node:crypto';

export class SharedVarOfExec {
  constructor(
    readonly shared: WorkspaceShared,
    readonly name: string | undefined,
    readonly description: string | undefined,
    readonly testTags: readonly vscode.TestTag[],
    readonly varToValue: readonly ResolveRuleAsync[],
    readonly path: string,
    readonly options: SpawnOptionsWithoutStdioEx,
    private readonly _frameworkSpecific: FrameworkSpecificConfig,
    parallelizationLimit: number,
    readonly maxTestsPerExecutable: number | null,
    readonly markAsSkipped: boolean,
    readonly executableCloning: boolean,
    readonly debugConfigData: DebugConfigData | undefined,
    readonly runTask: RunTaskConfig,
    readonly spawner: Spawner,
    readonly resolvedSourceFileMap: Record<string, string>,
  ) {
    this.parallelizationPool = new TaskPool(parallelizationLimit);
    {
      const h = createHash('md5');
      const env = options.customEnv;
      Object.keys(env)
        .sort()
        .forEach(k => h.update(`${k}=${env[k]}`));
      if (this._frameworkSpecific.prependTestRunningArgs) {
        h.update('prependTestRunningArgs=' + this._frameworkSpecific.prependTestRunningArgs.join('|'));
      }
      if (this._frameworkSpecific.prependTestDebuggingArgs) {
        h.update('prependTestDebuggingArgs=' + this._frameworkSpecific.prependTestDebuggingArgs.join('|'));
      }
      if (this._frameworkSpecific.prependTestListingArgs) {
        h.update('prependTestListingArgs=' + this._frameworkSpecific.prependTestListingArgs.join('|'));
      }
      this.optionsHash = h.digest('hex').substring(0, 6);
    }
    this.shared.log.debug(
      'exec hash',
      path,
      this.optionsHash,
      this.options.customEnv,
      this._frameworkSpecific.prependTestRunningArgs,
      this._frameworkSpecific.prependTestDebuggingArgs,
      this._frameworkSpecific.prependTestListingArgs,
    );
  }

  readonly parallelizationPool: TaskPool;
  readonly optionsHash: string;

  get testGrouping(): TestGroupingConfig | undefined {
    return this._frameworkSpecific.testGrouping;
  }

  get prependTestRunningArgs(): string[] {
    return this._frameworkSpecific.prependTestRunningArgs ?? [];
  }

  get prependTestDebuggingArgs(): string[] {
    return this._frameworkSpecific.prependTestDebuggingArgs ?? this.prependTestRunningArgs;
  }

  get prependTestListingArgs(): string[] {
    return this._frameworkSpecific.prependTestListingArgs ?? [];
  }

  get ignoreTestEnumerationStdErr(): boolean {
    return this._frameworkSpecific.ignoreTestEnumerationStdErr === true;
  }

  get enableDebugColouring(): boolean {
    return this._frameworkSpecific['debug.enableOutputColouring'] === true;
  }

  get stderrDecorator(): boolean {
    return this.shared.stderrDecorator;
  }

  get failIfExceedsLimitNs(): number | undefined {
    return this._frameworkSpecific.failIfExceedsLimitNs;
  }

  get enableRunExecutableTestsImplicitly(): boolean {
    return true; //TODO
  }

  /// accessors for shared

  get log() {
    return this.shared.log;
  }
  get workspaceFolder() {
    return this.shared.workspaceFolder;
  }
  get workspacePath() {
    return this.workspaceFolder.uri.fsPath;
  }
  get testController() {
    return this.shared.testController;
  }
  get cancellationToken() {
    return this.shared.cancellationToken;
  }
  get taskPool() {
    return this.shared.taskPool;
  }
  get executeTask() {
    return this.shared.executeTask;
  }

  get rngSeed(): 'time' | number | null {
    return this.shared.rngSeed;
  }
  get execWatchTimeout(): number {
    return this.shared.execWatchTimeout;
  }
  get execRunningTimeout(): number | null {
    return this.shared.execRunningTimeout;
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
  get enabledStrictPattern(): boolean {
    return this.shared.enabledStrictPattern;
  }
  get googleTestTreatGMockWarningAs(): 'nothing' | 'failure' {
    return this.shared.googleTestTreatGMockWarningAs;
  }
  get googleTestGMockVerbose(): 'default' | 'info' | 'warning' | 'error' {
    return this.shared.googleTestGMockVerbose;
  }
  get testNameLengthLimit(): number {
    return this.shared.testNameLengthLimit;
  }
}
