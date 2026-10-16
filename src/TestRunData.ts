import * as vscode from 'vscode';
import { TaskPoolMapI } from './util/TaskPool';
import * as TMA from './TestMateApi';

export interface TestRunData {
  readonly testRun: vscode.TestRun;
  readonly taskPoolForExecutables: TaskPoolMapI;
  readonly testRunHandler?: TMA.TestMateTestRunHandler;
}
