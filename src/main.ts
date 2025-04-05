import * as vscode from 'vscode';
import { AbstractExecutable, TestsToRun } from './framework/AbstractExecutable';
import { Logger } from './Logger';
import { WorkspaceManager } from './WorkspaceManager';
import { SharedTestTags } from './framework/SharedTestTags';
import { TestItemManager } from './TestItemManager';

///

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = new Logger();
  log.info('Activating extension');
  const controller = vscode.tests.createTestController('testmatecpp', 'TestMate C++');
  const workspace2manager = new Map<vscode.WorkspaceFolder, WorkspaceManager>();
  const testItemManager = new TestItemManager(controller);
  const executableChangedEmitter = new vscode.EventEmitter<Iterable<AbstractExecutable>>();
  const executableChanged = (e: Iterable<AbstractExecutable>): void => {
    executableChangedEmitter.fire(e);
  };

  ///

  const addWorkspaceManager = (wf: vscode.WorkspaceFolder): void => {
    if (workspace2manager.get(wf)) log.errorS('Unexpected workspace manager', wf);
    else workspace2manager.set(wf, new WorkspaceManager(wf, log, testItemManager, executableChanged));
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

  const initWorkspaceManagers = (forceReload: boolean) =>
    Promise.allSettled([...workspace2manager.values()].map(manager => manager.init(forceReload))).then<void>();

  const commandReloadWorkspaces = () => {
    for (const ws of workspace2manager.keys()) {
      removeWorkspaceManager(ws);
    }

    // just to make sure
    controller.items.replace([]);

    addOpenedWorkspaces();

    return initWorkspaceManagers(false);
  };

  ///

  controller.resolveHandler = (item: vscode.TestItem | undefined): Thenable<void> => {
    if (item) {
      const testData = testItemManager.map(item);
      if (testData) {
        //testData.resolve();
        return Promise.resolve();
      } else {
        log.errorS('Missing TestData for item', item.id, item.label);
        return Promise.resolve();
      }
    } else {
      return initWorkspaceManagers(false);
    }
  };

  ///

  controller.refreshHandler = (_token: vscode.CancellationToken): Thenable<void> => {
    return commandReloadWorkspaces();
  };

  ///

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
        const executable = test.exec;
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

  const startTestRun = async (request: vscode.TestRunRequest) => {
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
        runQueue.push(
          manager.run(executables, testRun).catch(e => {
            vscode.window.showErrorMessage('Unexpected error from run: ' + e);
          }),
        );
      }

      await Promise.allSettled(runQueue);
    } catch (e) {
      log.errorS('runHandler errored. never should be here', e);
    } finally {
      testRun.end();
      --runCount;
    }
  };

  const testResultInvalidator = executableChangedEmitter.event(executables => {
    const changedItems: vscode.TestItem[] = [];
    for (const e of executables) {
      const ei = e.getExecTestItem();
      if (ei) changedItems.push(ei);
      else for (const t of e.getTests()) changedItems.push(t.item);
    }
    controller.invalidateTestResults(changedItems);
  });

  const continousRunThese = new Set<vscode.TestRunRequest>();
  const continousRunHandler = executableChangedEmitter.event(executables => {
    if (continousRunThese.size === 0) return;
    const requests = new Map<
      vscode.TestRunProfile | undefined,
      { include: vscode.TestItem[]; exclude: vscode.TestItem[] }
    >();
    for (const trr of continousRunThese) {
      let req = requests.get(trr.profile);
      if (req === undefined) {
        req = {
          include: [],
          exclude: [],
        };
        requests.set(trr.profile, req);
      }
      if (trr.include === undefined) {
        for (const exec of executables) {
          const execTestItem = exec.getExecTestItem();
          if (execTestItem) req.include.push(execTestItem);
          else {
            for (const test of exec.getTests()) {
              if (!test.skipped) req.include.push(test.item);
            }
          }
        }
      } else {
        const isRelevant = (item: vscode.TestItem, skipSkiped: boolean): boolean | null => {
          const atest = testItemManager.map(item);
          if (atest === undefined)
            // null in case we cannot decide because children might relevant
            return null;
          if (skipSkiped && atest.skipped) {
            return false;
          }
          for (const e of executables) {
            if (atest.exec === e) return true;
          }
          return false;
        };
        for (const item of trr.include) {
          const isItemRelevant = isRelevant(item, false);
          if (isItemRelevant === true) req.include.push(item);
          // in case of using grouping, has to go deeper
          else if (isItemRelevant === null) {
            const recursiveCheckDescendants = (item: vscode.TestItem) => {
              for (const [_, childItem] of item.children) {
                const isRelevantChild = isRelevant(childItem, true);
                if (isRelevantChild) req!.include.push(childItem);
                else if (isRelevantChild === null) recursiveCheckDescendants(childItem);
              }
            };
            recursiveCheckDescendants(item);
          }
        }
      }
      if (trr.exclude !== undefined) {
        req.exclude.push(...trr.exclude);
      }
    }
    for (const [profile, req] of requests) {
      if (req.include === undefined || req.include.length > 0) {
        startTestRun(new vscode.TestRunRequest(req.include, req.exclude, profile, true));
      }
    }
  });

  const runProfile = controller.createRunProfile(
    'Run Test',
    vscode.TestRunProfileKind.Run,
    async (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken): Promise<void> => {
      if (request.continuous) {
        continousRunThese.add(request);
        cancellation.onCancellationRequested(() => continousRunThese.delete(request));
      } else {
        return startTestRun(request);
      }
    },
    true,
    SharedTestTags.runnable,
    true,
  );

  // https://github.com/matepek/vscode-catch2-test-adapter/issues/375
  let currentDebugExec = '';
  let currentDebugArgs: string[] = [];
  const setCurrentDebugVars = (exec: string, args: string[]) => {
    currentDebugExec = exec;
    currentDebugArgs = args;
  };

  const debugProfile = controller.createRunProfile(
    'Debug Test',
    vscode.TestRunProfileKind.Debug,
    async (request: vscode.TestRunRequest, _cancellation: vscode.CancellationToken): Promise<void> => {
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
          runQueue.push(
            manager
              .debug(test, testRun, setCurrentDebugVars)
              .catch(e => {
                vscode.window.showErrorMessage('Unexpected error from debug: ' + e);
              })
              .finally(() => (currentDebugArgs = [])),
          );
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
      testResultInvalidator.dispose();
      continousRunHandler.dispose();
      runProfile.dispose();
      debugProfile.dispose();
      controller.dispose();
      log.info('Deactivating finished');
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('testMate.cmd.reload-tests', () => initWorkspaceManagers(true)),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testMate.cmd.reload-workspaces', commandReloadWorkspaces),
  );

  context.subscriptions.push(vscode.commands.registerCommand('testMate.cmd.get-debug-exec', () => currentDebugExec));

  context.subscriptions.push(
    vscode.commands.registerCommand('testMate.cmd.get-debug-args', () =>
      currentDebugArgs.map(a => a.replaceAll('"', '\\"')).join('" "'),
    ),
  );

  addOpenedWorkspaces();

  log.info('Activation finished');

  [...workspace2manager.values()].forEach(manager => manager.initAtStartupIfRequestes());
}
