import * as vscode from 'vscode';

export class SharedTestTags {
  public static readonly runnable = new vscode.TestTag('can-be-run');
  public static readonly debuggable = new vscode.TestTag('can-be-debugged');
  public static readonly skipped = new vscode.TestTag('skipped');

  public static readonly groupArray = [this.runnable];

  public static readonly catch2 = new vscode.TestTag('framework.catch2');
  public static readonly gtest = new vscode.TestTag('framework.gtest');
  public static readonly doctest = new vscode.TestTag('framework.doctest');
  public static readonly gbenchmark = new vscode.TestTag('framework.gbenchmark');
}
