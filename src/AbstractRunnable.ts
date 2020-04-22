import * as cp from 'child_process';
import * as pathlib from 'path';
import * as fs from 'fs';

import * as c2fs from './FSWrapper';
import { RunnableSuiteProperties } from './RunnableSuiteProperties';
import { AbstractTest } from './AbstractTest';
import { Suite } from './Suite';
import { TaskPool } from './TaskPool';
import { SharedVariables } from './SharedVariables';
import { RunningTestExecutableInfo } from './RunningTestExecutableInfo';
import { promisify } from 'util';
import {
  Version,
  reverse,
  PythonIndexerRegexStr,
  processArrayWithPythonIndexer,
  resolveVariables,
  resolveOSEnvironmentVariables,
} from './Util';
import { TestGrouping, GroupByExecutable } from './TestGroupingInterface';

export abstract class AbstractRunnable {
  private static _reportedFrameworks: string[] = [];

  private _canceled = false;
  private _runInfos: RunningTestExecutableInfo[] = [];
  private _lastReloadTime: number | undefined = undefined;
  private _tests: AbstractTest[] = [];

  public constructor(
    protected readonly _shared: SharedVariables,
    protected readonly _rootSuite: Suite,
    public readonly execInfo: RunnableSuiteProperties,
    public readonly frameworkName: string,
    public readonly frameworkVersion: Promise<Version | undefined>,
  ) {
    frameworkVersion
      .then(version => {
        if (AbstractRunnable._reportedFrameworks.findIndex(x => x === frameworkName) === -1) {
          const versionStr = version ? version.toString() : 'unknown';

          _shared.log.infoMessageWithTags('Framework', {
            framework: this.frameworkName,
            frameworkVersion: `${this.frameworkName}@${versionStr}`,
          });

          AbstractRunnable._reportedFrameworks.push(frameworkName);
        }
      })
      .catch(e => this._shared.log.exception(e));
  }

  protected _getGroupByExecutable(): GroupByExecutable {
    return {
      label: this.execInfo.name,
      description: this.execInfo.description,
      tooltip: 'Path: ' + this.execInfo.path + '\nCwd: ' + this.execInfo.options.cwd,
    };
  }

  public get tests(): ReadonlyArray<AbstractTest> {
    return this._tests;
  }

  private _getOrCreateChildSuite(
    label: string,
    description: string | undefined,
    tooltip: string | undefined,
    group: Suite,
  ): Suite {
    const cond = (v: Suite | AbstractTest): boolean => v.type === 'suite' && v.label === label;
    const found = group.children.find(cond) as Suite | undefined;
    if (found) {
      return found;
    } else {
      const newG = group.addSuite(new Suite(this._shared, group, label, description, tooltip));
      return newG;
    }
  }

  private static readonly _variableRe = /\$\{[^ ]*\}/;

  private _resolveText(text: string): string {
    let resolvedText = '';
    try {
      resolvedText = resolveVariables(text, this.execInfo.varToValue);
      resolvedText = resolveOSEnvironmentVariables(resolvedText, false);

      if (resolvedText.match(AbstractRunnable._variableRe))
        this._shared.log.warn('Possibly unresolved variable', resolvedText, text, this);
    } catch (e) {
      this._shared.log.error('resolveText', text, e, this);
    }
    return resolvedText;
  }

  protected _createSubtreeAndAddTest(
    testName: string,
    testNameInOutput: string,
    file: string | undefined,
    tags: string[], // in case of google test it is the TestCase
    testGrouping: TestGrouping,
    createTest: (parent: Suite, old: AbstractTest | undefined) => AbstractTest,
  ): void {
    let group = this._rootSuite as Suite;

    const getOrCreateChildSuite = (
      label: string,
      description: string | undefined,
      tooltip: string | undefined,
    ): void => {
      group = this._getOrCreateChildSuite(label, description, tooltip, group);
    };

    let currentGrouping: TestGrouping = testGrouping;

    try {
      while (true) {
        if (currentGrouping.groupByExecutable) {
          this._shared.log.info('groupByExecutable');
          const g = currentGrouping.groupByExecutable;

          const label = this._resolveText(g.label ? g.label : '${filename}');
          const description = this._resolveText(g.description !== undefined ? g.description : '${relDirpath}/');
          const tooltip = g.tooltip ? this._resolveText(g.tooltip) : undefined;

          getOrCreateChildSuite(label, description, tooltip);

          currentGrouping = g;
        } else if (currentGrouping.groupBySource) {
          const g = currentGrouping.groupBySource;
          if (g.sourceIndex) {
            if (typeof g.sourceIndex === 'string') {
              const sourceIndicies = g.sourceIndex.match(PythonIndexerRegexStr);
              if (sourceIndicies) {
                if (file) {
                  this._shared.log.info('groupBySource', g.sourceIndex);
                  const relPath = pathlib.relative(this._shared.workspaceFolder.uri.fsPath, file);
                  const pathArray = relPath.split(/\/|\\/);
                  const fileStr = pathlib.join(...processArrayWithPythonIndexer(pathArray, sourceIndicies));
                  getOrCreateChildSuite(g.label ? g.label : fileStr, g.description, undefined);
                } else if (g.groupUngroupedTo) {
                  getOrCreateChildSuite(g.groupUngroupedTo, undefined, undefined);
                }
              } else {
                this._shared.log.warn("Couldn't parse", g.sourceIndex);
              }
            } else {
              this._shared.log.warn('sourceIndex has to be string', g.sourceIndex);
            }
          } else {
            this._shared.log.warn('missing "sourceIndex": skipping grouping level');
          }
          currentGrouping = g;
        } else if (currentGrouping.groupByTags) {
          const g = currentGrouping.groupByTags;
          if (g.tags) {
            this._shared.log.info('groupByTags', g.tags);

            if (Array.isArray(g.tags) && g.tags.every(v => typeof v === 'string')) {
              if (g.tags.length === 0) {
                if (tags.length > 0) {
                  const tagsStr = tags.sort().join('');
                  getOrCreateChildSuite(g.label ? g.label : tagsStr, g.description, undefined);
                } else if (g.groupUngroupedTo) {
                  getOrCreateChildSuite(g.groupUngroupedTo, undefined, undefined);
                }
              } else {
                const combos = g.tags
                  .map(tt => {
                    const m = tt.match(/(\[[^\[\]]+\])/g);
                    if (m) {
                      return m.map(t => t.substring(1, t.length - 1)).sort();
                    } else {
                      this._shared.log.warn(
                        'groupByTags.tags array element format should be like: "[tag1][tag2]".',
                        tt,
                      );
                      return [];
                    }
                  })
                  .filter(arr => arr.length > 0);

                const foundCombo = combos.find(combo => combo.every(t => tags.indexOf(t) !== -1));

                if (foundCombo) {
                  const comboStr = foundCombo.map(t => `[${t}]`).join('');
                  getOrCreateChildSuite(g.label ? g.label : comboStr, g.description, undefined);
                } else if (g.groupUngroupedTo) {
                  getOrCreateChildSuite(g.groupUngroupedTo, undefined, undefined);
                }
              }
            } else {
              this._shared.log.warn('groupByTags.tags should be an array of strings. Empty array is OK.', g.tags);
            }
          } else {
            this._shared.log.warn('missing "tags": skipping grouping level');
          }
          currentGrouping = g;
        } else if (currentGrouping.groupByRegex) {
          const g = currentGrouping.groupByRegex;
          if (g.regexes) {
            this._shared.log.info('groupByRegex', g.regexes);

            if (Array.isArray(g.regexes) && g.regexes.length > 0 && g.regexes.every(v => typeof v === 'string')) {
              let match: RegExpMatchArray | null = null;

              let index = 0;
              while (index < g.regexes.length && match == null) match = testName.match(g.regexes[index++]);

              if (match) {
                this._shared.log.info('groupByRegex matched on', testName, g.regexes[index - 1]);
                const group = match[1] ? match[1] : match[0];
                getOrCreateChildSuite(g.label ? g.label : group, g.description, undefined);
              } else if (g.groupUngroupedTo) {
                getOrCreateChildSuite(g.groupUngroupedTo, undefined, undefined);
              }
            } else {
              this._shared.log.warn('groupByTags.tags should be a non-empty array of strings.', g.regexes);
            }
          } else {
            this._shared.log.warn('missing "regexes": skipping grouping level');
          }
          currentGrouping = g;
        } else {
          break;
        }
      }
    } catch (e) {
      this._shared.log.exception(e);
    }

    const old = group.children.find(t => t instanceof AbstractTest && t.testNameInOutput === testNameInOutput) as
      | AbstractTest
      | undefined;

    const test = createTest(group, old);

    this._tests.push(test);

    group.addTest(test);
  }

  public removeTests(): void {
    this._tests.forEach(t => t.removeWithLeafAscendants());
    this._tests = [];
  }

  protected _addUnexpectedStdError(stdout: string, stderr: string): void {
    this._rootSuite.addError(
      this,
      [
        `❗️Unexpected stderr!`,
        `(One might can use ignoreTestEnumerationStdErr as the LAST RESORT. Check README for details.)`,
        `spawn`,
        `stout:`,
        `${stdout}`,
        `stderr:`,
        `${stderr}`,
      ].join('\n'),
    );
  }

  private _getModiTime(): Promise<number | undefined> {
    return promisify(fs.stat)(this.execInfo.path).then(
      stat => stat.mtimeMs,
      () => undefined,
    );
  }

  private async _isOutDated(): Promise<boolean> {
    const lastModiTime = await this._getModiTime();

    return this._lastReloadTime !== undefined && lastModiTime !== undefined && this._lastReloadTime !== lastModiTime;
  }

  private _splitTestSetForMultirun(tests: ReadonlyArray<AbstractTest>): ReadonlyArray<AbstractTest>[] {
    // const maxGroupNumber = 10;
    // const maxBucket = 100;
    // const minMilisecForGroup = 2000;
    // const maxMilisecForGroup = 10000;

    // const hasRuntime: AbstractTest[] = [];
    // const noHasRuntime: AbstractTest[] = [];

    // let durationSum = 0;
    // let durationCount = 0;

    // for (const t of tests) {
    //   if (t.lastRunMilisec !== undefined) {
    //     durationCount++;
    //     durationSum += t.lastRunMilisec;
    //   }
    // }

    // const noDurationCount = tests.length - durationCount;
    // const avgDuration = durationSum / durationCount;
    // const extrapolatedDuration = avgDuration * noDurationCount + durationSum;
    // const bucketTreshold = extrapolatedDuration / maxGroupNumber;

    // let bucketNumber = extrapolatedDuration/maxMilisecForGroup;

    //const buckets: AbstractTest[][] = [];

    //tests.forEach(t => buckets.push([t]));

    //return buckets;

    return [tests];
  }

  protected abstract _reloadChildren(): Promise<void>;

  protected abstract _getRunParams(childrenToRun: ReadonlyArray<AbstractTest>): string[];

  protected abstract _handleProcess(runInfo: RunningTestExecutableInfo): Promise<void>;

  public reloadTests(taskPool: TaskPool): Promise<void> {
    return taskPool.scheduleTask(async () => {
      this._shared.log.info('reloadChildren', this.frameworkName, this.frameworkVersion, this.execInfo.path);

      const lastModiTime = await this._getModiTime();

      if (this._lastReloadTime === undefined || lastModiTime === undefined || this._lastReloadTime !== lastModiTime) {
        this._lastReloadTime = lastModiTime;
        const oldTests = this._tests;
        this._tests = [];
        return this._reloadChildren().finally(() => oldTests.forEach(t => t.removeWithLeafAscendants()));
      } else {
        this._shared.log.debug('reloadTests was skipped due to mtime', this.execInfo.path);
      }
    });
  }

  public cancel(): void {
    this._shared.log.info('canceled:', this.execInfo.path);

    this._runInfos.forEach(r => {
      try {
        r.cancel();
      } catch (e) {
        this._shared.log.exception(e);
      }
    });

    this._canceled = true;
  }

  public run(childrenToRun: ReadonlyArray<AbstractTest>, taskPool: TaskPool): Promise<void> {
    this._canceled = false;

    if (childrenToRun.length === 0) {
      return Promise.resolve();
    }

    const buckets = this._splitTestSetForMultirun(childrenToRun);

    return Promise.all(
      buckets.map(b => {
        return this._runInner(b, taskPool);
      }),
    )
      .finally(() => {
        // last resort: if no fswatcher are functioning, this might notice the change
        this._isOutDated().then(
          (isOutDated: boolean) => {
            if (isOutDated) this._shared.loadWithTaskEmitter.fire(() => this.reloadTests(this._shared.taskPool));
          },
          err => this._shared.log.exception(err),
        );
      })
      .then();
  }

  private _runInner(childrenToRun: ReadonlyArray<AbstractTest>, taskPool: TaskPool): Promise<void> {
    const runIfNotCancelled = (): Promise<void> => {
      if (this._canceled) {
        this._shared.log.info('test was canceled:', this);
        return Promise.resolve();
      }
      return this._runProcess(childrenToRun);
    };

    return taskPool.scheduleTask(runIfNotCancelled).catch((err: Error) => {
      // eslint-disable-next-line
      if ((err as any).code === 'EBUSY' || (err as any).code === 'ETXTBSY') {
        this._shared.log.info('executable is busy, rescheduled: 2sec', err);

        return promisify(setTimeout)(2000).then(() => {
          taskPool.scheduleTask(runIfNotCancelled);
        });
      } else {
        throw err;
      }
    });
  }

  private _runProcess(childrenToRun: ReadonlyArray<AbstractTest>): Promise<void> {
    const descendantsWithStaticEvent: AbstractTest[] = [];
    const runnableDescendant: AbstractTest[] = [];

    childrenToRun.forEach(t => {
      if (t.staticEvent) descendantsWithStaticEvent.push(t);
      else runnableDescendant.push(t);
    });

    if (descendantsWithStaticEvent.length > 0) {
      descendantsWithStaticEvent.forEach(test => {
        if (test) {
          const route = [...test.route()];
          reverse(route)((s: Suite): void => s.sendRunningEventIfNeeded());
          this._shared.testStatesEmitter.fire(test!.getStartEvent());
          this._shared.testStatesEmitter.fire(test!.staticEvent);
          route.forEach((s: Suite): void => s.sendCompletedEventIfNeeded());
        }
      });
    }

    if (runnableDescendant.length === 0) {
      return Promise.resolve();
    }

    const execParams = this.execInfo.prependTestRunningArgs.concat(this._getRunParams(runnableDescendant));

    this._shared.log.info('proc starting', this.execInfo.path);
    this._shared.log.localDebug('proc starting', this.execInfo.path, execParams);

    const runInfo = new RunningTestExecutableInfo(
      cp.spawn(this.execInfo.path, execParams, this.execInfo.options),
      runnableDescendant,
    );

    this._runInfos.push(runInfo);

    this._shared.log.info('proc started:', this.execInfo.path);
    this._shared.log.localDebug('proc started:', this.execInfo.path, this.execInfo, execParams);

    runInfo.process.on('error', (err: Error) => {
      this._shared.log.error('process error event:', err, this);
    });

    {
      let trigger: (cause: 'reschedule' | 'closed' | 'timeout') => void;

      const changeConn = this._shared.onDidChangeExecRunningTimeout(() => {
        trigger('reschedule');
      });

      runInfo.process.once('close', (...args) => {
        this._shared.log.localDebug('proc close:', this.execInfo.path, args);
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
        this._shared.log.info('proc finished:', this.execInfo.path);

        const index = this._runInfos.indexOf(runInfo);
        if (index === -1) {
          this._shared.log.error("assertion: shouldn't be here", this._runInfos, runInfo);
        } else {
          this._runInfos.splice(index, 1);
        }
      });
  }

  protected _findTest(pred: (t: AbstractTest) => boolean): AbstractTest | undefined {
    return this._tests.find(pred);
  }

  protected _findFilePath(matchedPath: string): string {
    if (pathlib.isAbsolute(matchedPath)) return matchedPath;

    try {
      let parent: string;
      let parentParent = pathlib.dirname(this.execInfo.path);
      do {
        parent = parentParent;
        parentParent = pathlib.dirname(parent);

        const filePath = pathlib.join(parent, matchedPath);
        if (c2fs.existsSync(filePath)) return filePath;
      } while (parent != parentParent);
    } catch {}

    if (this.execInfo.options.cwd && !this.execInfo.path.startsWith(this.execInfo.options.cwd))
      try {
        let parent: string;
        let parentParent = this.execInfo.options.cwd;
        do {
          parent = parentParent;
          parentParent = pathlib.dirname(parent);

          const filePath = pathlib.join(parent, matchedPath);
          if (c2fs.existsSync(filePath)) return filePath;
        } while (parent != parentParent);
      } catch {}

    if (
      !this.execInfo.path.startsWith(this._shared.workspaceFolder.uri.fsPath) &&
      (!this.execInfo.options.cwd || !this.execInfo.options.cwd.startsWith(this._shared.workspaceFolder.uri.fsPath))
    )
      try {
        let parent: string;
        let parentParent = this._shared.workspaceFolder.uri.fsPath;
        do {
          parent = parentParent;
          parentParent = pathlib.dirname(parent);

          const filePath = pathlib.join(parent, matchedPath);
          if (c2fs.existsSync(filePath)) return filePath;
        } while (parent != parentParent);
      } catch {}

    return matchedPath;
  }

  public sendMinimalEventsIfNeeded(completed: Suite[], running: Suite[]): void {
    if (completed.length === 0) {
      reverse(running)(v => v.sendRunningEventIfNeeded());
    } else if (running.length === 0) {
      completed.forEach(v => v.sendCompletedEventIfNeeded());
    } else if (completed[0] === running[0]) {
      if (completed.length !== running.length) this._shared.log.error('completed.length !== running.length');
    } else {
      let completedIndex = -1;
      let runningIndex = -1;

      do {
        ++completedIndex;
        runningIndex = running.indexOf(completed[completedIndex]);
      } while (completedIndex < completed.length && runningIndex === -1);

      for (let i = 0; i < completedIndex; ++i) completed[i].sendCompletedEventIfNeeded();
      for (let i = runningIndex - 1; i >= 0; --i) running[i].sendRunningEventIfNeeded();
    }
  }
}
