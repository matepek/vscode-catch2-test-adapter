import * as pathlib from 'path';
import * as fs from 'fs';

import { RunnableProperties } from './RunnableProperties';
import { AbstractTest } from './AbstractTest';
import { TaskPool } from './util/TaskPool';
import { WorkspaceShared } from './WorkspaceShared';
import { RunningRunnable } from './RunningRunnable';
import { promisify, inspect } from 'util';
import { Version, reverse, getAbsolutePath, CancellationToken, CancellationFlag, generateId } from './Util';
import {
  resolveOSEnvironmentVariables,
  createPythonIndexerForPathVariable,
  ResolveRuleAsync,
  resolveVariablesAsync,
} from './util/ResolveRule';
import { TestGrouping, GroupByExecutable, GroupByTagRegex, GroupByRegex } from './TestGroupingInterface';
import { EOL } from 'os';
import { isSpawnBusyError } from './util/FSWrapper';
import * as vscode from 'vscode';

export class TestsToRun {
  public readonly direct: AbstractTest[] = []; // test is drectly included, should be run even if it is skipped
  public readonly parent: AbstractTest[] = []; // tests included because one of the ascendant was directly included

  *[Symbol.iterator](): Iterator<AbstractTest> {
    for (const i of this.direct) yield i;
    for (const i of this.parent) yield i;
  }
}

export abstract class AbstractRunnable {
  public constructor(
    public readonly _shared: WorkspaceShared,
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

  private static _reportedFrameworks: string[] = [];

  protected _getGroupByExecutable(): GroupByExecutable {
    return {
      label: this.properties.name,
      description: this.properties.description,
    };
  }

  private _lastReloadTime: number | undefined = undefined;

  public get lastReloadTime(): number | undefined {
    return this._lastReloadTime;
  }

  private _tests = new Set<AbstractTest>();

  private _getOrCreateChildSuite(
    label: string,
    description: string,
    tooltip: string,
    childrenOfLevel: vscode.TestItemCollection,
  ): vscode.TestItemCollection {
    const found = childrenOfLevel.get(label);
    if (found) {
      return found.children;
    } else {
      const testItem = this._shared.testItemCreator(label, label, undefined, undefined, undefined);
      testItem.description = description;
      childrenOfLevel.add(testItem);
      return testItem.children;
    }
  }

  private async _resolveAndGetOrCreateChildSuite(
    childrenOfLevel: vscode.TestItemCollection,
    label: string,
    description: string | undefined,
    tooltip: string | undefined,
    varsToResolve: ResolveRuleAsync<string>[],
  ): Promise<vscode.TestItemCollection> {
    const resolvedLabel = await this._resolveText(label, ...varsToResolve);
    const resolvedDescr = description !== undefined ? await this._resolveText(description, ...varsToResolve) : '';
    const resolvedToolt = tooltip !== undefined ? await this._resolveText(tooltip, ...varsToResolve) : '';

    return this._getOrCreateChildSuite(resolvedLabel, resolvedDescr, resolvedToolt, childrenOfLevel);
  }

  private _updateVarsWithTags(tg: TestGrouping, tags: string[], tagsResolveRule: ResolveRuleAsync<string>): void {
    const tagVar = '${tag}';

    tagsResolveRule.rule = async (): Promise<string> => {
      let tagFormat = `[${tagVar}]`;
      if (tg.tagFormat !== undefined) {
        if (tg.tagFormat.indexOf(tagVar) === -1) {
          this._shared.log.warn(`tagFormat should contain "${tagVar}" substring`, tg.tagFormat);
        } else {
          tagFormat = tg.tagFormat;
        }
      }
      return tags.map(t => tagFormat.replace(tagVar, t)).join('');
    };
  }

  private static readonly _variableRe = /\$\{[^ ]*\}/;

  private async _resolveText(text: string, ...additionalVarToValue: readonly ResolveRuleAsync[]): Promise<string> {
    let resolvedText = text;
    try {
      resolvedText = await resolveVariablesAsync(resolvedText, this.properties.varToValue);

      resolvedText =
        additionalVarToValue.length > 0
          ? await resolveVariablesAsync(resolvedText, additionalVarToValue)
          : resolvedText;

      resolvedText = resolveOSEnvironmentVariables(resolvedText, false);

      if (resolvedText.match(AbstractRunnable._variableRe))
        this._shared.log.warn('Possibly unresolved variable', resolvedText, text, this);
    } catch (e) {
      this._shared.log.error('resolveText', text, e, this);
    }
    return resolvedText;
  }

  private static readonly _tagVar = '${tags}';

  protected async _createSubtreeAndAddTest(
    testGrouping: TestGrouping,
    testNameAsId: string,
    testName: string,
    file: string | undefined,
    line: number | undefined,
    tags: string[], // in case of google test it is the TestCase
    description: string | undefined,
    createTest: () => AbstractTest,
    updateTest: (test: AbstractTest) => void,
  ): Promise<void> {
    this._shared.log.info('testGrouping', testNameAsId);
    this._shared.log.debug('testGrouping', { testName, testNameAsId, file, tags, testGrouping });

    tags.sort();

    const tagsResolveRule: ResolveRuleAsync<string> = {
      resolve: AbstractRunnable._tagVar,
      rule: '', // will be filled soon enough
    };
    const sourceRelPath = file ? pathlib.relative(this._shared.workspaceFolder.uri.fsPath, file) : '';

    const varsToResolve = [
      tagsResolveRule,
      createPythonIndexerForPathVariable('sourceRelPath', sourceRelPath),
      createPythonIndexerForPathVariable('sourceAbsPath', file ? file : ''),
    ];

    let childrenOfLevel = this._shared.rootItems;
    let currentGrouping: TestGrouping = testGrouping;

    try {
      while (true) {
        if (currentGrouping.groupByExecutable) {
          const g = currentGrouping.groupByExecutable;
          this._updateVarsWithTags(g, tags, tagsResolveRule);

          const label = g.label !== undefined ? g.label : '${filename}';
          const description = g.description !== undefined ? g.description : '${relDirpath}${osPathSep}';

          childrenOfLevel = await this._resolveAndGetOrCreateChildSuite(
            childrenOfLevel,
            label,
            description,
            `Path: ${this.properties.path}\nCwd: ${this.properties.options.cwd}`,
            varsToResolve,
          );

          currentGrouping = g;
        } else if (currentGrouping.groupBySource) {
          const g = currentGrouping.groupBySource;
          this._updateVarsWithTags(g, tags, tagsResolveRule);

          if (file) {
            const label = g.label ? g.label : sourceRelPath;
            const description = g.description;

            childrenOfLevel = await this._resolveAndGetOrCreateChildSuite(
              childrenOfLevel,
              label,
              description,
              undefined,
              varsToResolve,
            );
          } else if (g.groupUngroupedTo) {
            childrenOfLevel = await this._resolveAndGetOrCreateChildSuite(
              childrenOfLevel,
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
                childrenOfLevel = await this._resolveAndGetOrCreateChildSuite(
                  childrenOfLevel,
                  g.label ? g.label : AbstractRunnable._tagVar,
                  g.description,
                  undefined,
                  varsToResolve,
                );
              } else if (g.groupUngroupedTo) {
                childrenOfLevel = await this._resolveAndGetOrCreateChildSuite(
                  childrenOfLevel,
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
                childrenOfLevel = await this._resolveAndGetOrCreateChildSuite(
                  childrenOfLevel,
                  g.label ? g.label : AbstractRunnable._tagVar,
                  g.description,
                  undefined,
                  varsToResolve,
                );
              } else if (g.groupUngroupedTo) {
                childrenOfLevel = await this._resolveAndGetOrCreateChildSuite(
                  childrenOfLevel,
                  g.groupUngroupedTo,
                  undefined,
                  undefined,
                  varsToResolve,
                );
              }
            }
          } else {
            this._shared.log.warn('groupByTags.tags should be an array of strings. Empty array is OK.', g.tags);
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

              const matchOn = groupType == 'groupByTagRegex' ? tags : [testName];

              let reIndex = 0;
              while (reIndex < g.regexes.length && match == null) {
                let tagIndex = 0;
                while (tagIndex < matchOn.length && match == null) {
                  match = matchOn[tagIndex++].match(g.regexes[reIndex]);
                }
                reIndex++;
              }

              if (match !== null) {
                this._shared.log.info(groupType + ' matched on', testName, g.regexes[reIndex - 1]);
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

                childrenOfLevel = await this._resolveAndGetOrCreateChildSuite(
                  childrenOfLevel,
                  label,
                  description,
                  undefined,
                  varsToResolve,
                );
              } else if (g.groupUngroupedTo) {
                childrenOfLevel = await this._resolveAndGetOrCreateChildSuite(
                  childrenOfLevel,
                  g.groupUngroupedTo,
                  undefined,
                  undefined,
                  varsToResolve,
                );
              }
            } else {
              this._shared.log.warn(groupType + '.regexes should be a non-empty array of strings.', g.regexes);
            }
          } else {
            this._shared.log.warn(groupType + ' missing "regexes": skipping grouping level');
          }
          currentGrouping = g;
        } else {
          break;
        }
      }
    } catch (e) {
      this._shared.log.exceptionS(e);
    }

    const uri = file ? vscode.Uri.file(file) : undefined;

    const createAndAddItem = () => {
      const test = createTest();
      childrenOfLevel.add(test.item);
      this._tests.add(test);
    };

    const found = childrenOfLevel.get(testNameAsId);

    if (found) {
      if (found.uri?.toString() !== uri?.toString()) {
        childrenOfLevel.delete(testNameAsId);
        createAndAddItem();
      } else {
        const test = this._shared.testItemMapper(found);
        if (!test) throw Error('missing test for item');

        this._tests.add(test);
        updateTest(test);
      }
    } else {
      createAndAddItem();
    }
  }

  private removeWithLeafAscendants(testItem: vscode.TestItem): void {
    if (testItem.children.size > 0) return;

    if (testItem.parent) {
      const parent = testItem.parent;
      parent.children.delete(testItem.id);
      this.removeWithLeafAscendants(parent);
    } else {
      this._shared.rootItems.delete(testItem.id);
    }
  }

  public removeTests(): void {
    this._tests.forEach(t => this.removeWithLeafAscendants(t.item));
    this._tests = new Set();
  }

  // protected _createError(title: string, message: string): (parent: Suite) => AbstractTest {
  //   return (parent: Suite): AbstractTest => {
  //     const shared = this._shared;
  //     const runnable = this as AbstractRunnable;
  //     const test = new (class extends AbstractTest {
  //       public constructor() {
  //         super(
  //           shared,
  //           runnable,
  //           parent,
  //           title,
  //           title,
  //           undefined,
  //           undefined,
  //           true,
  //           {
  //             state: 'errored',
  //             message,
  //           },
  //           [],
  //           '⚡️ Run me for details ⚡️',
  //           undefined,
  //           undefined,
  //         );
  //       }

  //       public compare(testNameAsId: string): boolean {
  //         return testNameAsId === testNameAsId;
  //       }

  //       public getDebugParams(): string[] {
  //         throw Error('assert');
  //       }

  //       public parseAndProcessTestCase(): AbstractTestEvent {
  //         throw Error('assert');
  //       }
  //     })();

  //     return test;
  //   };
  // }

  protected _createAndAddError(label: string, message: string): void {
    //TODO: create special node store and add error
    // return new RunnableReloadResult().add(
    //   ...(await this._createSubtreeAndAddTest(
    //     { groupByExecutable: this._getGroupByExecutable() },
    //     label,
    //     label,
    //     undefined,
    //     [],
    //     this._createError(label, message),
    //     () => false,
    //   )),
    // );
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
        charCount = 0;
      }
      lastSet.push(test);
      charCount += test.testNameAsId.length;
    }

    return subsets;
  }

  protected abstract _reloadChildren(cancellationFlag: CancellationFlag): Promise<void>;

  protected abstract _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[]): string[];

  private _getRunParams(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    return this.properties.prependTestRunningArgs.concat(this._getRunParamsInner(childrenToRun));
  }

  protected abstract _handleProcess(testRun: vscode.TestRun, runInfo: RunningRunnable): Promise<void>;

  protected abstract _getDebugParamsInner(
    childrenToRun: readonly Readonly<AbstractTest>[],
    breakOnFailure: boolean,
  ): string[];

  public getDebugParams(childrenToRun: readonly Readonly<AbstractTest>[], breakOnFailure: boolean): string[] {
    return this.properties.prependTestRunningArgs.concat(this._getDebugParamsInner(childrenToRun, breakOnFailure));
  }

  public reloadTests(taskPool: TaskPool, cancellationFlag: CancellationFlag): Promise<void> {
    if (cancellationFlag.isCancellationRequested) return Promise.resolve();

    return taskPool.scheduleTask(async () => {
      this._shared.log.info('reloadTests', this.frameworkName, this.frameworkVersion, this.properties.path);

      const lastModiTime = await this._getModiTime();

      if (this._lastReloadTime === undefined || lastModiTime === undefined || this._lastReloadTime !== lastModiTime) {
        this._lastReloadTime = lastModiTime;

        const prevTests = this._tests;
        this._tests = new Set();

        await this._reloadChildren(cancellationFlag);

        prevTests.forEach(test => {
          this._tests.has(test) || this.removeWithLeafAscendants(test.item);
        });
      } else {
        this._shared.log.debug('reloadTests was skipped due to mtime', this.properties.path);
      }
    });
  }

  public async run(
    testRun: vscode.TestRun,
    testsToRun: TestsToRun,
    taskPool: TaskPool,
    cancellationToken: CancellationToken,
  ): Promise<void> {
    try {
      await this.runTasks('beforeEach', taskPool, cancellationToken);
    } catch (e) {
      //this.sentStaticErrorEvent(testRunId, collectChildrenToRun(), e);
      return;
    }
    //await this.reloadTests(taskPool, cancellationToken); // this might relod the test list if the file timestamp has changed

    const testsToRunFinal: AbstractTest[] = [];

    for (const t of testsToRun.direct) {
      if (t.reportStaticErrorIfHave(testRun)) {
      } else testsToRunFinal.push(t);
    }
    for (const t of testsToRun.parent) {
      if (t.reportStaticErrorIfHave(testRun)) {
      } else if (t.skipped) {
        /* dont have to mark it as skipped testRun.skipped(t.item);*/
      } else testsToRunFinal.push(t);
    }

    if (testsToRunFinal.length == 0) return;

    const buckets = this._splitTestSetForMultirunIfEnabled(testsToRunFinal);
    await Promise.allSettled(
      buckets.map(async (bucket: readonly AbstractTest[]) => {
        const smallerTestSet = this._splitTestsToSmallEnoughSubsets(bucket); //TODO: merge with _splitTestSetForMultirunIfEnabled
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
    return this.properties.parallelizationPool.scheduleTask(() => {
      const runIfNotCancelled = (): Promise<void> => {
        if (cancellation.isCancellationRequested) {
          this._shared.log.info('test was canceled:', this);
          return Promise.resolve();
        }
        return this._runProcess(testRun, testsToRun, cancellation);
      };

      return taskPool.scheduleTask(runIfNotCancelled).catch((err: Error) => {
        if (isSpawnBusyError(err)) {
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

  private async _runProcess(
    testRun: vscode.TestRun,
    childrenToRun: readonly AbstractTest[],
    cancellationToken: CancellationToken,
  ): Promise<void> {
    const execParams = this._getRunParams(childrenToRun);

    this._shared.log.info('proc starting', this.properties.path, execParams);

    const runInfo = new RunningRunnable(
      await this.properties.spawner.spawn(this.properties.path, execParams, this.properties.options),
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

    return this._handleProcess(testRun, runInfo)
      .catch((reason: Error) => this._shared.log.exceptionS(reason))
      .finally(() => this._shared.log.info('proc finished:', this.properties.path));
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

  protected _findTest(pred: (t: AbstractTest) => boolean): AbstractTest | undefined {
    for (const t of this._tests) if (pred(t)) return t;
    return undefined;
  }

  protected async _resolveSourceFilePath(file: string | undefined): Promise<string | undefined> {
    if (typeof file != 'string') return undefined;

    let resolved = file;

    for (const m in this.properties.sourceFileMap) {
      resolved = resolved.replace(m, this.properties.sourceFileMap[m]); // Note: it just replaces the first occurence
    }

    resolved = await this._resolveText(resolved);
    resolved = this._findFilePath(resolved);

    this._shared.log.debug('_resolveSourceFilePath:', file, '=>', resolved);

    return resolved;
  }

  protected _findFilePath(matchedPath: string): string {
    if (pathlib.isAbsolute(matchedPath)) return matchedPath;

    const directoriesToCheck: string[] = [pathlib.dirname(this.properties.path)];

    const cwd = this.properties.options.cwd?.toString();

    if (cwd && !this.properties.path.startsWith(cwd)) directoriesToCheck.push(cwd);

    if (
      !this.properties.path.startsWith(this._shared.workspaceFolder.uri.fsPath) &&
      (!cwd || !cwd.startsWith(this._shared.workspaceFolder.uri.fsPath))
    )
      directoriesToCheck.push(this._shared.workspaceFolder.uri.fsPath);

    const found = getAbsolutePath(matchedPath, directoriesToCheck);

    return found || matchedPath;
  }

  public sendStaticEvents(
    testRunId: string,
    childrenToRun: readonly AbstractTest[],
    staticEvent: unknown | undefined,
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
}
