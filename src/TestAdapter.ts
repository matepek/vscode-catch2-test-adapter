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
import { resolveVariables, generateUniqueId, hashString } from './Util';
import { TaskQueue } from './TaskQueue';
import { TestExecutableInfo, TestExecutableInfoFrameworkSpecific } from './TestExecutableInfo';
import { SharedVariables } from './SharedVariables';
import { AbstractTestInfo } from './AbstractTestInfo';
import { Catch2Section, Catch2TestInfo } from './framework/Catch2TestInfo';
import { AbstractTestSuiteInfo } from './AbstractTestSuiteInfo';
import { performance } from 'perf_hooks';
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

    if (this._getLogSentry(config) === 'question' && !process.env['C2_DEBUG']) {
      const options = [
        'Sure! I love this extension and happy to help.',
        'Yes, but exclude the current workspace.',
        'Over my dead body',
      ];
      vscode.window
        .showInformationMessage(
          'Hey there! The extension now has [sentry.io](https://sentry.io/welcome) integration to ' +
            'improve the stability and the development. 🤩 For this, I want to log and send errors ' +
            'to [sentry.io](https://sentry.io/welcome), but I would NEVER do it without your consent. ' +
            'Please be understandable and allow it. 🙏' +
            ' (`catch2TestExplorer.logSentry: "enable"/"disable"`)',
          ...options,
        )
        .then((value: string | undefined) => {
          this._log.info('Sentry consent: ' + value);

          if (value === options[0]) {
            config.update('logSentry', 'enable', true);
          } else if (value === options[1]) {
            config.update('logSentry', 'enable', true);
            config.update('logSentry', 'disable_1', false);
          } else if (value === options[2]) {
            config.update('logSentry', 'disable_1', true);
          }
        });
    }

    try {
      const extensionInfo = (() => {
        try {
          const pjson = readJSONSync(join(__dirname, '../../package.json'));
          return { version: pjson.version, publisher: pjson.publisher, name: pjson.name };
        } catch (e) {
          this._log.exception(e, __dirname);
          return { version: '<unknown version>', publisher: '<unknown publisher>', name: '<unknown name>' };
        }
      })();

      const enabled = this._getLogSentry(config) === 'enable' && process.env['C2_DEBUG'] === undefined;

      this._log.info('sentry.io is: ', enabled);

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

      {
        let userId = config.get<string>('userId');
        if (!userId) {
          let newUserId = (process.env['USER'] || process.env['USERNAME'] || 'user') + process.env['USERDOMAIN'];
          newUserId += performance.now().toString();
          newUserId += process.pid.toString();
          newUserId += Date.now().toString();

          userId = hashString(newUserId);

          config.update('userId', userId, true);
        }

        this._log.info('userId', userId);

        Sentry.setUser({ id: userId });
        Sentry.setTag('workspaceFolder', hashString(this.workspaceFolder.uri.fsPath));
      }

      Sentry.setContext('config', config);

      Sentry.captureMessage('Extension was activated', Sentry.Severity.Log);
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

      this._disposables.push(this._sendRetireEmitter.event(debounce(retire, this._getRetireDebounceTime(config))));
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
      this._getDefaultRngSeed(config),
      this._getDefaultExecWatchTimeout(config),
      this._getRetireDebounceTime(config),
      this._getDefaultExecRunningTimeout(config),
      this._getDefaultExecParsingTimeout(config),
      this._getDefaultNoThrow(config),
      this._getWorkerMaxNumber(config),
      this._getEnableTestListCaching(config),
      this._getGoogleTestTreatGMockWarningAs(config),
      this._getGoogleTestGMockVerbose(config),
    );

    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration(configChange => {
        const config = this._getConfiguration();

        if (configChange.affectsConfiguration('catch2TestExplorer.defaultRngSeed', this.workspaceFolder.uri)) {
          this._shared.rngSeed = this._getDefaultRngSeed(config);
          this._retireEmitter.fire({});
        }
        if (configChange.affectsConfiguration('catch2TestExplorer.defaultWatchTimeoutSec', this.workspaceFolder.uri)) {
          this._shared.execWatchTimeout = this._getDefaultExecWatchTimeout(config);
        }
        if (
          configChange.affectsConfiguration('catch2TestExplorer.retireDebounceTimeMilisec', this.workspaceFolder.uri)
        ) {
          this._shared.retireDebounceTime = this._getRetireDebounceTime(config);
        }
        if (
          configChange.affectsConfiguration('catch2TestExplorer.defaultRunningTimeoutSec', this.workspaceFolder.uri)
        ) {
          this._shared.setExecRunningTimeout(this._getDefaultExecRunningTimeout(config));
        }
        if (
          configChange.affectsConfiguration('catch2TestExplorer.defaultExecParsingTimeoutSec', this.workspaceFolder.uri)
        ) {
          this._shared.setExecRunningTimeout(this._getDefaultExecParsingTimeout(config));
        }
        if (configChange.affectsConfiguration('catch2TestExplorer.defaultNoThrow', this.workspaceFolder.uri)) {
          this._shared.isNoThrow = this._getDefaultNoThrow(config);
        }
        if (configChange.affectsConfiguration('catch2TestExplorer.workerMaxNumber', this.workspaceFolder.uri)) {
          this._shared.taskPool.maxTaskCount = this._getWorkerMaxNumber(config);
        }
        if (configChange.affectsConfiguration('catch2TestExplorer.enableTestListCaching', this.workspaceFolder.uri)) {
          this._shared.enabledTestListCaching = this._getEnableTestListCaching(config);
        }
        if (
          configChange.affectsConfiguration(
            'catch2TestExplorer.googletest.treatGmockWarningAs',
            this.workspaceFolder.uri,
          )
        ) {
          this._shared.googleTestTreatGMockWarningAs = this._getGoogleTestTreatGMockWarningAs(config);
        }
        if (configChange.affectsConfiguration('catch2TestExplorer.googletest.gmockVerbose', this.workspaceFolder.uri)) {
          this._shared.googleTestGMockVerbose = this._getGoogleTestGMockVerbose(config);
        }

        Sentry.setContext('config', config);
      }),
    );

    this._rootSuite = new RootTestSuiteInfo(undefined, this._shared);
  }

  public dispose(): void {
    this._log.info('dispose: ', this.workspaceFolder);

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
          return this._getExecutables(config, this._rootSuite);
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
      this._log.error('unsupported test count: ', tests);
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

    this._log.info('testInfo: ', testInfo, tests);

    const config = this._getConfiguration();

    const template = this._getDebugConfigurationTemplate(config);

    const argsArray = testInfo.getDebugParams(this._getDebugBreakOnFailure(config));

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

  private _getDebugConfigurationTemplate(config: vscode.WorkspaceConfiguration): vscode.DebugConfiguration {
    const templateFromConfig = config.get<object | null | 'extensionOnly'>('debugConfigTemplate', null);

    if (typeof templateFromConfig === 'object' && templateFromConfig !== null) {
      this._log.info('using user defined debug config');
      return Object.assign(
        {
          name: '${label} (${suiteLabel})',
          request: 'launch',
          type: 'cppdbg',
        },
        templateFromConfig,
      );
    }

    if (templateFromConfig === null) {
      const wpLaunchConfigs = vscode.workspace
        .getConfiguration('launch', this.workspaceFolder.uri)
        .get('configurations');

      if (wpLaunchConfigs && Array.isArray(wpLaunchConfigs) && wpLaunchConfigs.length > 0) {
        for (let i = 0; i < wpLaunchConfigs.length; ++i) {
          if (
            wpLaunchConfigs[i].request == 'launch' &&
            typeof wpLaunchConfigs[i].type == 'string' &&
            (wpLaunchConfigs[i].type.startsWith('cpp') ||
              wpLaunchConfigs[i].type.startsWith('lldb') ||
              wpLaunchConfigs[i].type.startsWith('gdb'))
          ) {
            this._log.info(
              "using debug config from launch.json. If it doesn't wokr for you please read the manual: https://github.com/matepek/vscode-catch2-test-adapter#or-user-can-manually-fill-it",
            );
            // putting as much known properties as much we can and hoping for the best 🤞
            return Object.assign({}, wpLaunchConfigs[i], {
              name: '${label} (${suiteLabel})',
              program: '${exec}',
              target: '${exec}',
              arguments: '${argsStr}',
              args: '${args}',
              cwd: '${cwd}',
              env: '${envObj}',
            });
          }
        }
      }
    }

    const template: vscode.DebugConfiguration = {
      name: '${label} (${suiteLabel})',
      request: 'launch',
      type: 'cppdbg',
    };

    if (vscode.extensions.getExtension('vadimcn.vscode-lldb')) {
      this._log.info('using debug extension: vadimcn.vscode-lldb');
      Object.assign(template, {
        type: 'cppdbg',
        MIMode: 'lldb',
        program: '${exec}',
        args: '${args}',
        cwd: '${cwd}',
        env: '${envObj}',
      });
    } else if (vscode.extensions.getExtension('webfreak.debug')) {
      this._log.info('using debug extension: webfreak.debug');
      Object.assign(template, {
        type: 'gdb',
        target: '${exec}',
        arguments: '${argsStr}',
        cwd: '${cwd}',
        env: '${envObj}',
        valuesFormatting: 'prettyPrinters',
      });

      if (process.platform === 'darwin') {
        template.type = 'lldb-mi';
        // Note: for LLDB you need to have lldb-mi in your PATH
        // If you are on OS X you can add lldb-mi to your path using ln -s /Applications/Xcode.app/Contents/Developer/usr/bin/lldb-mi /usr/local/bin/lldb-mi if you have Xcode.
        template.lldbmipath = '/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-mi';
      }
    } else if (vscode.extensions.getExtension('ms-vscode.cpptools')) {
      this._log.info('using debug extension: ms-vscode.cpptools');
      // documentation says debug"environment" = [{...}] but that doesn't work
      Object.assign(template, {
        type: 'cppvsdbg',
        linux: { type: 'cppdbg', MIMode: 'gdb' },
        osx: { type: 'cppdbg', MIMode: 'lldb' },
        windows: { type: 'cppvsdbg' },
        program: '${exec}',
        args: '${args}',
        cwd: '${cwd}',
        env: '${envObj}',
      });
    } else {
      throw Error(
        "For debugging 'catch2TestExplorer.debugConfigTemplate' should be set: https://github.com/matepek/vscode-catch2-test-adapter#or-user-can-manually-fill-it",
      );
    }
    return template;
  }

  private _getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('catch2TestExplorer', this.workspaceFolder.uri);
  }

  private _getLogSentry(config: vscode.WorkspaceConfiguration): 'enable' | 'disable' | 'question' {
    return config.get<'enable' | 'disable' | 'question'>('logSentry', 'disable');
  }

  private _getDebugBreakOnFailure(config: vscode.WorkspaceConfiguration): boolean {
    return config.get<boolean>('debugBreakOnFailure', true);
  }

  private _getDefaultNoThrow(config: vscode.WorkspaceConfiguration): boolean {
    return config.get<boolean>('defaultNoThrow', false);
  }

  private _getDefaultCwd(config: vscode.WorkspaceConfiguration): string {
    const dirname = this.workspaceFolder.uri.fsPath;
    return config.get<string>('defaultCwd', dirname);
  }

  private _getDefaultEnvironmentVariables(config: vscode.WorkspaceConfiguration): { [prop: string]: string } {
    return config.get('defaultEnv', {});
  }

  private _getDefaultRngSeed(config: vscode.WorkspaceConfiguration): string | number | null {
    return config.get<null | string | number>('defaultRngSeed', null);
  }

  private _getWorkerMaxNumber(config: vscode.WorkspaceConfiguration): number {
    const res = Math.max(1, config.get<number>('workerMaxNumber', 1));
    if (typeof res != 'number') return 1;
    else return res;
  }

  private _getDefaultExecWatchTimeout(config: vscode.WorkspaceConfiguration): number {
    const res = config.get<number>('defaultWatchTimeoutSec', 10) * 1000;
    return res;
  }

  private _getRetireDebounceTime(config: vscode.WorkspaceConfiguration): number {
    const res = config.get<number>('retireDebounceTimeMilisec', 1000);
    return res;
  }

  private _getDefaultExecRunningTimeout(config: vscode.WorkspaceConfiguration): null | number {
    const r = config.get<null | number>('defaultRunningTimeoutSec', null);
    return r !== null && r > 0 ? r * 1000 : null;
  }

  private _getDefaultExecParsingTimeout(config: vscode.WorkspaceConfiguration): number {
    const r = config.get<number>('defaultExecParsingTimeoutSec', 5);
    return r * 1000;
  }

  private _getEnableTestListCaching(config: vscode.WorkspaceConfiguration): boolean {
    return config.get<boolean>('enableTestListCaching', false);
  }

  private _getGoogleTestTreatGMockWarningAs(config: vscode.WorkspaceConfiguration): 'nothing' | 'failure' {
    return config.get<'nothing' | 'failure'>('googletest.treatGmockWarningAs', 'nothing');
  }

  private _getGoogleTestGMockVerbose(config: vscode.WorkspaceConfiguration): 'default' | 'info' | 'warning' | 'error' {
    return config.get<'default' | 'info' | 'warning' | 'error'>(
      'catch2TestExplorer.googletest.gmockVerbose',
      'default',
    );
  }

  private _getExecutables(config: vscode.WorkspaceConfiguration, rootSuite: RootTestSuiteInfo): TestExecutableInfo[] {
    const defaultCwd = this._getDefaultCwd(config) || '${absDirpath}';
    const defaultEnv = this._getDefaultEnvironmentVariables(config) || {};

    let executables: TestExecutableInfo[] = [];

    const configExecs:
      | undefined
      | null
      | string
      | string[]
      | { [prop: string]: string }
      | ({ [prop: string]: string } | string)[] = config.get('executables');

    const createFromObject = (obj: { [prop: string]: string }): TestExecutableInfo => {
      const name: string | undefined = typeof obj.name === 'string' ? obj.name : undefined;

      const description: string | undefined = typeof obj.description === 'string' ? obj.description : undefined;

      let pattern = '';
      {
        if (typeof obj.pattern == 'string') pattern = obj.pattern;
        else if (typeof obj.path == 'string') pattern = obj.path;
        else {
          this._log.debug('pattern property is required', obj);
          throw Error('Error: pattern property is required.');
        }
      }

      const cwd: string | undefined = typeof obj.cwd === 'string' ? obj.cwd : undefined;

      const env: { [prop: string]: string } | undefined = typeof obj.env === 'object' ? obj.env : undefined;

      const dependsOn: string[] = Array.isArray(obj.dependsOn) ? obj.dependsOn.filter(v => typeof v === 'string') : [];

      // eslint-disable-next-line
      const framework = (obj: any): TestExecutableInfoFrameworkSpecific => {
        const r: TestExecutableInfoFrameworkSpecific = {};
        if (typeof obj === 'object') {
          if (typeof obj.helpRegex === 'string') r.helpRegex = obj['helpRegex'];

          if (
            Array.isArray(obj.additionalRunArguments) &&
            // eslint-disable-next-line
            (obj.additionalRunArguments as any[]).every(x => typeof x === 'string')
          )
            r.additionalRunArguments = obj.additionalRunArguments;

          if (typeof obj.ignoreTestEnumerationStdErr) r.ignoreTestEnumerationStdErr = obj.ignoreTestEnumerationStdErr;
        }
        return r;
      };

      return new TestExecutableInfo(
        this._shared,
        rootSuite,
        pattern,
        name,
        description,
        cwd,
        env,
        dependsOn,
        defaultCwd,
        defaultEnv,
        this._variableToValue,
        framework(obj['catch2']),
        framework(obj['gtest']),
        framework(obj['doctest']),
      );
    };

    if (typeof configExecs === 'string') {
      if (configExecs.length == 0) return [];
      executables.push(
        new TestExecutableInfo(
          this._shared,
          rootSuite,
          configExecs,
          undefined,
          undefined,
          undefined,
          undefined,
          [],
          defaultCwd,
          defaultEnv,
          this._variableToValue,
          {},
          {},
          {},
        ),
      );
    } else if (Array.isArray(configExecs)) {
      for (var i = 0; i < configExecs.length; ++i) {
        const configExec = configExecs[i];
        if (typeof configExec === 'string') {
          const configExecsName = String(configExec);
          if (configExecsName.length > 0) {
            executables.push(
              new TestExecutableInfo(
                this._shared,
                rootSuite,
                configExecsName,
                undefined,
                undefined,
                undefined,
                undefined,
                [],
                defaultCwd,
                defaultEnv,
                this._variableToValue,
                {},
                {},
                {},
              ),
            );
          }
        } else if (typeof configExec === 'object') {
          try {
            executables.push(createFromObject(configExec));
          } catch (e) {
            this._log.warn(e, configExec);
            throw e;
          }
        } else {
          this._log.error('_getExecutables', configExec, i);
        }
      }
    } else if (configExecs === null || configExecs === undefined) {
      return [];
    } else if (typeof configExecs === 'object') {
      try {
        executables.push(createFromObject(configExecs));
      } catch (e) {
        this._log.warn(e, configExecs);
        throw e;
      }
    } else {
      this._log.error("executables couldn't be recognised:", executables);
      throw new Error('Config error: wrong type: executables');
    }

    return executables;
  }
}
