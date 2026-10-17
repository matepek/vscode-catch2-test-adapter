import * as vscode from 'vscode';
import * as fs from 'fs';
import { promisify } from 'util';

import { AbstractExecutable, HandleProcessResult } from '../AbstractExecutable';
import { CppUTestTest } from './CppUTestTest';
import { SharedVarOfExec } from '../SharedVarOfExec';
import { RunningExecutable } from '../../RunningExecutable';
import { AbstractTest } from '../AbstractTest';
import { CancellationFlag } from '../../Util';
import { TestGroupingConfig } from '../../TestGroupingInterface';
import { TestResultBuilder } from '../../TestResultBuilder';
import { TextStreamParser } from '../../util/TextStreamParser';
import {
  CppUTestEventHandler,
  CppUTestFailureInfo,
  CppUTestRunOutputParser,
  parseTestListOutput,
} from './CppUTestOutputParser';
import { TestItemParent } from '../../TestItemManager';
import { pipeProcess2Parser } from '../../util/ParserInterface';

export class CppUTestExecutable extends AbstractExecutable<CppUTestTest> {
  constructor(sharedVarOfExec: SharedVarOfExec) {
    super(sharedVarOfExec, 'CppUTest', undefined);
  }

  private getTestGrouping(): TestGroupingConfig {
    if (this.shared.testGrouping) {
      return this.shared.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      grouping.groupByExecutable.groupByTags = { tags: [], tagFormat: '${tag}' };
      return grouping;
    }
  }

  private readonly _createAndAddTest = async (
    group: string,
    testName: string,
    isSkipped: boolean,
    file: string | undefined,
    line: string | undefined,
  ): Promise<CppUTestTest> => {
    const resolvedFile = await this.findSourceFilePath(file);

    return this._createTreeAndAddTest(
      this.getTestGrouping(),
      CppUTestTest.calcId(group, testName),
      resolvedFile,
      line,
      [group],
      undefined,
      (parent: TestItemParent, label: string | undefined) =>
        new CppUTestTest(this, parent, group, testName, label ?? testName, isSkipped, resolvedFile, line),
      (test: CppUTestTest) => test.update2(test.label, isSkipped, resolvedFile, line),
    );
  };

  private async _reloadFromString(stdOutStr: string, cancellationFlag: CancellationFlag): Promise<void> {
    const { tests, malformed } = parseTestListOutput(stdOutStr);

    for (const entry of malformed) this.shared.log.warn('Unexpected CppUTest test listing entry', entry);

    for (const test of tests) {
      if (cancellationFlag.isCancellationRequested) return;
      await this._createAndAddTest(test.group, test.name, false, undefined, undefined);
    }
  }

  protected async _reloadChildren(cancellationFlag: CancellationFlag): Promise<void> {
    const cacheFile = this.shared.path + `.TestMate.testListCache.${this.shared.optionsHash}.txt`;

    if (this.shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.shared.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this.shared.log.info('loading from cache: ', cacheFile);
          const str = await promisify(fs.readFile)(cacheFile, 'utf8');

          return await this._reloadFromString(str, cancellationFlag);
        }
      } catch (e) {
        this.shared.log.info('coudnt use cache', e);
      }
    }

    const prependTestListingArgs = await Promise.all(this.shared.prependTestListingArgs.map(x => this.resolveText(x)));
    const args = prependTestListingArgs.concat(['-ln']);

    const pathForExecution = await this._getPathForExecution();
    this.shared.log.info('discovering tests', this.shared.path, pathForExecution, args, this.shared.options);
    const listOutput = await this.shared.spawnerForListing.spawnAsync(
      pathForExecution,
      args,
      this.shared.options,
      this.shared.execParsingTimeout,
    );

    if (listOutput.stderr && !this.shared.ignoreTestEnumerationStdErr) {
      this.shared.log.warn('reloadChildren -> cppUTestTestListOutput.stderr: ', listOutput);
      return await this._createAndAddUnexpectedStdError(listOutput.stdout, listOutput.stderr);
    } else {
      try {
        const result = await this._reloadFromString(listOutput.stdout, cancellationFlag);

        if (this.shared.enabledTestListCaching) {
          promisify(fs.writeFile)(cacheFile, listOutput.stdout).catch(err =>
            this.shared.log.warn('couldnt write cache file:', err),
          );
        }

        return result;
      } catch (e) {
        this.shared.log.info('CppUTest._reloadFromString error', e, listOutput);
        throw e;
      }
    }
  }

  private _getRunParamsCommon(childrenToRun: readonly Readonly<AbstractTest>[] | null): string[] {
    const execParams: string[] = [];

    if (this.shared.rngSeed !== null) {
      execParams.push('-s');
      // CppUTest rejects a seed of 0: `-s [randomizerSeed>0]`. Omitting it means a time based seed.
      if (this.shared.rngSeed !== 'time' && this.shared.rngSeed > 0) execParams.push(this.shared.rngSeed.toString());
    }

    if (childrenToRun !== null) {
      for (const child of childrenToRun) {
        execParams.push((child as CppUTestTest).runFilterArg);
      }
    }

    return execParams;
  }

  protected _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[] | null): string[] {
    return ['-v', ...this._getRunParamsCommon(childrenToRun)];
  }

  protected _getDebugParamsInner(
    childrenToRun: readonly Readonly<AbstractTest>[],
    _breakOnFailure: boolean, // CppUTest has no equivalent of `--gtest_break_on_failure`
  ): string[] {
    const debugParams = ['-v'];
    if (this.shared.enableDebugColouring) debugParams.push('-c');
    return debugParams.concat(this._getRunParamsCommon(childrenToRun));
  }

  protected async _handleProcess(testRun: vscode.TestRun, runInfo: RunningExecutable): Promise<HandleProcessResult> {
    const unexpectedTests: CppUTestTest[] = [];
    const expectedToRunAndFoundTests: CppUTestTest[] = [];
    const executable = this; //eslint-disable-line
    const log = this.shared.log;
    const data = {
      builder: undefined as TestResultBuilder | undefined,
      lastBuilder: undefined as TestResultBuilder | undefined,
      test: undefined as CppUTestTest | undefined,
    };

    const handler: CppUTestEventHandler = {
      async testStarted(group: string, name: string, isIgnored: boolean): Promise<void> {
        const testNameAsId = CppUTestTest.calcId(group, name);

        let test = executable._getTest(testNameAsId);
        if (!test) {
          log.info('TestCase not found in children', testNameAsId);
          test = await executable._createAndAddTest(group, name, isIgnored, undefined, undefined);
          unexpectedTests.push(test);
        } else {
          expectedToRunAndFoundTests.push(test);
          // `-ln` cannot report which tests are `IGNORE_TEST`, only the run output can.
          if (isIgnored && !test.skipped) test.update2(test.label, true, test.file, test.line);
        }

        const builder = new TestResultBuilder(test, testRun, runInfo.runPrefix, true);
        data.builder = builder;
        data.lastBuilder = builder;
        data.test = test;
        builder.started();
      },

      async testFailure(failure: CppUTestFailureInfo): Promise<void> {
        const builder = data.builder;
        if (builder === undefined) return;
        builder.failed();

        // Discovery (`-ln`) provides no location at all, so this is the only chance to get one.
        const test = data.test;
        if (test !== undefined && test.file === undefined) {
          const testFile = await executable.findSourceFilePath(failure.testFile);
          if (testFile !== undefined) await test.updateFL(testFile, failure.testLine);
        }

        if (failure.diff) {
          const titleLines = failure.message.slice(0, failure.diff.index);
          if (failure.diff.note) titleLines.push(failure.diff.note);
          const title = titleLines.length > 0 ? titleLines.join('\r\n') : 'Failure';

          await builder.addDiffMessage(failure.file, failure.line, title, failure.diff.expected, failure.diff.actual);
          await builder.addQuoteWithLocation(
            failure.file,
            failure.line,
            title,
            ...failure.message.slice(failure.diff.index),
          );
        } else {
          const title = failure.message.length > 0 ? failure.message[0] : 'Failure';
          await builder.addMessageWithOutput(failure.file, failure.line, title, ...failure.message.slice(1));
        }
      },

      testOutput(line: string): void {
        data.builder?.addReindentedOutput(1, line);
      },

      async testFinished(durationMilisec: number, isIgnored: boolean, hasFailure: boolean): Promise<void> {
        const builder = data.builder;
        data.builder = undefined;
        data.test = undefined;
        if (builder === undefined) return;

        builder.setDurationMilisec(durationMilisec);
        if (isIgnored) builder.skipped();
        else if (hasFailure) builder.failed();
        else builder.passed();

        builder.build();
      },

      rootOutput(line: string, isUninteresting: boolean): void {
        if (isUninteresting && executable.shared.shared.hideUninterestingOutput) return;
        testRun.appendOutput(runInfo.runPrefix + line + '\r\n');
      },
    };

    const runOutputParser = new CppUTestRunOutputParser(handler);

    const parser = new TextStreamParser(
      this.shared.log,
      {
        online: (line: string): Promise<void> => runOutputParser.online(line),
      },
      false,
    );

    await pipeProcess2Parser(runInfo, parser, (d: string) => executable.processStdErr(testRun, runInfo.runPrefix, d));

    const leftBehindBuilder = data.lastBuilder && !data.lastBuilder.built ? data.lastBuilder : undefined;

    return {
      unexpectedTests,
      expectedToRunAndFoundTests,
      leftBehindBuilder,
    };
  }
}
