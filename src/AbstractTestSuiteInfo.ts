import * as cp from 'child_process';
import * as path from 'path';

import * as c2fs from './FSWrapper';
import { AbstractTestInfo } from './AbstractTestInfo';
import { AbstractTestSuiteInfoBase } from './AbstractTestSuiteInfoBase';
import { TaskPool } from './TaskPool';
import { SharedVariables } from './SharedVariables';
import { RunningTestExecutableInfo } from './RunningTestExecutableInfo';
import { promisify } from 'util';

export abstract class AbstractTestSuiteInfo extends AbstractTestSuiteInfoBase {
  private static _reportedFrameworks: string[] = [];

  private _canceled: boolean = false;
  private _runInfo: RunningTestExecutableInfo | undefined = undefined;

  public constructor(
    shared: SharedVariables,
    label: string,
    desciption: string | undefined,
    public readonly execPath: string,
    public readonly execOptions: c2fs.SpawnOptions,
    public readonly frameworkName: string,
    public readonly frameworkVersion: [number, number, number] | undefined,
  ) {
    super(shared, label, desciption, undefined);

    if (AbstractTestSuiteInfo._reportedFrameworks.findIndex(x => x === frameworkName) === -1) {
      try {
        const versionStr = this.frameworkVersion ? this.frameworkVersion.join('.') : 'unknown';

        shared.log.infoWithTags('Framework', {
          framework: this.frameworkName,
          frameworkVersion: `${this.frameworkName}@${versionStr}`,
        });

        AbstractTestSuiteInfo._reportedFrameworks.push(frameworkName);
      } catch (e) {}
    }
  }

  public get tooltip(): string {
    return super.tooltip + '\n\nPath: ' + this.execPath + '\nCwd: ' + this.execOptions.cwd;
  }

  protected abstract _reloadChildren(): Promise<void>;

  protected abstract _getRunParams(childrenToRun: 'runAllTestsExceptSkipped' | Set<AbstractTestInfo>): string[];

  protected abstract _handleProcess(runInfo: RunningTestExecutableInfo): Promise<void>;

  public reloadTests(taskPool: TaskPool): Promise<void> {
    return taskPool.scheduleTask(() => {
      this._shared.log.info('reloadChildren', this.label, this.frameworkName, this.frameworkVersion, this.execPath);
      return this._reloadChildren();
    });
  }

  public cancel(): void {
    this._shared.log.info('canceled:', this.id, this.label, this._runInfo);

    this._runInfo && this._runInfo.killProcess();

    this._canceled = true;
  }

  public run(tests: Set<string>, taskPool: TaskPool): Promise<void> {
    this._canceled = false;

    if (this._runInfo) {
      this._shared.log.error('runInfo should be undefined', this._runInfo);
      this._runInfo = undefined;
    }

    const childrenToRun = tests.delete(this.id) ? 'runAllTestsExceptSkipped' : new Set<AbstractTestInfo>();

    if (childrenToRun === 'runAllTestsExceptSkipped') {
      this.enumerateDescendants(v => {
        tests.delete(v.id);
      });
    } else {
      this.enumerateDescendants((v: AbstractTestSuiteInfoBase | AbstractTestInfo) => {
        const explicitlyIn = tests.delete(v.id);
        if (explicitlyIn) {
          if (v instanceof AbstractTestInfo) {
            childrenToRun.add(v);
          } else if (v instanceof AbstractTestSuiteInfoBase) {
            v.enumerateTestInfos(vv => {
              if (!vv.skipped) childrenToRun.add(vv);
            });
          } else {
            this._shared.log.error('unknown case', v, this);
            debugger;
          }
        }
      });

      if (childrenToRun.size == 0) return Promise.resolve();
    }

    const runIfNotCancelled = () => {
      if (this._canceled) {
        this._shared.log.info('test was canceled:', this);
        return Promise.resolve();
      }
      return this._runInner(childrenToRun);
    };

    return taskPool.scheduleTask(runIfNotCancelled).catch((err: Error) => {
      // eslint-disable-next-line
      if ((err as any).code === 'EBUSY') {
        this._shared.log.info('executable is busy, rescheduled: 2sec', err);

        return promisify(setTimeout)(2000).then(() => {
          taskPool.scheduleTask(runIfNotCancelled);
        });
      } else {
        throw err;
      }
    });
  }

  private _runInner(childrenToRun: 'runAllTestsExceptSkipped' | Set<AbstractTestInfo>): Promise<void> {
    const execParams = this._getRunParams(childrenToRun);

    this._shared.log.info('proc starting: ', this.origLabel);

    this._shared.testStatesEmitter.fire(this.getRunningEvent());

    const runInfo = new RunningTestExecutableInfo(cp.spawn(this.execPath, execParams, this.execOptions), childrenToRun);

    this._runInfo = runInfo;

    this._shared.log.info('proc started:', this.origLabel, this.execPath, execParams, this.execOptions);

    runInfo.process.on('error', (err: Error) => {
      this._shared.log.error('process error event:', err, this);
    });

    {
      let trigger: (cause: 'reschedule' | 'closed' | 'timeout') => void;

      const changeConn = this._shared.onDidChangeExecRunningTimeout(() => {
        trigger('reschedule');
      });

      runInfo.process.once('close', (...args) => {
        this._shared.log.debug('proc close:', this.origLabel, args);
        trigger('closed');
      });

      const shedule = (): Promise<void> => {
        return new Promise<'reschedule' | 'closed' | 'timeout'>(resolve => {
          trigger = resolve;

          if (this._shared.execRunningTimeout !== null) {
            const elapsed = Date.now() - runInfo.startTime;
            const left = Math.max(0, this._shared.execRunningTimeout - elapsed);
            setTimeout(resolve, left, 'timeout');
          }
        }).then(cause => {
          if (cause === 'closed') {
            return Promise.resolve();
          } else if (cause === 'timeout') {
            runInfo.killProcess(this._shared.execRunningTimeout);
            return Promise.resolve();
          } else if (cause === 'reschedule') {
            return shedule();
          } else {
            throw new Error('unknown case: ' + cause);
          }
        });
      };

      shedule().then(() => {
        changeConn.dispose();
      });
    }

    return this._handleProcess(runInfo)
      .catch((reason: Error) => {
        this._shared.log.exception(reason);
      })
      .then(() => {
        this._shared.log.info('proc finished:', this.execPath);

        this._shared.testStatesEmitter.fire(this.getCompletedEvent());

        if (this._runInfo !== runInfo) {
          this._shared.log.error("assertion: shouldn't be here", this._runInfo, runInfo);
        }
        this._runInfo = undefined;
      });
  }

  protected _findFilePath(matchedPath: string): string {
    if (path.isAbsolute(matchedPath)) return matchedPath;

    try {
      let parent: string;
      let parentParent = path.dirname(this.execPath);
      do {
        parent = parentParent;
        parentParent = path.dirname(parent);

        const filePath = path.join(parent, matchedPath);
        if (c2fs.existsSync(filePath)) return filePath;
      } while (parent != parentParent);
    } catch {}

    if (this.execOptions.cwd && !this.execPath.startsWith(this.execOptions.cwd))
      try {
        let parent: string;
        let parentParent = this.execOptions.cwd;
        do {
          parent = parentParent;
          parentParent = path.dirname(parent);

          const filePath = path.join(parent, matchedPath);
          if (c2fs.existsSync(filePath)) return filePath;
        } while (parent != parentParent);
      } catch {}

    if (
      !this.execPath.startsWith(this._shared.workspaceFolder.uri.fsPath) &&
      (!this.execOptions.cwd || !this.execOptions.cwd.startsWith(this._shared.workspaceFolder.uri.fsPath))
    )
      try {
        let parent: string;
        let parentParent = this._shared.workspaceFolder.uri.fsPath;
        do {
          parent = parentParent;
          parentParent = path.dirname(parent);

          const filePath = path.join(parent, matchedPath);
          if (c2fs.existsSync(filePath)) return filePath;
        } while (parent != parentParent);
      } catch {}

    return matchedPath;
  }
}
