//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { Log } from "vscode-test-adapter-util";
import * as vscode from 'vscode';


export class SharedVariables {
	constructor(
		public readonly log: Log,
		public readonly workspaceFolder: vscode.WorkspaceFolder,
	) { }
}