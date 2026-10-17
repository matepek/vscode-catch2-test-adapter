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
import { LineProcessor, TextStreamParser } from '../../util/TextStreamParser';
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

  // `-ln` prints every test as `Group.Name`, space separated, on a single line without a trailing newline.
  // It carries no file/line and it cannot tell `IGNORE_TEST` apart from `TEST`.
  private async _reloadFromString(stdOutStr: string, cancellationFlag: CancellationFlag): Promise<void> {
    for (const entry of stdOutStr.split(/\s+/)) {
      if (cancellationFlag.isCancellationRequested) return;
      if (entry.length === 0) continue;

      const separatorIndex = entry.indexOf('.');
      if (separatorIndex < 1 || separatorIndex === entry.length - 1) {
        this.shared.log.warn('Unexpected CppUTest test listing entry', entry);
        continue;
      }

      await this._createAndAddTest(
        entry.substring(0, separatorIndex),
        entry.substring(separatorIndex + 1),
        false,
        undefined,
        undefined,
      );
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
    const data = { lastBuilder: undefined as TestResultBuilder | undefined };

    const parser = new TextStreamParser(
      this.shared.log,
      {
        async online(line: string): Promise<void | LineProcessor> {
          const beginMatch = testBeginRe.exec(line);

          if (beginMatch) {
            const isIgnored = beginMatch[1] === 'IGNORE_TEST';
            const group = beginMatch[2];
            const testName = beginMatch[3];
            const testNameAsId = CppUTestTest.calcId(group, testName);

            let test = executable._getTest(testNameAsId);
            if (!test) {
              log.info('TestCase not found in children', testNameAsId);
              test = await executable._createAndAddTest(group, testName, isIgnored, undefined, undefined);
              unexpectedTests.push(test);
            } else {
              expectedToRunAndFoundTests.push(test);
              // `-ln` cannot report which tests are `IGNORE_TEST`, only the run output can.
              if (isIgnored && !test.skipped) test.update2(test.label, true, test.file, test.line);
            }

            const builder = new TestResultBuilder(test, testRun, runInfo.runPrefix, true);
            data.lastBuilder = builder;
            builder.started();

            return new CppUTestCaseProcessor(executable, builder, test, isIgnored, beginMatch[4]);
          } else if (isUninterestingLine(line)) {
            if (!executable.shared.shared.hideUninterestingOutput)
              testRun.appendOutput(runInfo.runPrefix + line + '\r\n');
          } else {
            testRun.appendOutput(runInfo.runPrefix + line + '\r\n');
          }
        },
      },
      false,
    );

    await pipeProcess2Parser(runInfo, parser, (data: string) =>
      executable.processStdErr(testRun, runInfo.runPrefix, data),
    );

    const leftBehindBuilder = data.lastBuilder && !data.lastBuilder.built ? data.lastBuilder : undefined;

    return {
      unexpectedTests,
      expectedToRunAndFoundTests,
      leftBehindBuilder,
    };
  }
}

///

// `TEST(Group, name)` or `IGNORE_TEST(Group, name)`. Anything the test writes to stdout is glued
// to the end of this very line, so the remainder has to be processed too.
const testBeginRe = /^(TEST|IGNORE_TEST)\(([a-zA-Z_]\w*), ([a-zA-Z_]\w*)\)(.*)$/;
// ` - 12 ms` terminates a test. It can share the line with the begin marker, with the test's own
// output or with a `UT_PRINT`, hence the greedy prefix.
const testEndRe = /^(.*) - (\d+) ms$/;
// `/path/to/file.cpp:23: error: Failure in TEST(Group, name)`
const failureRe = /^(.+):(\d+): error: Failure in (?:IGNORE_)?TEST\([a-zA-Z_]\w*, [a-zA-Z_]\w*\)$/;
// Failures in `setup`, `teardown` or in a helper function add a second location line which is the
// actual assert location, the first one being the test's location.
const failureLocationRe = /^(.+):(\d+): error:$/;
const expectedRe = /^expected <(.*)>$/;
const butWasRe = /^but was\s+<(.*)>$/;
// `DOUBLES_EQUAL` appends a note after the value: `but was  <1.5> threshold used was <0.1>`.
// Requiring a space after the closing '>' keeps values which contain a '>' on the greedy branch.
const butWasWithNoteRe = /^but was\s+<(.*?)> (.+)$/;

const parseButWas = (line: string): { actual: string; note: string | undefined } | undefined => {
  const withNote = butWasWithNoteRe.exec(line);
  if (withNote) return { actual: withNote[1], note: withNote[2] };
  const plain = butWasRe.exec(line);
  if (plain) return { actual: plain[1], note: undefined };
  return undefined;
};
const summaryRe = /^(OK|Errors) \(.*\)$/;

const isUninterestingLine = (line: string): boolean =>
  line.length === 0 ||
  summaryRe.test(line) ||
  line.startsWith('Note: test run failed because no tests were run or ignored.') ||
  line.startsWith('Test order shuffling enabled with seed:');

interface CppUTestFailure {
  testFile: string | undefined;
  testLine: string;
  file: string | undefined;
  line: string;
  lines: string[];
}

///

class CppUTestCaseProcessor implements LineProcessor {
  constructor(
    private readonly executable: CppUTestExecutable,
    readonly builder: TestResultBuilder,
    private readonly test: CppUTestTest,
    private readonly isIgnored: boolean,
    private readonly beginLineRemainder: string,
  ) {}

  private _failure: CppUTestFailure | undefined = undefined;
  private _hasFailure = false;
  private _finished = false;

  async begin(_line: string): Promise<void> {
    // `begin` cannot retire the processor, so `online` has to hand the next line back to the root.
    await this._processLine(this.beginLineRemainder);
  }

  async online(line: string): Promise<void | boolean> {
    if (this._finished) return false;

    await this._processLine(line);

    return this._finished ? true : undefined;
  }

  private async _processLine(line: string): Promise<void> {
    const endMatch = testEndRe.exec(line);

    if (endMatch) {
      if (endMatch[1].length > 0) await this._processContentLine(endMatch[1]);
      await this._flushFailure();

      this.builder.setDurationMilisec(Number(endMatch[2]));
      if (this.isIgnored) this.builder.skipped();
      else if (this._hasFailure) this.builder.failed();
      else this.builder.passed();

      this.builder.build();
      this._finished = true;
    } else {
      await this._processContentLine(line);
    }
  }

  private async _processContentLine(line: string): Promise<void> {
    const failureMatch = failureRe.exec(line);

    if (failureMatch) {
      await this._flushFailure();

      const file = await this.executable.findSourceFilePath(failureMatch[1]);
      this._failure = { testFile: file, testLine: failureMatch[2], file, line: failureMatch[2], lines: [] };

      // Discovery (`-ln`) provides no location at all, so this is the only chance to get one.
      if (this.test.file === undefined && file !== undefined) await this.test.updateFL(file, failureMatch[2]);

      return;
    }

    if (this._failure) {
      if (this._failure.lines.length === 0) {
        const locationMatch = failureLocationRe.exec(line);
        if (locationMatch) {
          this._failure.file = await this.executable.findSourceFilePath(locationMatch[1]);
          this._failure.line = locationMatch[2];
          return;
        }
      }

      if (line.length === 0) {
        await this._flushFailure();
        return;
      }

      this._failure.lines.push(line.startsWith('\t') ? line.substring(1) : line);
      return;
    }

    this.builder.addReindentedOutput(1, line);
  }

  private async _flushFailure(): Promise<void> {
    const failure = this._failure;
    if (failure === undefined) return;
    this._failure = undefined;
    this._hasFailure = true;
    this.builder.failed();

    const lines = failure.lines;
    const diffIndex = lines.findIndex(
      (l, i) => expectedRe.test(l) && i + 1 < lines.length && parseButWas(lines[i + 1]) !== undefined,
    );

    if (diffIndex !== -1) {
      const expected = expectedRe.exec(lines[diffIndex])![1];
      const butWas = parseButWas(lines[diffIndex + 1])!;
      const titleLines = lines.slice(0, diffIndex);
      if (butWas.note) titleLines.push(butWas.note);
      const title = titleLines.length > 0 ? titleLines.join('\r\n') : 'Failure';

      await this.builder.addDiffMessage(failure.file, failure.line, title, expected, butWas.actual);
      await this.builder.addQuoteWithLocation(failure.file, failure.line, title, ...lines.slice(diffIndex));
    } else {
      const title = lines.length > 0 ? lines[0] : 'Failure';
      await this.builder.addMessageWithOutput(failure.file, failure.line, title, ...lines.slice(1));
    }
  }
}
