import { LoggerWrapper } from './LoggerWrapper';
import * as vscode from 'vscode';
import { TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import { TaskPool } from './TaskPool';
import { AbstractTest } from './AbstractTest';
import { ResolveRule } from './util/ResolveRule';

type TestStateEmitterType = vscode.EventEmitter<
  TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
>;

export class SharedVariables implements vscode.Disposable {
  private readonly _execRunningTimeoutChangeEmitter = new vscode.EventEmitter<void>();
  public readonly taskPool: TaskPool;

  public constructor(
    public readonly log: LoggerWrapper,
    public readonly workspaceFolder: vscode.WorkspaceFolder,
    public readonly testStatesEmitter: TestStateEmitterType,
    public readonly loadWithTaskEmitter: vscode.EventEmitter<() => void | PromiseLike<void>>,
    public readonly sendTestEventEmitter: vscode.EventEmitter<(TestEvent & { type: 'test' })[]>,
    public readonly retire: vscode.EventEmitter<readonly AbstractTest[]>,
    public readonly varToValue: ResolveRule[],
    public readonly executeTask: (
      taskName: string,
      varsToResolve: readonly ResolveRule[],
      cancellationToken: vscode.CancellationToken,
    ) => Promise<number | undefined>,
    public rngSeed: 'time' | number | null,
    public execWatchTimeout: number,
    public retireDebounceTime: number,
    private _execRunningTimeout: null | number,
    public execParsingTimeout: number,
    public isNoThrow: boolean,
    workerMaxNumber: number,
    public enabledTestListCaching: boolean,
    public googleTestTreatGMockWarningAs: 'nothing' | 'failure',
    public googleTestGMockVerbose: 'default' | 'info' | 'warning' | 'error',
  ) {
    this.taskPool = new TaskPool(workerMaxNumber);
  }

  public dispose(): void {
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
