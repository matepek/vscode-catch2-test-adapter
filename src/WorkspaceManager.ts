import * as vscode from 'vscode';
import { Config, Configurations } from './Configurations';
import { LoggerWrapper } from './LoggerWrapper';
import { createPythonIndexerForPathVariable, ResolveRuleAsync, resolveVariablesAsync } from './util/ResolveRule';
import { TestCreator, TestItemMapper, WorkspaceShared } from './WorkspaceShared';
import { sep as osPathSeparator } from 'path';
import { TaskQueue } from './util/TaskQueue';
import { AbstractRunnable, TestsToRun } from './AbstractRunnable';
import { ExecutableConfig } from './ExecutableConfig';
import { generateId } from './Util';
import { AbstractTest } from './AbstractTest';

//TODO if workspace contains ".vscode/testMate.cpp.json" we have to start loading the tests
export class WorkspaceManager implements vscode.Disposable {
  public constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly log: LoggerWrapper,
    rootItems: vscode.TestItemCollection,
    testItemCreator: TestCreator,
    testItemMapper: TestItemMapper,
  ) {
    const workspaceNameRes: ResolveRuleAsync = { resolve: '${workspaceName}', rule: this.workspaceFolder.name };

    this._disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        workspaceNameRes.rule = this.workspaceFolder.name;
      }),
    );

    const variableToValue = [
      createPythonIndexerForPathVariable('workspaceFolder', this.workspaceFolder.uri.fsPath),
      createPythonIndexerForPathVariable('workspaceDirectory', this.workspaceFolder.uri.fsPath),
      workspaceNameRes,
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

    const executeTaskQueue = new TaskQueue();
    const executeTask = (
      taskName: string,
      varToValue: readonly ResolveRuleAsync[],
      cancellationToken: vscode.CancellationToken,
    ): Promise<number | undefined> => {
      return executeTaskQueue.then(async () => {
        const tasks = await vscode.tasks.fetchTasks();
        const found = tasks.find(t => t.name === taskName);
        if (found === undefined) {
          const msg = `Could not find task with name "${taskName}".`;
          log.warn(msg);
          throw Error(msg);
        }

        const resolvedTask = await resolveVariablesAsync(found, varToValue);
        // Task.name setter needs to be triggered in order for the task to clear its __id field
        // (https://github.com/microsoft/vscode/blob/ba33738bb3db01e37e3addcdf776c5a68d64671c/src/vs/workbench/api/common/extHostTypes.ts#L1976),
        // otherwise task execution fails with "Task not found".
        resolvedTask.name += '';

        if (cancellationToken.isCancellationRequested) return;

        const result = new Promise<number | undefined>(resolve => {
          const disp1 = vscode.tasks.onDidEndTask((e: vscode.TaskEndEvent) => {
            if (e.execution.task.name === resolvedTask.name) {
              log.info('Task execution has finished', resolvedTask.name);
              disp1.dispose();
              resolve(undefined);
            }
          });

          const disp2 = vscode.tasks.onDidEndTaskProcess((e: vscode.TaskProcessEndEvent) => {
            if (e.execution.task.name === resolvedTask.name) {
              log.info('Task execution has finished', resolvedTask.name, e.exitCode);
              disp2.dispose();
              resolve(e.exitCode);
            }
          });
        });

        log.info('Task execution has started', resolvedTask);

        const execution = await vscode.tasks.executeTask(resolvedTask);

        cancellationToken.onCancellationRequested(() => {
          log.info('Task execution was terminated', execution.task.name);
          execution.terminate();
        });

        return result;
      });
    };

    const configuration = this._getConfiguration(log);

    this._shared = new WorkspaceShared(
      workspaceFolder,
      rootItems,
      log,
      testItemCreator,
      testItemMapper,
      executeTask,
      variableToValue,
      configuration.getRandomGeneratorSeed(),
      configuration.getExecWatchTimeout(),
      configuration.getExecRunningTimeout(),
      configuration.getExecParsingTimeout(),
      configuration.getDefaultNoThrow(),
      configuration.getParallelExecutionLimit(),
      configuration.getEnableTestListCaching(),
      configuration.getEnableStrictPattern(),
      configuration.getGoogleTestTreatGMockWarningAs(),
      configuration.getGoogleTestGMockVerbose(),
    );

    this._disposables.push(
      Configurations.onDidChange(changeEvent => {
        try {
          const config = this._getConfiguration(log);

          // Sentry
          // try {
          //   Sentry.setContext('config', config.getValues());
          // } catch (e) {
          //   log.exceptionS(e);
          // }

          const affectsAny = (...config: Config[]): boolean =>
            config.some(c => changeEvent.affectsConfiguration(c, this.workspaceFolder.uri));

          if (affectsAny('test.randomGeneratorSeed')) {
            this._shared.rngSeed = config.getRandomGeneratorSeed();
          }
          if (affectsAny('discovery.gracePeriodForMissing')) {
            this._shared.execWatchTimeout = config.getExecWatchTimeout();
          }
          if (affectsAny('test.runtimeLimit')) {
            this._shared.setExecRunningTimeout(config.getExecRunningTimeout());
          }
          if (affectsAny('discovery.runtimeLimit')) {
            this._shared.setExecRunningTimeout(config.getExecParsingTimeout());
          }
          if (affectsAny('debug.noThrow')) {
            this._shared.isNoThrow = config.getDefaultNoThrow();
          }
          if (affectsAny('test.parallelExecutionLimit')) {
            this._shared.taskPool.maxTaskCount = config.getParallelExecutionLimit();
          }
          if (affectsAny('discovery.testListCaching')) {
            this._shared.enabledTestListCaching = config.getEnableTestListCaching();
          }
          if (affectsAny('discovery.strictPattern')) {
            this._shared.enabledStrictPattern = config.getEnableStrictPattern();
          }
          if (affectsAny('gtest.treatGmockWarningAs')) {
            this._shared.googleTestTreatGMockWarningAs = config.getGoogleTestTreatGMockWarningAs();
          }
          if (affectsAny('gtest.gmockVerbose')) {
            this._shared.googleTestGMockVerbose = config.getGoogleTestGMockVerbose();
          }

          if (affectsAny('test.randomGeneratorSeed', 'gtest.treatGmockWarningAs', 'gtest.gmockVerbose')) {
            //TODO this.executables. ...; invalidate states
          }

          if (
            affectsAny(
              'test.workingDirectory',
              'test.advancedExecutables',
              'test.executables',
              'test.parallelExecutionOfExecutableLimit',
              'discovery.strictPattern',
            )
          ) {
            this.load();
          }
        } catch (e) {
          this._shared.log.exceptionS(e);
        }
      }),
    );
  }

  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _shared: WorkspaceShared;
  private _executableConfig: ExecutableConfig[] = [];

  dispose(): void {
    this._shared.dispose();
    this._executableConfig.forEach(c => c.dispose());
    this._disposables.forEach(d => d.dispose());
  }

  load(): Thenable<void> {
    this._executableConfig.forEach(c => c.dispose());

    const configuration = this._getConfiguration(this.log);
    const executableConfig = configuration.getExecutableConfigs(this._shared);
    this._executableConfig = executableConfig;
    return Promise.allSettled(
      executableConfig.map(x =>
        x.load().catch(e => {
          this.log.errorS(e);
          debugger; //TODO:remove later
        }),
      ),
    ).then();
  }

  private _getConfiguration(log: LoggerWrapper): Configurations {
    return new Configurations(log, this.workspaceFolder.uri);
  }

  public run(
    executables: Map<AbstractRunnable, TestsToRun>,
    cancellation: vscode.CancellationToken,
    run: vscode.TestRun,
  ): Thenable<void> {
    for (const exec of executables.values()) for (const test of exec) run.enqueued(test.item);

    return this._runInner(executables, cancellation, run).catch(e => {
      this.log.errorS('error during run', e);
      debugger;
    });
  }

  private async _runInner(
    executables: Map<AbstractRunnable, TestsToRun>,
    cancellation: vscode.CancellationToken,
    testRun: vscode.TestRun,
  ): Promise<void> {
    try {
      await this._runTasks('before', executables.keys(), cancellation);
      //runnables = this._collectRunnables(tests, isParentIn); // might changed due to tasks
    } catch (e) {
      //for (const [runnable, tests] of executables.values()) {
      //TODO:runnable.sentStaticErrorEvent(testRunId, tests, e);
      //}

      return;
    }

    const ps: Promise<void>[] = [];

    for (const [exec, toRun] of executables) {
      ps.push(
        exec
          .run(testRun, toRun, this._shared.taskPool, cancellation)
          .catch(err => this._shared.log.error('RootTestSuite.run.for.child', exec.properties.path, err)),
      );
    }

    await Promise.allSettled(ps);

    try {
      await this._runTasks('after', executables.keys(), cancellation);
    } catch (e) {
      for (const [runnable, tests] of executables.values()) {
        //TODO:runnable.sentStaticErrorEvent(testRunId, tests, e);
      }
    }
  }

  private async _runTasks(
    type: 'before' | 'after',
    runnables: Iterable<AbstractRunnable>,
    cancellationToken: vscode.CancellationToken,
  ): Promise<void> {
    const runTasks = new Set<string>();
    const runnableExecArray: string[] = [];

    for (const runnable of runnables) {
      runnable.properties.runTask[type]?.forEach(t => runTasks.add(t));
      runnableExecArray.push(runnable.properties.path);
    }

    if (runTasks.size === 0) return;

    const varToValue: ResolveRuleAsync[] = [
      ...this._shared.varToValue,
      {
        resolve: '${absPathArrayFlat}',
        rule: (): Promise<string[]> => Promise.resolve(runnableExecArray),
        isFlat: true,
      },
      { resolve: '${absPathConcatWithSpace}', rule: runnableExecArray.map(r => `"${r}"`).join(' ') },
    ];

    try {
      // sequential execution of tasks
      for (const taskName of runTasks) {
        const exitCode = await this._shared.executeTask(taskName, varToValue, cancellationToken);

        if (exitCode !== undefined) {
          if (exitCode !== 0) {
            throw Error(
              `Task "${taskName}" has returned with exitCode(${exitCode}) != 0. (\`testMate.test.advancedExecutables:runTask.${type}\`)`,
            );
          }
        }
      }
    } catch (e) {
      throw Error(
        `One of the tasks of the \`testMate.test.advancedExecutables:runTask.${type}\` array has failed: ` + e,
      );
    }
  }
}
