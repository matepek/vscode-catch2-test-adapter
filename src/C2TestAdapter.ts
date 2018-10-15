//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import {execFile} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';
import * as util from 'vscode-test-adapter-util';

import {C2AllTestSuiteInfo} from './C2AllTestSuiteInfo';
import {C2TestInfo} from './C2TestInfo';

export class C2TestAdapter implements TestAdapter, vscode.Disposable {
  private readonly testsEmitter =
      new vscode.EventEmitter<TestLoadStartedEvent|TestLoadFinishedEvent>();
  readonly testStatesEmitter =
      new vscode.EventEmitter<TestRunStartedEvent|TestRunFinishedEvent|
                              TestSuiteEvent|TestEvent>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();

  private readonly watchers: Map<string, fs.FSWatcher> = new Map();
  private isRunning: number = 0;
  private isDebugging: boolean = false;

  private allTests: C2AllTestSuiteInfo;
  private readonly disposables: Array<vscode.Disposable> = new Array();

  private isEnabledSourceDecoration = true;
  private rngSeedStr: string|number|null = null;
  private readonly variableResolvedPair: [string, string][] =
      [['${workspaceFolder}', this.workspaceFolder.uri.fsPath]];

  getIsEnabledSourceDecoration(): boolean {
    return this.isEnabledSourceDecoration;
  }

  getRngSeed(): string|number|null {
    return this.rngSeedStr;
  }

  constructor(
      public readonly workspaceFolder: vscode.WorkspaceFolder,
      public readonly log: util.Log) {
    this.disposables.push(
        vscode.workspace.onDidChangeConfiguration(configChange => {
          if (configChange.affectsConfiguration(
                  'catch2TestExplorer.defaultEnv', this.workspaceFolder.uri) ||
              configChange.affectsConfiguration(
                  'catch2TestExplorer.defaultCwd', this.workspaceFolder.uri) ||
              configChange.affectsConfiguration(
                  'catch2TestExplorer.workerMaxNumber',
                  this.workspaceFolder.uri) ||
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
            this.rngSeedStr = this.getDefaultRngSeed(this.getConfiguration());
          }
        }));

    this.allTests = new C2AllTestSuiteInfo(this, 1);
  }

  dispose() {
    this.disposables.forEach(d => {
      d.dispose();
    });
    while (this.disposables.shift() !== undefined)
      ;
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

  private loadSuite(exe: ExecutableConfig): Promise<void> {
    const suite = this.allTests.createChildSuite(
        exe.name, exe.path, {cwd: exe.cwd, env: exe.env});

    let watcher = this.watchers.get(suite.execPath);

    if (watcher != undefined) {
      watcher.close();
    }

    watcher = fs.watch(suite.execPath);
    this.watchers.set(suite.execPath, watcher);
    const allTests = this.allTests;  // alltest may has changed

    watcher.on('change', (eventType: string, filename: string) => {
      // need some time here:
      const waitAndThenTry = (remainingIteration: number, delay: number) => {
        if (remainingIteration == 0) {
          watcher!.close();
          this.watchers.delete(suite.execPath);
          this.testsEmitter.fire({type: 'started'});
          allTests.removeChild(suite);
          this.testsEmitter.fire({type: 'finished', suite: this.allTests});
        } else if (!fs.existsSync(suite.execPath)) {
          setTimeout(
              waitAndThenTry, delay,
              [remainingIteration - 1, Math.max(delay * 2, 2000)]);
        } else {
          this.testsEmitter.fire({type: 'started'});
          suite.reloadChildren().then(() => {
            this.testsEmitter.fire({type: 'finished', suite: this.allTests});
          });
        }
      };

      // change event can arrive during debug session on osx (why?)
      if (!this.isDebugging) {
        waitAndThenTry(10, 128);
      }
    });

    return suite.reloadChildren();
  }

  load(): Promise<void> {
    this.cancel();

    this.testsEmitter.fire({type: 'started'});

    this.watchers.forEach((value, key) => {
      value.close();
    });
    this.watchers.clear();

    const config = this.getConfiguration();

    this.rngSeedStr = this.getDefaultRngSeed(config);

    this.allTests =
        new C2AllTestSuiteInfo(this, this.getWorkerMaxNumber(config));

    const executables = this.getExecutables(config);

    return executables
        .then((execs: ExecutableConfig[]) => {
          let testListReaders = Promise.resolve();

          execs.forEach(exe => {
            testListReaders = testListReaders.then(() => {
              return this.loadSuite(exe);
            });
          });

          return testListReaders;
        })
        .then(() => {
          this.testsEmitter.fire({type: 'finished', suite: this.allTests});
        })
        .catch((err: Error) => {
          this.testsEmitter.fire(
              {type: 'finished', suite: undefined, errorMessage: err.message});
        });
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
      return this.allTests.run(tests).then(always, always);
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
      let resolveDebugVariables: [string, any][] = this.variableResolvedPair;
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
            debug[prop] = this.resolveVariables(val, resolveDebugVariables);
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
        result[prop] =
            this.resolveVariables(String(val), this.variableResolvedPair);
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
        resultEnv[prop] =
            this.resolveVariables(String(val), this.variableResolvedPair);
      }
    }

    return resultEnv;
  }

  private getDefaultCwd(config: vscode.WorkspaceConfiguration): string {
    const dirname = this.workspaceFolder.uri.fsPath;
    const cwd = this.resolveVariables(
        config.get<string>('defaultCwd', dirname), this.variableResolvedPair);
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
        resultEnv[prop] =
            this.resolveVariables(String(val), this.variableResolvedPair);
      }
    }

    return resultEnv;
  }

  private getEnableSourceDecoration(config: vscode.WorkspaceConfiguration):
      boolean {
    return config.get<boolean>('enableSourceDecoration', true);
  }

  private getExecutables(config: vscode.WorkspaceConfiguration):
      Promise<ExecutableConfig[]> {
    const globalWorkingDirectory = this.getDefaultCwd(config);

    let executables: ExecutableConfig[] = [];

    const configExecs:|undefined|string|string[]|{[prop: string]: any}|
        {[prop: string]: any}[] = config.get('executables');

    const fullPath = (p: string): string => {
      return path.isAbsolute(p) ? p : this.resolveRelPath(p);
    };

    const addObject = (o: Object): void => {
      const name: string =
          o.hasOwnProperty('name') ? (<any>o)['name'] : '${dirname} : ${name}';
      if (!o.hasOwnProperty('path') || (<any>o)['path'] === null) {
        console.warn(Error('\'path\' is a requireds property.'));
        return;
      }
      const p: string = fullPath(
          this.resolveVariables((<any>o)['path'], this.variableResolvedPair));
      const regex: string = o.hasOwnProperty('regex') ? (<any>o)['regex'] : '';
      const cwd: string =
          o.hasOwnProperty('cwd') ? (<any>o)['cwd'] : globalWorkingDirectory;
      const env: {[prop: string]: any} = o.hasOwnProperty('env') ?
          this.getGlobalAndCurrentEnvironmentVariables(
              config, (<any>o)['env']) :
          this.getGlobalAndDefaultEnvironmentVariables(config);
      const regexRecursive: boolean = o.hasOwnProperty('recursiveRegex') ?
          (<any>o)['recursiveRegex'] :
          false;

      if (regex.length > 0) {
        const recursiveAdd = (directory: string): void => {
          const children = fs.readdirSync(directory, 'utf8');
          children.forEach(child => {
            const childPath = path.resolve(directory, child);
            const childStat = fs.statSync(childPath);
            if (childPath.match(regex) && childStat.isFile()) {
              let resolvedName = name + ' : ' + child;
              let resolvedCwd = cwd;
              try {
                resolvedName = this.resolveVariables(name, [
                  ['${absDirname}', p],
                  [
                    '${dirname}',
                    path.relative(this.workspaceFolder.uri.fsPath, p)
                  ],
                  ['${name}', child]
                ]);
                resolvedCwd = this.resolveVariables(
                    cwd, this.variableResolvedPair.concat([
                      ['${absDirname}', p],
                      [
                        '${dirname}',
                        path.relative(this.workspaceFolder.uri.fsPath, p)
                      ]
                    ]));
              } catch (e) {
              }
              executables.push(new ExecutableConfig(
                  resolvedName, childPath, regex, fullPath(resolvedCwd), env));
            } else if (childStat.isDirectory() && regexRecursive) {
              recursiveAdd(childPath);
            }
          });
        };
        try {
          const stat = fs.statSync(p);
          if (stat.isDirectory()) {
            recursiveAdd(p);
          } else if (stat.isFile()) {
            executables.push(new ExecutableConfig(name, p, regex, cwd, env));
          } else {
            // do nothing
          }
        } catch (e) {
          this.log.error(e.message);
        }
      } else {
        executables.push(new ExecutableConfig(name, p, regex, cwd, env));
      }
    };

    if (typeof configExecs === 'string') {
      if (configExecs.length == 0) return Promise.resolve([]);
      executables.push(new ExecutableConfig(
          configExecs,
          fullPath(
              this.resolveVariables(configExecs, this.variableResolvedPair)),
          '', globalWorkingDirectory, []));
    } else if (Array.isArray(configExecs)) {
      for (var i = 0; i < configExecs.length; ++i) {
        if (typeof configExecs[i] == 'string') {
          const configExecsStr = String(configExecs[i]);
          if (configExecsStr.length > 0) {
            executables.push(new ExecutableConfig(
                this.resolveVariables(
                    configExecsStr, this.variableResolvedPair),
                fullPath(this.resolveVariables(
                    configExecsStr, this.variableResolvedPair)),
                '', globalWorkingDirectory, []));
          }
        } else {
          addObject(configExecs[i]);
        }
      }
    } else if (configExecs instanceof Object) {
      addObject(configExecs);
    } else {
      throw 'Catch2 config error: wrong type: executables';
    }

    return this.filterVerifiedCatch2TestExecutables(executables);
  }

  private verifyIsCatch2TestExecutable(path: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      try {
        execFile(
            path, ['--help'],
            (error: Error|null, stdout: string, stderr: string) => {
              if (stdout.indexOf('Catch v2.') != -1) {
                resolve(true);
              } else {
                resolve(false);
              }
            });
      } catch (e) {
        resolve(false);
      }
    });
  }

  private filterVerifiedCatch2TestExecutables(executables: ExecutableConfig[]):
      Promise<ExecutableConfig[]> {
    const verified: ExecutableConfig[] = [];
    const promises: Promise<void>[] = [];

    executables.forEach(exec => {
      promises.push(this.verifyIsCatch2TestExecutable(exec.path).then(
          (isCatch2: boolean) => {
            if (isCatch2) verified.push(exec);
          }));
    });

    return Promise.all(promises).then(() => {
      return verified;
    });
  }

  private resolveVariables(value: any, varValue: [string, any][]): any {
    if (typeof value == 'string') {
      for (let i = 0; i < varValue.length; ++i) {
        if (value === varValue[i][0] && typeof varValue[i][1] != 'string') {
          return varValue[i][1];
        }
        value = value.replace(varValue[i][0], varValue[i][1]);
      }
      return value;
    } else if (Array.isArray(value)) {
      return (<any[]>value).map((v: any) => this.resolveVariables(v, varValue));
    } else if (typeof value == 'object') {
      const newValue: any = {};
      for (const prop in value) {
        newValue[prop] = this.resolveVariables(value[prop], varValue);
      }
      return newValue;
    }
    return value;
  }

  private resolveRelPath(relPath: string): string {
    const dirname = this.workspaceFolder.uri.fsPath;
    return path.resolve(dirname, relPath);
  }
}

class ExecutableConfig {
  constructor(
      public readonly name: string, public readonly path: string,
      public readonly regex: string, public readonly cwd: string,
      public readonly env: {[prop: string]: any}) {}
}
