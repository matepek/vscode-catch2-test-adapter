import * as pathlib from 'path';
import * as vscode from 'vscode';
import { EOL } from 'os';

import { SharedVarOfExec } from './SharedVarOfExec';
import { AbstractTest } from './AbstractTest';
import { TaskPool } from '../util/TaskPool';
import { ExecutableRunResultValue, RunningExecutable } from '../RunningExecutable';
import { promisify } from 'util';
import { Version, getAbsolutePath, CancellationToken, reindentStr, parseLine, getModiTime } from '../Util';
import {
  createPythonIndexerForPathVariable,
  resolveAllAsync,
  ResolveRuleAsync,
  resolveVariablesAsync,
} from '../util/ResolveRule';
import {
  TestGroupingConfig,
  GroupByExecutable,
  GroupByTagRegex,
  GroupByRegex,
  testGroupingForEach,
  GroupBySource,
  GroupByTags,
} from '../TestGroupingInterface';
import { isSpawnBusyError } from '../util/FSWrapper';
import { TestResultBuilder } from '../TestResultBuilder';
import { debugAssert, debugBreak } from '../util/DevelopmentHelper';
import { SpawnBuilder } from '../Spawner';
import { SharedTestTags } from './SharedTestTags';
import { Disposable } from '../Util';
import { FilePathResolver, TestItemParent } from '../TestItemManager';

///

export abstract class AbstractExecutable<TestT extends AbstractTest = AbstractTest>
  implements Disposable, FilePathResolver
{
  constructor(
    readonly shared: SharedVarOfExec,
    readonly frameworkName: string,
    readonly frameworkVersion: Version | undefined,
  ) {
    this._execItem = new ExecutableGroup(this);
    const versionStr = frameworkVersion ? frameworkVersion.toString() : 'unknown';

    const tags: Record<string, string> = {};
    tags[this.frameworkName] = `${this.frameworkName}@${versionStr}`;
    shared.log.setTags(tags);

    AbstractExecutable._reportedFrameworks.push(frameworkName);
  }

  readonly log = this.shared.log;

  dispose(): void {
    for (const test of this._tests.values()) {
      this.removeTest(test);
    }
  }

  private static _reportedFrameworks: string[] = [];

  protected _getGroupByExecutable(): GroupByExecutable {
    return {
      label: this.shared.name,
      description: this.shared.description,
    };
  }

  private _lastReloadTime: number | undefined = undefined;

  // don't use this directly because _addTest and _getTest can be overwritten
  private _tests = new Map<string /*id*/, AbstractTest>();

  protected _addTest(testId: string, test: AbstractTest): void {
    this._tests.set(testId, test);
  }

  protected _getTest(testId: string): TestT | undefined {
    return this._tests.get(testId) as TestT;
  }

  public getTests(): Iterable<AbstractTest> {
    return this._tests.values();
  }

  public hasTestItem(item: vscode.TestItem): boolean {
    if (this._execItem.getItem() === item) return true;
    const found = this._tests.get(item.id);
    if (found?.item === item) return true;
    for (const test of this._tests.values()) {
      const found = test.hasSubTestItem(item);
      if (found) return true;
    }
    return false;
  }

  private async _getOrCreateChildGroup(
    idIn: string | undefined,
    label: string,
    description: string,
    itemOfLevel: vscode.TestItem | undefined,
    resolvedFile: string | undefined, // sets file only if not exists. can be misleading but we don't know better
    line: undefined | string | number,
  ): Promise<vscode.TestItem> {
    const childrenOfLevel = this.shared.testController.getChildCollection(itemOfLevel);
    const id = idIn ?? label;
    const found = childrenOfLevel.get(id);
    if (found) {
      return found;
    } else {
      const testItem = await this.shared.testController.createOrReplace(
        itemOfLevel,
        id,
        label,
        resolvedFile,
        line,
        undefined,
      );
      testItem.description = description;
      testItem.tags = SharedTestTags.groupArray;
      return testItem;
    }
  }

  private async _resolveAndGetOrCreateChildGroup(
    itemOfLevel: vscode.TestItem | undefined,
    id: string | undefined,
    label: string,
    description: string | undefined,
    varsToResolve: ResolveRuleAsync<string>[],
    resolvedFile?: string | undefined,
    line?: undefined | string | number,
  ): Promise<vscode.TestItem> {
    const resolvedLabel = await this.resolveText(label, ...varsToResolve);
    const resolvedDescr = description !== undefined ? await this.resolveText(description, ...varsToResolve) : '';

    return this._getOrCreateChildGroup(id, resolvedLabel, resolvedDescr, itemOfLevel, resolvedFile, line);
  }

  private _updateVarsWithTags(tg: TestGroupingConfig, tags: string[], tagsResolveRule: ResolveRuleAsync<string>): void {
    const tagVar = '${tag}';

    tagsResolveRule.rule = async (): Promise<string> => {
      let tagFormat = `${tagVar}`;
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

  async resolveText(text: string, ...additionalVarToValue: readonly ResolveRuleAsync[]): Promise<string> {
    let resolvedText = text;
    try {
      const varToValue =
        additionalVarToValue.length > 0 ? [...this.shared.varToValue, ...additionalVarToValue] : this.shared.varToValue;
      resolvedText = await resolveAllAsync(resolvedText, varToValue, false);

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

  public getExecTestItem(): vscode.TestItem | undefined {
    return this._execItem.getItem();
  }

  protected async _createTreeAndAddTest(
    testGrouping: TestGroupingConfig,
    testId: string,
    resolvedFile: string | undefined,
    lineInFile: string | undefined,
    tags: string[], // in case of google test it is the TestCase
    _description: string | undefined, // currently we don't use it for subtree creation
    createTest: (parent: TestItemParent) => TestT,
    updateTest: (test: TestT) => void,
  ): Promise<TestT> {
    this.shared.log.info('testGrouping', { testId, resolvedFile, tags, testGrouping });

    tags.sort();

    const aboveLineInFile = parseLine(lineInFile, undefined, -1);

    const tagsResolveRule: ResolveRuleAsync<string> = {
      resolve: AbstractExecutable._tagVar,
      rule: '', // will be filled soon enough
    };
    const sourceRelPath = resolvedFile ? pathlib.relative(this.shared.workspaceFolder.uri.fsPath, resolvedFile) : '';

    const varsToResolve = [
      tagsResolveRule,
      createPythonIndexerForPathVariable('sourceRelPath', sourceRelPath),
      createPythonIndexerForPathVariable('sourceAbsPath', resolvedFile ? resolvedFile : ''),
    ];

    // undefined means root
    let itemOfLevel: vscode.TestItem | undefined = undefined;

    try {
      const groupByTagRegexOrRegex = async (
        groupType: 'groupByTagRegex' | 'groupByRegex',
        g: GroupByTagRegex | GroupByRegex,
      ): Promise<void> => {
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
                    lowerMatchGroup.substring(0, 1).toUpperCase() + lowerMatchGroup.substring(1),
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
                varsToResolve,
                resolvedFile,
                aboveLineInFile,
              );
            } else if (g.groupUngroupedTo) {
              itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
                itemOfLevel,
                undefined,
                g.groupUngroupedTo,
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
      };

      await testGroupingForEach(testGrouping, {
        groupByExecutable: async (g: GroupByExecutable): Promise<void> => {
          this._updateVarsWithTags(g, tags, tagsResolveRule);

          const optionHash = this.shared.optionsHash;
          const id = (g.mergeByLabel === true ? '' : this.shared.path) + `#${optionHash}`;
          const label = g.label ?? '${filename}';
          const description = g.description ?? '${relDirpath}${osPathSep}';

          itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
            itemOfLevel,
            id,
            label,
            description,
            varsToResolve,
            undefined,
            undefined,
          );

          // special item handling for exec
          this._execItem.setItem(itemOfLevel);
        },
        groupBySource: async (g: GroupBySource): Promise<void> => {
          this._updateVarsWithTags(g, tags, tagsResolveRule);

          if (resolvedFile) {
            const id = resolvedFile;
            const label = g.label ?? '${sourceRelPath[-1]}';
            const description = g.description ?? '${sourceRelPath[0:-1]}';

            itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
              itemOfLevel,
              id,
              label,
              description,
              varsToResolve,
              resolvedFile,
              aboveLineInFile,
            );
          } else if (g.groupUngroupedTo) {
            itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
              itemOfLevel,
              undefined,
              g.groupUngroupedTo,
              undefined,
              varsToResolve,
            );
          }
        },
        groupByTags: async (g: GroupByTags): Promise<void> => {
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
                  g.label ?? AbstractExecutable._tagVar,
                  g.description,
                  varsToResolve,
                  resolvedFile,
                  aboveLineInFile,
                );
              } else if (g.groupUngroupedTo) {
                itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
                  itemOfLevel,
                  undefined,
                  g.groupUngroupedTo,
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
                  g.label ?? AbstractExecutable._tagVar,
                  g.description,
                  varsToResolve,
                  resolvedFile,
                  aboveLineInFile,
                );
              } else if (g.groupUngroupedTo) {
                itemOfLevel = await this._resolveAndGetOrCreateChildGroup(
                  itemOfLevel,
                  undefined,
                  g.groupUngroupedTo,
                  undefined,
                  varsToResolve,
                );
              }
            }
          } else {
            this.shared.log.warn('groupByTags.tags should be an array of strings. Empty array is OK.', g.tags);
          }
        },
        groupByTagRegex: async (g: GroupByTagRegex): Promise<void> => groupByTagRegexOrRegex('groupByTagRegex', g),
        groupByRegex: async (g: GroupByRegex): Promise<void> => groupByTagRegexOrRegex('groupByRegex', g),
      });
    } catch (e) {
      this.shared.log.exceptionS(e);
    }

    const found = this.shared.testController.getChildCollection(itemOfLevel).get(testId);

    if (found) {
      const test = this.shared.testController.map(found) as TestT;
      if (!test) throw Error('missing test for item');
      updateTest(test);
      this._addTest(test.id, test);
      return test;
    } else {
      const test = createTest(itemOfLevel);
      this._addTest(test.id, test);
      return test;
    }
  }

  private removeWithLeafAscendants(testItem: vscode.TestItem, evenIfHasChildren = false): void {
    if (!evenIfHasChildren && testItem.children.size > 0) return;

    const parent = testItem.parent;
    this.shared.testController.getChildCollection(parent).delete(testItem.id);

    if (parent) {
      this.removeWithLeafAscendants(parent);
    }
  }

  private removeTest(test: AbstractTest): void {
    this.removeWithLeafAscendants(test.item, true);
  }

  protected async _createAndAddError(label: string, message: string): Promise<void> {
    await this._execItem.setError(label, message);
  }

  protected async _createAndAddUnexpectedStdError(stdout: string, stderr: string): Promise<void> {
    await this._createAndAddError(
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

  private _splitTestSetForMultirunIfEnabled(tests: readonly AbstractTest[]): (readonly AbstractTest[])[] {
    const parallelizationLimit = this.shared.parallelizationPool.maxTaskCount;

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

  protected abstract _reloadChildren(cancellationToken: CancellationToken): Promise<void>;

  protected abstract _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[]): string[];

  private _getRunParams(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    return this.shared.prependTestRunningArgs.concat(this._getRunParamsInner(childrenToRun));
  }

  protected abstract _handleProcess(testRun: vscode.TestRun, runInfo: RunningExecutable): Promise<HandleProcessResult>;

  protected abstract _getDebugParamsInner(
    childrenToRun: readonly Readonly<AbstractTest>[],
    breakOnFailure: boolean,
  ): string[];

  /**
   * Can be overridden, some cases make it necessary
   */
  protected _splitTests(tests: readonly AbstractTest[]): (readonly AbstractTest[])[] {
    return [tests];
  }

  getDebugParams(childrenToRun: readonly Readonly<AbstractTest>[], breakOnFailure: boolean): string[] {
    return this.shared.prependTestRunningArgs.concat(this._getDebugParamsInner(childrenToRun, breakOnFailure));
  }

  reloadTests(taskPool: TaskPool, cancellationToken: CancellationToken, lastModiTime?: number): Promise<void> {
    if (cancellationToken.isCancellationRequested) return Promise.resolve();

    // mutually exclusive lock
    return this._execItem.busy(async () => {
      return taskPool.scheduleTask(async () => {
        if (cancellationToken.isCancellationRequested) return Promise.resolve();

        this.shared.log.info('reloadTests', this.frameworkName, this.frameworkVersion, this.shared.path);

        lastModiTime = lastModiTime ?? (await getModiTime(this.shared.path));

        if (this._lastReloadTime === undefined || lastModiTime === undefined || this._lastReloadTime < lastModiTime) {
          this._lastReloadTime = lastModiTime;

          const prevTests = this._tests;
          this._tests = new Map();
          this._execItem.clearError();

          await this._reloadChildren(cancellationToken);

          for (const test of prevTests.values()) {
            if (!this._getTest(test.id)) this.removeTest(test);
          }
        } else {
          this.shared.log.debug('reloadTests was skipped due to mtime', this.shared.path);
        }
      });
    });
  }

  async run(
    testRun: vscode.TestRun,
    testsToRun: TestsToRun,
    taskPool: TaskPool,
    cancellationToken: CancellationToken,
  ): Promise<void> {
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

    try {
      await this.runTasks('beforeEach', taskPool, cancellationToken);
      //TODO:future: test list might changes: await this.reloadTests(taskPool, cancellationToken);
      // that case the testsToRunFinal should be after this block
    } catch (e) {
      const msg = e.toString();
      testRun.appendOutput(msg);
      const errorMsg = new vscode.TestMessage(msg);
      for (const test of testsToRun) {
        testRun.errored(test.item, errorMsg);
      }
      return;
    }

    const splittedForFramework = this._splitTests(testsToRunFinal);
    const splittedForMultirun = splittedForFramework.flatMap(v => this._splitTestSetForMultirunIfEnabled(v));
    const splittedFinal = splittedForMultirun.flatMap(b => this._splitTestsToSmallEnoughSubsets(b)); //TODO:future merge with _splitTestSetForMultirunIfEnabled

    const runningBucketPromises = splittedFinal.map(b =>
      this._runInner(testRun, b, taskPool, cancellationToken).catch(err => {
        vscode.window.showWarningMessage(err.toString());
      }),
    );

    await Promise.allSettled(runningBucketPromises);

    try {
      await this.runTasks('afterEach', taskPool, cancellationToken);
    } catch (e) {
      const msg = e.toString();
      testRun.appendOutput(msg);
      const errorMsg = new vscode.TestMessage(msg);
      for (const test of testsToRun) {
        testRun.errored(test.item, errorMsg);
      }
      return;
    }
  }

  private _runInner(
    testRun: vscode.TestRun,
    testsToRun: readonly AbstractTest[],
    taskPool: TaskPool,
    cancellation: CancellationToken,
  ): Promise<void> {
    return this.shared.parallelizationPool.scheduleTask(async () => {
      const runIfNotCancelled = (): Promise<void> => {
        if (cancellation.isCancellationRequested) {
          this.shared.log.info('test was canceled:', this);
          return Promise.resolve();
        }
        return this._runProcess(testRun, testsToRun, cancellation);
      };

      try {
        return await taskPool.scheduleTask(runIfNotCancelled);
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

    this.shared.log.info('proc starting', this.shared.path, execParams);

    const runInfo = await RunningExecutable.create(
      new SpawnBuilder(this.shared.spawner, this.shared.path, execParams, this.shared.options, undefined),
      childrenToRun,
      cancellationToken,
    );

    testRun.appendOutput(runInfo.getProcStartLine());

    this.shared.log.info('proc started', runInfo.process.pid, this.shared.path, this.shared, execParams);

    runInfo.setPriorityAsync(this.shared.log);

    runInfo.process.on('error', (err: Error) => {
      this.shared.log.error('process error event:', err, this);
    });

    {
      let trigger: (cause: 'reschedule' | 'closed' | 'timeout') => void;

      const changeConn = this.shared.shared.onDidChangeExecRunningTimeout(() => {
        trigger('reschedule');
      });

      runInfo.process.once('close', (...args) => {
        this.shared.log.info('proc close:', this.shared.path, args);
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
        this.reloadTests(this.shared.taskPool, this.shared.cancellationToken).catch((reason: Error) => {
          // Suite possibly deleted: It is a dead suite but this should have been handled elsewhere
          this.shared.log.error('reloading-error: ', reason);
        });
      }
    } catch (e) {
      debugBreak(); // we really shouldnt be here
      this.shared.log.exceptionS(e);
    } finally {
      this.shared.log.info('proc finished:', this.shared.path);
    }
  }

  async runTasks(
    type: 'beforeEach' | 'afterEach',
    taskPool: TaskPool,
    cancellationToken: CancellationToken,
  ): Promise<void> {
    if (this.shared.runTask[type]?.length) {
      return taskPool.scheduleTask(async () => {
        try {
          // sequential execution of tasks
          for (const taskName of this.shared.runTask[type] || []) {
            const exitCode = await this.shared.executeTask(taskName, this.shared.varToValue, cancellationToken);

            if (exitCode !== undefined) {
              if (exitCode !== 0) {
                throw Error(`Task "${taskName}" has returned with exitCode(${exitCode}) != 0.`);
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

  findSourceFilePath(file: string | undefined): string | undefined {
    if (typeof file != 'string') return undefined;

    // normalize before apply resolvedSourceFileMap because it is normalize too
    // this is for better platfrom independent resolution
    let resolved = pathlib.normalize(file);

    for (const m in this.shared.resolvedSourceFileMap) {
      resolved = resolved.replace(m, this.shared.resolvedSourceFileMap[m]); // Note: it just replaces the first occurence
    }

    resolved = this._findFilePath(resolved);

    this.shared.log.debug('findSourceFilePath:', file, '=>', resolved);

    resolved = pathlib.normalize(resolved);

    return resolved;
  }

  private _findFilePath(path: string): string {
    if (pathlib.isAbsolute(path)) return path;

    const directoriesToCheck: string[] = [pathlib.dirname(this.shared.path)];

    const cwd = this.shared.options.cwd?.toString();

    if (cwd && !this.shared.path.startsWith(cwd)) {
      directoriesToCheck.push(cwd);
    }

    if (
      !this.shared.path.startsWith(this.shared.workspaceFolder.uri.fsPath) &&
      (!cwd || !cwd.startsWith(this.shared.workspaceFolder.uri.fsPath))
    )
      directoriesToCheck.push(this.shared.workspaceFolder.uri.fsPath);

    const found = getAbsolutePath(path, directoriesToCheck);

    return found || path;
  }

  protected processStdErr(testRun: vscode.TestRun, runPrefix: string, str: string): void {
    testRun.appendOutput(runPrefix + '⬇ std::cerr:\r\n');
    const indented = reindentStr(0, 2, str);
    testRun.appendOutput(indented.map(x => runPrefix + x + '\r\n').join(''));
    testRun.appendOutput(runPrefix + '⬆ std::cerr\r\n');
  }
}

export interface HandleProcessResult {
  unexpectedTests: readonly Readonly<AbstractTest>[];
  expectedToRunAndFoundTests: readonly Readonly<AbstractTest>[];
  leftBehindBuilder?: Readonly<TestResultBuilder<AbstractTest>>;
}

class ExecutableGroup {
  constructor(private readonly executable: AbstractExecutable<AbstractTest>) {}

  private _busyCounter = 0;
  private _item: vscode.TestItem | undefined | null = undefined;
  private _itemForStaticError: vscode.TestItem | undefined = undefined;
  // we need to be exclusive because we save prevTests
  private _lock = Promise.resolve();

  getItem(): vscode.TestItem | undefined {
    return this._item ?? undefined;
  }

  setItem(item: vscode.TestItem) {
    if (this._item !== undefined) {
      if (this._item !== null && this._item !== item) {
        this._item = null;
      }
    } else {
      this._item = item;
      if (this._busyCounter > 0) this._item.busy = true;
    }
  }

  // makes the item spinning
  busy(func: () => Promise<void>): Promise<void> {
    if (this._busyCounter++ === 0 && this._item) this._item.busy = true;

    return (this._lock = this._lock.then(func).finally(() => {
      if (--this._busyCounter === 0) {
        if (this._item) {
          this._item.busy = false;
        }
      }
    }));
  }

  async setError(label: string, message: string): Promise<void> {
    const l = label + ': ' + message;
    if (this._item) {
      this._item.error = l;
      this.removeSpecialItem();
    } else {
      if (!this._itemForStaticError) {
        this._itemForStaticError = await this.executable.shared.testController.createOrReplace(
          undefined,
          this.executable.shared.path,
          this.executable.shared.path,
          undefined,
          undefined,
          undefined,
        );
      }
      this._itemForStaticError.error = l;
    }
  }

  clearError(): void {
    if (this._item) this._item.error = undefined;
    this.removeSpecialItem();
  }

  private removeSpecialItem(): void {
    if (this._itemForStaticError) {
      this.executable.shared.testController
        .getChildCollection(this._itemForStaticError.parent)
        .delete(this._itemForStaticError.id);
      this._itemForStaticError = undefined;
    }
  }
}

///

export class TestsToRun {
  readonly direct: AbstractTest[] = []; // test is drectly included, should be run even if it is skipped
  readonly parent: AbstractTest[] = []; // tests included because one of the ascendant was directly included

  *[Symbol.iterator](): Iterator<AbstractTest> {
    for (const i of this.direct) yield i;
    for (const i of this.parent) yield i;
  }
}
