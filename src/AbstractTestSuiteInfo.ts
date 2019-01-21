//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as child_process from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

import * as c2fs from './FsWrapper';
import { AbstractTestInfo } from './AbstractTestInfo';
import { AbstractTestSuiteInfoBase } from './AbstractTestSuiteInfoBase';
import { TaskPool } from './TaskPool';
import { SharedVariables } from './SharedVariables';
import { RunningTestExecutableInfo } from './RunningTestExecutableInfo';

export abstract class AbstractTestSuiteInfo extends AbstractTestSuiteInfoBase {

  private _killed: boolean = false;
  private _process: child_process.ChildProcess | undefined = undefined;

  constructor(
    shared: SharedVariables,
    origLabel: string,
    public readonly execPath: string,
    public readonly execOptions: c2fs.SpawnOptions,
  ) {
    super(shared, origLabel);
  }

  abstract reloadChildren(): Promise<void>;

  protected abstract _getRunParams(childrenToRun: Set<AbstractTestInfo>): string[];

  protected abstract _handleProcess(runInfo: RunningTestExecutableInfo): Promise<void>;

  cancel(): void {
    this._shared.log.info('canceled:', this.id, this.label, this._process != undefined);

    this._killed = true;

    if (this._process != undefined) {
      this._process.kill();
      this._process = undefined;
    }
  }

  run(tests: Set<string>, taskPool: TaskPool): Promise<void> {
    this._killed = false;
    this._process = undefined;

    const childrenToRun = new Set<AbstractTestInfo>();
    const runAll = tests.delete(this.id);

    if (runAll) {
      this.enumerateDescendants(v => { tests.delete(v.id); });
    }
    else {
      this.enumerateDescendants((v: AbstractTestSuiteInfoBase | AbstractTestInfo) => {
        const explicitlyIn = tests.delete(v.id);
        if (explicitlyIn) {
          if (v instanceof AbstractTestInfo) {
            childrenToRun.add(v);
          }
          else if (v instanceof AbstractTestSuiteInfoBase) {
            v.enumerateTestInfos(vv => { childrenToRun.add(vv); });
          }
          else { this._shared.log.error('unknown case', v, this); debugger; }
        }
      });

      if (childrenToRun.size == 0) return Promise.resolve();
    }

    return taskPool.scheduleTask(() => { return this._runInner(childrenToRun); });
  }

  /**
   * @param childrenToRun If it is empty, it means run all.
   */
  private _runInner(childrenToRun: Set<AbstractTestInfo>): Promise<void> {
    if (this._killed) {
      this._shared.log.info('test was canceled:', this);
      return Promise.resolve();
    }

    const execParams = this._getRunParams(childrenToRun);

    this._shared.log.info('proc starting: ', this.execPath, execParams);

    this._shared.testStatesEmitter.fire({ type: 'suite', suite: this, state: 'running' });

    if (childrenToRun.size === 0) {
      this.sendSkippedChildrenEvents();
    }

    this._process = child_process.spawn(this.execPath, execParams, this.execOptions);

    const runInfo: RunningTestExecutableInfo = {
      process: this._process,
      childrenToRun: childrenToRun,
      timeout: undefined,
      timeoutWatcherTrigger: () => { },
      startTime: Date.now(),
    };

    this._shared.log.info('proc started');
    {
      const killIfTimeouts = (): Promise<void> => {
        return new Promise<vscode.Disposable>(resolve => {
          const conn = this._shared.onDidChangeExecRunningTimeout(() => {
            resolve(conn);
          });

          runInfo.timeoutWatcherTrigger = () => { resolve(conn); };

          if (this._shared.execRunningTimeout !== null) {
            const elapsed = Date.now() - runInfo.startTime;
            const left = this._shared.execRunningTimeout - elapsed;
            if (left <= 0) resolve(conn);
            else setTimeout(resolve, left, conn);
          }
        }).then((conn: vscode.Disposable) => {
          conn.dispose();
          if (runInfo.process === undefined) {
            return Promise.resolve();
          } else if (this._shared.execRunningTimeout !== null
            && Date.now() - runInfo.startTime > this._shared.execRunningTimeout) {
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
}