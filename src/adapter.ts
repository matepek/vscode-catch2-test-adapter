//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the public
// domain. The author hereby disclaims copyright to this source code.

import { execFile } from "child_process";
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
  private isRunning: number = 0;

  private allTests: Catch2.C2TestSuiteInfo;
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
    this.allTests = new Catch2.C2TestSuiteInfo("AllTests", undefined, this, new Catch2.TaskPool(1));
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

  loadSuite(
    exe: ExecutableConfig,
    parentSuite: Catch2.C2TestSuiteInfo,
    oldSuite: Catch2.C2TestSuiteInfo | undefined
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        execFile(
          exe.abs,
          ["--list-test-names-only"],
          (error: Error | null, stdout: string, stderr: string) => {
            const suite = new Catch2.C2TestSuiteInfo(
              exe.name,
              parentSuite,
              this,
              new Catch2.TaskPool(exe.workerPool)
            );

            if (oldSuite !== undefined) {
              const index = parentSuite.children.findIndex(val => val.id == oldSuite.id);
              if (index !== -1) {
                parentSuite.children[index] = suite;
              } else {
                console.error("It should contains");
              }
            } else {
              parentSuite.children.push(suite);
            }

            let lines = stdout.split(/[\n\r]+/);
            for (var line of lines) {
              if (line.trim().length > 0) {
                suite.children.push(
                  new Catch2.C2TestInfo(
                    line.trimRight(),
                    this,
                    suite,
                    exe.abs,
                    [line.replace(",", "\\,").trim(), "--reporter", "xml"],
                    { cwd: exe.workingDirectory, env: exe.environmentVariables }
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
              this.testsEmitter.fire({ type: "started" });
              this.loadSuite(exe, parentSuite, suite).then(() => {
                this.testsEmitter.fire({
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

    this.testsEmitter.fire({ type: "started" });

    this.watchedFiles.forEach(file => {
      fs.unwatchFile(file);
    });
    this.watchedFiles.clear();

    const config = this.getConfiguration();
    const execs = this.getExecutables(config);

    if (execs == undefined) {
      this.testsEmitter.fire({ type: "finished", suite: undefined });
      return Promise.resolve();
    }

    const allTests = new Catch2.C2TestSuiteInfo(
      "AllTests",
      undefined,
      this,
      new Catch2.TaskPool(this.getGlobalWorkerPool(config))
    );

    let testListReaders = Promise.resolve();

    execs.forEach(exe => {
      testListReaders = testListReaders.then(() => {
        return this.loadSuite(exe, allTests, undefined);
      });
    });

    return testListReaders.then(() => {
      this.allTests = allTests;
      this.testsEmitter.fire({
        type: "finished",
        suite: allTests
      });
    });
  }

  run(tests: string[]): Promise<void> {
    const runners: Promise<void>[] = [];
    if (this.isRunning == 0) {
      this.testStatesEmitter.fire({ type: "started", tests: tests });
      tests.forEach(testId => {
        const info = this.findSuiteOrTest(this.allTests, testId);
        if (info === undefined) {
          console.error("Shouldn't be here");
        } else {
          const always = () => {
            this.isRunning -= 1;
          };
          runners.push(info.test().then(always, always));
          this.isRunning += 1;
        }
      });

      this.isRunning += 1;
      const always = () => {
        this.testStatesEmitter.fire({ type: "finished" });
        this.isRunning -= 1;
      };

      return Promise.all(runners).then(always, always);
    }
    throw Error("Catch2 Test Adapter: Test(s) are currently running.");
  }

  async debug(tests: string[]): Promise<void> {
    throw new Error("Method not implemented.");
  }

  cancel(): void {
    this.allTests.cancel();
  }

  private findSuiteOrTest(
    suite: Catch2.C2TestSuiteInfo,
    byId: string
  ): Catch2.C2TestSuiteInfo | Catch2.C2TestInfo | undefined {
    let search: Function = (
      t: Catch2.C2TestSuiteInfo | Catch2.C2TestInfo
    ): Catch2.C2TestSuiteInfo | Catch2.C2TestInfo | undefined => {
      if (t.id === byId) return t;
      if (t.type == "test") return undefined;
      for (let i = 0; i < (<Catch2.C2TestSuiteInfo>t).children.length; ++i) {
        let tt = search((<Catch2.C2TestSuiteInfo>t).children[i]);
        if (tt != undefined) return tt;
      }
      return undefined;
    };
    return search(suite);
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

  generateUniqueId(): string {
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
