//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as child_process from 'child_process';
import * as path from 'path';

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

  protected abstract _getRunParams(childrenToRun: 'runAllTestsExceptSkipped' | Set<AbstractTestInfo>): string[];

  protected abstract _handleProcess(runInfo: RunningTestExecutableInfo): Promise<void>;

  cancel(): void {
    this._shared.log.info('canceled:', this.id, this.label, this._process != undefined);

    if (this._process != undefined) {
      if (!this._killed) {
        this._process.kill();
        this._killed = true;
      } else {
        // Sometimes apps try to handle kill but it happens that it hangs in case of Catch2. 
        // The second click on the 'cancel button' sends a more serious signal. ☠️
        this._process.kill('SIGKILL');
      }
    }
  }

  run(tests: Set<string>, taskPool: TaskPool): Promise<void> {
    this._killed = false;
    this._process = undefined;

    const childrenToRun = tests.delete(this.id)
      ? 'runAllTestsExceptSkipped'
      : new Set<AbstractTestInfo>();

    if (childrenToRun === 'runAllTestsExceptSkipped') {
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

  private _runInner(childrenToRun: 'runAllTestsExceptSkipped' | Set<AbstractTestInfo>): Promise<void> {
    if (this._killed) {
      this._shared.log.info('test was canceled:', this);
      return Promise.resolve();
    }

    const execParams = this._getRunParams(childrenToRun);

    this._shared.log.info('proc starting: ', this.execPath, execParams);

    this._shared.testStatesEmitter.fire({ type: 'suite', suite: this, state: 'running' });

    if (childrenToRun === 'runAllTestsExceptSkipped') {
      this.sendSkippedChildrenEvents();
    }

    const process = child_process.spawn(this.execPath, execParams, this.execOptions);
    this._process = process;

    this._shared.log.info('proc started');

    process.on('error', (err: Error) => {
      this._shared.log.error('process error event', this, err);
    });

    const runInfo: RunningTestExecutableInfo = {
      process: process,
      childrenToRun: childrenToRun,
      timeout: null,
      startTime: Date.now(),
    };

    {
      let trigger: (cause: 'timeoutValueChanged' | 'close' | 'timeout') => void;

      const changeConn = this._shared.onDidChangeExecRunningTimeout(() => { trigger('timeoutValueChanged'); });

      process.once('close', () => {
        runInfo.process = undefined;
        trigger('close');
      });

      const shedule = (): Promise<void> => {
        return new Promise<'timeoutValueChanged' | 'close' | 'timeout'>(resolve => {
          trigger = resolve;

          if (this._shared.execRunningTimeout !== null) {
            const elapsed = Date.now() - runInfo.startTime;
            const left = Math.max(0, this._shared.execRunningTimeout - elapsed);
            setTimeout(resolve, left, 'timeout');
          }
        }).then((cause) => {
          if (cause === 'close') {
            return Promise.resolve();
          }
          else if (cause === 'timeout') {
            return new Promise<boolean>(resolve => {
              if (runInfo.process) {
                runInfo.process.once('close', () => { resolve(true); });
                setTimeout(resolve, 5000, false); // process has 5 secs to handle SIGTERM

                runInfo.process.kill();
                runInfo.timeout = this._shared.execRunningTimeout;
              } else {
                resolve(true);
              }
            }).then((couldKill: boolean) => {
              if (!couldKill && runInfo.process)
                runInfo.process.kill('SIGKILL');
            });
          }
          else if (cause === 'timeoutValueChanged') {
            return shedule();
          }
          else {
            throw new Error('unknown case: ' + cause);
          }
        });
      };

      shedule().then(() => {
        changeConn.dispose();
      });
    }

    return this._handleProcess(runInfo)
      .catch((reason: any) => {
        this._shared.log.error(reason);
      })
      .then(() => {
        this._shared.log.info('proc finished:', this.execPath);
        this._shared.testStatesEmitter.fire({ type: 'suite', suite: this, state: 'completed' });

        if (this._process === process)
          this._process = undefined;
      });
  }

  protected _findFilePath(matchedPath: string): string {
    try {
      let filePath = path.join(this._shared.workspaceFolder.uri.fsPath, matchedPath);
      if (c2fs.existsSync(filePath))
        return filePath;

      if (this.execOptions.cwd) {
        filePath = path.join(this.execOptions.cwd, matchedPath);
        if (c2fs.existsSync(filePath))
          return filePath;
      }

      {
        let parent: string;
        let parentParent = path.dirname(this.execPath);
        do {
          parent = parentParent;
          parentParent = path.dirname(parent);

          filePath = path.join(parent, matchedPath);
          if (c2fs.existsSync(filePath))
            return filePath;
        } while (parent != parentParent);
      }
    } finally {
      return path.join(this._shared.workspaceFolder.uri.fsPath, matchedPath);
    }
  }
}