//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as path from 'path';
import {inspect, promisify} from 'util';
import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';
import * as util from 'vscode-test-adapter-util';

import {C2AllTestSuiteInfo} from './C2AllTestSuiteInfo';
import {C2TestInfo} from './C2TestInfo';
import * as c2fs from './FsWrapper';

export class C2TestAdapter implements TestAdapter, vscode.Disposable {
  private readonly testsEmitter =
      new vscode.EventEmitter<TestLoadStartedEvent|TestLoadFinishedEvent>();
  readonly testStatesEmitter =
      new vscode.EventEmitter<TestRunStartedEvent|TestRunFinishedEvent|
                              TestSuiteEvent|TestEvent>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();

  private readonly watchers: Map<string, vscode.Disposable> = new Map();
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
            this.rngSeedStr = this.getDefaultRngSeed(this.getConfiguration());
            this.autorunEmitter.fire();
          }
        }));

    this.allTests = new C2AllTestSuiteInfo(this);
  }

  dispose() {
    this.disposables.forEach(d => {
      d.dispose();
    });
    this.watchers.forEach((v) => {
      v.dispose();
    });
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

  loadSuite(exe: ExecutableConfig): Promise<void> {
    const suite = this.allTests.createChildSuite(
        exe.name, exe.path, {cwd: exe.cwd, env: exe.env});

    let watcher = this.watchers.get(suite.execPath);

    if (watcher === undefined &&
        suite.execPath.startsWith(this.workspaceFolder.uri.path)) {
      try {
        const watcher = vscode.workspace.createFileSystemWatcher(
            suite.execPath, true, false, false);
        this.watchers.set(suite.execPath, watcher);
        const allTests = this.allTests;  // alltest may has changed

        const handler = (uri: vscode.Uri) => {
          const x =
              (exists: boolean, startTime: number, timeout: number,
               delay: number): Promise<void> => {
                if ((Date.now() - startTime) > timeout) {
                  watcher!.dispose();
                  this.watchers.delete(suite.execPath);
                  this.testsEmitter.fire({type: 'started'});
                  allTests.removeChild(suite);
                  this.testsEmitter.fire(
                      {type: 'finished', suite: this.allTests});
                  return Promise.resolve();
                } else if (exists) {
                  this.testsEmitter.fire({type: 'started'});
                  return suite.reloadChildren().then(
                      () => {
                        this.testsEmitter.fire(
                            {type: 'finished', suite: this.allTests});
                      },
                      (err: any) => {
                        this.testsEmitter.fire(
                            {type: 'finished', suite: this.allTests});
                        this.log.warn(inspect(err));
                        return x(
                            false, startTime, timeout,
                            Math.min(delay * 2, 2000));
                      });
                }
                return promisify(setTimeout)(Math.min(delay * 2, 2000))
                    .then(() => {
                      return c2fs.existsAsync(suite.execPath)
                          .then((exists: boolean) => {
                            return x(
                                exists, startTime, timeout,
                                Math.min(delay * 2, 2000));
                          });
                    });
              };

          // change event can arrive during debug session on osx (why?)
          if (!this.isDebugging) {
            // TODO filter multiple events and dont mess with 'load'
            x(false, Date.now(),
              this.getDefaultExecWatchTimeout(this.getConfiguration()), 64);
          }
        };
        this.disposables.push(watcher.onDidChange(handler));  // TODO not nice
        this.disposables.push(watcher.onDidDelete(handler));
      } catch (e) {
        this.log.warn('watcher couldn\'t watch: ' + suite.execPath);
      }
    }
    return suite.reloadChildren().catch((err: any) => {
      this.log.warn(inspect(err));
      this.allTests.removeChild(suite);
    });
  }

  load(): Promise<void> {
    this.cancel();

    this.testsEmitter.fire({type: 'started'});

    this.watchers.forEach((value, key) => {
      value.dispose();
    });
    this.watchers.clear();

    const config = this.getConfiguration();

    this.rngSeedStr = this.getDefaultRngSeed(config);

    this.allTests = new C2AllTestSuiteInfo(this);

    const executables = this.getExecutables(config);

    return executables
        .then((execs: ExecutableConfig[]) => {
          let testListReaders = Promise.resolve();

          for (let i = 0; i < execs.length; i++) {
            testListReaders = testListReaders.then(() => {
              return this.loadSuite(execs[i]).catch((err) => {
                this.log.error(inspect(err));
                debugger;
              });
            })
          }

          return testListReaders;
        })
        .then(
            () => {
              this.testsEmitter.fire({type: 'finished', suite: this.allTests});
            },
            (err: Error) => {
              this.testsEmitter.fire({
                type: 'finished',
                suite: undefined,
                errorMessage: err.message
              });
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

  private getDefaultExecWatchTimeout(config: vscode.WorkspaceConfiguration):
      number {
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

  private async getExecutables(config: vscode.WorkspaceConfiguration):
      Promise<ExecutableConfig[]> {
    const globalWorkingDirectory = this.getDefaultCwd(config);

    let executables: ExecutableConfig[] = [];

    const configExecs:|undefined|string|string[]|{[prop: string]: any}|
        {[prop: string]: any}[] = config.get('executables');

    const fullPath = (p: string): string => {
      return path.isAbsolute(p) ? p : this.resolveRelPath(p);
    };

    const addObject = async(o: Object): Promise<void> => {
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
        const recursiveAdd = async(directory: string): Promise<void> => {
          const children = c2fs.readdirSync(directory);
          for (let i = 0; i < children.length; ++i) {
            const child = children[i];
            const childPath = path.resolve(directory, child);
            const childStat = await c2fs.statAsync(childPath);
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
              await recursiveAdd(childPath);
            }
          }
        };
        try {
          const stat = await c2fs.statAsync(p);
          if (stat.isDirectory()) {
            await recursiveAdd(p);
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
          await addObject(configExecs[i]);
        }
      }
    } else if (configExecs instanceof Object) {
      await addObject(configExecs);
    } else {
      throw 'Catch2 config error: wrong type: executables';
    }

    return this.filterVerifiedCatch2TestExecutables(await executables);
  }

  verifyIsCatch2TestExecutable(path: string): Promise<boolean> {
    return c2fs.spawnAsync(path, ['--help'])
        .then((res) => {
          return res.stdout.indexOf('Catch v2.') != -1;
        })
        .catch((e) => {
          this.log.error(inspect(e));
          return false;
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
