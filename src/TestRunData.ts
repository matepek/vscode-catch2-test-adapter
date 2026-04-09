import * as vscode from 'vscode';
import { TaskPoolMapI } from './util/TaskPool';
import * as TMA from './TestMateApi';

export interface TestRunData {
  testRun: vscode.TestRun;
  taskPoolForExecutables: TaskPoolMapI;
  testRunHandler?: TMA.TestMateTestRunHandler;
}
