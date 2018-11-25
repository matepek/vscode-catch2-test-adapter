import * as vscode from 'vscode';
import {testExplorerExtensionId, TestHub} from 'vscode-test-adapter-api';

import {C2TestAdapter} from './C2TestAdapter';

export async function activate(context: vscode.ExtensionContext) {
  const testExplorerExtension =
      vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);

  if (testExplorerExtension) {
    if (!testExplorerExtension.isActive) {
      await testExplorerExtension.activate();
    }

    const registeredAdapters = new Map<vscode.WorkspaceFolder, C2TestAdapter>();

    if (vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        const adapter = new C2TestAdapter(workspaceFolder);
        registeredAdapters.set(workspaceFolder, adapter);
        testExplorerExtension.exports.registerTestAdapter(adapter);
      }
    }

    vscode.workspace.onDidChangeWorkspaceFolders(event => {
      for (const workspaceFolder of event.removed) {
        const adapter = registeredAdapters.get(workspaceFolder);
        if (adapter) {
          testExplorerExtension.exports.unregisterTestAdapter(adapter);
          registeredAdapters.delete(workspaceFolder);
        }
      }

      for (const workspaceFolder of event.added) {
        const adapter = new C2TestAdapter(workspaceFolder);
        registeredAdapters.set(workspaceFolder, adapter);
        testExplorerExtension.exports.registerTestAdapter(adapter);
      }
    });
  }
}
