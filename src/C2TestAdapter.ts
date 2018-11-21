//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as path from 'path';
import {inspect} from 'util';
import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';
import * as util from 'vscode-test-adapter-util';

import {C2AllTestSuiteInfo} from './C2AllTestSuiteInfo';
import {C2ExecutableInfo} from './C2ExecutableInfo';
import {C2TestInfo} from './C2TestInfo';
import {resolveVariables} from './Helpers';
import {QueueGraphNode} from './QueueGraph';

export class C2TestAdapter implements TestAdapter, vscode.Disposable {
  private readonly _testsEmitter =
      new vscode.EventEmitter<TestLoadStartedEvent|TestLoadFinishedEvent>();
  private readonly _testStatesEmitter =
      new vscode.EventEmitter<TestRunStartedEvent|TestRunFinishedEvent|
                              TestSuiteEvent|TestEvent>();
  private readonly _autorunEmitter = new vscode.EventEmitter<void>();

  private readonly _variableToValue: [string, string][] = [
    ['${workspaceDirectory}', this._workspaceFolder.uri.fsPath],
    ['${workspaceFolder}', this._workspaceFolder.uri.fsPath]
  ];

  // because we always want to return with the current allTests suite
  private readonly _loadFinishedEmitter = new vscode.EventEmitter<void>();

  private _allTasks = new QueueGraphNode();
  private _allTests: C2AllTestSuiteInfo;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
      private readonly _workspaceFolder: vscode.WorkspaceFolder,
      private readonly _log: util.Log,
  ) {
    this._log.info(
        'info: ' + inspect([
          process.platform, process.version, process.versions, vscode.version
        ]));

    this._disposables.push(this._testsEmitter);
    this._disposables.push(this._testStatesEmitter);
    this._disposables.push(this._autorunEmitter);

    this._disposables.push(this._loadFinishedEmitter);
    this._disposables.push(this._loadFinishedEmitter.event(() => {
      this._testsEmitter.fire({type: 'finished', suite: this._allTests});
    }));

    this._disposables.push(
        vscode.workspace.onDidChangeConfiguration(configChange => {
          if (configChange.affectsConfiguration(
                  'catch2TestExplorer.defaultEnv', this._workspaceFolder.uri) ||
              configChange.affectsConfiguration(
                  'catch2TestExplorer.defaultCwd', this._workspaceFolder.uri) ||
              configChange.affectsConfiguration(
                  'catch2TestExplorer.executables',
                  this._workspaceFolder.uri)) {
            this.load();
          }
        }));

    this._disposables.push(
        vscode.workspace.onDidChangeConfiguration(configChange => {
          if (configChange.affectsConfiguration(
                  'catch2TestExplorer.enableSourceDecoration',
                  this._workspaceFolder.uri)) {
            this._allTests.isEnabledSourceDecoration =
                this._getEnableSourceDecoration(this._getConfiguration());
          }
          if (configChange.affectsConfiguration(
                  'catch2TestExplorer.defaultRngSeed',
                  this._workspaceFolder.uri)) {
            this._allTests.rngSeed =
                this._getDefaultRngSeed(this._getConfiguration());
            this._autorunEmitter.fire();
          }
          if (configChange.affectsConfiguration(
                  'catch2TestExplorer.defaultWatchTimeoutSec',
                  this._workspaceFolder.uri)) {
            this._allTests.execWatchTimeout =
                this._getDefaultExecWatchTimeout(this._getConfiguration());
          }
        }));

    const config = this._getConfiguration();
    this._allTests = new C2AllTestSuiteInfo(
        this._allTasks, this._log, this._workspaceFolder,
        this._loadFinishedEmitter, this._testsEmitter, this._testStatesEmitter,
        this._autorunEmitter, this._variableToValue,
        this._getEnableSourceDecoration(config),
        this._getDefaultRngSeed(config),
        this._getDefaultExecWatchTimeout(config));
  }

  dispose() {
    this._disposables.forEach(d => {
      d.dispose();
    });
    this._allTests.dispose();
    this._log.dispose();
  }

  get testStates(): vscode.Event<TestRunStartedEvent|TestRunFinishedEvent|
                                 TestSuiteEvent|TestEvent> {
    return this._testStatesEmitter.event;
  }

  get tests(): vscode.Event<TestLoadStartedEvent|TestLoadFinishedEvent> {
    return this._testsEmitter.event;
  }

  get autorun(): vscode.Event<void> {
    return this._autorunEmitter.event;
  }

  load(): Promise<void> {
    this.cancel();
    const config = this._getConfiguration();

    this._allTests.dispose();
    this._allTasks = new QueueGraphNode();

    this._allTests = new C2AllTestSuiteInfo(
        this._allTasks, this._log, this._workspaceFolder,
        this._loadFinishedEmitter, this._testsEmitter, this._testStatesEmitter,
        this._autorunEmitter, this._variableToValue,
        this._getEnableSourceDecoration(config),
        this._getDefaultRngSeed(config),
        this._getDefaultExecWatchTimeout(config));

    this._testsEmitter.fire(<TestLoadStartedEvent>{type: 'started'});

    return this._allTasks.then(() => {
      return this._allTests.load(this._getExecutables(config, this._allTests))
          .then(
              () => {
                this._testsEmitter.fire(
                    {type: 'finished', suite: this._allTests});
              },
              (e: any) => {
                this._testsEmitter.fire({
                  type: 'finished',
                  suite: undefined,
                  errorMessage: e.toString()
                });
              });
    });
  }

  cancel(): void {
    this._allTests.cancel();
  }

  run(tests: string[]): Promise<void> {
    if (this._allTasks.size > 0) {
      this._log.info(__filename + 'run is busy');
      throw 'Catch2 is busy. Try it again a bit later.';
    }

    return this._allTasks.then(() => {
      return this._allTests.run(
          tests, this._getWorkerMaxNumber(this._getConfiguration()));
    });
  }

  debug(tests: string[]): Promise<void> {
    if (this._allTasks.size > 0) {
      this._log.info(__filename + 'debug is busy');
      throw 'Catch2 is busy. Try it again a bit later.';
    }

    this._log.info('Debug...');

    console.assert(tests.length === 1);
    const info = this._allTests.findChildById(tests[0]);
    console.assert(info !== undefined);

    if (!(info instanceof C2TestInfo)) {
      this._log.info(__filename + ' !(info instanceof C2TestInfo)');
      throw 'Can\'t choose a group, only a single test.';
    }

    const testInfo = <C2TestInfo>info;

    this._log.info('testInfo: ' + inspect([testInfo, tests]));

    const getDebugConfiguration = (): vscode.DebugConfiguration => {
      const debug: vscode.DebugConfiguration = {
        name: 'Catch2: ' + testInfo.label,
        request: 'launch',
        type: ''
      };

      const config = this._getConfiguration();
      const template = this._getDebugConfigurationTemplate(config);
      let resolveDebugVariables: [string, any][] = this._variableToValue;
      const args = [testInfo.getEscapedTestName(), '--reporter', 'console'];
      if (this._getDebugBreakOnFailure(config)) args.push('--break');

      resolveDebugVariables = resolveDebugVariables.concat([
        ['${label}', testInfo.label],
        ['${exec}', testInfo.parent.execPath],
        ['${args}', args],
        ['${cwd}', testInfo.parent.execOptions.cwd!],
        ['${envObj}', testInfo.parent.execOptions.env!],
      ]);

      if (template !== null) {
        for (const prop in template) {
          const val = template[prop];
          if (val !== undefined && val !== null) {
            debug[prop] = resolveVariables(val, resolveDebugVariables);
          }
        }
        return debug;
      } else if (vscode.extensions.getExtension('vadimcn.vscode-lldb')) {
        debug['type'] = 'lldb';
        debug['program'] = testInfo.parent.execPath;
        debug['args'] = args;
        debug['cwd'] = testInfo.parent.execOptions.cwd!;
        debug['env'] = testInfo.parent.execOptions.env!;
        return debug;
      } else if (vscode.extensions.getExtension('ms-vscode.cpptools')) {
        debug['type'] = 'cppvsdbg';
        debug['program'] = testInfo.parent.execPath;
        debug['args'] = args;
        debug['cwd'] = testInfo.parent.execOptions.cwd!;
        debug['environment'] = [testInfo.parent.execOptions.env!];
        return debug;
      }

      throw 'Catch2: For debug \'debugConfigTemplate\' should be set.';
    };

    const debugConfig = getDebugConfiguration();
    this._log.info('Debug config: ' + inspect(debugConfig));

    return this._allTasks.then(() => {
      return vscode.debug.startDebugging(this._workspaceFolder, debugConfig)
          .then((debugSessionStarted: boolean) => {
            const currentSession = vscode.debug.activeDebugSession;

            if (!debugSessionStarted || !currentSession) {
              this._log.info('Failed starting the debug session - aborting');
              return Promise.resolve();
            }

            this._log.info('debugSessionStarted');

            return new Promise<void>((resolve) => {
              const subscription =
                  vscode.debug.onDidTerminateDebugSession(session => {
                    if (currentSession != session) return;
                    this._log.info('Debug session ended.');
                    resolve();
                    subscription.dispose();
                  });
            });
          });
    });
  }

  private _getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(
        'catch2TestExplorer', this._workspaceFolder.uri);
  }

  private _getDebugConfigurationTemplate(config: vscode.WorkspaceConfiguration):
      {[prop: string]: string}|null {
    const o = config.get<any>('debugConfigTemplate', null);

    if (o === null) return null;

    const result: {[prop: string]: string} = {};

    for (const prop in o) {
      const val = o[prop];
      if (val === undefined || val === null) {
        delete result.prop;
      } else {
        result[prop] = resolveVariables(String(val), this._variableToValue);
      }
    }
    return result;
  }

  private _getDebugBreakOnFailure(config: vscode.WorkspaceConfiguration):
      boolean {
    return config.get<boolean>('debugBreakOnFailure', true);
  }

  private _getGlobalAndDefaultEnvironmentVariables(
      config: vscode.WorkspaceConfiguration):
      {[prop: string]: string|undefined} {
    const processEnv = process.env;
    const configEnv: {[prop: string]: any} = config.get('defaultEnv') || {};

    const resultEnv = {...processEnv};

    for (const prop in configEnv) {
      const val = configEnv[prop];
      if (val === undefined || val === null) {
        delete resultEnv.prop;
      } else {
        resultEnv[prop] = resolveVariables(String(val), this._variableToValue);
      }
    }

    return resultEnv;
  }

  private _getDefaultCwd(config: vscode.WorkspaceConfiguration): string {
    const dirname = this._workspaceFolder.uri.fsPath;
    const cwd = resolveVariables(
        config.get<string>('defaultCwd', dirname), this._variableToValue);
    if (path.isAbsolute(cwd)) {
      return cwd;
    } else {
      return path.resolve(this._workspaceFolder.uri.fsPath, cwd);
    }
  }

  private _getDefaultRngSeed(config: vscode.WorkspaceConfiguration): string
      |number|null {
    return config.get<null|string|number>('defaultRngSeed', null);
  }

  private _getWorkerMaxNumber(config: vscode.WorkspaceConfiguration): number {
    return config.get<number>('workerMaxNumber', 4);
  }

  private _getDefaultExecWatchTimeout(config: vscode.WorkspaceConfiguration):
      number {
    return config.get<number>('defaultWatchTimeoutSec', 10) * 1000;
  }

  private _getGlobalAndCurrentEnvironmentVariables(
      config: vscode.WorkspaceConfiguration,
      configEnv: {[prop: string]: any}): {[prop: string]: any} {
    const processEnv = process.env;
    const resultEnv = {...processEnv};

    for (const prop in configEnv) {
      const val = configEnv[prop];
      if (val === undefined || val === null) {
        delete resultEnv.prop;
      } else {
        resultEnv[prop] = resolveVariables(String(val), this._variableToValue);
      }
    }

    return resultEnv;
  }

  private _getEnableSourceDecoration(config: vscode.WorkspaceConfiguration):
      boolean {
    return config.get<boolean>('enableSourceDecoration', true);
  }

  private _getExecutables(
      config: vscode.WorkspaceConfiguration,
      allTests: C2AllTestSuiteInfo): C2ExecutableInfo[] {
    const globalWorkingDirectory = this._getDefaultCwd(config);

    let executables: C2ExecutableInfo[] = [];

    const configExecs:|undefined|string|string[]|{[prop: string]: any}|
        {[prop: string]: any}[] = config.get('executables');

    const createFromObject = (obj: {[prop: string]: any}): C2ExecutableInfo => {
      const name: string =
          obj.hasOwnProperty('name') ? obj.name : '${relName} (${relDirname}/)';

      let pattern: string = '';
      if (obj.hasOwnProperty('pattern') && typeof obj.pattern == 'string')
        pattern = obj.pattern;
      else if (obj.hasOwnProperty('path') && typeof obj.path == 'string')
        pattern = obj.path;
      else
        throw Error('Error: pattern or path property is required.');

      const cwd: string =
          obj.hasOwnProperty('cwd') ? obj.cwd : globalWorkingDirectory;

      const env: {[prop: string]: any} = obj.hasOwnProperty('env') ?
          this._getGlobalAndCurrentEnvironmentVariables(config, obj.env) :
          this._getGlobalAndDefaultEnvironmentVariables(config);

      return new C2ExecutableInfo(allTests, name, pattern, cwd, env);
    };

    if (typeof configExecs === 'string') {
      if (configExecs.length == 0) return [];
      executables.push(new C2ExecutableInfo(
          allTests, configExecs, configExecs, globalWorkingDirectory, {}));
    } else if (Array.isArray(configExecs)) {
      for (var i = 0; i < configExecs.length; ++i) {
        const configExe = configExecs[i];
        if (typeof configExe == 'string') {
          const configExecsName = String(configExe);
          if (configExecsName.length > 0) {
            executables.push(new C2ExecutableInfo(
                allTests, configExecsName, configExecsName,
                globalWorkingDirectory, {}));
          }
        } else {
          try {
            executables.push(createFromObject(configExe));
          } catch (e) {
            this._log.error(inspect(e));
          }
        }
      }
    } else if (configExecs instanceof Object) {
      try {
        executables.push(createFromObject(configExecs));
      } catch (e) {
        this._log.error(inspect(e));
      }
    } else {
      throw 'Catch2 config error: wrong type: executables';
    }

    return executables;
  }
}
