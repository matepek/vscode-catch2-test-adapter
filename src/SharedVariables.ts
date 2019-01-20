//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { Log } from "vscode-test-adapter-util";
import * as vscode from 'vscode';
import {
	TestRunStartedEvent,
	TestRunFinishedEvent,
	TestSuiteEvent,
	TestEvent
} from 'vscode-test-adapter-api';


export class SharedVariables implements vscode.Disposable {
	private readonly _execRunningTimeoutChangeEmitter = new vscode.EventEmitter<void>();

	constructor(
		public readonly log: Log,
		public readonly workspaceFolder: vscode.WorkspaceFolder,
		public readonly testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>,
		public readonly loadWithTaskEmitter: vscode.EventEmitter<() => void | PromiseLike<void>>,
		public readonly sendTestEventEmitter: vscode.EventEmitter<TestEvent[]>,
		public isEnabledSourceDecoration: boolean,
		public rngSeed: string | number | null,
		public execWatchTimeout: number,
		private _execRunningTimeout: null | number,
		public isNoThrow: boolean,
		public defaultEnv: { [prop: string]: string }
	) { }

	dispose() {
		this._execRunningTimeoutChangeEmitter.dispose();
	}

	get execRunningTimeout() { return this._execRunningTimeout; }

	set execRunningTimeout(value: null | number) {
		this._execRunningTimeout = value;
		this._execRunningTimeoutChangeEmitter.fire();
	}

	readonly onDidChangeExecRunningTimeout = this._execRunningTimeoutChangeEmitter.event;
}