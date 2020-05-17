import * as cp from 'child_process';
import * as pathlib from 'path';
import * as fs from 'fs';

import { RunnableProperties } from './RunnableProperties';
import { AbstractTest, AbstractTestEvent } from './AbstractTest';
import { Suite } from './Suite';
import { TaskPool } from './TaskPool';
import { SharedVariables } from './SharedVariables';
import { RunningRunnable } from './RunningRunnable';
import { promisify, inspect } from 'util';
import { Version, reverse, getAbsolutePath, CancellationToken } from './Util';
import {
  resolveVariables,
  resolveOSEnvironmentVariables,
  ResolveRule,
  createPythonIndexerForPathVariable,
} from './util/ResolveRule';
import { TestGrouping, GroupByExecutable } from './TestGroupingInterface';
import { TestEvent } from 'vscode-test-adapter-api';
import { RootSuite } from './RootSuite';
import { EOL } from 'os';

export class RunnableReloadResult {
  public tests = new Set<AbstractTest>();
  public changedAny = false;

  public add(test: AbstractTest, changed: boolean): this {
    this.tests.add(test);
    this.changedAny = this.changedAny || changed;
    return this;
  }
}

export abstract class AbstractRunnable {
  private static _reportedFrameworks: string[] = [];

  private _lastReloadTime: number | undefined = undefined;
  private _tests = new Set<AbstractTest>();

  public constructor(
    protected readonly _shared: SharedVariables,
    protected readonly _rootSuite: RootSuite,
    public readonly properties: RunnableProperties,
    public readonly frameworkName: string,
    public readonly frameworkVersion: Promise<Version | undefined>,
  ) {
    frameworkVersion
      .then(version => {
        if (AbstractRunnable._reportedFrameworks.findIndex(x => x === frameworkName) === -1) {
          const versionStr = version ? version.toString() : 'unknown';

          const tags: Record<string, string> = {};
          tags[this.frameworkName] = `${this.frameworkName}@${versionStr}`;
          _shared.log.setTags(tags);

          AbstractRunnable._reportedFrameworks.push(frameworkName);
        }
      })
      .catch(e => this._shared.log.exceptionS(e));
  }

  protected _getGroupByExecutable(): GroupByExecutable {
    return {
      label: this.properties.name,
      description: this.properties.description,
    };
  }

  public get tests(): Set<AbstractTest> {
    return this._tests;
  }

  private _getOrCreateChildSuite(label: string, description: string, tooltip: string, group: Suite): Suite {
    const cond = (v: Suite | AbstractTest): boolean => v.type === 'suite' && v.compare(label, description);
    const found = group.children.find(cond) as Suite | undefined;
    if (found) {
      return found;
    } else {
      const newG = group.addSuite(new Suite(this._shared, group, label, description, tooltip, undefined));
      return newG;
    }
  }

  private static readonly _variableRe = /\$\{[^ ]*\}/;

  private _resolveText(text: string, ...additionalVarToValue: readonly ResolveRule[]): string {
    let resolvedText = text;
    try {
      resolvedText = resolveVariables(resolvedText, this.properties.varToValue);
      resolvedText = resolveVariables(resolvedText, additionalVarToValue);
      resolvedText = resolveOSEnvironmentVariables(resolvedText, false);

      if (resolvedText.match(AbstractRunnable._variableRe))
        this._shared.log.warn('Possibly unresolved variable', resolvedText, text, this);
    } catch (e) {
      this._shared.log.error('resolveText', text, e, this);
    }
    return resolvedText;
  }

  protected _createSubtreeAndAddTest(
    testGrouping: TestGrouping,
    testNameAsId: string,
    testName: string,
    file: string | undefined,
    tags: string[], // in case of google test it is the TestCase
    createTest: (parent: Suite) => AbstractTest,
    updateTest: (old: AbstractTest) => boolean,
  ): [AbstractTest, boolean] {
    this._shared.log.setNextInspectOptions({ depth: 10 });
    this._shared.log.info('testGrouping', { testName, testNameAsId, file, tags }, testGrouping);

    let group = this._rootSuite as Suite;

    const relPath = file ? pathlib.relative(this._shared.workspaceFolder.uri.fsPath, file) : '';
    const absPath = file ? file : '';
    tags.sort();

    const vars: ResolveRule[] = [
      createPythonIndexerForPathVariable('sourceRelPath', relPath),
      createPythonIndexerForPathVariable('sourceAbsPath', absPath),
    ];

    const tagVar = '${tag}';
    const tagsVar = '${tags}';

    const updateVarsWithTags = (tg: TestGrouping, overrideTags?: string[]): void => {
      if (tg.tagFormat !== undefined && tg.tagFormat.indexOf(tagVar) === -1)
        this._shared.log.warn('tagFormat should contain "${tag}" substring', tg.tagFormat);

      const tagFormat = tg.tagFormat !== undefined && tg.tagFormat.indexOf(tagVar) !== -1 ? tg.tagFormat : '[${tag}]';
      const formattedTags = (overrideTags ? overrideTags : tags).map(t => tagFormat.replace(tagVar, t)).join('');
      const found = vars.find(v => v.resolve === tagsVar);

      if (found) {
        found.rule = formattedTags;
      } else {
        vars.push({ resolve: tagsVar, rule: formattedTags });
      }
    };

    const getOrCreateChildSuite = (
      label: string,
      description: string | undefined,
      tooltip: string | undefined,
    ): void => {
      const resolvedLabel = this._resolveText(label, ...vars);
      const resolvedDescr = description !== undefined ? this._resolveText(description, ...vars) : '';
      const resolvedToolt = tooltip !== undefined ? this._resolveText(tooltip, ...vars) : '';

      this._shared.log.info('groupBy', { label, resolvedLabel, description, resolvedDescr });

      group = this._getOrCreateChildSuite(resolvedLabel, resolvedDescr, resolvedToolt, group);
    };

    let currentGrouping: TestGrouping = testGrouping;

    try {
      while (true) {
        if (currentGrouping.groupByExecutable) {
          const g = currentGrouping.groupByExecutable;
          updateVarsWithTags(g);

          const label = g.label !== undefined ? g.label : '${filename}';
          const description = g.description !== undefined ? g.description : '${relDirpath}${osPathSep}';

          getOrCreateChildSuite(
            label,
            description,
            `Path: ${this.properties.path}\nCwd: ${this.properties.options.cwd}`,
          );

          currentGrouping = g;
        } else if (currentGrouping.groupBySource) {
          const g = currentGrouping.groupBySource;
          updateVarsWithTags(g);

          if (file) {
            const label = g.label ? g.label : relPath;
            const description = g.description;

            getOrCreateChildSuite(label, description, undefined);
          } else if (g.groupUngroupedTo) {
            getOrCreateChildSuite(g.groupUngroupedTo, undefined, undefined);
          }

          currentGrouping = g;
        } else if (currentGrouping.groupByTags) {
          const g = currentGrouping.groupByTags;
          updateVarsWithTags(g);

          if (
            g.tags === undefined ||
            (Array.isArray(g.tags) &&
              g.tags.every(v => typeof Array.isArray(v) && v.every(vv => typeof vv === 'string')))
          ) {
            if (g.tags === undefined || g.tags.length === 0 || g.tags.every(t => t.length == 0)) {
              if (tags.length > 0) {
                getOrCreateChildSuite(g.label ? g.label : tagsVar, g.description, undefined);
              } else if (g.groupUngroupedTo) {
                getOrCreateChildSuite(g.groupUngroupedTo, undefined, undefined);
              }
            } else {
              const combos = g.tags.filter(arr => arr.length > 0);
              const foundCombo = combos.find(combo => combo.every(t => tags.indexOf(t) !== -1));

              if (foundCombo) {
                updateVarsWithTags(g, foundCombo);
                getOrCreateChildSuite(g.label ? g.label : tagsVar, g.description, undefined);
              } else if (g.groupUngroupedTo) {
                getOrCreateChildSuite(g.groupUngroupedTo, undefined, undefined);
              }
            }
          } else {
            this._shared.log.warn('groupByTags.tags should be an array of strings. Empty array is OK.', g.tags);
          }

          currentGrouping = g;
        } else if (currentGrouping.groupByRegex) {
          const g = currentGrouping.groupByRegex;
          updateVarsWithTags(g);

          if (g.regexes) {
            if (Array.isArray(g.regexes) && g.regexes.length > 0 && g.regexes.every(v => typeof v === 'string')) {
              let match: RegExpMatchArray | null = null;

              let index = 0;
              while (index < g.regexes.length && match == null) match = testName.match(g.regexes[index++]);

              if (match) {
                this._shared.log.info('groupByRegex matched on', testName, g.regexes[index - 1]);
                const group = match[1] ? match[1] : match[0];

                const matchVar: ResolveRule[] = [{ resolve: '${match}', rule: group }];

                const label = g.label ? this._resolveText(g.label, ...matchVar) : group;
                const description =
                  g.description !== undefined ? this._resolveText(g.description, ...matchVar) : undefined;

                getOrCreateChildSuite(label, description, undefined);
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
      this._shared.log.exceptionS(e);
    }

    const old = group.children.find(t => t instanceof AbstractTest && t.compare(testNameAsId)) as
      | AbstractTest
      | undefined;

    if (old) {
      return [old, updateTest(old)];
    } else {
      const test = group.addTest(createTest(group));
      this._tests.add(test);
      return [test, true];
    }
  }

  public removeTests(): void {
    this._tests.forEach(t => t.removeWithLeafAscendants());
    this._tests = new Set();
  }

  protected _createError(title: string, message: string): (parent: Suite) => AbstractTest {
    return (parent: Suite): AbstractTest => {
      const shared = this._shared;
      const runnable = this as AbstractRunnable;
      const test = new (class extends AbstractTest {
        public constructor() {
          super(
            shared,
            runnable,
            parent,
            title,
            title,
            undefined,
            undefined,
            true,
            {
              state: 'errored',
              message,
            },
            [],
            '⚡️ Run me for details ⚡️',
            undefined,
            undefined,
          );
        }

        public compare(testNameAsId: string): boolean {
          return testNameAsId === testNameAsId;
        }

        public getDebugParams(): string[] {
          throw Error('assert');
        }

        public parseAndProcessTestCase(): AbstractTestEvent {
          throw Error('assert');
        }
      })();

      return test;
    };
  }

  protected _createAndAddError(label: string, message: string): RunnableReloadResult {
    return new RunnableReloadResult().add(
      ...this._createSubtreeAndAddTest(
        { groupByExecutable: this._getGroupByExecutable() },
        label,
        label,
        undefined,
        [],
        this._createError(label, message),
        () => false,
      ),
    );
  }

  protected _createAndAddUnexpectedStdError(stdout: string, stderr: string): RunnableReloadResult {
    return this._createAndAddError(
      `⚡️ Unexpected ERROR while parsing`,
      [
        `❗️Unexpected stderr!`,
        `(One might can use ignoreTestEnumerationStdErr as the LAST RESORT. Check README for details.)`,
        `spawn`,
        `stout:`,
        `${stdout}`,
        `stderr:`,
        `${stderr}`,
      ].join(EOL),
    );
  }

  private _getModiTime(): Promise<number | undefined> {
    return promisify(fs.stat)(this.properties.path).then(
      stat => stat.mtimeMs,
      () => undefined,
    );
  }

  private _splitTestSetForMultirunIfEnabled(tests: readonly AbstractTest[]): (readonly AbstractTest[])[] {
    const parallelizationLimit = this.properties.parallelizationPool.maxTaskCount;

    if (parallelizationLimit > 1) {
      // user intention?
      const testPerTask = Math.max(1, Math.round(this.tests.size / parallelizationLimit));

      const targetTaskCount = Math.min(tests.length, Math.max(1, Math.round(tests.length / testPerTask)));

      const buckets: AbstractTest[][] = [];

      for (let i = 0; i < targetTaskCount; ++i) {
        buckets.push([]);
      }

      for (let i = 0; i < tests.length; ++i) {
        buckets[i % buckets.length].push(tests[i]);
      }

      if (buckets.length > 1) {
        this._shared.log.info(
          "Parallel execution of the same executable is enabled. Note: This can cause problems if the executable's test cases depend on the same resource.",
          buckets.length,
        );
      }

      return buckets;
    } else {
      return [tests];
    }
  }

  private _splitTestsToSmallEnoughSubsets(tests: readonly AbstractTest[]): AbstractTest[][] {
    let lastSet: AbstractTest[] = [];
    const subsets: AbstractTest[][] = [lastSet];
    let charCount = 0;
    const limit = 30000;

    for (const test of tests) {
      if (charCount + test.testNameAsId.length >= limit) {
        lastSet = [];
        subsets.push(lastSet);
      }
      lastSet.push(test);
      charCount += test.testNameAsId.length;
    }

    return subsets;
  }

  protected abstract _reloadChildren(): Promise<RunnableReloadResult>;

  protected abstract _getRunParams(childrenToRun: readonly Readonly<AbstractTest>[]): string[];

  protected abstract _handleProcess(runInfo: RunningRunnable): Promise<void>;

  public abstract getDebugParams(childrenToRun: readonly Readonly<AbstractTest>[], breakOnFailure: boolean): string[];

  public reloadTests(taskPool: TaskPool): Promise<void> {
    return taskPool.scheduleTask(async () => {
      this._shared.log.info('reloadChildren', this.frameworkName, this.frameworkVersion, this.properties.path);

      const lastModiTime = await this._getModiTime();

      if (this._lastReloadTime === undefined || lastModiTime === undefined || this._lastReloadTime !== lastModiTime) {
        this._lastReloadTime = lastModiTime;

        const reloadResult = await this._reloadChildren();

        const toRemove: AbstractTest[] = [];
        for (const t of this._tests) if (!reloadResult.tests.has(t)) toRemove.push(t);

        if (toRemove.length > 0 || reloadResult.changedAny) {
          await this._shared.loadWithTask(
            async (): Promise<void> => {
              toRemove.forEach(t => {
                t.removeWithLeafAscendants();
                this._tests.delete(t);
              });
            },
          );
        }
      } else {
        this._shared.log.debug('reloadTests was skipped due to mtime', this.properties.path);
      }
    });
  }

  public async run(
    tests: readonly string[],
    isParentIn: boolean,
    taskPool: TaskPool,
    cancellationToken: CancellationToken,
  ): Promise<void> {
    const collectChildrenToRun = (): readonly AbstractTest[] =>
      this._rootSuite.collectTestToRun(tests, isParentIn, (test: AbstractTest): boolean => test.runnable === this);

    try {
      await this.runTasks('beforeEach', taskPool, cancellationToken);
    } catch (e) {
      this.sentStaticErrorEvent(collectChildrenToRun(), e);

      return;
    }

    await this.reloadTests(taskPool);

    const childrenToRun = collectChildrenToRun();

    if (childrenToRun.length === 0) return;

    const buckets = this._splitTestSetForMultirunIfEnabled(childrenToRun);

    await Promise.all(
      buckets.map(async (bucket: readonly AbstractTest[]) => {
        const smallerTestSet = this._splitTestsToSmallEnoughSubsets(bucket);
        for (const testSet of smallerTestSet) await this._runInner(testSet, taskPool, cancellationToken);
      }),
    );

    try {
      await this.runTasks('afterEach', taskPool, cancellationToken);
    } catch (e) {
      this.sentStaticErrorEvent(collectChildrenToRun(), e);
    }
  }

  public async runTasks(
    type: 'beforeEach' | 'afterEach',
    taskPool: TaskPool,
    cancellationToken: CancellationToken,
  ): Promise<void> {
    if (this.properties.runTask[type]?.length) {
      return taskPool.scheduleTask(async () => {
        try {
          // sequential execution of tasks
          for (const taskName of this.properties.runTask[type] || []) {
            const exitCode = await this._shared.executeTask(taskName, this.properties.varToValue, cancellationToken);

            if (exitCode !== undefined) {
              if (exitCode !== 0) {
                throw Error(
                  `Task "${taskName}" has returned with exitCode(${exitCode}) != 0. (\`testMate.test.advancedExecutables:runTask.${type}\`)`,
                );
              }
            }
          }
        } catch (e) {
          throw Error(
            `One of the tasks of the \`testMate.test.advancedExecutables:runTask.${type}\` array has failed: ` + e,
          );
        }
      });
    }
  }

  private _runInner(
    childrenToRun: readonly AbstractTest[],
    taskPool: TaskPool,
    cancellationToken: CancellationToken,
  ): Promise<void> {
    return this.properties.parallelizationPool.scheduleTask(() => {
      const descendantsWithStaticEvent: AbstractTest[] = [];
      const runnableDescendant: AbstractTest[] = [];

      childrenToRun.forEach(t => {
        if (t.staticEvent) descendantsWithStaticEvent.push(t);
        else runnableDescendant.push(t);
      });

      if (descendantsWithStaticEvent.length > 0) {
        this.sendStaticEvents(descendantsWithStaticEvent, undefined);
      }

      if (runnableDescendant.length === 0) {
        return Promise.resolve();
      }

      const runIfNotCancelled = (): Promise<void> => {
        if (cancellationToken.isCancellationRequested) {
          this._shared.log.info('test was canceled:', this);
          return Promise.resolve();
        }
        return this._runProcess(runnableDescendant, cancellationToken);
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
    });
  }

  private _runProcess(childrenToRun: readonly AbstractTest[], cancellationToken: CancellationToken): Promise<void> {
    const execParams = this.properties.prependTestRunningArgs.concat(this._getRunParams(childrenToRun));

    this._shared.log.info('proc starting', this.properties.path, execParams);

    const runInfo = new RunningRunnable(
      cp.spawn(this.properties.path, execParams, this.properties.options),
      childrenToRun,
      cancellationToken,
    );

    this._shared.log.info('proc started', runInfo.process.pid, this.properties.path, this.properties, execParams);

    runInfo.setPriorityAsync(this._shared.log);

    runInfo.process.on('error', (err: Error) => {
      this._shared.log.error('process error event:', err, this);
    });

    {
      let trigger: (cause: 'reschedule' | 'closed' | 'timeout') => void;

      const changeConn = this._shared.onDidChangeExecRunningTimeout(() => {
        trigger('reschedule');
      });

      runInfo.process.once('close', (...args) => {
        this._shared.log.info('proc close:', this.properties.path, args);
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

      shedule().finally(() => {
        changeConn.dispose();
      });
    }

    return this._handleProcess(runInfo)
      .catch((reason: Error) => this._shared.log.exceptionS(reason))
      .finally(() => this._shared.log.info('proc finished:', this.properties.path));
  }

  protected _findTest(pred: (t: AbstractTest) => boolean): AbstractTest | undefined {
    for (const t of this._tests) if (pred(t)) return t;
    return undefined;
  }

  protected _findFilePath(matchedPath: string): string {
    if (pathlib.isAbsolute(matchedPath)) return matchedPath;

    const directoriesToCheck: string[] = [pathlib.dirname(this.properties.path)];

    if (this.properties.options.cwd && !this.properties.path.startsWith(this.properties.options.cwd))
      directoriesToCheck.push(this.properties.options.cwd);

    if (
      !this.properties.path.startsWith(this._shared.workspaceFolder.uri.fsPath) &&
      (!this.properties.options.cwd || !this.properties.options.cwd.startsWith(this._shared.workspaceFolder.uri.fsPath))
    )
      directoriesToCheck.push(this._shared.workspaceFolder.uri.fsPath);

    const found = getAbsolutePath(matchedPath, directoriesToCheck);

    return found || matchedPath;
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

  public sendStaticEvents(childrenToRun: readonly AbstractTest[], staticEvent: TestEvent | undefined): void {
    childrenToRun.forEach(test => {
      const event = staticEvent || test.staticEvent;
      if (event) {
        event.test = test;
        // TODO: we might dont need this at all
        const route = [...test.route()];
        reverse(route)((s: Suite): void => s.sendRunningEventIfNeeded());
        this._shared.sendTestEvent(test!.getStartEvent());
        this._shared.sendTestEvent(event);
        route.forEach((s: Suite): void => s.sendCompletedEventIfNeeded());
      }
    });
  }

  // eslint-disable-next-line
  public sentStaticErrorEvent(childrenToRun: readonly AbstractTest[], err: any): void {
    this.sendStaticEvents(childrenToRun, {
      type: 'test',
      test: 'will be filled automatically',
      state: 'errored',
      message: err instanceof Error ? `⚡️ ${err.name}: ${err.message}` : inspect(err),
    });
  }
}
