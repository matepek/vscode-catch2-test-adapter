// https://github.com/hbenl/vscode-example-test-adapter/blob/master/src/main.ts

import * as vscode from 'vscode';
import { testExplorerExtensionId, TestHub } from 'vscode-test-adapter-api';
import { TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { TestAdapter } from './TestAdapter';
import { LoggerWrapper } from './LoggerWrapper';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);

  if (testExplorerExtension) {
    const testHub = testExplorerExtension.exports;

    const logger = new LoggerWrapper('testMate.cpp.log', undefined, `C++ TestMate`);

    context.subscriptions.push(
      new TestAdapterRegistrar(testHub, workspaceFolder => new TestAdapter(workspaceFolder, logger), logger),
    );
  }
}
