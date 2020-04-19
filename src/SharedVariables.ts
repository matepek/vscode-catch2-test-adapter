import { LoggerWrapper } from './LoggerWrapper';
import * as vscode from 'vscode';
import * as pathlib from 'path';
import { TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import { AbstractRunnableSuite } from './AbstractRunnableSuite';
import { TaskPool } from './TaskPool';

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
    public readonly sendTestEventEmitter: vscode.EventEmitter<TestEvent[]>,
    public readonly retire: vscode.EventEmitter<AbstractRunnableSuite[]>,
    public rngSeed: string | number | null,
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
  }

  public get execRunningTimeout(): number | null {
    return this._execRunningTimeout;
  }

  public setExecRunningTimeout(value: number | null): void {
    this._execRunningTimeout = value;
    this._execRunningTimeoutChangeEmitter.fire();
  }

  public readonly onDidChangeExecRunningTimeout = this._execRunningTimeoutChangeEmitter.event;

  public getPathRelativeToWorkspace(path: string): string {
    return pathlib.relative(this.workspaceFolder.uri.fsPath, path);
  }
}
