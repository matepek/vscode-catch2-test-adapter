import * as fs from 'fs';
import * as vscode from 'vscode';
import { promisify } from 'util';
import * as ansi from 'ansi-colors';

import { AbstractExecutable as AbstractExecutable, HandleProcessResult } from '../AbstractExecutable';
import { GoogleTestTest } from './GoogleTestTest';
import { RunnableProperties } from '../RunnableProperties';
import { WorkspaceShared } from '../WorkspaceShared';
import { RunningExecutable } from '../RunningExecutable';
import { AbstractTest } from '../AbstractTest';
import { CancellationFlag } from '../Util';
import { TestGrouping } from '../TestGroupingInterface';
import { TestResultBuilder } from '../TestResultBuilder';
import { XmlParser, XmlTag, XmlTagProcessor } from '../util/XmlParser';
import { LineProcessor, TextStreamParser } from '../util/TextStreamParser';
import { assert, debugBreak } from '../util/DevelopmentHelper';
import { pipeProcess2Parser } from '../util/ParserInterface';

export class GoogleTestExecutable extends AbstractExecutable {
  public constructor(shared: WorkspaceShared, execInfo: RunnableProperties, private readonly _argumentPrefix: string) {
    super(shared, execInfo, 'GoogleTest', undefined);
  }

  private getTestGrouping(): TestGrouping {
    if (this.properties.testGrouping) {
      return this.properties.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      grouping.groupByExecutable.groupByTags = { tags: [], tagFormat: '${tag}' };
      return grouping;
    }
  }

  //TODO:release streaming would be more efficient
  private async _reloadFromXml(xmlStr: string, _cancellationFlag: CancellationFlag): Promise<void> {
    const createAndAddTest = this._createAndAddTest;

    const parser = new XmlParser(
      this.shared.log,
      {
        onopentag(tag: XmlTag): void | XmlTagProcessor {
          switch (tag.name) {
            case 'testsuite':
              return new TestSuiteListingProcessor(tag.attribs, createAndAddTest);
            default:
              return;
          }
        },
      },
      error => {
        this.shared.log.error('reloadFromXml', error);
        throw error;
      },
    );

    parser.write(xmlStr);
    await parser.end();
  }

  private async _reloadFromString(stdOutStr: string, cancellationFlag: CancellationFlag): Promise<void> {
    const lines = stdOutStr.split(/\r?\n/);

    const testGroupRe = /^([A-z][\/A-z0-9_\-]*)\.(?:\s+(#\s+TypeParam(?:\(\))?\s+=\s*(.+)))?$/;
    const testRe = /^\s+([A-z0-9][\/A-z0-9_\-]*)(?:\s+(#\s+GetParam(?:\(\))?\s+=\s*(.+)))?$/;

    let lineCount = lines.length;

    while (lineCount > 0 && lines[lineCount - 1].match(testRe) === null) lineCount--;

    let lineNum = 0;

    // gtest_main.cc
    while (lineCount > lineNum && lines[lineNum].match(testGroupRe) === null) lineNum++;

    if (lineCount - lineNum === 0) throw Error('Wrong test list.');

    let testGroupMatch = lineCount > lineNum ? lines[lineNum].match(testGroupRe) : null;

    while (testGroupMatch) {
      lineNum++;

      const suiteName = testGroupMatch[1];
      const typeParam: string | undefined = testGroupMatch[3];

      let testMatch = lineCount > lineNum ? lines[lineNum].match(testRe) : null;

      while (testMatch) {
        if (cancellationFlag.isCancellationRequested) return;

        lineNum++;

        const testName = testMatch[1];
        const valueParam: string | undefined = testMatch[3];

        await this._createAndAddTest(testName, suiteName, undefined, undefined, typeParam, valueParam);

        testMatch = lineCount > lineNum ? lines[lineNum].match(testRe) : null;
      }

      testGroupMatch = lineCount > lineNum ? lines[lineNum].match(testGroupRe) : null;
    }
  }

  private readonly _createAndAddTest = async (
    testName: string,
    suiteName: string,
    file: string | undefined,
    line: string | undefined,
    typeParam: string | undefined,
    valueParam: string | undefined,
  ): Promise<GoogleTestTest> => {
    const resolvedFile = await this.resolveAndFindSourceFilePath(file);
    return this._createTreeAndAddTest(
      this.getTestGrouping(),
      testName,
      resolvedFile,
      [suiteName],
      undefined,
      (container: vscode.TestItemCollection) =>
        new GoogleTestTest(
          this.shared,
          this,
          container,
          testName,
          suiteName,
          typeParam,
          valueParam,
          resolvedFile,
          line,
        ),
      (test: GoogleTestTest) => test.update2(testName, suiteName, resolvedFile, line, typeParam, valueParam),
    );
  };

  protected async _reloadChildren(cancellationFlag: CancellationFlag): Promise<void> {
    const cacheFile = this.properties.path + '.TestMate.testListCache.xml';

    if (this.shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.properties.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this.shared.log.info('loading from cache: ', cacheFile);
          const xmlStr = await promisify(fs.readFile)(cacheFile, 'utf8');

          return await this._reloadFromXml(xmlStr, cancellationFlag);
        }
      } catch (e) {
        this.shared.log.info('coudnt use cache', e);
      }
    }

    const args = this.properties.prependTestListingArgs.concat([
      `--${this._argumentPrefix}list_tests`,
      `--${this._argumentPrefix}output=xml:${cacheFile}`,
    ]);

    this.shared.log.info('discovering tests', this.properties.path, args, this.properties.options.cwd);
    const googleTestListOutput = await this.properties.spawner.spawnAsync(
      this.properties.path,
      args,
      this.properties.options,
      30000,
    );

    if (googleTestListOutput.stderr && !this.properties.ignoreTestEnumerationStdErr) {
      this.shared.log.warn('reloadChildren -> googleTestListOutput.stderr: ', googleTestListOutput);
      return await this._createAndAddUnexpectedStdError(googleTestListOutput.stdout, googleTestListOutput.stderr);
    } else {
      const hasXmlFile = await promisify(fs.exists)(cacheFile);

      if (hasXmlFile) {
        const xmlStr = await promisify(fs.readFile)(cacheFile, 'utf8');

        const result = await this._reloadFromXml(xmlStr, cancellationFlag);

        if (!this.shared.enabledTestListCaching) {
          fs.unlink(cacheFile, (err: Error | null) => {
            err && this.shared.log.warn("Couldn't remove: ", cacheFile, err);
          });
        }

        return result;
      } else {
        this.shared.log.info(
          "Couldn't parse output file. Possibly it is an older version of Google Test framework. It is trying to parse the output",
        );

        try {
          return await this._reloadFromString(googleTestListOutput.stdout, cancellationFlag);
        } catch (e) {
          this.shared.log.info('GoogleTest._reloadFromStdOut error', e, googleTestListOutput);
          throw e;
        }
      }
    }
  }

  private _getRunParamsCommon(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    const execParams: string[] = [];

    const testNames = childrenToRun.map(c => c.id);

    execParams.push(`--${this._argumentPrefix}filter=` + testNames.join(':'));

    execParams.push(`--${this._argumentPrefix}also_run_disabled_tests`);

    if (this.shared.rngSeed !== null) {
      execParams.push(`--${this._argumentPrefix}shuffle`);
      execParams.push(
        `--${this._argumentPrefix}random_seed=` +
          (this.shared.rngSeed === 'time' ? '0' : this.shared.rngSeed.toString()),
      );
    }

    if (this.shared.googleTestGMockVerbose !== 'default') {
      execParams.push('--gmock_verbose=' + this.shared.googleTestGMockVerbose);
    }

    return execParams;
  }

  protected _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    return [`--${this._argumentPrefix}color=no`, ...this._getRunParamsCommon(childrenToRun)];
  }

  protected _getDebugParamsInner(childrenToRun: readonly Readonly<AbstractTest>[], breakOnFailure: boolean): string[] {
    const colouring = this.properties.enableDebugColouring ? 'yes' : 'no';
    const debugParams = [`--${this._argumentPrefix}color=${colouring}`, ...this._getRunParamsCommon(childrenToRun)];
    if (breakOnFailure) debugParams.push(`--${this._argumentPrefix}break_on_failure`);
    return debugParams;
  }

  protected async _handleProcess(testRun: vscode.TestRun, runInfo: RunningExecutable): Promise<HandleProcessResult> {
    const unexpectedTests: GoogleTestTest[] = [];
    const expectedToRunAndFoundTests: GoogleTestTest[] = [];
    const executable = this; //eslint-disable-line
    const log = this.shared.log;
    const data = { lastBuilder: undefined as TestResultBuilder | undefined };
    // we dont need this now: const rngSeed: number | undefined = typeof this._shared.rngSeed === 'number' ? this._shared.rngSeed : undefined;

    const parser = new TextStreamParser(this.shared.log, {
      async online(line: string): Promise<void | LineProcessor> {
        const beginMatch = testBeginRe.exec(line);
        if (beginMatch) {
          const testNameAsId = beginMatch[1];
          const testName = beginMatch[3];
          const suiteName = beginMatch[2];
          let test = executable._getTest<GoogleTestTest>(testNameAsId);
          if (!test) {
            log.info('TestCase not found in children', testNameAsId);
            test = await executable._createAndAddTest(testName, suiteName, undefined, undefined, undefined, undefined);
            unexpectedTests.push(test);
          } else {
            expectedToRunAndFoundTests.push(test);
          }
          data.lastBuilder = new TestResultBuilder(test, testRun, runInfo.runPrefix, false);
          return new TestCaseProcessor(executable.shared, testEndRe(test.id), data.lastBuilder);
        } else if (line.startsWith('[----------] Global test environment tear-down')) {
          return new NoOpLineProcessor();
        } else {
          if (
            line === '' ||
            ['Running main()', 'Note: Google Test filter =', '[==========]', '[----------]'].some(x =>
              line.startsWith(x),
            )
          ) {
            //skip
          } else {
            testRun.appendOutput(runInfo.runPrefix + line + '\r\n');
          }
        }
      },
    });

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

class TestSuiteListingProcessor implements XmlTagProcessor {
  constructor(
    attribs: Record<string, string>,
    private readonly create: (
      testName: string,
      suiteName: string,
      file: string | undefined,
      line: string | undefined,
      typeParam: string | undefined,
      valueParam: string | undefined,
    ) => Promise<GoogleTestTest>,
  ) {
    this.suiteName = attribs.name;
  }

  private suiteName: string | undefined = undefined;

  onopentag(tag: XmlTag): void {
    switch (tag.name) {
      case 'testcase': {
        assert(this.suiteName);
        assert(tag.attribs.name);
        this.create(
          tag.attribs.name,
          this.suiteName!,
          tag.attribs.file,
          tag.attribs.line,
          tag.attribs.type_param,
          tag.attribs.value_param,
        );
        return;
      }
      default:
        return;
    }
  }
}

///

// Remark: not necessarily starts like this so do not use: ^
const testBeginRe = /\[ RUN      \] ((.+)\.(.+))$/m;
// Ex: "Is True[       OK ] TestCas1.test5 (0 ms)"
// m[1] == '[       '
// m[2] == 'OK'
// m[3] == ' ] '
// m[4] == 'TestCas1.test5'
// m[5] == ' '
// m[6] == '(0 ms)'
// m[7] == '0'
// Ex.: "[  FAILED  ] Params2/Failing.Fails2/0, where GetParam() = 3 (0 ms)"
// m[1] == '[  '
// m[2] == 'FAILED'
// m[3] == '  ] '
// m[4] == 'Params2/Failing.Fails2/0'
// m[5] == ', where GetParam() = 3 '
// m[6] == '(0 ms)'
// m[7] == '0'
const testEndRe = (testId: string) =>
  new RegExp('(\\[\\s*)(\\S+)(\\s*\\] )(' + testId.replace('.', '\\.') + ')(.*)(\\(([0-9]+) ms\\))$');

///

class TestCaseSharedData {
  constructor(public readonly shared: WorkspaceShared, public readonly builder: TestResultBuilder) {}

  public gMockWarningCount = 0;
}

///

class TestCaseProcessor implements LineProcessor {
  constructor(shared: WorkspaceShared, private readonly testEndRe: RegExp, builder: TestResultBuilder) {
    this.testCaseShared = new TestCaseSharedData(shared, builder);
    builder.started();
  }

  private readonly testCaseShared: TestCaseSharedData;

  begin(line: string): void {
    const loc = TestResultBuilder.getLocationAtStr(
      this.testCaseShared.builder.test.file,
      this.testCaseShared.builder.test.line,
    );
    this.testCaseShared.builder.addOutputLine(ansi.bold(line) + loc);
  }

  online(line: string): void | true | LineProcessor {
    const testEndMatch = this.testEndRe.exec(line);

    if (testEndMatch) {
      const duration = Number(testEndMatch[7]);
      if (!Number.isNaN(duration)) this.testCaseShared.builder.setDurationMilisec(duration);
      const result = testEndMatch[2];

      let styleFunc = (s: string) => s;

      if (result === 'OK') {
        styleFunc = (s: string) => ansi.green(s);
        this.testCaseShared.builder.passed();
      } else if (result === 'FAILED') {
        styleFunc = (s: string) => ansi.red.bold(s);
        this.testCaseShared.builder.failed();
      } else if (result === 'SKIPPED') {
        this.testCaseShared.builder.skipped();
      } else {
        this.testCaseShared.shared.log.error('unexpected token:', line);
        this.testCaseShared.builder.errored();
      }

      if (this.testCaseShared.gMockWarningCount) {
        this.testCaseShared.builder.addOutputLine(
          1,
          '⚠️' + this.testCaseShared.gMockWarningCount + ' GMock warning(s) in the output!',
        );
      }

      this.testCaseShared.builder.build();

      this.testCaseShared.builder.addOutputLine(
        testEndMatch[1] +
          styleFunc(testEndMatch[2]) +
          testEndMatch[3] +
          testEndMatch[4] +
          testEndMatch[5] +
          ansi.grey(testEndMatch[6]),
        '',
      );

      return true;
    }

    const failureMatch = failureRe.exec(line);
    if (failureMatch) {
      const type = failureMatch[6] as FailureType;
      const file = failureMatch[2];
      const line = failureMatch[3];
      const fullMsg = failureMatch[5];

      this.testCaseShared.builder.addOutputLine(
        1,
        ansi.red(failureMatch[6]) +
          failureMatch[7] +
          TestResultBuilder.getLocationAtStr(failureMatch[2], failureMatch[3]),
      );

      switch (type) {
        case 'Failure':
        case 'error':
          return new FailureProcessor(this.testCaseShared, file, line, fullMsg);
        case 'EXPECT_CALL':
          return new ExpectCallProcessor(this.testCaseShared, file, line, fullMsg);
        default:
          this.testCaseShared.shared.log.errorS('assertion of gtest parser', line);
          break;
      }
    }
  }
}

// Ex:'/Users/mapek/private/vscode-catch2-test-adapter/test/cpp/gtest/gtest1.cpp:69: Failure blabla'
// m[1] == '/Users/mapek/private/vscode-catch2-test-adapter/test/cpp/gtest/gtest1.cpp:69'
// m[2] == '/Users/mapek/private/vscode-catch2-test-adapter/test/cpp/gtest/gtest1.cpp'
// m[3] == '69'
// m[4] == ': '
// m[5] == 'Failure bla bla'
// m[6] == 'Failure'
// m[7] == ' bla bla'
const failureRe = /^((.+)[:\(]([0-9]+)\)?)(: )((Failure|EXPECT_CALL|error)(.*))$/;
type FailureType = 'Failure' | 'EXPECT_CALL' | 'error';

///

class FailureProcessor implements LineProcessor {
  constructor(
    private readonly testCaseShared: TestCaseSharedData,
    private readonly file: string | undefined,
    private readonly line: string | undefined,
    private readonly fullMsg: string,
  ) {}

  private lines: string[] = [];

  online(line: string): void | false {
    if (acceptedAndDecoratedPrefixes.some(prefix => line.startsWith(prefix))) {
      if (isDecorationEnabled) {
        const first = line.indexOf(':');
        if (first != -1) {
          const value = line.substr(first + 1).trim();
          const decoratedValue = value ? ' `' + line.substr(first + 1).trim() + '`' : '';
          this.lines.push(line.substr(0, first + 1) + decoratedValue);
        } else {
          this.testCaseShared.shared.log.errorS("colon isn't found", line);
          this.lines.push(line);
        }
      } else {
        this.lines.push(line);
      }
    } else if (acceptedPrefixes.some(prefix => line.startsWith(prefix))) {
      this.lines.push(line);
    } else if (acceptedIncludes.some(inStr => line.includes(inStr))) {
      this.lines.push(line);
    } else if (line.startsWith('  ')) {
      this.lines.push(line); /* special prefix. This might cause some issue */
    } else {
      return false;
    }
  }

  end(): void {
    this.testCaseShared.builder.addOutputLine(2, ...this.lines);

    if (isDecorationEnabled) {
      this.testCaseShared.builder.addMarkdownMsg(
        this.file,
        this.line,
        `${isDecorationEnabled ? '### ' : ''}${this.fullMsg}:`,
        ...this.lines,
      );
    } else {
      this.testCaseShared.builder.addMessage(this.file, this.line, `# ${this.fullMsg}:`, ...this.lines);
    }
  }
}

const isDecorationEnabled = false;

const acceptedAndDecoratedPrefixes = [
  'Expected:',
  '  Actual:',
  'Value of:',
  'Which is:',
  '    Function call:',
  '         Expected:',
  '           Actual:',
  '          Returns:',
  'Expected equality of these values:',
  '  Expected arg #0:',
  '  Expected arg #1:',
  '  Expected arg #2:',
  '  Expected arg #3:',
  '  Expected arg #4:',
  '  Expected arg #5:',
  '  Expected arg #6:',
  '  Expected arg #7:',
  '  Expected arg #8:',
  '  Expected arg #9:',
  'element #',
];

const acceptedPrefixes = ['a substring of', 'Actual function call', 'Mock function call', 'The difference between'];

const acceptedIncludes = [' evaluates to ', ' is equal to '];
///

class ExpectCallProcessor implements LineProcessor {
  constructor(
    private readonly testCaseShared: TestCaseSharedData,
    private readonly file: string | undefined,
    private readonly line: string | undefined,
    // @ts-expect-error don't need it here, could be removed
    private readonly fullMsg: string,
  ) {}

  private expected = '';
  private actual: string[] = [];
  private readonly lines: string[] = [];

  online(line: string): void | false {
    if (!this.expected && line.startsWith('  Expected')) {
      this.expected = line;
    } else if (this.expected && !this.actual.length && line.trim().startsWith('Actual:')) {
      this.actual.push(line);
    } else if (this.expected && this.actual.length) {
      if (line.startsWith('  ')) {
        this.actual.push(line);
      } else {
        return false;
      }
    } else {
      this.testCaseShared.shared.log.debugS('unparsed EXPECT_CALL');
      debugBreak();
      return false;
    }

    this.lines.push(line);
  }

  end(): void {
    this.testCaseShared.builder.addOutputLine(2, ...this.lines);

    this.testCaseShared.builder.addMessage(this.file, this.line, this.expected, ...this.actual);
  }
}

///

class NoOpLineProcessor implements LineProcessor {
  constructor() {}

  online(_line: string): void {}
}
