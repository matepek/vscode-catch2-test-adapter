import * as vscode from "vscode";
import { TestHub, testExplorerExtensionId } from "vscode-test-adapter-api";
import { Log } from "vscode-test-adapter-util";
import { Catch2TestAdapter } from "./adapter";

export async function activate(context: vscode.ExtensionContext) {
  const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);

  if (testExplorerExtension) {
    if (!testExplorerExtension.isActive) {
      await testExplorerExtension.activate();
    }

    const registeredAdapters = new Map<vscode.WorkspaceFolder, Catch2TestAdapter>();

    if (vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        const log = new Log("Catch2TestAdapter", workspaceFolder, "Catch2TestAdapter");
        context.subscriptions.push(log);
        const adapter = new Catch2TestAdapter(workspaceFolder, log);
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
        const log = new Log("Catch2TestAdapter", workspaceFolder, "Catch2TestAdapter");
        context.subscriptions.push(log);
        const adapter = new Catch2TestAdapter(workspaceFolder, log);
        registeredAdapters.set(workspaceFolder, adapter);
        testExplorerExtension.exports.registerTestAdapter(adapter);
      }
    });
  }
}
