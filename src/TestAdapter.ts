import { inspect } from 'util';
import * as vscode from 'vscode';
import {
  TestInfo,
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

import { LogWrapper } from './LogWrapper';
import { RootTestSuiteInfo } from './RootTestSuiteInfo';
import { resolveVariables, generateUniqueId } from './Util';
import { TaskQueue } from './TaskQueue';
import { SharedVariables } from './SharedVariables';
import { AbstractTestInfo } from './AbstractTestInfo';
import { Catch2Section, Catch2TestInfo } from './framework/Catch2TestInfo';
import { AbstractTestSuiteInfo } from './AbstractTestSuiteInfo';
import { Config } from './Config';
import { readJSONSync } from 'fs-extra';
import { join } from 'path';

export class TestAdapter implements api.TestAdapter, vscode.Disposable {
  private readonly _log: LogWrapper;
  private readonly _testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly _testStatesEmitter = new vscode.EventEmitter<
    TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
  >();
  private readonly _retireEmitter = new vscode.EventEmitter<RetireEvent>();

  private readonly _variableToValue: [string, string][] = [
    ['${workspaceDirectory}', this.workspaceFolder.uri.fsPath],
    ['${workspaceFolder}', this.workspaceFolder.uri.fsPath],
    ['${workspaceName}', this.workspaceFolder.name],
  ];

  // because we always want to return with the current rootSuite suite
  private readonly _loadWithTaskEmitter = new vscode.EventEmitter<() => void | PromiseLike<void>>();

  private readonly _sendTestEventEmitter = new vscode.EventEmitter<TestEvent[]>();

  private readonly _sendRetireEmitter = new vscode.EventEmitter<AbstractTestSuiteInfo[]>();

  private readonly _mainTaskQueue = new TaskQueue([], 'TestAdapter');
  private readonly _disposables: vscode.Disposable[] = [];

  private readonly _shared: SharedVariables;
  private _rootSuite: RootTestSuiteInfo;

  private readonly _isDebug: boolean = !!process.env['C2_DEBUG'];

  public constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {
    this._log = new LogWrapper(
      'catch2TestExplorer',
      this.workspaceFolder,
      'Test Explorer: ' + this.workspaceFolder.name,
      { showProxy: true, depth: 3 },
      true,
    );

    const config = this._getConfiguration();

    this._log.info(
      'info:',
      this.workspaceFolder,
      process.platform,
      process.version,
      process.versions,
      vscode.version,
      config,
    );

    // TODO feedback
    if (false) {
      'https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter&ssr=false#review-details';
    }

    if (!this._isDebug) config.askSentryConsent();

    try {
      const extensionInfo = ((): {
        version: string;
        publisher: string;
        name: string;
      } => {
        try {
          const pjson = readJSONSync(join(__dirname, '../../package.json'));
          return { version: pjson.version, publisher: pjson.publisher, name: pjson.name };
        } catch (e) {
          this._log.exception(e, __dirname);
          return { version: '<unknown version>', publisher: '<unknown publisher>', name: '<unknown name>' };
        }
      })();

      const enabled = !this._isDebug && config.isSentryEnabled();

      this._log.info('sentry.io is', enabled);

      const release = extensionInfo.publisher + '/' + extensionInfo.name + '@' + extensionInfo.version;

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
        this._log.exception(e);
      }

      Sentry.setUser({ id: config.getOrCreateUserId() });
      //Sentry.setTag('workspaceFolder', hashString(this.workspaceFolder.uri.fsPath));

      Sentry.setContext('config', config);

      //'Framework' message includes this old message too: Sentry.captureMessage('Extension was activated', Sentry.Severity.Log);
    } catch (e) {
      this._log.exception(e);
    }

    this._disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this._variableToValue[2][1] = this.workspaceFolder.name;
      }),
    );

    this._disposables.push(this._testsEmitter);
    this._disposables.push(this._testStatesEmitter);

    this._disposables.push(this._sendRetireEmitter);
    {
      const unique = new Set<AbstractTestSuiteInfo>();

      const retire = (aggregatedArgs: [AbstractTestSuiteInfo[]][]): void => {
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

      this._disposables.push(this._sendRetireEmitter.event(debounce(retire, config.getRetireDebounceTime())));
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
                this._log.exception(reason);
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
          for (let i = 0; i < testEvents.length; ++i) {
            const id: string =
              typeof testEvents[i].test === 'string'
                ? (testEvents[i].test as string)
                : (testEvents[i].test as TestInfo).id;
            const route = this._rootSuite.findRouteToTestById(id);

            if (route !== undefined && route.length > 1) {
              this._testStatesEmitter.fire({ type: 'started', tests: [id] });

              for (let j = 0; j < route.length - 1; ++j)
                this._testStatesEmitter.fire((route[j] as AbstractTestSuiteInfo).getRunningEvent());

              this._testStatesEmitter.fire((testEvents[i].test as AbstractTestInfo).getStartEvent());
              this._testStatesEmitter.fire(testEvents[i]);

              for (let j = route.length - 2; j >= 0; --j)
                this._testStatesEmitter.fire((route[j] as AbstractTestSuiteInfo).getCompletedEvent());

              this._testStatesEmitter.fire({ type: 'finished' });
            } else {
              this._log.error('sendTestEventEmitter.event', testEvents[i], route, this._rootSuite);
            }
          }
        });
      }),
    );

    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration(configChange => {
        if (
          configChange.affectsConfiguration('catch2TestExplorer.defaultEnv', this.workspaceFolder.uri) ||
          configChange.affectsConfiguration('catch2TestExplorer.defaultCwd', this.workspaceFolder.uri) ||
          configChange.affectsConfiguration('catch2TestExplorer.executables', this.workspaceFolder.uri)
        ) {
          this.load();
        }
      }),
    );

    this._shared = new SharedVariables(
      this._log,
      this.workspaceFolder,
      this._testStatesEmitter,
      this._loadWithTaskEmitter,
      this._sendTestEventEmitter,
      this._sendRetireEmitter,
      config.getDefaultRngSeed(),
      config.getDefaultExecWatchTimeout(),
      config.getRetireDebounceTime(),
      config.getDefaultExecRunningTimeout(),
      config.getDefaultExecParsingTimeout(),
      config.getDefaultNoThrow(),
      config.getWorkerMaxNumber(),
      config.getEnableTestListCaching(),
      config.getGoogleTestTreatGMockWarningAs(),
      config.getGoogleTestGMockVerbose(),
    );

    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration(configChange => {
        const config = this._getConfiguration();

        try {
          Sentry.setContext('config', config);
        } catch (e) {
          this._log.exception(e);
        }

        if (configChange.affectsConfiguration('catch2TestExplorer.defaultRngSeed', this.workspaceFolder.uri)) {
          this._shared.rngSeed = config.getDefaultRngSeed();
          this._retireEmitter.fire({});
        }
        if (configChange.affectsConfiguration('catch2TestExplorer.defaultWatchTimeoutSec', this.workspaceFolder.uri)) {
          this._shared.execWatchTimeout = config.getDefaultExecWatchTimeout();
        }
        if (
          configChange.affectsConfiguration('catch2TestExplorer.retireDebounceTimeMilisec', this.workspaceFolder.uri)
        ) {
          this._shared.retireDebounceTime = config.getRetireDebounceTime();
        }
        if (
          configChange.affectsConfiguration('catch2TestExplorer.defaultRunningTimeoutSec', this.workspaceFolder.uri)
        ) {
          this._shared.setExecRunningTimeout(config.getDefaultExecRunningTimeout());
        }
        if (
          configChange.affectsConfiguration('catch2TestExplorer.defaultExecParsingTimeoutSec', this.workspaceFolder.uri)
        ) {
          this._shared.setExecRunningTimeout(config.getDefaultExecParsingTimeout());
        }
        if (configChange.affectsConfiguration('catch2TestExplorer.defaultNoThrow', this.workspaceFolder.uri)) {
          this._shared.isNoThrow = config.getDefaultNoThrow();
        }
        if (configChange.affectsConfiguration('catch2TestExplorer.workerMaxNumber', this.workspaceFolder.uri)) {
          this._shared.taskPool.maxTaskCount = config.getWorkerMaxNumber();
        }
        if (configChange.affectsConfiguration('catch2TestExplorer.enableTestListCaching', this.workspaceFolder.uri)) {
          this._shared.enabledTestListCaching = config.getEnableTestListCaching();
        }
        if (
          configChange.affectsConfiguration(
            'catch2TestExplorer.googletest.treatGmockWarningAs',
            this.workspaceFolder.uri,
          )
        ) {
          this._shared.googleTestTreatGMockWarningAs = config.getGoogleTestTreatGMockWarningAs();
        }
        if (configChange.affectsConfiguration('catch2TestExplorer.googletest.gmockVerbose', this.workspaceFolder.uri)) {
          this._shared.googleTestGMockVerbose = config.getGoogleTestGMockVerbose();
        }

        Sentry.setContext('config', config);
      }),
    );

    this._rootSuite = new RootTestSuiteInfo(undefined, this._shared);
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

    try {
      this._log.dispose();
    } catch (e) {
      this._log.error('dispose', e, this._log);
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

    const config = this._getConfiguration();

    this._rootSuite.dispose();

    this._rootSuite = new RootTestSuiteInfo(this._rootSuite.id, this._shared);

    return this._mainTaskQueue.then(() => {
      this._log.info('load started');

      this._testsEmitter.fire({ type: 'started' });

      return Promise.resolve()
        .then(() => {
          return config.getExecutables(this._shared, this._rootSuite, this._variableToValue);
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
            this._log.exception(e);

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
      return this._rootSuite.run(tests).catch((reason: Error) => this._log.exception(reason));
    });
  }

  public async debug(tests: string[]): Promise<void> {
    if (this._mainTaskQueue.size > 0) {
      this._log.info('Debug is busy');
      throw Error('The adapter is busy. Try it again a bit later.');
    }

    this._log.info('Debugging');

    if (tests.length !== 1) {
      this._log.error('unsupported test count', tests);
      throw Error(
        'Unsupported input. It seems you would like to debug more test cases at once. This is not supported currently.',
      );
    }

    const route = this._rootSuite.findRouteToTestById(tests[0]);
    if (route === undefined) {
      this._log.warn('route === undefined', tests);
      throw Error('Not existing test id.');
    } else if (route.length == 0) {
      this._log.error('route.length == 0', tests);
      throw Error('Unexpected error.');
    } else if (route[route.length - 1].type !== 'test') {
      this._log.error("route[route.length-1].type !== 'test'", tests);
      throw Error('Unexpected error.');
    }

    const testInfo = route[route.length - 1] as AbstractTestInfo;
    route.pop();
    const suiteLabels = route.map(s => s.label).join(' ➡️ ');

    const testSuite = route.find(v => v instanceof AbstractTestSuiteInfo);
    if (testSuite === undefined || !(testSuite instanceof AbstractTestSuiteInfo))
      throw Error('Unexpected error. Should have AbstractTestSuiteInfo parent.');

    this._log.info('testInfo', testInfo, tests);

    const config = this._getConfiguration();

    const template = config.getDebugConfigurationTemplate();

    const argsArray = testInfo.getDebugParams(config.getDebugBreakOnFailure());

    if (testInfo instanceof Catch2TestInfo) {
      const sections = testInfo.sections;
      if (sections && sections.length > 0) {
        interface QuickPickItem extends vscode.QuickPickItem {
          sectionStack: Catch2Section[];
        }

        const items: QuickPickItem[] = [
          {
            label: testInfo.origLabel,
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
      ['${label}', testInfo.label],
      ['${exec}', testSuite.execInfo.path],
      ['${args}', argsArray], // deprecated
      ['${argsArray}', argsArray],
      ['${argsStr}', '"' + argsArray.map(a => a.replace('"', '\\"')).join('" "') + '"'],
      ['${cwd}', testSuite.execInfo.options.cwd!],
      ['${envObj}', Object.assign(Object.assign({}, process.env), testSuite.execInfo.options.env!)],
    ]);

    // we dont know better :(
    // https://github.com/Microsoft/vscode/issues/70125
    const magicValueKey = 'magic variable  🤦🏼‍';
    const magicValue = generateUniqueId();
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
              'Failed starting the debug session. ' +
                'Maybe something wrong with "catch2TestExplorer.debugConfigTemplate".',
            ),
          );
        }
      })
      .catch(err => {
        this._log.info(err);
        throw err;
      });
  }

  private _getConfiguration(): Config {
    return new Config(this._log, this.workspaceFolder.uri);
  }
}
