import { sep as osPathSeparator } from 'path';
import * as vscode from 'vscode';
import { TestLoadFinishedEvent, TestLoadStartedEvent, RetireEvent } from 'vscode-test-adapter-api';
import * as api from 'vscode-test-adapter-api';
import * as Sentry from '@sentry/node';

import { LoggerWrapper } from './LoggerWrapper';
import { RootSuite } from './RootSuite';
import { generateId } from './Util';
import { TaskQueue } from './util/TaskQueue';
import { SharedVariables, TestRunEvent } from './SharedVariables';
import { Catch2Section, Catch2Test } from './framework/Catch2Test';
import { AbstractRunnable } from './AbstractRunnable';
import { Configurations, Config } from './Configurations';
import { readJSONSync } from 'fs-extra';
import { join } from 'path';
import { AbstractTest, AbstractTestEvent } from './AbstractTest';
import { ResolveRuleAsync, resolveVariablesAsync } from './util/ResolveRule';
import { inspect } from 'util';

export class TestAdapter implements api.TestAdapter, vscode.Disposable {
  private readonly _testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly _testStatesEmitter = new vscode.EventEmitter<TestRunEvent>();
  private readonly _retireEmitter = new vscode.EventEmitter<RetireEvent>();
  private readonly _disposables: vscode.Disposable[] = [];

  private readonly _shared: SharedVariables;
  private _rootSuite: RootSuite;

  private readonly _isDebugExtension: boolean = process.env['C2_DEBUG'] === 'true';

  public constructor(public readonly workspaceFolder: vscode.WorkspaceFolder, log: LoggerWrapper) {
    const configuration = this._getConfiguration(log);

    log.info(
      'Extension constructor',
      this.workspaceFolder.name,
      this.workspaceFolder.index,
      this.workspaceFolder.uri.fsPath,
      process.platform,
      process.version,
      process.versions,
      vscode.version,
    );

    if (!this._isDebugExtension) configuration.askSentryConsent();

    try {
      let extensionInfo: {
        version: string;
        publisher: string;
        name: string;
      };

      try {
        const pjson = readJSONSync(join(__dirname, '../../package.json'));
        extensionInfo = { version: pjson.version, publisher: pjson.publisher, name: pjson.name };
      } catch (e) {
        log.exceptionS(e, __dirname);
        extensionInfo = { version: '<unknown-version>', publisher: '<unknown-publisher>', name: '<unknown-name>' };
      }

      const enabled = !this._isDebugExtension && configuration.isSentryEnabled();

      log.info('sentry.io is', enabled);

      const release = extensionInfo.publisher + '-' + extensionInfo.name + '@' + extensionInfo.version;

      Sentry.init({
        dsn: 'https://0cfbeca1e97e4478a5d7e9c77925d92f@sentry.io/1554599',
        enabled,
        release,
        defaultIntegrations: false,
        normalizeDepth: 10,
      });

      Sentry.setTags({
        platform: process.platform,
        vscodeVersion: vscode.version,
        version: extensionInfo.version,
        publisher: extensionInfo.publisher,
      });

      try {
        const opt = Intl.DateTimeFormat().resolvedOptions();
        Sentry.setTags({ timeZone: opt.timeZone, locale: opt.locale });
      } catch (e) {
        log.exceptionS(e);
      }

      Sentry.setUser({ id: configuration.getOrCreateUserId() });
      //Sentry.setTag('workspaceFolder', hashString(this.workspaceFolder.uri.fsPath));

      //'Framework' message includes this old message too: Sentry.captureMessage('Extension was activated', Sentry.Severity.Log);

      log.setContext('config', configuration.getValues());

      const extensionsChanged = (): void => {
        try {
          const activeExtensions = vscode.extensions.all.filter(ex => ex.isActive).map(ex => ex.id);
          const vscodeRemote = activeExtensions.find(ex => ex.startsWith('ms-vscode-remote.'));
          log.debug('Active extensions', `activeVSCodeRemote(${vscodeRemote})`, activeExtensions);
          Sentry.setTag('activeVSCodeRemote', vscodeRemote ? vscodeRemote : 'undefined');
        } catch (e) {
          log.exceptionS(e);
        }
      };
      extensionsChanged();

      this._disposables.push(vscode.extensions.onDidChange(extensionsChanged));
    } catch (e) {
      log.exceptionS(e);
    }

    this._disposables.push(this._testsEmitter);
    this._disposables.push(this._testStatesEmitter);

    const loadWithTask = async (task: () => Promise<void | Error[]>): Promise<void> => {
      this._sendLoadingEventIfNeeded();

      try {
        const errors = await task();
        this._sendLoadingFinishedEventIfNeeded(errors);
      } catch (reason) {
        log.warnS('loadTask exception', reason);
        this._sendLoadingFinishedEventIfNeeded([reason]);
      }
    };

    const sendRetireEvent = (tests: Iterable<AbstractTest>): void => {
      const ids: string[] = [];
      for (const t of tests) ids.push(t.id);
      this._retireEmitter.fire({ tests: ids });
    };

    const sendTestRunEvent = (event: TestRunEvent): void => {
      const label =
        event.type === 'suite'
          ? typeof event.suite === 'string'
            ? event.suite
            : event.suite.label
          : event.type === 'test'
          ? typeof event.test === 'string'
            ? event.test
            : event.test.label
          : event.type;
      this._shared.log.setNextInspectOptions({ depth: 0 });
      this._shared.log.debug('Event fired', label, event);

      this._testStatesEmitter.fire(event);
    };

    const sendTestEventsWithStartAndFin = (testEvents: AbstractTestEvent[]): void => {
      if (testEvents.length > 0) {
        const testRunId = generateId();
        this._rootSuite.sendStartEventIfNeeded(
          testRunId,
          testEvents.map(v => v.test),
        );

        for (let i = 0; i < testEvents.length; ++i) {
          const test = this._rootSuite.findTestById(testEvents[i].test);

          if (test) {
            // we dont need to send events about ancestors: https://github.com/hbenl/vscode-test-explorer/issues/141
            this._testStatesEmitter.fire(testEvents[i]);
          } else {
            log.error('sendTestEventEmitter.event', testEvents[i], this._rootSuite);
          }
        }

        this._rootSuite.sendFinishedEventIfNeeded(testRunId);
      }
    };

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

        //TODO timeout
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

    const workspaceNameRes: ResolveRuleAsync = { resolve: '${workspaceName}', rule: this.workspaceFolder.name };

    this._disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        workspaceNameRes.rule = this.workspaceFolder.name;
      }),
    );

    const variableToValue: ResolveRuleAsync[] = [
      { resolve: '${osPathSep}', rule: osPathSeparator },
      { resolve: '${workspaceFolder}', rule: this.workspaceFolder.uri.fsPath },
      { resolve: '${workspaceDirectory}', rule: this.workspaceFolder.uri.fsPath },
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
      workspaceNameRes,
    ];

    this._shared = new SharedVariables(
      log,
      this.workspaceFolder,
      loadWithTask,
      sendRetireEvent,
      sendTestRunEvent,
      sendTestEventsWithStartAndFin,
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

          try {
            Sentry.setContext('config', config.getValues());
          } catch (e) {
            log.exceptionS(e);
          }

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
            this._retireEmitter.fire({});
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

    this._rootSuite = new RootSuite(undefined, this._shared);
  }

  public dispose(): void {
    this._shared.log.info('dispose', this.workspaceFolder);

    this._disposables.forEach(d => {
      try {
        d.dispose();
      } catch (e) {
        this._shared.log.error('dispose', e, d);
      }
    });

    try {
      this._shared.dispose();
    } catch (e) {
      this._shared.log.error('dispose', e, this._shared);
    }

    try {
      this._rootSuite.dispose();
    } catch (e) {
      this._shared.log.error('dispose', e, this._rootSuite);
    }
  }

  public get testStates(): vscode.Event<TestRunEvent> {
    return this._testStatesEmitter.event;
  }

  public get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
    return this._testsEmitter.event;
  }

  public get retire(): vscode.Event<RetireEvent> {
    return this._retireEmitter.event;
  }

  private _testLoadingCounter = 0;
  private _testLoadingErrors: Error[] = [];

  private _sendLoadingEventIfNeeded(): void {
    if (this._testLoadingCounter++ === 0) {
      this._shared.log.info('load started');
      this._testsEmitter.fire({ type: 'started' });
      this._testLoadingErrors = [];
    }
  }

  private _sendLoadingFinishedEventIfNeeded(errors?: void | Error[]): void {
    if (errors && errors.length) {
      try {
        this._testLoadingErrors.push(...errors);
      } catch (reason) {
        this._shared.log.exceptionS(reason);
      }
    }

    if (this._testLoadingCounter < 1) {
      this._shared.log.error('loading counter is too low');
      this._testLoadingCounter = 0;
      this._testLoadingErrors = [];
      debugger;
      return;
    }

    if (this._testLoadingCounter-- === 1) {
      this._shared.log.info('load finished', this._rootSuite.children.length);
      if (this._testLoadingErrors.length > 0) {
        this._testsEmitter.fire({
          type: 'finished',
          errorMessage: this._testLoadingErrors
            .map(err => (err instanceof Error ? `${err.name}: ${err.message}` : inspect(err)))
            .join('\n'),
        });
      } else if (this._rootSuite.children.length === 0) {
        this._testsEmitter.fire({
          type: 'finished',
          suite: undefined,
        });
      } else {
        this._testsEmitter.fire({
          type: 'finished',
          suite: this._rootSuite.getInterfaceObj(),
        });
      }
    }
  }

  public async load(): Promise<void> {
    this._shared.log.info('load called');

    try {
      this.cancel();
      this._rootSuite.dispose();

      const configuration = this._getConfiguration(this._shared.log);

      this._rootSuite = new RootSuite(this._rootSuite.id, this._shared);

      const exec = configuration.getExecutables(this._shared);

      return await this._shared.loadWithTask(() => {
        return this._rootSuite.load(exec);
      });
    } catch (reason) {
      vscode.window.showErrorMessage('Unable to load tests: ' + reason);
    }
  }

  public cancel(): void {
    this._shared.log.debug('canceled');
    this._rootSuite.cancel();
  }

  private readonly _busyMsg =
    'The adapter is busy. Please wait before you start another task. (If you are not running tests or debugging currently then this is a bug.)';

  public run(tests: string[]): Promise<void> {
    if (this._isDebugging) {
      this._shared.log.warn(this._busyMsg);
      throw Error(this._busyMsg);
    }

    return this._rootSuite.run(tests);
  }

  private static _debugMetricSent = false;
  private _isDebugging = false;

  public async debug(tests: string[]): Promise<void> {
    if (this._rootSuite.isRunning || this._isDebugging) {
      this._shared.log.warn(this._busyMsg);
      throw Error(this._busyMsg);
    }

    this._isDebugging = true;

    try {
      this._shared.log.info('Using debug');

      if (this._rootSuite.findChildSuite(s => tests.indexOf(s.id) != -1)) {
        this._shared.log.info('unsupported suite debug', tests);
        throw Error('Suites cannot be debugged.');
      }

      const runnableToTestMap = tests
        .map(t => this._rootSuite.findTestById(t))
        .reduce((runnableToTestMap, test) => {
          if (test === undefined) return runnableToTestMap;
          const tests = runnableToTestMap.get(test.runnable);
          if (tests) tests.push(test!);
          else runnableToTestMap.set(test.runnable, [test]);
          return runnableToTestMap;
        }, new Map<AbstractRunnable, Readonly<AbstractTest>[]>());

      if (runnableToTestMap.size !== 1) {
        this._shared.log.error('unsupported executable count', tests);
        throw Error('Unsupported input. It seems you would like to debug more tests from different executables.');
      }

      const [runnable, runnableTests] = [...runnableToTestMap][0];

      this._shared.log.info('test', runnable, runnableTests);

      const configuration = this._getConfiguration(this._shared.log);

      const [debugConfigTemplate, debugConfigTemplateSource] = configuration.getDebugConfigurationTemplate();

      this._shared.log.debug('debugConfigTemplate', { debugConfigTemplateSource, debugConfigTemplate });

      if (!TestAdapter._debugMetricSent) {
        this._shared.log.infoSWithTags('Using debug', { debugConfigTemplateSource });
        TestAdapter._debugMetricSent = true;
      }

      const label = runnableTests.length > 1 ? `(${runnableTests.length} tests)` : runnableTests[0].label;

      const suiteLabels =
        runnableTests.length > 1
          ? ''
          : [...runnableTests[0].route()]
              .filter((v, i, a) => i < a.length - 1)
              .map(s => s.label)
              .join(' ← ');

      const argsArray = runnable.getDebugParams(runnableTests, configuration.getDebugBreakOnFailure());

      if (runnableTests.length === 1 && runnableTests[0] instanceof Catch2Test) {
        const sections = (runnableTests[0] as Catch2Test).sections;
        if (sections && sections.length > 0) {
          interface QuickPickItem extends vscode.QuickPickItem {
            sectionStack: Catch2Section[];
          }

          const items: QuickPickItem[] = [
            {
              label: label,
              sectionStack: [],
              description: 'Select the section combo you wish to debug or choose this to debug all of it.',
            },
          ];

          const traverse = (
            stack: Catch2Section[],
            section: Catch2Section,
            hasNextStack: boolean[],
            hasNext: boolean,
          ): void => {
            const currStack = stack.concat(section);
            const space = '\u3000';
            let label = hasNextStack.map(h => (h ? '┃' : space)).join('');
            label += hasNext ? '┣' : '┗';
            label += section.name;

            items.push({
              label: label,
              description: section.failed ? '❌' : '✅',
              sectionStack: currStack,
            });

            for (let i = 0; i < section.children.length; ++i)
              traverse(currStack, section.children[i], hasNextStack.concat(hasNext), i < section.children.length - 1);
          };

          for (let i = 0; i < sections.length; ++i) traverse([], sections[i], [], i < sections.length - 1);

          const pick = await vscode.window.showQuickPick(items);

          if (pick === undefined) return Promise.resolve();

          pick.sectionStack.forEach(s => {
            argsArray.push('-c');
            argsArray.push(s.escapedName);
          });
        }
      }

      const argsArrayFunc = async (): Promise<string[]> => argsArray;

      const envVars = Object.assign(Object.assign({}, process.env), runnable.properties.options.env!);

      const varToResolve: ResolveRuleAsync[] = [
        ...runnable.properties.varToValue,
        { resolve: '${suiteLabel}', rule: suiteLabels },
        { resolve: '${label}', rule: label },
        { resolve: '${exec}', rule: runnable.properties.path },
        { resolve: '${args}', rule: argsArrayFunc }, // deprecated
        { resolve: '${argsArray}', rule: argsArrayFunc },
        { resolve: '${argsArrayFlat}', rule: argsArrayFunc, isFlat: true },
        {
          resolve: '${argsStr}',
          rule: async (): Promise<string> => '"' + argsArray.map(a => a.replace('"', '\\"')).join('" "') + '"',
        },
        { resolve: '${cwd}', rule: runnable.properties.options.cwd! },
        {
          resolve: '${envObj}',
          rule: async (): Promise<NodeJS.ProcessEnv> => envVars,
        },
        {
          resolve: '${envObjArray}',
          rule: async (): Promise<{ name: string; value: string }[]> =>
            Object.keys(envVars).map(name => {
              return { name, value: envVars[name] || '' };
            }),
        },
        {
          resolve: '${sourceFileMapObj}',
          rule: async (): Promise<Record<string, string>> => runnable.properties.sourceFileMap,
        },
      ];

      const debugConfig = await resolveVariablesAsync(debugConfigTemplate, varToResolve);

      // we dont know better: https://github.com/Microsoft/vscode/issues/70125
      const magicValueKey = 'magic variable  🤦🏼‍';
      const magicValue = generateId();
      debugConfig[magicValueKey] = magicValue;

      this._shared.log.info('Debug: resolved debugConfig:', debugConfig);

      const cancellationTokenSource = new vscode.CancellationTokenSource();

      await this._rootSuite.runTasks('before', runnableToTestMap, cancellationTokenSource.token);
      await runnable.runTasks('beforeEach', this._shared.taskPool, cancellationTokenSource.token);

      let terminateConn: vscode.Disposable | undefined;

      const terminated = new Promise<void>(resolve => {
        terminateConn = vscode.debug.onDidTerminateDebugSession((session: vscode.DebugSession) => {
          const session2 = (session as unknown) as { configuration: { [prop: string]: string } };
          if (session2.configuration && session2.configuration[magicValueKey] === magicValue) {
            cancellationTokenSource.cancel();
            resolve();
            terminateConn && terminateConn.dispose();
          }
        });
      }).finally(() => {
        this._shared.log.info('debugSessionTerminated');
      });

      this._shared.log.info('startDebugging');

      const debugSessionStarted = await vscode.debug.startDebugging(this.workspaceFolder, debugConfig);

      if (debugSessionStarted) {
        this._shared.log.info('debugSessionStarted');
        await terminated;
      } else {
        terminateConn && terminateConn.dispose();
        throw Error(
          'Failed starting the debug session. Maybe something wrong with "testMate.cpp.debug.configTemplate".',
        );
      }

      await runnable.runTasks('afterEach', this._shared.taskPool, cancellationTokenSource.token);
      await this._rootSuite.runTasks('after', runnableToTestMap, cancellationTokenSource.token);
    } catch (err) {
      this._shared.log.warn(err);
      throw err;
    } finally {
      this._isDebugging = false;
    }
  }

  private _getConfiguration(log: LoggerWrapper): Configurations {
    return new Configurations(log, this.workspaceFolder.uri);
  }
}
