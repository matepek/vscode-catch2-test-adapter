import * as vscode from 'vscode';
import { AbstractRunnable, TestsToRun } from './AbstractRunnable';
import { AbstractTest } from './AbstractTest';
import { LoggerWrapper } from './LoggerWrapper';
import { WorkspaceManager } from './WorkspaceManager';

///

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = new LoggerWrapper('testMate.cpp.log', 'C++ TestMate');
  log.info('Activating extension');
  const controller = vscode.tests.createTestController('testmatecpp', 'TestMate C++');
  const workspace2manager = new Map<vscode.WorkspaceFolder, WorkspaceManager>();
  const testItem2test = new WeakMap<vscode.TestItem, AbstractTest>();

  ///

  controller.resolveHandler = (item: vscode.TestItem | undefined): Thenable<void> => {
    if (item) {
      // const testData = testItem2testData.get(item);
      // if (testData?.executable) {
      //   return testData.executable.resolve(testData, item);
      // } else {
      //   log.errorS('Missing TestData for item', item.id, item.label);
      //   return Promise.resolve();
      // }
      return Promise.resolve();
    } else {
      return Promise.allSettled([...workspace2manager.values()].map(manager => manager.load())).then();
    }
  };

  ///

  const testItemCreator = (
    id: string,
    label: string,
    file: string | undefined,
    line: string | number | undefined,
    testData: AbstractTest | undefined,
  ) => {
    const uri = file ? vscode.Uri.file(file) : undefined;
    const item = controller.createTestItem(id, label, uri);
    if (file) {
      const lineP = typeof line == 'number' ? line : typeof line == 'string' ? parseInt(line) : undefined;
      if (lineP) item.range = new vscode.Range(lineP - 1, 0, lineP - 1, 0);
    }
    if (testData) testItem2test.set(item, testData);
    return item;
  };

  const mapTestItem2Test = (item: vscode.TestItem): AbstractTest | undefined => testItem2test.get(item);

  const addWorkspaceManager = (wf: vscode.WorkspaceFolder): void => {
    if (workspace2manager.get(wf)) log.errorS('Unexpected workspace manager', wf);
    else workspace2manager.set(wf, new WorkspaceManager(wf, log, controller.items, testItemCreator, mapTestItem2Test));
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

  const collectExecutablesForRun = (request: vscode.TestRunRequest) => {
    const managers = new Map<WorkspaceManager, Map<AbstractRunnable, TestsToRun>>();

    const enumerator = (type: 'direct' | 'parent') => (item: vscode.TestItem) => {
      if (request.exclude?.includes(item)) return;

      const test = testItem2test.get(item);

      if (test) {
        const executable = test.runnable;
        const manager = workspace2manager.get(executable._shared.workspaceFolder)!;
        let executables = managers.get(manager);
        if (!executables) {
          executables = new Map<AbstractRunnable, TestsToRun>();
          managers.set(manager, executables);
        }
        let tests = executables.get(executable);
        if (!tests) {
          tests = new TestsToRun();
          executables.set(executable, tests);
        }
        tests[type].push(test);
      } else if (item.children.size) {
        item.children.forEach(enumerator('parent'));
      }
    };

    if (request.include) request.include.forEach(enumerator('direct'));
    else controller.items.forEach(enumerator('parent'));

    return managers;
  };

  const runProfile = controller.createRunProfile(
    'run profile name',
    vscode.TestRunProfileKind.Run,
    async (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken): Promise<void> => {
      const run = controller.createTestRun(request);
      try {
        const managers = collectExecutablesForRun(request);

        const managerRuns: Thenable<void>[] = [];
        for (const [manager, executables] of managers) {
          managerRuns.push(manager.run(executables, cancellation, run));
        }

        await Promise.allSettled(managerRuns);
      } catch (e) {
        log.errorS('runHandler errored', e);
      } finally {
        run.end();
      }
    },
    true,
  );

  context.subscriptions.push({
    dispose(): void {
      log.info('Deactivating extension');
      for (const wf of workspace2manager.keys()) {
        removeWorkspaceManager(wf);
      }
      log.info('Disposing controller');
      runProfile.dispose();
      controller.dispose();
      log.info('Deactivating finished');
    },
  });

  log.info('Activation finished');
}
