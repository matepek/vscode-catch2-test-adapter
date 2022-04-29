import * as vscode from 'vscode';

export class SharedTestTags {
  static readonly runnable = new vscode.TestTag('can-be-run');
  static readonly debuggable = new vscode.TestTag('can-be-debugged');
  static readonly skipped = new vscode.TestTag('skipped');

  static readonly groupArray = [this.runnable];

  static readonly catch2 = new vscode.TestTag('framework.catch2');
  static readonly gtest = new vscode.TestTag('framework.gtest');
  static readonly doctest = new vscode.TestTag('framework.doctest');
  static readonly gbenchmark = new vscode.TestTag('framework.gbenchmark');
}
