//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the public
// domain. The author hereby disclaims copyright to this source code.

import { ExecFileOptions, execFile } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import {
  TestAdapter,
  TestEvent,
  TestSuiteEvent,
  TestLoadStartedEvent,
  TestLoadFinishedEvent,
  TestRunStartedEvent,
  TestRunFinishedEvent
} from "vscode-test-adapter-api";
import * as Catch2 from "./catch2";

export class Catch2TestAdapter implements TestAdapter, vscode.Disposable {
  private readonly testsEmitter = new vscode.EventEmitter<
    TestLoadStartedEvent | TestLoadFinishedEvent
  >();
  readonly testStatesEmitter = new vscode.EventEmitter<
    TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
  >();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();

  private readonly watchedFiles: Set<string> = new Set();
  private readonly runningTasks: Set<Catch2.TestTask> = new Set();

  private readonly allTests: Catch2.ExtendedTestSuiteInfo;
  private readonly disposables: Array<vscode.Disposable> = new Array();
  //todo: logging

  constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(configChange => {
        if (
          configChange.affectsConfiguration(
            "catch2TestExplorer.executables",
            this.workspaceFolder.uri
          ) ||
          configChange.affectsConfiguration(
            "catch2TestExplorer.globalWorkerPool",
            this.workspaceFolder.uri
          ) ||
          configChange.affectsConfiguration(
            "catch2TestExplorer.globalEnvironmentVariables",
            this.workspaceFolder.uri
          ) ||
          configChange.affectsConfiguration(
            "catch2TestExplorer.globalWorkingDirectory",
            this.workspaceFolder.uri
          )
        ) {
          this.load();
        }
      })
    );
    this.allTests = this.makeSuite("AllTests", new Catch2.TestTaskPool(1, undefined));
  }

  dispose() {
    this.disposables.forEach(d => {
      d.dispose();
    });
    while (this.disposables.shift() !== undefined);
  }

  get testStates(): vscode.Event<
    TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
  > {
    return this.testStatesEmitter.event;
  }

  get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
    return this.testsEmitter.event;
  }

  get autorun(): vscode.Event<void> {
    return this.autorunEmitter.event;
  }

  findSuiteOrTest(
    allTests: Catch2.ExtendedTestSuiteInfo,
    byId: string
  ): Catch2.ExtendedTestSuiteInfo | Catch2.ExtendedTestInfo | undefined {
    let search: Function = (
      t: Catch2.ExtendedTestSuiteInfo | Catch2.ExtendedTestInfo
    ): Catch2.ExtendedTestSuiteInfo | Catch2.ExtendedTestInfo | undefined => {
      if (t.id === byId) return t;
      if (t.type == "test") return undefined;
      for (let i = 0; i < (<Catch2.ExtendedTestSuiteInfo>t).children.length; ++i) {
        let tt = search((<Catch2.ExtendedTestSuiteInfo>t).children[i]);
        if (tt != undefined) return tt;
      }
      return undefined;
    };
    return search(allTests);
  }

  loadSuite(
    exe: ExecutableConfig,
    oldSuite: Catch2.ExtendedTestSuiteInfo | undefined
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        execFile(
          exe.abs,
          ["--list-test-names-only"],
          (error: Error | null, stdout: string, stderr: string) => {
            const suite = this.makeSuite(
              exe.name,
              new Catch2.TestTaskPool(exe.workerPool, this.allTests.taskPool)
            );
            if (oldSuite !== undefined) {
              const index = this.allTests.children.findIndex(val => val.id == oldSuite.id);
              if (index !== -1) {
                this.allTests.children[index] = suite;
              } else {
                console.error("It should contains");
              }
            } else {
              this.allTests.children.push(suite);
            }
            let lines = stdout.split(/[\n\r]+/);
            for (var line of lines) {
              if (line.trim().length > 0) {
                suite.children.push(
                  this.makeTest(
                    line.trim(),
                    exe.abs, //https://github.com/catchorg/Catch2/issues/1327
                    [line.replace(",", "\\,").trim(), "--reporter", "xml"],
                    { cwd: exe.workingDirectory, env: exe.environmentVariables },
                    suite.taskPool
                  )
                );
              }
            }
            if (!this.watchedFiles.has(exe.abs)) {
              this.watchedFiles.add(exe.abs);
            } else {
              fs.unwatchFile(exe.abs);
            }
            fs.watchFile(exe.abs, (curr, prev) => {
              console.log(`the current mtime is: ${curr.mtime}`);
              console.log(`the previous mtime was: ${prev.mtime}`);
              //itt a gond mert suite be van capturelve
              this.testsEmitter.fire(<TestLoadStartedEvent>{ type: "started" });
              this.loadSuite(exe, suite).then(() => {
                this.testsEmitter.fire(<TestLoadFinishedEvent>{
                  type: "finished",
                  suite: this.allTests
                });
              });
            });
            resolve();
          }
        );
      } catch (e) {
        console.error("Something is wrong.", e);
        resolve();
      }
    });
  }

  load(): Promise<void> {
    this.cancel();

    this.testsEmitter.fire(<TestLoadStartedEvent>{ type: "started" });

    this.watchedFiles.forEach(file => {
      fs.unwatchFile(file);
    });
    this.watchedFiles.clear();

    const config = this.getConfiguration();
    const execs = this.getExecutables(config);
    while (this.allTests.children.shift() !== undefined);

    if (execs == undefined) {
      this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: "finished", suite: undefined });
      return Promise.resolve();
    }

    this.allTests.taskPool = new Catch2.TestTaskPool(this.getGlobalWorkerPool(config), undefined);

    let testListReaders = Promise.resolve();

    execs.forEach(exe => {
      testListReaders = testListReaders.then(() => {
        return this.loadSuite(exe, undefined);
      });
    });

    return testListReaders.then(() => {
      this.testsEmitter.fire(<TestLoadFinishedEvent>{
        type: "finished",
        suite: this.allTests
      });
    });
  }

  run(tests: string[]): Promise<void> {
    if (tests.length != 1) {
      // when can we get more than 1 id?
      throw Error("Unexpected 1.");
    }
    const taskPromises: Promise<void>[] = [];
    if (this.runningTasks.size == 0) {
      this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: "started", tests: tests });
      tests.forEach(testId => {
        const id = this.findSuiteOrTest(this.allTests, testId);
        if (id === undefined) {
          throw Error();
        }
        const task = new Catch2.TestTask(this, id);
        this.runningTasks.add(task);
        const always = () => {
          this.runningTasks.delete(task);
        };
        taskPromises.push(task.getPromise().then(always, always));
      });

      const always = () => {
        this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: "finished" });
      };
      return Promise.all(taskPromises).then(always, always);
    }
    throw Error("Catch2 Test Adapter: Test(s) are currently running. Wait.");
  }

  async debug(tests: string[]): Promise<void> {
    throw new Error("Method not implemented.");
  }

  cancel(): void {
    this.runningTasks.forEach(task => {
      task.cancel();
    });
  }

  private makeSuite(
    suite_name: string,
    taskPool: Catch2.TestTaskPool
  ): Catch2.ExtendedTestSuiteInfo {
    return {
      type: "suite",
      id: this.generateUniqueId(),
      label: suite_name,
      children: [],
      taskPool: taskPool
    };
  }

  private makeTest(
    test_name: string,
    execPath: string,
    execParams: string[],
    execOptions: ExecFileOptions,
    taskPool: Catch2.TestTaskPool
  ): Catch2.ExtendedTestInfo {
    return {
      type: "test",
      id: this.generateUniqueId(),
      label: test_name,
      execPath: execPath,
      execParams: execParams,
      execOptions: execOptions,
      taskPool: taskPool
    };
  }

  private getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("catch2TestExplorer", this.workspaceFolder.uri);
  }

  private getGlobalEnvironmentVariables(
    config: vscode.WorkspaceConfiguration
  ): { [prop: string]: string | undefined } {
    const processEnv = process.env;
    const configEnv: { [prop: string]: any } = config.get("globalEnvironmentVariables") || {};

    const resultEnv = { ...processEnv };

    for (const prop in configEnv) {
      const val = configEnv[prop];
      if (val === undefined || val === null) {
        delete resultEnv.prop;
      } else {
        resultEnv[prop] = String(val);
      }
    }

    return resultEnv;
  }

  private getGlobalWorkerPool(config: vscode.WorkspaceConfiguration): number {
    let pool = config.get<number>("globalWorkerPool", 4);
    pool = pool < 0 ? 9999 : pool;
    return pool;
  }

  private getGlobalWorkingDirectory(config: vscode.WorkspaceConfiguration): string {
    const dirname = this.workspaceFolder.uri.fsPath;
    const cwd = config.get<string>("globalWorkingDirectory", dirname);
    if (path.isAbsolute(cwd)) {
      return cwd;
    } else {
      return this.resolveRelPath(cwd);
    }
  }

  private getGlobalAndLocalEnvironmentVariables(
    config: vscode.WorkspaceConfiguration,
    configEnv: { [prop: string]: any }
  ): { [prop: string]: any } {
    let resultEnv = this.getGlobalEnvironmentVariables(config);

    for (const prop in configEnv) {
      const val = configEnv[prop];
      if (val === undefined || val === null) {
        delete resultEnv.prop;
      } else {
        resultEnv[prop] = String(val);
      }
    }

    return resultEnv;
  }

  private getExecutables(config: vscode.WorkspaceConfiguration): ExecutableConfig[] {
    const globalWorkingDirectory = this.getGlobalWorkingDirectory(config);
    let executables: ExecutableConfig[] = [];
    const configExecs:
      | string
      | { [prop: string]: any }
      | { [prop: string]: any }[]
      | undefined = config.get("executables");
    const fullPath = (p: string): string => {
      return path.isAbsolute(p) ? p : this.resolveRelPath(p);
    };
    const addObject = (o: Object): void => {
      const name: string = o.hasOwnProperty("name") ? (<any>o)["name"] : (<any>o)["path"];
      if (!o.hasOwnProperty("path")) {
        throw Error("'path' is a requireds property.");
      }
      const p: string = fullPath((<any>o)["path"]);
      const regex: string = o.hasOwnProperty("regex") ? (<any>o)["regex"] : "";
      let pool: number = o.hasOwnProperty("workerPool") ? Number((<any>o)["workerPool"]) : 1;
      pool = pool < 0 ? 9999 : pool;
      const cwd: string = o.hasOwnProperty("workingDirectory")
        ? fullPath((<any>o)["workingDirectory"])
        : globalWorkingDirectory;
      const env: { [prop: string]: any } = o.hasOwnProperty("environmentVariables")
        ? this.getGlobalAndLocalEnvironmentVariables(config, (<any>o)["environmentVariables"])
        : {};

      if (regex.length > 0) {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          const children = fs.readdirSync(p, "utf8");
          children.forEach(child => {
            const childPath = path.resolve(p, child);
            if (child.match(regex) && fs.statSync(childPath).isFile()) {
              executables.push(
                new ExecutableConfig(name + "(" + child + ")", childPath, regex, pool, cwd, env)
              );
            }
          });
        } else if (stat.isFile()) {
          executables.push(new ExecutableConfig(name, p, regex, pool, cwd, env));
        } else {
          // do nothing
        }
      } else {
        executables.push(new ExecutableConfig(name, p, regex, pool, cwd, env));
      }
    };
    if (typeof configExecs === "string") {
      executables.push(
        new ExecutableConfig(configExecs, fullPath(configExecs), "", 1, globalWorkingDirectory, [])
      );
    } else if (configExecs instanceof Array) {
      for (var i = 0; i < configExecs.length; ++i) {
        if (typeof configExecs[i] === "string") {
          executables.push(
            new ExecutableConfig(
              configExecs[i].toString(),
              fullPath(configExecs[i].toString()),
              "",
              1,
              globalWorkingDirectory,
              []
            )
          );
        } else {
          addObject(configExecs[i]);
        }
      }
    } else if (configExecs instanceof Object) {
      addObject(configExecs);
    } else {
      throw "Catch2 congig error: wrong type: executables";
    }

    executables.sort((a: ExecutableConfig, b: ExecutableConfig) => {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return executables;
  }

  resolveRelPath(relPath: string): string {
    const dirname = this.workspaceFolder.uri.fsPath;
    return path.resolve(dirname, relPath);
  }

  private static uidCounter: number = 0;

  private generateUniqueId(): string {
    return (++Catch2TestAdapter.uidCounter).toString();
  }
}

class ExecutableConfig {
  constructor(
    public readonly name: string,
    public readonly abs: string,
    public readonly regex: string,
    public readonly workerPool: number,
    public readonly workingDirectory: string,
    public readonly environmentVariables: { [prop: string]: any }
  ) {}
}
