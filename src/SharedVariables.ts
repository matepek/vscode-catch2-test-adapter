//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { Log } from 'vscode-test-adapter-util';
import * as vscode from 'vscode';
import { TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';

export class SharedVariables implements vscode.Disposable {
  private readonly _execRunningTimeoutChangeEmitter = new vscode.EventEmitter<void>();

  public constructor(
    public readonly log: Log,
    public readonly workspaceFolder: vscode.WorkspaceFolder,
    public readonly testStatesEmitter: vscode.EventEmitter<
      TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
    >,
    public readonly loadWithTaskEmitter: vscode.EventEmitter<() => void | PromiseLike<void>>,
    public readonly sendTestEventEmitter: vscode.EventEmitter<TestEvent[]>,
    public rngSeed: string | number | null,
    public execWatchTimeout: number,
    private _execRunningTimeout: null | number,
    public isNoThrow: boolean,
    public enabledTestListCaching: boolean,
  ) {}

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
}
