//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as path from 'path';
import { inspect } from 'util';
import * as vscode from 'vscode';
import { TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent } from 'vscode-test-adapter-api';
import * as api from 'vscode-test-adapter-api';
import * as util from 'vscode-test-adapter-util';

import { RootTestSuiteInfo } from './RootTestSuiteInfo';
import { resolveVariables } from './Helpers';
import { QueueGraphNode } from './QueueGraph';
import { TestExecutableInfo } from './TestExecutableInfo';

export class TestAdapter implements api.TestAdapter, vscode.Disposable {
  private readonly _log: util.Log;
  private readonly _testsEmitter =
    new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
  private readonly _testStatesEmitter =
    new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent |
      TestSuiteEvent | TestEvent>();
  private readonly _autorunEmitter = new vscode.EventEmitter<void>();

  private readonly _variableToValue: [string, string][] = [
    ['${workspaceDirectory}', this._workspaceFolder.uri.fsPath],
    ['${workspaceFolder}', this._workspaceFolder.uri.fsPath]
  ];

  // because we always want to return with the current allTests suite
  private readonly _loadFinishedEmitter = new vscode.EventEmitter<void>();

  private _allTasks = new QueueGraphNode();
  private _allTests: RootTestSuiteInfo;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly _workspaceFolder: vscode.WorkspaceFolder) {
    this._log = new util.Log(
      'catch2TestExplorer', this._workspaceFolder, 'Test Explorer: ' + this._workspaceFolder.name);
    this._disposables.push(this._log);

    this._log.info(
      'info: ' + inspect([
        process.platform, process.version, process.versions, vscode.version
      ]));

    this._disposables.push(this._testsEmitter);
    this._disposables.push(this._testStatesEmitter);
    this._disposables.push(this._autorunEmitter);

    this._disposables.push(this._loadFinishedEmitter);
    this._disposables.push(this._loadFinishedEmitter.event(() => {
      this._testsEmitter.fire({ type: 'finished', suite: this._allTests });
    }));

    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration(configChange => {
        if (configChange.affectsConfiguration(
          'catch2TestExplorer.defaultEnv', this._workspaceFolder.uri) ||
          configChange.affectsConfiguration(
            'catch2TestExplorer.defaultCwd', this._workspaceFolder.uri) ||
          configChange.affectsConfiguration(
            'catch2TestExplorer.executables', this._workspaceFolder.uri)) {
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
        if (configChange.affectsConfiguration(
          'catch2TestExplorer.defaultRunningTimeoutSec',
          this._workspaceFolder.uri)) {
          this._allTests.execRunningTimeout =
            this._getDefaultExecRunningTimeout(this._getConfiguration());
        }
        if (configChange.affectsConfiguration(
          'catch2TestExplorer.defaultNoThrow',
          this._workspaceFolder.uri)) {
          this._allTests.isNoThrow =
            this._getDefaultNoThrow(this._getConfiguration());
        }
      }));

    const config = this._getConfiguration();
    this._allTests = new RootTestSuiteInfo(
      this._allTasks, this._log, this._workspaceFolder,
      this._loadFinishedEmitter, this._testsEmitter, this._testStatesEmitter,
      this._autorunEmitter, this._variableToValue,
      this._getEnableSourceDecoration(config),
      this._getDefaultRngSeed(config),
      this._getDefaultExecWatchTimeout(config),
      this._getDefaultExecRunningTimeout(config),
      this._getDefaultNoThrow(config));
  }

  dispose() {
    this._disposables.forEach(d => {
      d.dispose();
    });
    this._allTests.dispose();
    this._log.dispose();
  }

  get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent |
    TestSuiteEvent | TestEvent> {
    return this._testStatesEmitter.event;
  }

  get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
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

    this._allTests = new RootTestSuiteInfo(
      this._allTasks, this._log, this._workspaceFolder,
      this._loadFinishedEmitter, this._testsEmitter, this._testStatesEmitter,
      this._autorunEmitter, this._variableToValue,
      this._getEnableSourceDecoration(config),
      this._getDefaultRngSeed(config),
      this._getDefaultExecWatchTimeout(config),
      this._getDefaultExecRunningTimeout(config),
      this._getDefaultNoThrow(config));

    this._testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

    return this._allTasks.then(() => {
      return this._allTests.load(this._getExecutables(config, this._allTests))
        .then(
          () => {
            this._testsEmitter.fire(
              { type: 'finished', suite: this._allTests });
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
      this._log.info(__filename + '. Run is busy');
    }

    return this._allTasks.then(() => {
      return this._allTests.run(
        tests, this._getWorkerMaxNumber(this._getConfiguration()));
    }, (reason: any) => {
      this._log.error(inspect(reason));
    });
  }

  debug(tests: string[]): Promise<void> {
    if (this._allTasks.size > 0) {
      this._log.info(__filename + '. Debug is busy');
      throw 'The adapter is busy. Try it again a bit later.';
    }

    this._log.info('Debugging');

    if (tests.length !== 1) {
      this._log.error('unsupported test count: ' + inspect(tests));
      throw Error('Unsupported input. Contact');
    }

    const testInfo = this._allTests.findTestById(tests[0]);

    if (testInfo === undefined) {
      this._log.error(
        'Not existing id: ' + inspect([tests, this._allTasks], true, 3));
      throw Error('Not existing test id');
    }

    this._log.info('testInfo: ' + inspect([testInfo, tests]));

    const getDebugConfiguration = (): vscode.DebugConfiguration => {
      const config = this._getConfiguration();

      let template =
        this._getDebugConfigurationTemplate(config);

      if (template !== null) {
        //skip
      } else if (vscode.extensions.getExtension("vadimcn.vscode-lldb")) {
        template = {
          "type": "cppdbg",
          "MIMode": "lldb",
          "program": "${exec}",
          "args": "${args}",
          "cwd": "${cwd}",
          "env": "${envObj}"
        };
      } else if (vscode.extensions.getExtension("ms-vscode.cpptools")) {
        // documentation says debug"environment" = [{...}] but that is not works
        template = {
          "type": "cppvsdbg",
          "linux": { "type": "cppdbg", "MIMode": "gdb" },
          "osx": { "type": "cppdbg", "MIMode": "lldb" },
          "program": "${exec}",
          "args": "${args}",
          "cwd": "${cwd}",
          "env": "${envObj}"
        };
      } else {
        throw 'C2: For debugging \'debugConfigTemplate\' should be set.';
      }

      if (template !== null && !template.hasOwnProperty('name'))
        template = Object.assign({ 'name': "${label} (${suiteLabel})" }, template);
      if (template !== null && !template.hasOwnProperty('request'))
        template = Object.assign({ 'request': "launch" }, template);

      const args = testInfo.getDebugParams(this._getDebugBreakOnFailure(config));

      return resolveVariables(template, [
        ...this._variableToValue,
        ["${suitelabel}", testInfo.parent.label],
        ["${suiteLabel}", testInfo.parent.label],
        ["${label}", testInfo.label],
        ["${exec}", testInfo.parent.execPath],
        ["${args}", args],
        ["${cwd}", testInfo.parent.execOptions.cwd!],
        ["${envObj}", testInfo.parent.execOptions.env!],
      ]);
    };

    const debugConfig = getDebugConfiguration();
    this._log.info('Debug config: ' + inspect(debugConfig));

    let resolveF: Function;
    let rejectF: Function;
    const ret = new Promise<void>((resolve, reject) => {
      resolveF = resolve;
      rejectF = reject;
    });
    this._allTasks.then(
      () => {
        return vscode.debug.startDebugging(this._workspaceFolder, debugConfig)
          .then((debugSessionStarted: boolean) => {
            const currentSession = vscode.debug.activeDebugSession;

            if (!debugSessionStarted || !currentSession) {
              return Promise.reject(
                'Failed starting the debug session - aborting. Maybe something wrong with "catch2TestExplorer.debugConfigTemplate"' +
                inspect({ debugSessionStarted: debugSessionStarted, currentSession: currentSession }));
            }

            this._log.info('debugSessionStarted');

            return new Promise<void>((resolve) => {
              const subscription =
                vscode.debug.onDidTerminateDebugSession(session => {
                  if (currentSession != session) return;
                  this._log.info('Debug session ended.');
                  resolve();
                  resolveF();
                  subscription.dispose();
                });
            });
          });
      },
      (reason: any) => {
        this._log.error(inspect(reason));
        rejectF(reason);
      });
    return ret;
  }

  private _getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(
      'catch2TestExplorer', this._workspaceFolder.uri);
  }

  private _getDebugConfigurationTemplate(config: vscode.WorkspaceConfiguration) {
    return config.get<object | null>('debugConfigTemplate', null);
  }

  private _getDebugBreakOnFailure(config: vscode.WorkspaceConfiguration):
    boolean {
    return config.get<boolean>('debugBreakOnFailure', true);
  }

  private _getDefaultNoThrow(config: vscode.WorkspaceConfiguration): boolean {
    return config.get<boolean>('defaultNoThrow', false);
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
    | number | null {
    return config.get<null | string | number>('defaultRngSeed', null);
  }

  private _getWorkerMaxNumber(config: vscode.WorkspaceConfiguration): number {
    return config.get<number>('workerMaxNumber', 4);
  }

  private _getDefaultExecWatchTimeout(config: vscode.WorkspaceConfiguration):
    number {
    return config.get<number>('defaultWatchTimeoutSec', 10) * 1000;
  }

  private _getDefaultExecRunningTimeout(config: vscode.WorkspaceConfiguration):
    null | number {
    const r = config.get<null | number>('defaultRunningTimeoutSec', null);
    return r !== null ? r * 1000 : r;
  }

  private _getGlobalAndDefaultEnvironmentVariables(
    config: vscode.WorkspaceConfiguration): { [prop: string]: string | undefined } {
    const processEnv = process.env;
    const configEnv: { [prop: string]: any } = config.get('defaultEnv') || {};

    const resultEnv = { ...processEnv };

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

  private _getGlobalAndCurrentEnvironmentVariables(
    configEnv: { [prop: string]: any }): { [prop: string]: any } {
    const processEnv = process.env;
    const resultEnv = { ...processEnv };

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
    allTests: RootTestSuiteInfo): TestExecutableInfo[] {
    const globalWorkingDirectory = this._getDefaultCwd(config);

    let executables: TestExecutableInfo[] = [];

    const configExecs: |undefined | string | string[] | { [prop: string]: any } |
      { [prop: string]: any }[] = config.get('executables');

    const createFromObject = (obj: { [prop: string]: any }): TestExecutableInfo => {
      const name: string = obj.hasOwnProperty('name') ? obj.name : '${relPath}';

      let pattern: string = '';
      if (obj.hasOwnProperty('pattern') && typeof obj.pattern == 'string')
        pattern = obj.pattern;
      else if (obj.hasOwnProperty('path') && typeof obj.path == 'string')
        pattern = obj.path;
      else
        throw Error('Error: pattern property is required.');

      const cwd: string =
        obj.hasOwnProperty('cwd') ? obj.cwd : globalWorkingDirectory;

      const env: { [prop: string]: any } = obj.hasOwnProperty('env') ?
        this._getGlobalAndCurrentEnvironmentVariables(obj.env) :
        this._getGlobalAndDefaultEnvironmentVariables(config);

      return new TestExecutableInfo(allTests, name, pattern, cwd, env);
    };

    if (typeof configExecs === 'string') {
      if (configExecs.length == 0) return [];
      executables.push(new TestExecutableInfo(
        allTests, configExecs, configExecs, globalWorkingDirectory, {}));
    } else if (Array.isArray(configExecs)) {
      for (var i = 0; i < configExecs.length; ++i) {
        const configExe = configExecs[i];
        if (typeof configExe == 'string') {
          const configExecsName = String(configExe);
          if (configExecsName.length > 0) {
            executables.push(new TestExecutableInfo(
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
      throw 'Config error: wrong type: executables';
    }

    return executables;
  }
}
