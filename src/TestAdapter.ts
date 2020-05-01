import { inspect } from 'util';
import { sep as osPathSeparator } from 'path';
import * as vscode from 'vscode';
import {
  TestEvent,
  TestLoadFinishedEvent,
  TestLoadStartedEvent,
  TestRunFinishedEvent,
  TestRunStartedEvent,
  TestSuiteEvent,
  RetireEvent,
} from 'vscode-test-adapter-api';
import * as api from 'vscode-test-adapter-api';
import debounce = require('debounce-collect');
import * as Sentry from '@sentry/node';

import { LoggerWrapper } from './LoggerWrapper';
import { RootSuite } from './RootSuite';
import { resolveVariables, generateId, reverse } from './Util';
import { TaskQueue } from './TaskQueue';
import { SharedVariables } from './SharedVariables';
import { Catch2Section, Catch2Test } from './framework/Catch2Test';
import { AbstractRunnable } from './AbstractRunnable';
import { Configurations, Config } from './Configurations';
import { readJSONSync } from 'fs-extra';
import { join } from 'path';
import { AbstractTest } from './AbstractTest';

export class TestAdapter implements api.TestAdapter, vscode.Disposable {
  private readonly _log: LoggerWrapper;
  private readonly _testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly _testStatesEmitter = new vscode.EventEmitter<
    TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
  >();
  private readonly _retireEmitter = new vscode.EventEmitter<RetireEvent>();

  private readonly _variableToValue: [string, string][] = [
    ['${workspaceName}', this.workspaceFolder.name], // beware changing this line or the order
    ['${workspaceDirectory}', this.workspaceFolder.uri.fsPath],
    ['${workspaceFolder}', this.workspaceFolder.uri.fsPath],
    ['${osPathSep}', osPathSeparator],
  ];

  // because we always want to return with the current rootSuite suite
  private readonly _loadWithTaskEmitter = new vscode.EventEmitter<() => void | PromiseLike<void>>();

  private readonly _sendTestEventEmitter = new vscode.EventEmitter<TestEvent[]>();

  private readonly _sendRetireEmitter = new vscode.EventEmitter<readonly AbstractTest[]>();

  private readonly _mainTaskQueue = new TaskQueue([], 'TestAdapter');
  private readonly _disposables: vscode.Disposable[] = [];

  private readonly _shared: SharedVariables;
  private _rootSuite: RootSuite;

  private readonly _isDebug: boolean = !!process.env['C2_DEBUG'];

  public constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {
    this._log = new LoggerWrapper('copper.log', this.workspaceFolder, 'Test Explorer: ' + this.workspaceFolder.name);

    const configuration = this._getConfiguration();

    this._log.infoS('info:', this.workspaceFolder, process.platform, process.version, process.versions, vscode.version);

    // TODO feedback
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
    } catch (e) {
      this._log.exceptionS(e);
    }

    this._disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this._variableToValue[0][1] = this.workspaceFolder.name;
      }),
    );

    this._disposables.push(this._testsEmitter);
    this._disposables.push(this._testStatesEmitter);

    this._disposables.push(this._sendRetireEmitter);
    {
      const unique = new Set<AbstractTest>();

      const retire = (aggregatedArgs: [readonly AbstractTest[]][]): void => {
        const isScheduled = unique.size > 0;
        aggregatedArgs.forEach(args => args[0].forEach(test => unique.add(test)));

        if (!isScheduled)
          this._mainTaskQueue.then(() => {
            if (unique.size > 0) {
              this._retireEmitter.fire({ tests: [...unique].map(t => t.id) });
              unique.clear();
            }
          });
      };

      this._disposables.push(this._sendRetireEmitter.event(debounce(retire, configuration.getRetireDebounceTime())));
    }

    this._disposables.push(this._loadWithTaskEmitter);
    this._disposables.push(
      this._loadWithTaskEmitter.event((task: () => void | PromiseLike<void>) => {
        this._mainTaskQueue.then(() => {
          this._testsEmitter.fire({ type: 'started' });
          return Promise.resolve()
            .then(task)
            .then(
              () => {
                this._testsEmitter.fire({
                  type: 'finished',
                  suite: this._rootSuite.children.length > 0 ? this._rootSuite : undefined,
                });
              },
              (reason: Error) => {
                this._log.exceptionS(reason);
                debugger;
                this._testsEmitter.fire({
                  type: 'finished',
                  errorMessage: inspect(reason),
                  suite: this._rootSuite.children.length > 0 ? this._rootSuite : undefined,
                });
              },
            );
        });
      }),
    );

    this._disposables.push(this._sendTestEventEmitter);
    this._disposables.push(
      this._sendTestEventEmitter.event((testEvents: TestEvent[]) => {
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
      }),
    );

    this._shared = new SharedVariables(
      this._log,
      this.workspaceFolder,
      this._testStatesEmitter,
      this._loadWithTaskEmitter,
      this._sendTestEventEmitter,
      this._sendRetireEmitter,
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
            Sentry.setContext('config', config);
          } catch (e) {
            this._log.exceptionS(e);
          }

          const affectsAny = (...config: Config[]): boolean =>
            config.some(c => changeEvent.affectsConfiguration(c, this.workspaceFolder.uri));

          if (affectsAny('test.workingDirectory', 'test.executables', 'test.executable')) {
            this.load();
          }
          if (affectsAny('test.randomGeneratorSeed')) {
            this._shared.rngSeed = config.getRandomGeneratorSeed();
            this._retireEmitter.fire({});
          }
          if (affectsAny('discovery.missingFileWaitingTimeLimit')) {
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

  public get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> {
    return this._testStatesEmitter.event;
  }

  public get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
    return this._testsEmitter.event;
  }

  public get retire(): vscode.Event<RetireEvent> {
    return this._retireEmitter.event;
  }

  public load(): Promise<void> {
    this._log.info('load called');
    this._mainTaskQueue.size > 0 && this.cancel();

    const configuration = this._getConfiguration();

    this._rootSuite.dispose();

    this._rootSuite = new RootSuite(this._rootSuite.id, this._shared);

    return this._mainTaskQueue.then(() => {
      this._log.info('load started');

      this._testsEmitter.fire({ type: 'started' });

      return Promise.resolve()
        .then(() => {
          return configuration.getExecutables(this._shared, this._variableToValue);
        })
        .then(exec => {
          return this._rootSuite.load(exec);
        })
        .then(
          () => {
            this._log.info('load finished', this._rootSuite.children.length);

            this._testsEmitter.fire({
              type: 'finished',
              suite: this._rootSuite.children.length > 0 ? this._rootSuite : undefined,
            });
          },
          (e: Error) => {
            this._log.exceptionS(e);

            this._testsEmitter.fire({
              type: 'finished',
              suite: undefined,
              errorMessage: inspect(e),
            });
          },
        );
    });
  }

  public cancel(): void {
    this._rootSuite.cancel();
  }

  public run(tests: string[]): Promise<void> {
    if (this._mainTaskQueue.size > 0) {
      this._log.info(
        "Run is busy. Your test maybe in an infinite loop: Try to limit the test's timeout with: defaultRunningTimeoutSec config option!",
      );
    }

    return this._mainTaskQueue.then(() => {
      return this._rootSuite.run(tests).catch((reason: Error) => this._log.exceptionS(reason));
    });
  }

  public async debug(tests: string[]): Promise<void> {
    if (this._mainTaskQueue.size > 0) {
      this._log.info('Debug is busy');
      throw Error('The adapter is busy. Try it again a bit later.');
    }

    this._log.infoS('Debugging');

    const runnables = tests
      .map(t => this._rootSuite.findTestById(t))
      .filter(t => t !== undefined)
      .reduce((prev, curr) => {
        const arr = prev.find(x => x[0] === curr!.runnable);
        if (arr) arr[1].push(curr!);
        else prev.push([curr!.runnable, [curr!]]);
        return prev;
      }, new Array<[AbstractRunnable, AbstractTest[]]>());

    if (runnables.length !== 1) {
      this._log.error('unsupported executable count', tests);
      throw Error('Unsupported input. It seems you would like to debug more tests from different executables.');
    }

    const [runnable, runnableTests] = runnables[0];

    this._log.info('test', runnable, runnableTests);

    const configuration = this._getConfiguration();

    const template = configuration.getDebugConfigurationTemplate();

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

    const debugConfig = resolveVariables(template, [
      ...this._variableToValue,
      ['${suitelabel}', suiteLabels], // deprecated
      ['${suiteLabel}', suiteLabels],
      ['${label}', label],
      ['${exec}', runnable.properties.path],
      ['${args}', argsArray], // deprecated
      ['${argsArray}', argsArray],
      ['${argsStr}', '"' + argsArray.map(a => a.replace('"', '\\"')).join('" "') + '"'],
      ['${cwd}', runnable.properties.options.cwd!],
      ['${envObj}', Object.assign(Object.assign({}, process.env), runnable.properties.options.env!)],
    ]);

    // we dont know better :(
    // https://github.com/Microsoft/vscode/issues/70125
    const magicValueKey = 'magic variable  🤦🏼‍';
    const magicValue = generateId();
    debugConfig[magicValueKey] = magicValue;

    this._log.info('Debug: resolved debugConfig:', debugConfig);

    return this._mainTaskQueue
      .then(async () => {
        let terminateConn: vscode.Disposable | undefined;

        const terminated = new Promise<void>(resolve => {
          terminateConn = vscode.debug.onDidTerminateDebugSession((session: vscode.DebugSession) => {
            const session2 = (session as unknown) as { configuration: { [prop: string]: string } };
            if (session2.configuration && session2.configuration[magicValueKey] === magicValue) {
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
            new Error(
              'Failed starting the debug session. ' + 'Maybe something wrong with "copper.debug.configTemplate".',
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
