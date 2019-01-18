//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { ChildProcess } from 'child_process';

import { AbstractTestInfo } from './AbstractTestInfo';

export interface RunningTestExecutableInfo {
	process: ChildProcess | undefined;
	childrenToRun: Set<AbstractTestInfo>;
	timeout: number | undefined;
	timeoutWatcherTrigger: () => void;
	startTime: number;
}