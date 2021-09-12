import { LoggerWrapper } from './LoggerWrapper';
import * as vscode from 'vscode';
import { TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import { TaskPool } from './util/TaskPool';
import { ResolveRuleAsync } from './util/ResolveRule';
import { BuildProcessChecker } from './util/BuildProcessChecker';
import { AbstractRunnable } from './AbstractRunnable';

export type TestRunEvent = TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent;

export class SharedVariables implements vscode.Disposable {
  private readonly _execRunningTimeoutChangeEmitter = new vscode.EventEmitter<void>();
  public readonly taskPool: TaskPool;
  public readonly buildProcessChecker: BuildProcessChecker;

  public constructor(
    public readonly log: LoggerWrapper,
    public readonly workspaceFolder: vscode.WorkspaceFolder,
    public readonly loadWithTask: (task: () => Promise<void | unknown[]>) => Promise<void>,
    public readonly sendRetireEvent: (tests: Iterable<AbstractRunnable>) => void,
    public readonly sendTestRunEvent: (event: TestRunEvent) => void,
    public readonly sendTestEvents: (testEvents: AbstractTestEvent[]) => void,
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
