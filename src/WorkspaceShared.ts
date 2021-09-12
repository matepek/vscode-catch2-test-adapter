import { LoggerWrapper } from './LoggerWrapper';
import * as vscode from 'vscode';
import { TaskPool } from './util/TaskPool';
import { ResolveRuleAsync } from './util/ResolveRule';
import { BuildProcessChecker } from './util/BuildProcessChecker';
import { AbstractTest } from './AbstractTest';

export type TestCreator = (
  id: string,
  label: string,
  file: string | undefined,
  line: string | number | undefined,
  testData: AbstractTest | undefined,
) => vscode.TestItem;

export type TestItemMapper = (item: vscode.TestItem) => AbstractTest | undefined;

export class WorkspaceShared {
  public constructor(
    public readonly workspaceFolder: vscode.WorkspaceFolder,
    public readonly rootItems: vscode.TestItemCollection,
    public readonly log: LoggerWrapper,
    public readonly testItemCreator: TestCreator,
    public readonly testItemMapper: TestItemMapper,
    public readonly executeTask: (
      taskName: string,
      varsToResolve: readonly ResolveRuleAsync[],
      cancellationToken: vscode.CancellationToken,
    ) => Promise<number | undefined>,
    public readonly varToValue: readonly Readonly<ResolveRuleAsync>[],
    public rngSeed: 'time' | number | null,
    public execWatchTimeout: number,
    private _execRunningTimeout: null | number,
    public execParsingTimeout: number,
    public isNoThrow: boolean,
    workerMaxNumber: number,
    public enabledTestListCaching: boolean,
    public enabledStrictPattern: boolean,
    public googleTestTreatGMockWarningAs: 'nothing' | 'failure',
    public googleTestGMockVerbose: 'default' | 'info' | 'warning' | 'error',
  ) {
    this.taskPool = new TaskPool(workerMaxNumber);
    this.buildProcessChecker = new BuildProcessChecker(log);
  }

  private readonly _execRunningTimeoutChangeEmitter = new vscode.EventEmitter<void>();
  public readonly taskPool: TaskPool;
  public readonly buildProcessChecker: BuildProcessChecker;

  public dispose(): void {
    this.buildProcessChecker.dispose();
    this._execRunningTimeoutChangeEmitter.dispose();
    this.log.dispose();
  }

  public get execRunningTimeout(): number | null {
    return this._execRunningTimeout;
  }

  public setExecRunningTimeout(value: number | null): void {
    this._execRunningTimeout = value;
    this._execRunningTimeoutChangeEmitter.fire();
  }

  public readonly onDidChangeExecRunningTimeout = this._execRunningTimeoutChangeEmitter.event;
}
