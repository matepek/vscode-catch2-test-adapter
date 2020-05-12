import { sep as osPathSeparator } from 'path';
import * as vscode from 'vscode';
import { TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, RetireEvent } from 'vscode-test-adapter-api';
import * as api from 'vscode-test-adapter-api';
import * as Sentry from '@sentry/node';

import { LoggerWrapper } from './LoggerWrapper';
import { RootSuite } from './RootSuite';
import { generateId, reverse } from './Util';
import { TaskQueue } from './TaskQueue';
import { SharedVariables, TestRunEvent } from './SharedVariables';
import { Catch2Section, Catch2Test } from './framework/Catch2Test';
import { AbstractRunnable } from './AbstractRunnable';
import { Configurations, Config } from './Configurations';
import { readJSONSync } from 'fs-extra';
import { join } from 'path';
import { AbstractTest } from './AbstractTest';
import { ResolveRule, resolveVariables } from './util/ResolveRule';
import { inspect } from 'util';

export class TestAdapter implements api.TestAdapter, vscode.Disposable {
  private readonly _log: LoggerWrapper;

  private readonly _testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly _testStatesEmitter = new vscode.EventEmitter<TestRunEvent>();
  private readonly _retireEmitter = new vscode.EventEmitter<RetireEvent>();

  private readonly _mainTaskQueue = new TaskQueue([], 'TestAdapter');
  private readonly _disposables: vscode.Disposable[] = [];

  private readonly _shared: SharedVariables;
  private _rootSuite: RootSuite;

  private readonly _isDebug: boolean = process.env['C2_DEBUG'] === 'true';

  public constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {
    this._log = new LoggerWrapper(
      'testMate.cpp.log',
      this.workspaceFolder,
      `C++ TestMate: ${this.workspaceFolder.name}`,
    );

    const configuration = this._getConfiguration();

    this._log.info(
      'Extension constructor: activated',
      this.workspaceFolder,
      process.platform,
      process.version,
      process.versions,
      vscode.version,
    );

    // TODO:future feedback
    // if (false) {
    //   'https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter&ssr=false#review-details';
    // }

    if (!this._isDebug) configuration.askSentryConsent();

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
        this._log.exceptionS(e, __dirname);
        extensionInfo = { version: '<unknown-version>', publisher: '<unknown-publisher>', name: '<unknown-name>' };
      }

      const enabled = !this._isDebug && configuration.isSentryEnabled();

      this._log.info('sentry.io is', enabled);

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
        this._log.exceptionS(e);
      }

      Sentry.setUser({ id: configuration.getOrCreateUserId() });
      //Sentry.setTag('workspaceFolder', hashString(this.workspaceFolder.uri.fsPath));

      //'Framework' message includes this old message too: Sentry.captureMessage('Extension was activated', Sentry.Severity.Log);

      this._log.setContext('config', configuration.getValues());

      const extensionsChanged = (): void => {
        try {
          const activeExtensions = vscode.extensions.all.filter(ex => ex.isActive).map(ex => ex.id);
          const vscodeRemote = activeExtensions.find(ex => ex.startsWith('ms-vscode-remote.'));
          this._log.debug('Active extensions', `activeVSCodeRemote(${vscodeRemote})`, activeExtensions);
          Sentry.setTag('activeVSCodeRemote', vscodeRemote ? vscodeRemote : 'undefined');
        } catch (e) {
          this._log.exceptionS(e);
        }
      };
      extensionsChanged();

      this._disposables.push(vscode.extensions.onDidChange(extensionsChanged));
    } catch (e) {
      this._log.exceptionS(e);
    }

    this._disposables.push(this._testsEmitter);
    this._disposables.push(this._testStatesEmitter);

    // TODO remove debounce config and package
    const sendRetireEvent = (tests: Iterable<AbstractTest>): void => {
      const ids: string[] = [];
      for (const t of tests) ids.push(t.id);
      this._retireEmitter.fire({ tests: ids });
    };

    const sendTestStateEvents = (testEvents: TestEvent[]): void => {
      this._mainTaskQueue.then(() => {
        if (testEvents.length > 0) {
          this._rootSuite.sendStartEventIfNeeded(
            testEvents.filter(v => v.type == 'test').map(v => (typeof v.test === 'string' ? v.test : v.test.id)),
          );

          for (let i = 0; i < testEvents.length; ++i) {
            const test = this._rootSuite.findTestById(testEvents[i].test);

            if (test) {
              const route = [...test.route()];
              reverse(route)(v => v.sendRunningEventIfNeeded());

              this._testStatesEmitter.fire(test.getStartEvent());
              this._testStatesEmitter.fire(testEvents[i]);

              route.forEach(v => v.sendCompletedEventIfNeeded());
            } else {
              this._log.error('sendTestEventEmitter.event', testEvents[i], this._rootSuite);
            }
          }

          this._rootSuite.sendFinishedEventIfNeeded();
        }
      });
    };

    const executeTaskQueue = new TaskQueue();
    const executeTask = (
      taskName: string,
      varToValue: readonly ResolveRule[],
      cancellationToken: vscode.CancellationToken,
    ): Promise<number | undefined> => {
      return executeTaskQueue.then(async () => {
        const tasks = await vscode.tasks.fetchTasks();
        const found = tasks.find(t => t.name === taskName);
        if (found === undefined) {
          const msg = `Could not find task with name "${taskName}".`;
          this._log.warn(msg);
          throw Error(msg);
        }

        const resolvedTask = resolveVariables(found, varToValue);
        // Task.name setter needs to be triggered in order for the task to clear its __id field
        // (https://github.com/microsoft/vscode/blob/ba33738bb3db01e37e3addcdf776c5a68d64671c/src/vs/workbench/api/common/extHostTypes.ts#L1976),
        // otherwise task execution fails with "Task not found".
        resolvedTask.name += '';

        //TODO timeout
        if (cancellationToken.isCancellationRequested) return;

        const result = new Promise<number | undefined>(resolve => {
          const disp1 = vscode.tasks.onDidEndTask((e: vscode.TaskEndEvent) => {
            if (e.execution.task.name === resolvedTask.name) {
              this._log.info('Task execution has finished', resolvedTask.name);
              disp1.dispose();
              resolve();
            }
          });

          const disp2 = vscode.tasks.onDidEndTaskProcess((e: vscode.TaskProcessEndEvent) => {
            if (e.execution.task.name === resolvedTask.name) {
              this._log.info('Task execution has finished', resolvedTask.name, e.exitCode);
              disp2.dispose();
              resolve(e.exitCode);
            }
          });
        });

        this._log.info('Task execution has started', resolvedTask);

        const execution = await vscode.tasks.executeTask(resolvedTask);

        cancellationToken.onCancellationRequested(() => {
          this._log.info('Task execution was terminated', execution.task.name);
          execution.terminate();
        });

        return result;
      });
    };

    const loadTask = (task: () => Promise<void>): Promise<void> => {
      this._sendLoadingEventIfNeeded();
      return task().then(
        () => {
          this._sendLoadingFinishedEventIfNeeded();
        },
        (reason: Error) => {
          this._log.exceptionS(reason);
          this._sendLoadingFinishedEventIfNeeded(reason);
        },
      );
    };

    const variableToValue: ResolveRule[] = [
      { resolve: '${workspaceName}', rule: this.workspaceFolder.name }, // beware changing this line or the order
      { resolve: '${workspaceDirectory}', rule: this.workspaceFolder.uri.fsPath },
      { resolve: '${workspaceFolder}', rule: this.workspaceFolder.uri.fsPath },
      { resolve: '${osPathSep}', rule: osPathSeparator },
      { resolve: '${osPathEnvSep}', rule: process.platform === 'win32' ? ';' : ':' },
      { resolve: '${osEnvSep}', rule: process.platform === 'win32' ? ';' : ':' }, // deprecated
      {
        resolve: /\$\{if\(isWin\)\}(.*)\$\{else\}(.*)\$\{endif\}/,
        rule: (m: RegExpMatchArray): string => (process.platform === 'win32' ? m[1] : m[2]),
      },
    ];

    this._disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        variableToValue[0].rule = this.workspaceFolder.name;
      }),
    );

    this._shared = new SharedVariables(
      this._log,
      this.workspaceFolder,
      this._testStatesEmitter,
      loadTask,
      sendTestStateEvents,
      sendRetireEvent,
      executeTask,
      variableToValue,
      configuration.getRandomGeneratorSeed(),
      configuration.getExecWatchTimeout(),
      configuration.getRetireDebounceTime(),
      configuration.getExecRunningTimeout(),
      configuration.getExecParsingTimeout(),
      configuration.getDefaultNoThrow(),
      configuration.getParallelExecutionLimit(),
      configuration.getEnableTestListCaching(),
      configuration.getGoogleTestTreatGMockWarningAs(),
      configuration.getGoogleTestGMockVerbose(),
    );

    this._disposables.push(
      Configurations.onDidChange(changeEvent => {
        try {
          const config = this._getConfiguration();

          try {
            Sentry.setContext('config', config.getValues());
          } catch (e) {
            this._log.exceptionS(e);
          }

          const affectsAny = (...config: Config[]): boolean =>
            config.some(c => changeEvent.affectsConfiguration(c, this.workspaceFolder.uri));

          if (
            affectsAny(
              'test.workingDirectory',
              'test.advancedExecutables',
              'test.executables',
              'test.parallelExecutionOfExecutableLimit',
            )
          ) {
            this.load();
          }
          if (affectsAny('test.randomGeneratorSeed')) {
            this._shared.rngSeed = config.getRandomGeneratorSeed();
            this._retireEmitter.fire({});
          }
          if (affectsAny('discovery.gracePeriodForMissing')) {
            this._shared.execWatchTimeout = config.getExecWatchTimeout();
          }
          if (affectsAny('discovery.retireDebounceLimit')) {
            this._shared.retireDebounceTime = config.getRetireDebounceTime();
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
          if (affectsAny('gtest.treatGmockWarningAs')) {
            this._shared.googleTestTreatGMockWarningAs = config.getGoogleTestTreatGMockWarningAs();
          }
          if (affectsAny('gtest.gmockVerbose')) {
            this._shared.googleTestGMockVerbose = config.getGoogleTestGMockVerbose();
          }
        } catch (e) {
          this._shared.log.exceptionS(e);
        }
      }),
    );

    this._rootSuite = new RootSuite(undefined, this._shared);
  }

  public dispose(): void {
    this._log.info('dispose', this.workspaceFolder);

    this._disposables.forEach(d => {
      try {
        d.dispose();
      } catch (e) {
        this._log.error('dispose', e, d);
      }
    });

    try {
      this._shared.dispose();
    } catch (e) {
      this._log.error('dispose', e, this._shared);
    }

    try {
      this._rootSuite.dispose();
    } catch (e) {
      this._log.error('dispose', e, this._rootSuite);
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

  private _sendLoadingEventIfNeeded(): void {
    if (this._testLoadingCounter++ === 0) {
      this._log.info('load started');
      this._testsEmitter.fire({ type: 'started' });
    }
  }

  // eslint-disable-next-line
  private _sendLoadingFinishedEventIfNeeded(err?: any): void {
    if (this._testLoadingCounter < 1) {
      this._log.error('loading counter is too low');
      this._testLoadingCounter = 0;
      return;
    }
    if (this._testLoadingCounter-- === 1) {
      this._log.info('load finished', this._rootSuite.children.length);
      if (err) {
        this._testsEmitter.fire({
          type: 'finished',
          errorMessage: err instanceof Error ? `${err.name}\n${err.message}` : inspect(err),
        });
      } else {
        this._testsEmitter.fire({
          type: 'finished',
          suite: this._rootSuite.children.length > 0 ? this._rootSuite : undefined,
        });
      }
    }
  }

  public load(): Promise<void> {
    this._log.info('load called');

    this.cancel();
    this._rootSuite.dispose();

    const configuration = this._getConfiguration();

    this._rootSuite = new RootSuite(this._rootSuite.id, this._shared);

    return this._shared.loadWithTask(() =>
      configuration.getExecutables(this._shared, this._shared.varToValue).then(exec => this._rootSuite.load(exec)),
    );
  }

  private _cancellationTokenSource: vscode.CancellationTokenSource | undefined = undefined;

  public cancel(): void {
    this._log.debug('canceled');
    if (this._cancellationTokenSource) {
      this._cancellationTokenSource.cancel();
    }
  }

  public run(tests: string[]): Promise<void> {
    if (this._mainTaskQueue.size > 0) {
      this._log.info(
        "Run is busy. Your test maybe in an infinite loop: Try to limit the test's timeout with: defaultRunningTimeoutSec config option!",
      );
    }

    const cancellationTokenSource = new vscode.CancellationTokenSource();
    this._cancellationTokenSource = cancellationTokenSource;

    return this._mainTaskQueue.then(() => {
      return this._rootSuite
        .run(tests, cancellationTokenSource.token)
        .catch((reason: Error) => this._log.exceptionS(reason))
        .finally(() => {
          cancellationTokenSource.dispose();
          this._cancellationTokenSource = undefined;
        });
    });
  }

  public async debug(tests: string[]): Promise<void> {
    if (this._mainTaskQueue.size > 0) {
      this._log.info('Debug is busy');
      throw Error('The adapter is busy. Try it again a bit later.');
    }

    this._log.info('Using debug');

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
      this._log.error('unsupported executable count', tests);
      throw Error('Unsupported input. It seems you would like to debug more tests from different executables.');
    }

    const [runnable, runnableTests] = [...runnableToTestMap][0];

    this._log.info('test', runnable, runnableTests);

    const configuration = this._getConfiguration();

    const [debugConfigTemplate, debugConfigTemplateSource] = configuration.getDebugConfigurationTemplate();

    this._log.debugS('debugConfigTemplate', debugConfigTemplate);
    this._log.infoSWithTags('Using debug', { debugConfigTemplateSource });

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

    const varToResolve: ResolveRule[] = [
      ...runnable.properties.varToValue,
      { resolve: '${suitelabel}', rule: suiteLabels }, // deprecated
      { resolve: '${suiteLabel}', rule: suiteLabels },
      { resolve: '${label}', rule: label },
      { resolve: '${exec}', rule: runnable.properties.path },
      { resolve: '${args}', rule: argsArray }, // deprecated
      { resolve: '${argsArray}', rule: argsArray },
      { resolve: '${argsStr}', rule: '"' + argsArray.map(a => a.replace('"', '\\"')).join('" "') + '"' },
      { resolve: '${cwd}', rule: runnable.properties.options.cwd! },
      { resolve: '${envObj}', rule: Object.assign(Object.assign({}, process.env), runnable.properties.options.env!) },
    ];

    const debugConfig = resolveVariables(debugConfigTemplate, varToResolve);

    // we dont know better :(
    // https://github.com/Microsoft/vscode/issues/70125
    const magicValueKey = 'magic variable  🤦🏼‍';
    const magicValue = generateId();
    debugConfig[magicValueKey] = magicValue;

    this._log.info('Debug: resolved debugConfig:', debugConfig);

    return this._mainTaskQueue
      .then(async () => {
        const cancellationTokenSource = new vscode.CancellationTokenSource();
        await this._rootSuite.runTaskBefore(runnableToTestMap, cancellationTokenSource.token);
        await runnable.runTaskbeforeEach(this._shared.taskPool, cancellationTokenSource.token);

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
          this._log.info('debugSessionTerminated');
        });

        this._log.info('startDebugging');

        const debugSessionStarted = await vscode.debug.startDebugging(this.workspaceFolder, debugConfig);

        if (debugSessionStarted) {
          this._log.info('debugSessionStarted');
          return terminated;
        } else {
          terminateConn && terminateConn.dispose();
          return Promise.reject(
            Error(
              'Failed starting the debug session. ' + 'Maybe something wrong with "testMate.cpp.debug.configTemplate".',
            ),
          );
        }
      })
      .catch(err => {
        this._log.info(err);
        throw err;
      });
  }

  private _getConfiguration(): Configurations {
    return new Configurations(this._log, this.workspaceFolder.uri);
  }
}
