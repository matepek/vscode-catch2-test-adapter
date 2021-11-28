import * as vscode from 'vscode';
import { AbstractExecutable, TestsToRun } from './AbstractExecutable';
import { LoggerWrapper } from './LoggerWrapper';
import { WorkspaceManager } from './WorkspaceManager';
import { SharedTestTags } from './SharedTestTags';
import { TestItemManager } from './TestItemManager';

///

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = new LoggerWrapper('testMate.cpp.log', 'C++ TestMate');
  log.info('Activating extension');
  const controller = vscode.tests.createTestController('testmatecpp', 'TestMate C++');
  const workspace2manager = new Map<vscode.WorkspaceFolder, WorkspaceManager>();
  const testItemManager = new TestItemManager(controller);

  ///

  controller.resolveHandler = (item: vscode.TestItem | undefined): Thenable<void> => {
    if (item) {
      const testData = testItemManager.map(item);
      if (testData) {
        return testData.resolve();
      } else {
        log.errorS('Missing TestData for item', item.id, item.label);
        return Promise.resolve();
      }
    } else {
      return Promise.allSettled([...workspace2manager.values()].map(manager => manager.load())).then();
    }
  };

  ///

  const addWorkspaceManager = (wf: vscode.WorkspaceFolder): void => {
    if (workspace2manager.get(wf)) log.errorS('Unexpected workspace manager', wf);
    else workspace2manager.set(wf, new WorkspaceManager(wf, log, testItemManager));
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

  const addOpenedWorkspaces = () => {
    if (vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        addWorkspaceManager(workspaceFolder);
      }
    }
  };

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
    const managers = new Map<WorkspaceManager, Map<AbstractExecutable, TestsToRun>>();

    const enumerator = (type: 'direct' | 'parent') => (item: vscode.TestItem) => {
      if (request.exclude?.includes(item)) return;

      const test = testItemManager.map(item);

      if (test) {
        const executable = test.executable;
        const manager = workspace2manager.get(executable.shared.workspaceFolder)!;
        let executables = managers.get(manager);
        if (!executables) {
          executables = new Map<AbstractExecutable, TestsToRun>();
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

  let runCount = 0;
  let debugCount = 0;

  const runProfile = controller.createRunProfile(
    'Run Test',
    vscode.TestRunProfileKind.Run,
    async (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken): Promise<void> => {
      if (debugCount) {
        vscode.window.showWarningMessage('Cannot run new tests while debugging.');
        return;
      }

      const testRun = controller.createTestRun(request);
      ++runCount;

      try {
        const managers = collectExecutablesForRun(request);

        const runQueue: Thenable<void>[] = [];

        for (const [manager, executables] of managers) {
          runQueue.push(manager.run(executables, cancellation, testRun));
        }

        await Promise.allSettled(runQueue);
      } catch (e) {
        log.errorS('runHandler errored. never should be here', e);
      } finally {
        testRun.end();
        --runCount;
      }
    },
    true,
    SharedTestTags.runnable,
  );

  const debugProfile = controller.createRunProfile(
    'Debug Test',
    vscode.TestRunProfileKind.Debug,
    async (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken): Promise<void> => {
      if (runCount) {
        vscode.window.showWarningMessage('Cannot debug test while running test(s).');
        return;
      }
      if (debugCount) {
        vscode.window.showWarningMessage('Cannot debug test while debugging.');
        return;
      }

      const testRun = controller.createTestRun(request);
      ++debugCount;

      try {
        const managers = collectExecutablesForRun(request);

        if (managers.size != 1) {
          vscode.window.showWarningMessage('You should only run 1 test case, no group.');
          return;
        }

        const runQueue: Thenable<void>[] = [];

        for (const [manager, executables] of managers) {
          if (executables.size != 1) {
            vscode.window.showWarningMessage('You should only run 1 test case, no group.');
            return;
          }

          const testsToRun = [...executables.values()][0];

          if (testsToRun.direct.length != 1) {
            vscode.window.showWarningMessage('You should only run 1 test case, no group.');
            return;
          }
          const test = testsToRun.direct[0];
          runQueue.push(manager.debug(test, cancellation, testRun));
        }

        await Promise.allSettled(runQueue);
      } catch (e) {
        log.errorS('debugHandler errored. never should be here', e);
      } finally {
        testRun.end();
        --debugCount;
      }
    },
    false,
    SharedTestTags.debuggable,
  );

  context.subscriptions.push({
    dispose(): void {
      log.info('Deactivating extension');
      for (const wf of workspace2manager.keys()) {
        removeWorkspaceManager(wf);
      }
      log.info('Disposing controller');
      runProfile.dispose();
      debugProfile.dispose();
      controller.dispose();
      log.info('Deactivating finished');
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('testMate.cmd.reload-tests', async () => {
      for (const ws of workspace2manager.values()) {
        await ws.load();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testMate.cmd.reload-workspaces', () => {
      for (const ws of workspace2manager.keys()) {
        removeWorkspaceManager(ws);
      }

      addOpenedWorkspaces();
      Promise.allSettled([...workspace2manager.values()].map(manager => manager.load())).then();
    }),
  );

  addOpenedWorkspaces();

  log.info('Activation finished');
}
