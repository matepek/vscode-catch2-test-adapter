import * as vscode from 'vscode';
import { LoggerWrapper } from './LoggerWrapper';
import { WorkspaceManager } from './WorkspaceManager';
import { TestData } from './TestData';
import { ResolveRuleAsync } from './util/ResolveRule';
import { sep as osPathSeparator } from 'path';

///

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = new LoggerWrapper('testMate.cpp.log', 'C++ TestMate');
  log.info('Activating extension');
  const controller = vscode.tests.createTestController('testmatecpp', 'TestMate C++');
  const workspace2manager = new Map<vscode.WorkspaceFolder, WorkspaceManager>();
  const testItem2testData = new WeakMap<vscode.TestItem, TestData>();

  ///

  controller.resolveHandler = (item: vscode.TestItem | undefined): Thenable<void> => {
    if (item) {
      const testData = testItem2testData.get(item);
      if (testData?.runnable) return testData.runnable.resolve(testData, item);
      log.error('Missing TestData for item', item.id, item.label);
      return Promise.resolve();
    } else {
      return Promise.all(
        [...workspace2manager.values()].map(manager =>
          manager.load().catch(reason => log.errorS('workspace load is errored', reason)),
        ),
      ).then();
    }
  };

  ///

  const variableToValue: ResolveRuleAsync[] = [
    {
      resolve: /\$\{assert(?::([^}]+))?\}/,
      rule: async (m: RegExpMatchArray): Promise<never> => {
        const msg = m[1] ? ': ' + m[1] : '';
        throw Error('Assertion while resolving variable' + msg);
      },
    },
    { resolve: '${osPathSep}', rule: osPathSeparator },
    { resolve: '${osPathEnvSep}', rule: process.platform === 'win32' ? ';' : ':' },
    {
      resolve: /\$\{command:([^}]+)\}/,
      rule: async (m: RegExpMatchArray): Promise<string> => {
        try {
          const ruleV = await vscode.commands.executeCommand<string>(m[1]);
          if (ruleV !== undefined) return ruleV;
        } catch (reason) {
          log.warnS("couldn't resolve command", m[0]);
        }
        return m[0];
      },
    },
  ];

  const addWorkspaceManager = (wf: vscode.WorkspaceFolder): void => {
    if (workspace2manager.get(wf)) log.errorS('Unexpected workspace manager', wf);
    else workspace2manager.set(wf, new WorkspaceManager(wf, log, variableToValue));
  };

  const removeWorkspaceManager = (wf: vscode.WorkspaceFolder): void => {
    const manager = workspace2manager.get(wf);
    if (manager) {
      workspace2manager.delete(wf);
      manager.dispose();
    } else {
      log.errorS('Missing manager for workspace', wf);
    }
  };

  if (vscode.workspace.workspaceFolders) {
    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      addWorkspaceManager(workspaceFolder);
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(event => {
      for (const workspaceFolder of event.removed) {
        removeWorkspaceManager(workspaceFolder);
      }

      for (const workspaceFolder of event.added) {
        addWorkspaceManager(workspaceFolder);
      }
    }),
  );

  context.subscriptions.push({
    dispose(): void {
      log.info('Deactivating extension');
      for (const wf of workspace2manager.keys()) {
        removeWorkspaceManager(wf);
      }
      log.info('Disposing controller');
      controller.dispose();
      log.info('Deactivating finished');
    },
  });

  log.info('Activation finished');
}
