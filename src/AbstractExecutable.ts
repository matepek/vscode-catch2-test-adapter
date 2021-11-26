import * as pathlib from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { EOL } from 'os';

import { RunnableProperties } from './RunnableProperties';
import { AbstractTest } from './AbstractTest';
import { TaskPool } from './util/TaskPool';
import { WorkspaceShared } from './WorkspaceShared';
import { ExecutableRunResultValue, RunningExecutable } from './RunningExecutable';
import { promisify, inspect } from 'util';
import { Version, getAbsolutePath, CancellationToken, CancellationFlag, reindentStr } from './Util';
import {
  resolveOSEnvironmentVariables,
  createPythonIndexerForPathVariable,
  ResolveRuleAsync,
  resolveVariablesAsync,
} from './util/ResolveRule';
import { TestGrouping, GroupByExecutable, GroupByTagRegex, GroupByRegex } from './TestGroupingInterface';
import { isSpawnBusyError } from './util/FSWrapper';
import { TestResultBuilder } from './TestResultBuilder';
import { debugAssert, debugBreak } from './util/DevelopmentHelper';
import { SpawnBuilder } from './Spawner';
import { SharedTestTags } from './SharedTestTags';
import { Disposable } from './Util';

export class TestsToRun {
  public readonly direct: AbstractTest[] = []; // test is drectly included, should be run even if it is skipped
  public readonly parent: AbstractTest[] = []; // tests included because one of the ascendant was directly included

  *[Symbol.iterator](): Iterator<AbstractTest> {
    for (const i of this.direct) yield i;
    for (const i of this.parent) yield i;
  }
}

export abstract class AbstractExecutable implements Disposable {
  public constructor(
    public readonly shared: WorkspaceShared,
    public readonly properties: RunnableProperties,
    public readonly frameworkName: string,
    public readonly frameworkVersion: Version | undefined,
  ) {
    this._execItem = new ExecutableGroup(this);
    const versionStr = frameworkVersion ? frameworkVersion.toString() : 'unknown';

    const tags: Record<string, string> = {};
    tags[this.frameworkName] = `${this.frameworkName}@${versionStr}`;
    shared.log.setTags(tags);

    AbstractExecutable._reportedFrameworks.push(frameworkName);
  }

  public dispose(): void {
    for (const test of this._tests.values()) {
      this.removeTest(test);
    }
  }

  private static _reportedFrameworks: string[] = [];

  protected _getGroupByExecutable(): GroupByExecutable {
    return {
      label: this.properties.name,
      description: this.properties.description,
    };
  }

  private _lastReloadTime: number | undefined = undefined;

  //TODO:future  special group to be expandable: private _execGroup: vscode.TestItem | undefined = undefined;

  // don't use this directly because _addTest and _getTest can be overwritten
  private _tests = new Map<string /*id*/, AbstractTest>();

  protected _addTest(testId: string, test: AbstractTest): void {
    this._tests.set(testId, test);
  }

  protected _getTest<T extends AbstractTest>(testId: string): T | undefined {
    return this._tests.get(testId) as T;
  }

  private _getOrCreateChildGroup(
    idIn: string | undefined,
    label: string,
    description: string,
    _tooltip: string, // tooltip currently is not supported
    itemOfLevel: vscode.TestItem | undefined,
  ): vscode.TestItem {
    const childrenOfLevel = itemOfLevel?.children ?? this.shared.rootItems;
    const id = idIn ?? label;
    const found = childrenOfLevel.get(id);
    if (found) {
      return found;
    } else {
      const testItem = this.shared.testItemCreator(id, label, undefined, undefined, undefined);
      testItem.description = description;
      testItem.tags = SharedTestTags.groupArray;
      childrenOfLevel.add(testItem);
      return testItem;
    }
  }

  private async _resolveAndGetOrCreateChildGroup(
    itemOfLevel: vscode.TestItem | undefined,
    id: string | undefined,
    label: string,
    description: string | undefined,
    tooltip: string | undefined,
    varsToResolve: ResolveRuleAsync<string>[],
  ): Promise<vscode.TestItem> {
    const resolvedLabel = await this.resolveText(label, ...varsToResolve);
    const resolvedDescr = description !== undefined ? await this.resolveText(description, ...varsToResolve) : '';
    const resolvedToolt = tooltip !== undefined ? await this.resolveText(tooltip, ...varsToResolve) : '';

    return this._getOrCreateChildGroup(id, resolvedLabel, resolvedDescr, resolvedToolt, itemOfLevel);
  }

  private _updateVarsWithTags(tg: TestGrouping, tags: string[], tagsResolveRule: ResolveRuleAsync<string>): void {
    const tagVar = '${tag}';

    tagsResolveRule.rule = async (): Promise<string> => {
      let tagFormat = `[${tagVar}]`;
      if (tg.tagFormat !== undefined) {
        if (tg.tagFormat.indexOf(tagVar) === -1) {
          this.shared.log.warn(`tagFormat should contain "${tagVar}" substring`, tg.tagFormat);
        } else {
          tagFormat = tg.tagFormat;
        }
      }
      return tags.map(t => tagFormat.replace(tagVar, t)).join('');
    };
  }

  private static readonly _variableRe = /\$\{[^ ]*\}/;

  public async resolveText(text: string, ...additionalVarToValue: readonly ResolveRuleAsync[]): Promise<string> {
    let resolvedText = text;
    try {
      resolvedText = await resolveVariablesAsync(resolvedText, this.properties.varToValue);

      resolvedText =
        additionalVarToValue.length > 0
          ? await resolveVariablesAsync(resolvedText, additionalVarToValue)
          : resolvedText;

      resolvedText = resolveOSEnvironmentVariables(resolvedText, false);

      if (resolvedText.match(AbstractExecutable._variableRe))
        this.shared.log.warn('Possibly unresolved variable', resolvedText, text, this);
    } catch (e) {
      this.shared.log.error('resolveText', text, e, this);
    }
    return resolvedText;
  }

  private static readonly _tagVar = '${tags}';

  /**
   * If there is a special group called 'groupByExecutable' then we will store
   * the corresponding TestItem for error reporting and other features.
   * It can be nested, in this case the shallowest/first will be stored.
   */
  private readonly _execItem: ExecutableGroup;

  protected async _createTreeAndAddTest<T extends AbstractTest>(
    testGrouping: TestGrouping,
    testId: string,
    file: string | undefined,
    tags: string[], // in case of google test it is the TestCase
    _description: string | undefined, // currently we don't use it for subtree creation
    createTest: (container: vscode.TestItemCollection) => T,
    updateTest: (test: T) => void,
  ): Promise<T> {
    this.shared.log.info('testGrouping', testId);
    this.shared.log.debug('testGrouping', { testId, file, tags, testGrouping });

    tags.sort();

    const tagsResolveRule: ResolveRuleAsync<string> = {
      resolve: AbstractExecutable._tagVar,
      rule: '', // will be filled soon enough
    };
    const sourceRelPath = file ? pathlib.relative(this.shared.workspaceFolder.uri.fsPath, file) : '';

    const varsToResolve = [
      tagsResolveRule,
      createPythonIndexerForPathVariable('sourceRelPath', sourceRelPath),
      createPythonIndexerForPathVariable('sourceAbsPath', file ? file : ''),
    ];

    // undefined means root
    let itemOfLevel: vscode.TestItem | undefined = undefined;
    let currentGrouping: TestGrouping = testGrouping;

    try {
      while (true) {
        if (currentGrouping.groupByExecutable) {
          const g = currentGrouping.groupByExecutable;
          this._updateVarsWithTags(g, tags, tagsResolveRule);

          const id = this.properties.path;
          const label = g.label !== undefined ? g.label : '${filename}';
          const description = g.description !== undefined ? g.description : '${relDirpath}${osPathSep}';

          itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
            itemOfLevel,
            id,
            label,
            description,
            `Path: ${this.properties.path}\nCwd: ${this.properties.options.cwd}`,
            varsToResolve,
          );

          this._execItem.item = itemOfLevel;

          currentGrouping = g;
        } else if (currentGrouping.groupBySource) {
          const g = currentGrouping.groupBySource;
          this._updateVarsWithTags(g, tags, tagsResolveRule);

          if (file) {
            const label = g.label ? g.label : sourceRelPath;
            const description = g.description;

            itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
              itemOfLevel,
              undefined,
              label,
              description,
              undefined,
              varsToResolve,
            );
          } else if (g.groupUngroupedTo) {
            itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
              itemOfLevel,
              undefined,
              g.groupUngroupedTo,
              undefined,
              undefined,
              varsToResolve,
            );
          }

          currentGrouping = g;
        } else if (currentGrouping.groupByTags) {
          const g = currentGrouping.groupByTags;
          this._updateVarsWithTags(g, tags, tagsResolveRule);

          if (
            g.tags === undefined ||
            (Array.isArray(g.tags) &&
              g.tags.every(v => typeof Array.isArray(v) && v.every(vv => typeof vv === 'string')))
          ) {
            if (g.tags === undefined || g.tags.length === 0 || g.tags.every(t => t.length == 0)) {
              if (tags.length > 0) {
                itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
                  itemOfLevel,
                  undefined,
                  g.label ? g.label : AbstractExecutable._tagVar,
                  g.description,
                  undefined,
                  varsToResolve,
                );
              } else if (g.groupUngroupedTo) {
                itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
                  itemOfLevel,
                  undefined,
                  g.groupUngroupedTo,
                  undefined,
                  undefined,
                  varsToResolve,
                );
              }
            } else {
              const combos = g.tags.filter(arr => arr.length > 0);
              const foundCombo = combos.find(combo => combo.every(t => tags.indexOf(t) !== -1));

              if (foundCombo) {
                this._updateVarsWithTags(g, foundCombo, tagsResolveRule);
                itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
                  itemOfLevel,
                  undefined,
                  g.label ? g.label : AbstractExecutable._tagVar,
                  g.description,
                  undefined,
                  varsToResolve,
                );
              } else if (g.groupUngroupedTo) {
                itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
                  itemOfLevel,
                  undefined,
                  g.groupUngroupedTo,
                  undefined,
                  undefined,
                  varsToResolve,
                );
              }
            }
          } else {
            this.shared.log.warn('groupByTags.tags should be an array of strings. Empty array is OK.', g.tags);
          }

          currentGrouping = g;
        } else if (currentGrouping.groupByTagRegex || currentGrouping.groupByRegex) {
          const groupType = currentGrouping.groupByTagRegex ? 'groupByTagRegex' : 'groupByRegex';
          const g: GroupByTagRegex | GroupByRegex = currentGrouping.groupByTagRegex
            ? currentGrouping.groupByTagRegex
            : currentGrouping.groupByRegex!;

          this._updateVarsWithTags(g, tags, tagsResolveRule);

          if (g.regexes) {
            if (Array.isArray(g.regexes) && g.regexes.length > 0 && g.regexes.every(v => typeof v === 'string')) {
              let match: RegExpMatchArray | null = null;

              const matchOn = groupType == 'groupByTagRegex' ? tags : [testId];

              let reIndex = 0;
              while (reIndex < g.regexes.length && match == null) {
                let tagIndex = 0;
                while (tagIndex < matchOn.length && match == null) {
                  match = matchOn[tagIndex++].match(g.regexes[reIndex]);
                }
                reIndex++;
              }

              if (match !== null) {
                this.shared.log.info(groupType + ' matched on', testId, g.regexes[reIndex - 1]);
                const matchGroup = match[1] ? match[1] : match[0];

                const lowerMatchGroup = matchGroup.toLowerCase();

                const matchVar: ResolveRuleAsync[] = [
                  { resolve: '${match}', rule: matchGroup },
                  { resolve: '${match_lowercased}', rule: lowerMatchGroup },
                  {
                    resolve: '${match_upperfirst}',
                    rule: async (): Promise<string> =>
                      lowerMatchGroup.substr(0, 1).toUpperCase() + lowerMatchGroup.substr(1),
                  },
                ];

                const label = g.label ? await resolveVariablesAsync(g.label, matchVar) : matchGroup;
                const description =
                  g.description !== undefined ? await resolveVariablesAsync(g.description, matchVar) : undefined;

                itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
                  itemOfLevel,
                  undefined,
                  label,
                  description,
                  undefined,
                  varsToResolve,
                );
              } else if (g.groupUngroupedTo) {
                itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
                  itemOfLevel,
                  undefined,
                  g.groupUngroupedTo,
                  undefined,
                  undefined,
                  varsToResolve,
                );
              }
            } else {
              this.shared.log.warn(groupType + '.regexes should be a non-empty array of strings.', g.regexes);
            }
          } else {
            this.shared.log.warn(groupType + ' missing "regexes": skipping grouping level');
          }
          currentGrouping = g;
        } else {
          break;
        }
      }
    } catch (e) {
      this.shared.log.exceptionS(e);
    }

    const childrenOfLevel = itemOfLevel?.children ?? this.shared.rootItems;
    const found = childrenOfLevel.get(testId);

    if (found) {
      const test = this.shared.testItemMapper(found) as T;
      if (!test) throw Error('missing test for item');
      updateTest(test);
      this._addTest(test.id, test);
      return test;
    } else {
      const test = createTest(childrenOfLevel);
      this._addTest(test.id, test);
      return test;
    }
  }

  private removeWithLeafAscendants(testItem: vscode.TestItem, evenIfHasChildren = false): void {
    if (!evenIfHasChildren && testItem.children.size > 0) return;

    if (testItem.parent) {
      const parent = testItem.parent;
      parent.children.delete(testItem.id);
      this.removeWithLeafAscendants(parent);
    } else {
      this.shared.rootItems.delete(testItem.id);
    }
  }

  private removeTest(test: AbstractTest): void {
    this.removeWithLeafAscendants(test.item, true);
  }

  protected _createAndAddError(label: string, message: string): void {
    this._execItem.setError(label, message);
  }

  protected _createAndAddUnexpectedStdError(stdout: string, stderr: string): void {
    this._createAndAddError(
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
      const testPerTask = Math.max(1, Math.round(this._tests.size / parallelizationLimit));

      const targetTaskCount = Math.min(tests.length, Math.max(1, Math.round(tests.length / testPerTask)));

      const buckets: AbstractTest[][] = [];

      for (let i = 0; i < targetTaskCount; ++i) {
        buckets.push([]);
      }

      for (let i = 0; i < tests.length; ++i) {
        buckets[i % buckets.length].push(tests[i]);
      }

      if (buckets.length > 1) {
        this.shared.log.info(
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
      if (charCount + test.id.length >= limit) {
        lastSet = [];
        subsets.push(lastSet);
        charCount = 0;
      }
      lastSet.push(test);
      charCount += test.id.length;
    }

    return subsets;
  }

  protected abstract _reloadChildren(cancellationFlag: CancellationFlag): Promise<void>;

  protected abstract _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[]): string[];

  private _getRunParams(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    return this.properties.prependTestRunningArgs.concat(this._getRunParamsInner(childrenToRun));
  }

  protected abstract _handleProcess(testRun: vscode.TestRun, runInfo: RunningExecutable): Promise<HandleProcessResult>;

  protected abstract _getDebugParamsInner(
    childrenToRun: readonly Readonly<AbstractTest>[],
    breakOnFailure: boolean,
  ): string[];

  public getDebugParams(childrenToRun: readonly Readonly<AbstractTest>[], breakOnFailure: boolean): string[] {
    return this.properties.prependTestRunningArgs.concat(this._getDebugParamsInner(childrenToRun, breakOnFailure));
  }

  public reloadTests(taskPool: TaskPool, cancellationFlag: CancellationFlag): Promise<void> {
    if (cancellationFlag.isCancellationRequested) return Promise.resolve();

    // mutually exclusive lock
    return this._execItem.busy(async () => {
      return taskPool.scheduleTask(async () => {
        if (cancellationFlag.isCancellationRequested) return Promise.resolve();

        this.shared.log.info('reloadTests', this.frameworkName, this.frameworkVersion, this.properties.path);

        const lastModiTime = await this._getModiTime();

        if (this._lastReloadTime === undefined || lastModiTime === undefined || this._lastReloadTime !== lastModiTime) {
          this._lastReloadTime = lastModiTime;

          const prevTests = this._tests;
          this._tests = new Map();
          this._execItem.clearError();

          await this._reloadChildren(cancellationFlag);

          for (const test of prevTests.values()) {
            if (!this._getTest(test.id)) this.removeTest(test);
          }
        } else {
          this.shared.log.debug('reloadTests was skipped due to mtime', this.properties.path);
        }
      });
    });
  }

  public async run(
    testRun: vscode.TestRun,
    testsToRun: TestsToRun,
    taskPool: TaskPool,
    cancellationToken: CancellationToken,
  ): Promise<void> {
    // DISABLED for now
    // try {
    //   await this.runTasks('beforeEach', taskPool, cancellationToken);
    //   //await this.reloadTests(taskPool, cancellationToken); // this might relod the test list if the file timestamp has changed
    // } catch (e) {
    //   //this.sentStaticErrorEvent(testRunId, collectChildrenToRun(), e);
    //   return;
    // }

    const testsToRunFinal: AbstractTest[] = [];

    for (const t of testsToRun.direct) {
      if (!t.hasStaticError) testsToRunFinal.push(t);
    }
    for (const t of testsToRun.parent) {
      if (t.hasStaticError || t.reportIfSkippedFirstOnly(testRun)) {
        /* skip */
      } else testsToRunFinal.push(t);
    }

    if (testsToRunFinal.length == 0) return;

    const buckets = this._splitTestSetForMultirunIfEnabled(testsToRunFinal);
    await Promise.allSettled(
      buckets.map(async (bucket: readonly AbstractTest[]) => {
        const smallerTestSet = this._splitTestsToSmallEnoughSubsets(bucket); //TODO:future merge with _splitTestSetForMultirunIfEnabled
        for (const testSet of smallerTestSet) await this._runInner(testRun, testSet, taskPool, cancellationToken);
      }),
    );
    try {
      await this.runTasks('afterEach', taskPool, cancellationToken);
    } catch (e) {
      //this.sentStaticErrorEvent(testRunId, collectChildrenToRun(), e);
    }
  }

  private _runInner(
    testRun: vscode.TestRun,
    testsToRun: readonly AbstractTest[],
    taskPool: TaskPool,
    cancellation: CancellationToken,
  ): Promise<void> {
    return this.properties.parallelizationPool.scheduleTask(async () => {
      const runIfNotCancelled = (): Promise<void> => {
        if (cancellation.isCancellationRequested) {
          this.shared.log.info('test was canceled:', this);
          return Promise.resolve();
        }
        return this._runProcess(testRun, testsToRun, cancellation);
      };

      try {
        return taskPool.scheduleTask(runIfNotCancelled);
      } catch (err) {
        if (isSpawnBusyError(err)) {
          this.shared.log.info('executable is busy, rescheduled: 2sec', err);

          return promisify(setTimeout)(2000).then(() => {
            taskPool.scheduleTask(runIfNotCancelled);
          });
        } else {
          throw err;
        }
      }
    });
  }

  private async _runProcess(
    testRun: vscode.TestRun,
    childrenToRun: readonly AbstractTest[],
    cancellationToken: CancellationToken,
  ): Promise<void> {
    const execParams = this._getRunParams(childrenToRun);

    this.shared.log.info('proc starting', this.properties.path, execParams);

    const runInfo = await RunningExecutable.create(
      new SpawnBuilder(this.properties.spawner, this.properties.path, execParams, this.properties.options, undefined),
      childrenToRun,
      cancellationToken,
    );

    testRun.appendOutput(runInfo.getProcStartLine());

    this.shared.log.info('proc started', runInfo.process.pid, this.properties.path, this.properties, execParams);

    runInfo.setPriorityAsync(this.shared.log);

    runInfo.process.on('error', (err: Error) => {
      this.shared.log.error('process error event:', err, this);
    });

    {
      let trigger: (cause: 'reschedule' | 'closed' | 'timeout') => void;

      const changeConn = this.shared.onDidChangeExecRunningTimeout(() => {
        trigger('reschedule');
      });

      runInfo.process.once('close', (...args) => {
        this.shared.log.info('proc close:', this.properties.path, args);
        trigger('closed');
      });

      const shedule = async (): Promise<void> => {
        const cause_1 = await new Promise<'reschedule' | 'closed' | 'timeout'>(resolve => {
          trigger = resolve;

          if (this.shared.execRunningTimeout !== null) {
            const elapsed = Date.now() - runInfo.startTime;
            const left = Math.max(0, this.shared.execRunningTimeout - elapsed);
            setTimeout(resolve, left, 'timeout');
          }
        });
        if (cause_1 === 'closed') {
          return Promise.resolve();
        } else if (cause_1 === 'timeout') {
          runInfo.killProcess(this.shared.execRunningTimeout);
          return Promise.resolve();
        } else if (cause_1 === 'reschedule') {
          return shedule();
        } else {
          throw new Error('unknown case: ' + cause_1);
        }
      };

      shedule().finally(() => {
        changeConn.dispose();
      });
    }

    try {
      const { unexpectedTests, expectedToRunAndFoundTests, leftBehindBuilder } = await this._handleProcess(
        testRun,
        runInfo,
      );
      const result = await runInfo.result;

      testRun.appendOutput(runInfo.getProcStopLine(result));

      if (result.value === ExecutableRunResultValue.Errored) {
        this.shared.log.warn(result.toString(), result, runInfo, this);
        testRun.appendOutput(runInfo.runPrefix + '❌ Executable run is finished with error.');
        testRun.appendOutput(
          runInfo.runPrefix + [runInfo.spawnBuilder.cmd, ...runInfo.spawnBuilder.args].map(x => `"${x}""`).join(' '),
        );
      }

      if (leftBehindBuilder) {
        debugAssert(!leftBehindBuilder.built, "if it is built it shouldn't be passed");
        switch (result.value) {
          case ExecutableRunResultValue.OK:
            {
              this.shared.log.errorS('builder should not left behind if no problem', this, leftBehindBuilder);
              leftBehindBuilder.addOutputLine(0, '❗️ Test run has been cancelled by user.');
              leftBehindBuilder.errored();
            }
            break;
          case ExecutableRunResultValue.CancelledByUser:
            {
              this.shared.log.info('Test run has been cancelled by user. ✋', leftBehindBuilder);
              leftBehindBuilder.addOutputLine(0, '❓ Test run has been cancelled by user.');
              leftBehindBuilder.errored();
            }
            break;
          case ExecutableRunResultValue.TimeoutByUser:
            {
              this.shared.log.info('Test has timed out. See `test.runtimeLimit` for details.', leftBehindBuilder);
              leftBehindBuilder.addOutputLine(0, '❗️ Test has timed out. See `test.runtimeLimit` for details.');
              leftBehindBuilder.errored();
            }
            break;
          case ExecutableRunResultValue.Errored:
            {
              this.shared.log.warn('Test has ended unexpectedly.', result, leftBehindBuilder);
              leftBehindBuilder.addOutputLine(0, '❗️ Test has ended unexpectedly: ' + result.toString());
              leftBehindBuilder.errored();
            }
            break;
        }
        leftBehindBuilder.build();
      }

      const hasMissingTest = expectedToRunAndFoundTests.length < runInfo.childrenToRun.length && result.Ok;
      const hasNewTest = unexpectedTests.length > 0;

      if (hasMissingTest || hasNewTest) {
        // exec probably has changed
        this.reloadTests(this.shared.taskPool, this.shared.cancellationFlag).catch((reason: Error) => {
          // Suite possibly deleted: It is a dead suite but this should have been handled elsewhere
          this.shared.log.error('reloading-error: ', reason);
        });
      }
    } catch (e) {
      debugBreak(); // we really shouldnt be here
      this.shared.log.exceptionS(e);
    } finally {
      this.shared.log.info('proc finished:', this.properties.path);
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
            const exitCode = await this.shared.executeTask(taskName, this.properties.varToValue, cancellationToken);

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

  public async resolveAndFindSourceFilePath(file: string | undefined): Promise<string | undefined> {
    if (typeof file != 'string') return undefined;

    let resolved = file;

    for (const m in this.properties.sourceFileMap) {
      resolved = resolved.replace(m, this.properties.sourceFileMap[m]); // Note: it just replaces the first occurence
    }

    resolved = await this.resolveText(resolved);
    resolved = pathlib.normalize(resolved);
    resolved = this._findFilePath(resolved);

    this.shared.log.debug('_resolveSourceFilePath:', file, '=>', resolved);

    return resolved;
  }

  private _findFilePath(path: string): string {
    if (pathlib.isAbsolute(path)) return path;

    const directoriesToCheck: string[] = [pathlib.dirname(this.properties.path)];

    const cwd = this.properties.options.cwd?.toString();

    if (cwd && !this.properties.path.startsWith(cwd)) directoriesToCheck.push(cwd);

    if (
      !this.properties.path.startsWith(this.shared.workspaceFolder.uri.fsPath) &&
      (!cwd || !cwd.startsWith(this.shared.workspaceFolder.uri.fsPath))
    )
      directoriesToCheck.push(this.shared.workspaceFolder.uri.fsPath);

    const found = getAbsolutePath(path, directoriesToCheck);

    return found || path;
  }

  public sendStaticEvents(
    _testRunId: string,
    _childrenToRun: readonly AbstractTest[],
    _staticEvent: unknown | undefined,
  ): void {
    // childrenToRun.forEach(test => {
    //   const testStaticEvent = test.getStaticEvent(testRunId);
    //   const event: TestEvent | undefined = staticEvent || testStaticEvent;
    //   if (event) {
    //     event.test = test;
    //     event.testRunId = testRunId;
    //     // we dont need to send events about ancestors: https://github.com/hbenl/vscode-test-explorer/issues/141
    //     // probably we dont need this either: this._shared.sendTestEvent(test!.getStartEvent());
    //     this._shared.sendTestRunEvent(event);
    //   }
    // });
  }

  // eslint-disable-next-line
  public sentStaticErrorEvent(testRunId: string, childrenToRun: readonly AbstractTest[], err: any): void {
    this.sendStaticEvents(testRunId, childrenToRun, {
      type: 'test',
      test: 'will be filled automatically',
      state: 'errored',
      message: err instanceof Error ? `⚡️ ${err.name}: ${err.message}` : inspect(err),
    });
  }

  protected processStdErr(testRun: vscode.TestRun, runPrefix: string, str: string): void {
    testRun.appendOutput(runPrefix + '⬇ std::cerr:\r\n');
    const indented = reindentStr(0, 2, str);
    testRun.appendOutput(indented.map(x => runPrefix + '> ' + x + '\r\n').join(''));
    testRun.appendOutput(runPrefix + '⬆ std::cerr\r\n');
  }
}

export interface HandleProcessResult {
  unexpectedTests: readonly Readonly<AbstractTest>[];
  expectedToRunAndFoundTests: readonly Readonly<AbstractTest>[];
  leftBehindBuilder?: Readonly<TestResultBuilder<AbstractTest>>;
}

class ExecutableGroup {
  public constructor(private readonly executable: AbstractExecutable) {}

  private _count = 0;
  private _item: vscode.TestItem | undefined = undefined;
  private _itemForStaticError: vscode.TestItem | undefined = undefined;
  // we need to be exclusive because we save prevTests
  private _lock = Promise.resolve();

  public set item(item: vscode.TestItem) {
    if (this.item && this.item !== item) {
      this.executable.shared.log.errorS('why do we have different executableItem');
      debugBreak('why are we here?');
    } else if (!this._item) {
      this._item = item;
      if (this._count > 0) this._item.busy = true;
    }
  }

  // makes the item spinning
  public busy(func: () => Promise<void>): Promise<void> {
    if (this._count++ === 0 && this._item) this._item.busy = true;

    return (this._lock = this._lock.then(func).finally(() => {
      if (--this._count === 0) {
        if (this._item) {
          this._item.busy = false;
        }
      }
    }));
  }

  public setError(label: string, message: string): void {
    const l = label + ': ' + message;
    if (this._item) {
      this._item.error = l;
      this.removeSpecialItem();
    } else {
      if (!this._itemForStaticError) {
        this._itemForStaticError = this.executable.shared.testItemCreator(
          this.executable.properties.path,
          this.executable.properties.path,
          undefined,
          undefined,
          undefined,
        );
        this.executable.shared.rootItems.add(this._itemForStaticError);
      }
      this._itemForStaticError.error = l;
    }
  }

  public clearError(): void {
    if (this._item) this._item.error = undefined;
    this.removeSpecialItem();
  }

  private removeSpecialItem(): void {
    if (this._itemForStaticError) {
      this.executable.shared.rootItems.delete(this._itemForStaticError.id);
      this._itemForStaticError = undefined;
    }
  }
}
