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

export class C2TestAdapter implements TestAdapter, vscode.Disposable {
  readonly testsEmitter =
      new vscode.EventEmitter<TestLoadStartedEvent|TestLoadFinishedEvent>();
  readonly testStatesEmitter =
      new vscode.EventEmitter<TestRunStartedEvent|TestRunFinishedEvent|
                              TestSuiteEvent|TestEvent>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();

  readonly variableToValue: [string, string][] =
      [['${workspaceFolder}', this.workspaceFolder.uri.fsPath]];

  private allTests: C2AllTestSuiteInfo;
  private readonly disposables: Array<vscode.Disposable> = new Array();

  private isEnabledSourceDecoration = true;

  constructor(
      public readonly workspaceFolder: vscode.WorkspaceFolder,
      public readonly log: util.Log) {
    this.disposables.push(this.testsEmitter);
    this.disposables.push(this.testStatesEmitter);
    this.disposables.push(this.autorunEmitter);

    this.disposables.push(
        vscode.workspace.onDidChangeConfiguration(configChange => {
          if (configChange.affectsConfiguration(
                  'catch2TestExplorer.defaultEnv', this.workspaceFolder.uri) ||
              configChange.affectsConfiguration(
                  'catch2TestExplorer.defaultCwd', this.workspaceFolder.uri) ||
              configChange.affectsConfiguration(
                  'catch2TestExplorer.executables', this.workspaceFolder.uri)) {
            this.load();
          }
        }));

    this.disposables.push(
        vscode.workspace.onDidChangeConfiguration(configChange => {
          if (configChange.affectsConfiguration(
                  'catch2TestExplorer.enableSourceDecoration',
                  this.workspaceFolder.uri)) {
            this.isEnabledSourceDecoration =
                this.getEnableSourceDecoration(this.getConfiguration());
          }
          if (configChange.affectsConfiguration(
                  'catch2TestExplorer.defaultRngSeed',
                  this.workspaceFolder.uri)) {
            this.autorunEmitter.fire();
          }
        }));

    this.allTests = new C2AllTestSuiteInfo(this);
  }

  dispose() {
    this.disposables.forEach(d => {
      d.dispose();
    });
    this.allTests.dispose();
  }

  get testStates(): vscode.Event<TestRunStartedEvent|TestRunFinishedEvent|
                                 TestSuiteEvent|TestEvent> {
    return this.testStatesEmitter.event;
  }

  get tests(): vscode.Event<TestLoadStartedEvent|TestLoadFinishedEvent> {
    return this.testsEmitter.event;
  }

  get autorun(): vscode.Event<void> {
    return this.autorunEmitter.event;
  }

  getIsEnabledSourceDecoration(): boolean {
    return this.isEnabledSourceDecoration;
  }

  getRngSeed(): string|number|null {
    return this.getDefaultRngSeed(this.getConfiguration());
  }

  getExecWatchTimeout(): number {
    return this.getDefaultExecWatchTimeout(this.getConfiguration());
  }

  private isDebugging: boolean = false;
  private isRunning: number = 0;


  async load(): Promise<void> {
    try {
      this.cancel();

      this.allTests.dispose();
      this.allTests = new C2AllTestSuiteInfo(this);

      this.testsEmitter.fire({type: 'started'});

      const config = this.getConfiguration();

      await this.allTests.load(this.getExecutables(config, this.allTests));

      this.testsEmitter.fire({type: 'finished', suite: this.allTests});
    } catch (e) {
      this.testsEmitter.fire(
          {type: 'finished', suite: undefined, errorMessage: e.message});
    }
  }

  cancel(): void {
    this.allTests.cancel();
  }

  run(tests: string[]): Promise<void> {
    if (this.isDebugging) {
      throw 'Catch2: Test is currently being debugged.';
    }

    if (this.isRunning == 0) {
      this.isRunning += 1;
      const always = () => {
        this.isRunning -= 1;
      };
      return this.allTests
          .run(tests, this.getWorkerMaxNumber(this.getConfiguration()))
          .then(always, always);
    }

    throw Error('Catch2 Test Adapter: Test(s) are currently being run.');
  }

  async debug(tests: string[]): Promise<void> {
    if (this.isDebugging) {
      throw 'Catch2: Test is currently being debugged.';
    }

    if (this.isRunning > 0) {
      throw 'Catch2: Test(s) are currently being run.';
    }

    console.assert(tests.length === 1);
    const info = this.allTests.findChildById(tests[0]);
    console.assert(info !== undefined);

    if (!(info instanceof C2TestInfo)) {
      throw 'Can\'t choose a group, only a single test.';
    }

    const testInfo = <C2TestInfo>info;

    const getDebugConfiguration = (): vscode.DebugConfiguration => {
      const debug: vscode.DebugConfiguration = {
        name: 'Catch2: ' + testInfo.label,
        request: 'launch',
        type: ''
      };

      const template =
          this.getDebugConfigurationTemplate(this.getConfiguration());
      let resolveDebugVariables: [string, any][] = this.variableToValue;
      resolveDebugVariables = resolveDebugVariables.concat([
        ['${label}', testInfo.label], ['${exec}', testInfo.parent.execPath],
        [
          '${args}',
          [testInfo.getEscapedTestName(), '--reporter', 'console', '--break']
        ],
        ['${cwd}', testInfo.parent.execOptions.cwd!],
        ['${envObj}', testInfo.parent.execOptions.env!]
      ]);

      if (template !== null) {
        for (const prop in template) {
          const val = template[prop];
          if (val !== undefined && val !== null) {
            debug[prop] = resolveVariables(val, resolveDebugVariables);
          }
        }

        return debug;
      } else {
        // lets try to recognise existing extensions
        vscode.extensions.getExtension('');
      }

      throw 'Catch2: For debug \'debugConfigurationTemplate\' should be set.';
    };

    const debugConfig = getDebugConfiguration();

    this.isDebugging = true;

    const debugSessionStarted =
        await vscode.debug.startDebugging(this.workspaceFolder, debugConfig);

    if (!debugSessionStarted) {
      console.error('Failed starting the debug session - aborting');
      this.isDebugging = false;
      return;
    }

    const currentSession = vscode.debug.activeDebugSession;
    if (!currentSession) {
      console.error('No active debug session - aborting');
      this.isDebugging = false;
      return;
    }

    const always = () => {
      this.isDebugging = false;
    };

    await new Promise<void>((resolve, reject) => {
      const subscription = vscode.debug.onDidTerminateDebugSession(session => {
        if (currentSession != session) return;
        console.info('Debug session ended');
        resolve();
        subscription.dispose();
      });
    }).then(always, always);
  }

  private getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(
        'catch2TestExplorer', this.workspaceFolder.uri);
  }

  private getDebugConfigurationTemplate(config: vscode.WorkspaceConfiguration):
      {[prop: string]: string}|null {
    const o = config.get<any>('debugConfigurationTemplate', null);

    if (o === null) return null;

    const result: {[prop: string]: string} = {};

    for (const prop in o) {
      const val = o[prop];
      if (val === undefined || val === null) {
        delete result.prop;
      } else {
        result[prop] = resolveVariables(String(val), this.variableToValue);
      }
    }
    return result;
  }

  private getGlobalAndDefaultEnvironmentVariables(
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
        resultEnv[prop] = resolveVariables(String(val), this.variableToValue);
      }
    }

    return resultEnv;
  }

  private getDefaultCwd(config: vscode.WorkspaceConfiguration): string {
    const dirname = this.workspaceFolder.uri.fsPath;
    const cwd = resolveVariables(
        config.get<string>('defaultCwd', dirname), this.variableToValue);
    if (path.isAbsolute(cwd)) {
      return cwd;
    } else {
      return this.resolveRelPath(cwd);
    }
  }

  private getDefaultRngSeed(config: vscode.WorkspaceConfiguration): string
      |number|null {
    return config.get<null|string|number>('defaultRngSeed', null);
  }

  getDefaultExecWatchTimeout(config: vscode.WorkspaceConfiguration): number {
    return config.get<number>('defaultExecWatchTimeout', 10000);
  }

  private getWorkerMaxNumber(config: vscode.WorkspaceConfiguration): number {
    return config.get<number>('workerMaxNumber', 4);
  }

  private getGlobalAndCurrentEnvironmentVariables(
      config: vscode.WorkspaceConfiguration,
      configEnv: {[prop: string]: any}): {[prop: string]: any} {
    const processEnv = process.env;
    const resultEnv = {...processEnv};

    for (const prop in configEnv) {
      const val = configEnv[prop];
      if (val === undefined || val === null) {
        delete resultEnv.prop;
      } else {
        resultEnv[prop] = resolveVariables(String(val), this.variableToValue);
      }
    }

    return resultEnv;
  }

  private getEnableSourceDecoration(config: vscode.WorkspaceConfiguration):
      boolean {
    return config.get<boolean>('enableSourceDecoration', true);
  }

  private getExecutables(
      config: vscode.WorkspaceConfiguration,
      allTests: C2AllTestSuiteInfo): C2ExecutableInfo[] {
    const globalWorkingDirectory = this.getDefaultCwd(config);

    let executables: C2ExecutableInfo[] = [];

    const configExecs:|undefined|string|string[]|{[prop: string]: any}|
        {[prop: string]: any}[] = config.get('executables');

    const fullPath = (p: string): string => {
      return path.isAbsolute(p) ? p : this.resolveRelPath(p);
    };

    const createFromObject = (o: Object): C2ExecutableInfo => {
      const name: string = o.hasOwnProperty('name') ? (<any>o)['name'] :
                                                      '${relDirname} : ${name}';
      if (!o.hasOwnProperty('path') || (<any>o)['path'] === null) {
        console.warn(Error('\'path\' is a requireds property.'));
        throw Error('Wrong object: ' + inspect(o));
      }
      const p: string =
          fullPath(resolveVariables((<any>o)['path'], this.variableToValue));
      const cwd: string =
          o.hasOwnProperty('cwd') ? (<any>o)['cwd'] : globalWorkingDirectory;
      const env: {[prop: string]: any} = o.hasOwnProperty('env') ?
          this.getGlobalAndCurrentEnvironmentVariables(
              config, (<any>o)['env']) :
          this.getGlobalAndDefaultEnvironmentVariables(config);

      return new C2ExecutableInfo(this, allTests, name, p, cwd, env);
    };

    if (typeof configExecs === 'string') {
      if (configExecs.length == 0) return [];
      executables.push(new C2ExecutableInfo(
          this, allTests, configExecs,
          fullPath(resolveVariables(configExecs, this.variableToValue)),
          globalWorkingDirectory, {}));
    } else if (Array.isArray(configExecs)) {
      for (var i = 0; i < configExecs.length; ++i) {
        const configExe = configExecs[i];
        if (typeof configExe == 'string') {
          const configExecsName = String(configExe);
          if (configExecsName.length > 0) {
            const resolvedName =
                resolveVariables(configExecsName, this.variableToValue);
            executables.push(new C2ExecutableInfo(
                this, allTests, resolvedName, fullPath(resolvedName),
                globalWorkingDirectory, {}));
          }
        } else {
          try {
            executables.push(createFromObject(configExe));
          } catch (e) {
            this.log.error(inspect(e));
          }
        }
      }
    } else if (configExecs instanceof Object) {
      try {
        executables.push(createFromObject(configExecs));
      } catch (e) {
        this.log.error(inspect(e));
      }
    } else {
      throw 'Catch2 config error: wrong type: executables';
    }

    return executables;
  }

  private resolveRelPath(relPath: string): string {
    const dirname = this.workspaceFolder.uri.fsPath;
    return path.resolve(dirname, relPath);
  }
}
