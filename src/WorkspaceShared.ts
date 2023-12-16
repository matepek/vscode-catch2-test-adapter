import { Logger } from './Logger';
import * as vscode from 'vscode';
import { TaskPool } from './util/TaskPool';
import { ResolveRuleAsync } from './util/ResolveRule';
import { BuildProcessChecker } from './util/BuildProcessChecker';
import { CancellationToken } from './Util';
import { TestItemManager } from './TestItemManager';
import { AbstractExecutable } from './framework/AbstractExecutable';

export class WorkspaceShared {
  constructor(
    readonly workspaceFolder: vscode.WorkspaceFolder,
    readonly log: Logger,
    readonly testController: TestItemManager,
    readonly executeTask: (
      taskName: string,
      varsToResolve: readonly ResolveRuleAsync[],
      cancellationToken: CancellationToken,
    ) => Promise<number | undefined>,
    readonly sendRetireEvent: (executables: Iterable<AbstractExecutable>) => void,
    readonly varToValue: readonly Readonly<ResolveRuleAsync>[],
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
    public hideUninterestingOutput: boolean,
  ) {
    this.taskPool = new TaskPool(workerMaxNumber);
    this.buildProcessChecker = new BuildProcessChecker(log);
  }

  readonly taskPool: TaskPool;
  readonly buildProcessChecker: BuildProcessChecker;
  private readonly _execRunningTimeoutChangeEmitter = new vscode.EventEmitter<void>();
  private readonly _cancellationTokenSource: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();
  readonly cancellationToken: CancellationToken = this._cancellationTokenSource.token;

  dispose(): void {
    this._cancellationTokenSource.cancel();
    this.buildProcessChecker.dispose();
    this._execRunningTimeoutChangeEmitter.dispose();
    this.log.dispose();
  }

  get execRunningTimeout(): number | null {
    return this._execRunningTimeout;
  }

  setExecRunningTimeout(value: number | null): void {
    this._execRunningTimeout = value;
    this._execRunningTimeoutChangeEmitter.fire();
  }

  setExecParsingTimeout(value: number): void {
    this.execParsingTimeout = value;
  }

  readonly onDidChangeExecRunningTimeout = this._execRunningTimeoutChangeEmitter.event;
}
