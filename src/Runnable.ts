import * as vscode from 'vscode';
import { TestData } from './TestData';

export abstract class Runnable {
  //private testDatas: WeakMap<vscode.TestItem, TestData> = new WeakMap();

  // cannot return with error
  public abstract resolve(testData: TestData, testItem: vscode.TestItem): Thenable<void>;
}
