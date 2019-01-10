//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';

import { TestInfoBase } from './TestInfoBase';
import * as c2fs from './FsWrapper';
import { generateUniqueId } from './IdGenerator';
import { TaskPool } from './TaskPool';
import { SharedVariables } from './SharedVariables';

export abstract class TestSuiteInfoBase implements TestSuiteInfo {
  readonly type: 'suite' = 'suite';
  readonly id: string;
  label: string;
  children: TestInfoBase[] = [];
  file?: string;
  line?: number;

  private _killed: boolean = false;
  private _process: ChildProcess | undefined = undefined;

  constructor(
    protected readonly _shared: SharedVariables,
    public readonly origLabel: string,
    public readonly execPath: string,
    public readonly execOptions: SpawnOptions) {
    this.label = origLabel;
    this.id = generateUniqueId();
  }

  static determineTestTypeOfExecutable(execPath: string):
    Promise<{ type: 'catch2' | 'google' | undefined; version: [number, number, number]; }> {
    return c2fs.spawnAsync(execPath, ['--help'])
      .then((res): any => {
        const catch2 = res.stdout.match(/Catch v([0-9]+)\.([0-9]+)\.([0-9]+)\s?/);
        if (catch2 && catch2.length == 4) {
          return { type: 'catch2', version: [Number(catch2[1]), Number(catch2[2]), Number(catch2[3])] };
        }
        const google = res.stdout.match(/This program contains tests written using Google Test./);
        if (google) {
          return { type: 'google', version: [0, 0, 0] };
        }
        return { type: undefined, version: [0, 0, 0] };
      }).catch(() => { return { type: undefined, version: [0, 0, 0] }; });
  }

  abstract reloadChildren(): Promise<void>;

  protected abstract _getRunParams(childrenToRun: TestInfoBase[] | 'all'): string[];

  protected abstract _handleProcess(runInfo: TestSuiteInfoBaseRunInfo): Promise<void>;

  cancel(): void {
    this._shared.log.info('canceled: ', this.id, this.label, this._process != undefined);

    this._killed = true;

    if (this._process != undefined) {
      this._process.kill();
      this._process = undefined;
    }
  }

  run(tests: Set<string>, taskPool: TaskPool): Promise<void> {
    this._killed = false;
    this._process = undefined;

    let childrenToRun: 'all' | TestInfoBase[] = 'all';

    if (tests.delete(this.id)) {
      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        tests.delete(c.id);
      }
    } else {
      childrenToRun = [];

      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        if (tests.delete(c.id)) childrenToRun.push(c);
      }

      if (childrenToRun.length == 0) return Promise.resolve();
    }

    return taskPool.scheduleTask(() => { return this._runInner(childrenToRun); });
  }

  private _runInner(childrenToRun: TestInfoBase[] | 'all'):
    Promise<void> {
    if (this._killed) return Promise.reject(Error('Test was killed.'));

    this._shared.testStatesEmitter.fire(
      { type: 'suite', suite: this, state: 'running' });

    if (childrenToRun === 'all') {
      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        if (c.skipped) {
          this._shared.testStatesEmitter.fire(c.getStartEvent());
          this._shared.testStatesEmitter.fire(c.getSkippedEvent());
        }
      }
    }

    const execParams = this._getRunParams(childrenToRun);

    this._shared.log.info('proc starting: ', this.execPath, execParams);

    this._process = spawn(this.execPath, execParams, this.execOptions);

    const runInfo: TestSuiteInfoBaseRunInfo = {
      process: this._process,
      childrenToRun: childrenToRun,
      timeout: undefined,
      timeoutWatcherTrigger: () => { },
    };

    this._shared.log.info('proc started');
    {
      const startTime = Date.now();

      const killIfTimeouts = (): Promise<void> => {
        return new Promise<vscode.Disposable>(resolve => {
          const conn = this._shared.onDidChangeExecRunningTimeout(() => {
            resolve(conn);
          });

          runInfo.timeoutWatcherTrigger = () => { resolve(conn); };

          if (this._shared.execRunningTimeout !== null) {
            const elapsed = Date.now() - startTime;
            const left = this._shared.execRunningTimeout - elapsed;
            if (left <= 0) resolve(conn);
            else setTimeout(resolve, left, conn);
          }
        }).then((conn: vscode.Disposable) => {
          conn.dispose();
          if (runInfo.process === undefined) {
            return Promise.resolve();
          } else if (this._shared.execRunningTimeout !== null
            && Date.now() - startTime > this._shared.execRunningTimeout) {
            runInfo.process.kill();
            runInfo.timeout = this._shared.execRunningTimeout;
            return Promise.resolve();
          } else {
            return killIfTimeouts();
          }
        });
      };
      killIfTimeouts();
    }

    return this._handleProcess(runInfo)
      .catch((reason: any) => {
        this._shared.log.error(reason);
      })
      .then(() => {
        this._shared.log.info('proc finished:', this.execPath);
        this._shared.testStatesEmitter.fire({ type: 'suite', suite: this, state: 'completed' });

        this._process = undefined;
        runInfo.process = undefined;
        runInfo.timeoutWatcherTrigger();
      });
  }

  protected _addChild(test: TestInfoBase) {
    if (this.children.length == 0) {
      this.file = test.file;
      this.line = test.file ? 0 : undefined;
    } else if (this.file != test.file) {
      this.file = undefined;
      this.line = undefined;
    }

    let i = this.children.findIndex((v: TestInfoBase) => {
      if (test.file && v.file && test.line && v.line) {
        const f = test.file.trim().localeCompare(v.file.trim());
        if (f != 0)
          return f < 0;
        else
          return test.line < v.line;
      } else {
        return test.label.trim().localeCompare(v.label.trim()) < 0;
      }
    });

    if (i == -1) i = this.children.length;

    this.children.splice(i, 0, test);
  }

  protected _findFilePath(matchedPath: string): string {
    let filePath = matchedPath;
    try {
      filePath = path.join(this._shared.workspaceFolder.uri.fsPath, matchedPath);
      if (!c2fs.existsSync(filePath) && this.execOptions.cwd) {
        filePath = path.join(this.execOptions.cwd, matchedPath);
      }
      if (!c2fs.existsSync(filePath)) {
        let parent = path.dirname(this.execPath);
        filePath = path.join(parent, matchedPath);
        let parentParent = path.dirname(parent);
        while (!c2fs.existsSync(filePath) && parent != parentParent) {
          parent = parentParent;
          filePath = path.join(parent, matchedPath);
          parentParent = path.dirname(parent);
        }
      }
      if (!c2fs.existsSync(filePath)) {
        filePath = matchedPath;
      }
    } catch (e) {
      filePath = path.join(this._shared.workspaceFolder.uri.fsPath, matchedPath);
    }
    return filePath;
  }

  findTestById(id: string): TestInfoBase | undefined {
    for (let i = 0; i < this.children.length; ++i) {
      if (this.children[i].id === id) return this.children[i];
    }
    return undefined;
  }

  findRouteToTestById(id: string): (TestSuiteInfo | TestInfo)[] | undefined {
    for (let i = 0; i < this.children.length; ++i) {
      const res = this.children[i].findRouteToTestById(id);
      if (res) return [this, ...res];
    }
    return undefined;
  }

  protected _getTimeoutMessage(milisec: number): string {
    return 'Timed out: "catch2TestExplorer.defaultRunningTimeoutSec": '
      + milisec / 1000 + ' second(s).\n';
  }
}

export interface TestSuiteInfoBaseRunInfo {
  process: ChildProcess | undefined;
  childrenToRun: TestInfoBase[] | 'all';
  timeout: number | undefined;
  timeoutWatcherTrigger: () => void;
}