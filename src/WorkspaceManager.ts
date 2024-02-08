import * as vscode from 'vscode';
import { Configurations, setEnvKey } from './Configurations';
import { Logger } from './Logger';
import {
  createPythonIndexerForArray,
  createPythonIndexerForPathVariable,
  ResolveRuleAsync,
  resolveVariablesAsync,
} from './util/ResolveRule';
import { WorkspaceShared } from './WorkspaceShared';
import { sep as osPathSeparator } from 'path';
import { TaskQueue } from './util/TaskQueue';
import { AbstractExecutable, TestsToRun } from './framework/AbstractExecutable';
import { ConfigOfExecGroup } from './ConfigOfExecGroup';
import { generateId, Version } from './Util';
import { AbstractTest } from './framework/AbstractTest';
import { TestItemManager } from './TestItemManager';
import { ProgressReporter } from './util/ProgressReporter';

export class WorkspaceManager implements vscode.Disposable {
  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly log: Logger,
    testItemManager: TestItemManager,
    executableChanged: (e: Iterable<AbstractExecutable>) => void,
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
        rule: (m: RegExpMatchArray): never => {
          const msg = m[1] ? ': ' + m[1] : '';
          throw Error('Assertion while resolving variable' + msg);
        },
      },
      { resolve: '${osPathSep}', rule: osPathSeparator },
      { resolve: '${osPathEnvSep}', rule: process.platform === 'win32' ? ';' : ':' },
      {
        resolve: /\$\{config:([^}]+)\}/,
        rule: (m: RegExpMatchArray): string => {
          try {
            const ruleV = vscode.workspace.getConfiguration().get<string>(m[1])?.toString();
            if (ruleV !== undefined) return ruleV;
          } catch (reason) {
            log.warnS("couldn't resolve config", m[0]);
          }
          return m[0];
        },
      },
      {
        resolve: /\$\{command:([^}]+)\}/, //TODO: add parameter options
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
        // need a new task, ssems like task wiht existing name are handled spcially and changed fields are ignored
        resolvedTask.name = 'testMate:' + resolvedTask.name;

        if (Version.from(vscode.version)?.smaller(new Version(1, 72))) {
          // Task.name setter needs to be triggered in order for the task to clear its __id field
          // (https://github.com/microsoft/vscode/blob/ba33738bb3db01e37e3addcdf776c5a68d64671c/src/vs/workbench/api/common/extHostTypes.ts#L1976),
          // otherwise task execution fails with "Task not found".
          resolvedTask.name += '';
        }

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

        return await result;
      });
    };

    const configuration = this._getConfiguration(log);

    this.initP = configuration.getLoadAtStartup();

    this._shared = new WorkspaceShared(
      workspaceFolder,
      log,
      testItemManager,
      executeTask,
      executableChanged,
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
      true,
    );

    this._disposables.push(
      Configurations.onDidChange(this.log, this.workspaceFolder, changeEvent => {
        try {
          const config = changeEvent.config;

          // Sentry
          // try {
          //   Sentry.setContext('config', config.getValues());
          // } catch (e) {
          //   log.exceptionS(e);
          // }

          if (changeEvent.affects('test.randomGeneratorSeed')) {
            this._shared.rngSeed = config.getRandomGeneratorSeed();
          }
          if (changeEvent.affects('discovery.gracePeriodForMissing')) {
            this._shared.execWatchTimeout = config.getExecWatchTimeout();
          }
          if (changeEvent.affects('test.runtimeLimit')) {
            this._shared.setExecRunningTimeout(config.getExecRunningTimeout());
          }
          if (changeEvent.affects('discovery.runtimeLimit')) {
            this._shared.setExecParsingTimeout(config.getExecParsingTimeout());
          }
          if (changeEvent.affects('debug.noThrow')) {
            this._shared.isNoThrow = config.getDefaultNoThrow();
          }
          if (changeEvent.affects('test.parallelExecutionLimit')) {
            this._shared.taskPool.maxTaskCount = config.getParallelExecutionLimit();
          }
          if (changeEvent.affects('discovery.testListCaching')) {
            this._shared.enabledTestListCaching = config.getEnableTestListCaching();
          }
          if (changeEvent.affects('discovery.strictPattern')) {
            this._shared.enabledStrictPattern = config.getEnableStrictPattern();
          }
          if (changeEvent.affects('gtest.treatGmockWarningAs')) {
            this._shared.googleTestTreatGMockWarningAs = config.getGoogleTestTreatGMockWarningAs();
          }
          if (changeEvent.affects('gtest.gmockVerbose')) {
            this._shared.googleTestGMockVerbose = config.getGoogleTestGMockVerbose();
          }
          if (changeEvent.affectsAny('test.randomGeneratorSeed', 'gtest.treatGmockWarningAs', 'gtest.gmockVerbose')) {
            this._executableConfig.forEach(i => i.sendRetireAllExecutables());
          }
          if (
            changeEvent.affectsAny(
              'test.workingDirectory',
              'test.advancedExecutables',
              'test.executables',
              'test.parallelExecutionOfExecutableLimit',
              'discovery.strictPattern',
            ) ||
            changeEvent.affectsNotTestMate('files.watcherExclude')
          ) {
            this.init(true);
          }
        } catch (e) {
          this._shared.log.exceptionS(e);
        }
      }),
    );
  }

  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _shared: WorkspaceShared;
  private _executableConfig: ConfigOfExecGroup[] = [];

  dispose(): void {
    this._shared.dispose();
    this._executableConfig.forEach(c => c.dispose());
    this._disposables.forEach(d => d.dispose());
  }

  private initP: Thenable<void> | boolean;

  async init(forceReload: boolean): Promise<void> {
    if (typeof this.initP !== 'boolean') {
      if (!forceReload) {
        return await this.initP;
      } else {
        try {
          await this.initP;
        } catch (e) {
          this.log.warn('error during init with forceReload', e);
        }
      }
    }

    this._executableConfig.forEach(c => c.dispose());

    const sbm = vscode.window.setStatusBarMessage('TestMate C++: loading tests...');

    this.initP = vscode.window.withProgress(
      { location: { viewId: 'workbench.view.extension.test' } },
      async (
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        _token: vscode.CancellationToken,
      ): Promise<void> => {
        await new Promise<void>(r => setTimeout(r, 500)); // there are some race condition, this fixes it: maybe async dispose would fix it too?

        const configuration = this._getConfiguration(this.log);
        const executableConfig = configuration.getExecutableConfigs(this._shared);
        this._executableConfig = executableConfig;
        const progressReporter = new ProgressReporter(progress);

        await Promise.allSettled(
          executableConfig.map(x => {
            const subProgressReporter = progressReporter.createSubProgressReporter();
            return x.load(subProgressReporter).catch(e => this.log.errorS(e));
          }),
        );
        sbm.dispose();
      },
    );

    return this.initP;
  }

  public initAtStartupIfRequestes(): void {
    if (this.initP === true) this.init(false);
  }

  private _getConfiguration(log: Logger): Configurations {
    return new Configurations(log, this.workspaceFolder.uri);
  }

  run(executables: Map<AbstractExecutable, TestsToRun>, run: vscode.TestRun): Promise<void> {
    for (const exec of executables.values()) for (const test of exec) run.enqueued(test.item);

    return this._runInner(executables, run).catch(e => {
      this.log.errorS('error during run', e);
      throw e;
    });
  }

  private async _runInner(executables: Map<AbstractExecutable, TestsToRun>, testRun: vscode.TestRun): Promise<void> {
    try {
      await this._runTasks('before', executables.keys(), testRun.token);
      //TODO: future: test list might changes: executables = this._collectRunnables(tests, isParentIn); // might changed due to tasks
    } catch (e) {
      const msg = e.toString();
      testRun.appendOutput(msg);
      const errorMsg = new vscode.TestMessage(msg);
      for (const testsToRun of executables.values()) {
        for (const test of testsToRun) {
          testRun.errored(test.item, errorMsg);
        }
      }

      return;
    }

    const ps: Promise<void>[] = [];

    for (const [exec, toRun] of executables) {
      ps.push(
        exec
          .run(testRun, toRun, this._shared.taskPool)
          .catch(err => this._shared.log.error('RootTestSuite.run.for.child', exec.shared.path, err)),
      );
    }

    await Promise.allSettled(ps);

    try {
      await this._runTasks('after', executables.keys(), testRun.token);
    } catch (e) {
      const msg = e.toString();
      testRun.appendOutput(msg);
      const errorMsg = new vscode.TestMessage(msg);
      for (const testsToRun of executables.values()) {
        for (const test of testsToRun) {
          testRun.errored(test.item, errorMsg);
        }
      }
    }
  }

  private async _runTasks(
    type: 'before' | 'after',
    executables: Iterable<AbstractExecutable>,
    cancellationToken: vscode.CancellationToken,
  ): Promise<void> {
    const runTasks = new Set<string>();
    const runnableExecArray: string[] = [];

    for (const runnable of executables) {
      runnable.shared.runTask[type]?.forEach(t => runTasks.add(t));
      runnableExecArray.push(runnable.shared.path);
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

  debug(test: AbstractTest, run: vscode.TestRun, setDebugArgs: (exec: string, args: string[]) => void): Promise<void> {
    run.enqueued(test.item);

    return this._debugInner(test, run, setDebugArgs).catch(e => {
      this.log.errorS('error during debug', e);
      throw e;
    });
  }

  async _debugInner(
    test: AbstractTest,
    run: vscode.TestRun,
    setDebugArgs: (exec: string, args: string[]) => void,
  ): Promise<void> {
    try {
      this._shared.log.info('Using debug');

      const executable = test.exec;

      this._shared.log.setNextInspectOptions({ depth: 5 });
      this._shared.log.info('test', executable, test);

      const configuration = this._getConfiguration(this._shared.log);

      const argsArray = executable.getDebugParams([test], configuration.getDebugBreakOnFailure());
      setDebugArgs(executable.shared.path, argsArray);

      const argsArrayFunc = async (): Promise<string[]> => argsArray;

      const debugConfigData = configuration.getDebugConfigurationTemplate();

      this._shared.log.info('debug config data', {
        source: debugConfigData.source,
        launchSourceFileMap: debugConfigData.launchSourceFileMap,
      });
      this._shared.log.info(
        'debug config template can be set by "testMate.cpp.debug.configTemplate", one can customize and put it into settings.json:\n' +
          JSON.stringify({ 'testMate.cpp.debug.configTemplate': debugConfigData.template }, undefined, 2),
      );

      const envVars = Object.assign({}, executable.shared.options.env);
      {
        if (typeof debugConfigData.template[setEnvKey] === 'object') {
          for (const envName in debugConfigData.template[setEnvKey]) {
            const envValue = debugConfigData.template[setEnvKey][envName];
            if (envValue === null) delete envVars[envName];
            else if (typeof envValue === 'string') envVars[envName] = envValue;
            else
              this._shared.log.warn(
                'Wrong value. testMate.cpp.debug.setEnv should contains only string values',
                envName,
                setEnvKey,
              );
          }
        }
      }

      const parentLabel: string[] = [];
      {
        let curr = test.item.parent;
        while (curr !== undefined) {
          parentLabel.push(curr.label);
          curr = curr.parent;
        }
      }

      const varToResolve: ResolveRuleAsync[] = [
        ...executable.shared.varToValue,
        { resolve: '${label}', rule: test.label },
        { resolve: '${exec}', rule: executable.shared.path },
        { resolve: '${args}', rule: argsArrayFunc }, // deprecated
        { resolve: '${argsArray}', rule: argsArrayFunc },
        { resolve: '${argsArrayFlat}', rule: argsArrayFunc, isFlat: true },
        {
          resolve: '${argsStr}',
          rule: (): string => '"' + argsArray.map(a => a.replaceAll('"', '\\"')).join('" "') + '"',
        },
        { resolve: '${cwd}', rule: executable.shared.options.cwd.toString() },
        {
          resolve: '${envObj}',
          rule: (): NodeJS.ProcessEnv => envVars,
        },
        {
          resolve: '${envObjArray}',
          rule: (): { name: string; value: string }[] =>
            Object.keys(envVars).map(name => {
              return { name, value: envVars[name] || '' };
            }),
        },
        {
          resolve: '${sourceFileMapObj}',
          rule: (): Record<string, string> =>
            Object.assign({}, executable.shared.resolvedSourceFileMap, debugConfigData.launchSourceFileMap),
        },
        createPythonIndexerForArray('parentLabel', parentLabel, '▸'),
      ];

      let debugConfig = await resolveVariablesAsync(debugConfigData.template, varToResolve);
      const taskSlotId = 0;
      debugConfig = await resolveVariablesAsync(debugConfig, [
        { resolve: '${testMate.var.taskSlotId}', rule: taskSlotId.toString() },
      ]);

      // we dont know better: https://github.com/Microsoft/vscode/issues/70125
      const magicValueKey = 'magic variable  🤦🏼‍';
      const magicValue = generateId();
      debugConfig[magicValueKey] = magicValue;

      this._shared.log.info('resolved debugConfig:', debugConfig);

      await this._runTasks('before', [executable], run.token);
      await executable.runTasks('beforeEach', taskSlotId, run.token);

      let currentSession: vscode.DebugSession | undefined = undefined;

      const started = new Promise<void>(resolve => {
        vscode.debug.onDidStartDebugSession((session: vscode.DebugSession) => {
          const session2 = session as unknown as { configuration: { [prop: string]: string } };
          if (session2.configuration && session2.configuration[magicValueKey] === magicValue) {
            currentSession = session;
            resolve();
          }
        });
      });

      const terminated = new Promise<void>(resolve => {
        vscode.debug.onDidTerminateDebugSession((session: vscode.DebugSession) => {
          const session2 = session as unknown as { configuration: { [prop: string]: string } };
          if (session2.configuration && session2.configuration[magicValueKey] === magicValue) {
            resolve();
          }
        });
      }).finally(() => {
        this._shared.log.info('debugSessionTerminated');
      });

      this._shared.log.info('startDebugging');

      run.started(test.item);

      const debugSessionStarted = await vscode.debug.startDebugging(this.workspaceFolder, debugConfig);

      if (debugSessionStarted) {
        this._shared.log.info('debugSessionStarted');
        await started;
        if (currentSession) {
          run.token.onCancellationRequested(() => {
            vscode.debug.stopDebugging(currentSession);
          });
        }
        await terminated;
      } else {
        throw Error(
          'Failed starting the debug session. Maybe something wrong with "testMate.cpp.debug.configTemplate".',
        );
      }

      await executable.runTasks('afterEach', taskSlotId, run.token);
      await this._runTasks('after', [executable], run.token);
    } catch (err) {
      this._shared.log.warn(err);
      throw err;
    }
  }
}
