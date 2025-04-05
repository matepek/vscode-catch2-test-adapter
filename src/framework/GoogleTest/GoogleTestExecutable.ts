import * as fs from 'fs';
import * as vscode from 'vscode';
import { promisify } from 'util';
import * as ansi from 'ansi-colors';

import { AbstractExecutable as AbstractExecutable, HandleProcessResult } from '../AbstractExecutable';
import { GoogleTestTest } from './GoogleTestTest';
import { SharedVarOfExec } from '../SharedVarOfExec';
import { RunningExecutable } from '../../RunningExecutable';
import { AbstractTest } from '../AbstractTest';
import { CancellationToken } from '../../Util';
import { TestGroupingConfig } from '../../TestGroupingInterface';
import { TestResultBuilder } from '../../TestResultBuilder';
import { XmlParser, XmlTag, XmlTagProcessor } from '../../util/XmlParser';
import { LambdaLineProcessor, LineProcessor, NoOpLineProcessor, TextStreamParser } from '../../util/TextStreamParser';
import { assert, debugBreak } from '../../util/DevelopmentHelper';
import { TestItemParent } from '../../TestItemManager';
import { pipeOutputStreams2Parser, pipeOutputStreams2String, pipeProcess2Parser } from '../../util/ParserInterface';
import { Readable } from 'stream';

export class GoogleTestExecutable extends AbstractExecutable<GoogleTestTest> {
  constructor(
    sharedVarOfExec: SharedVarOfExec,
    private readonly _argumentPrefix: string,
  ) {
    super(sharedVarOfExec, 'GoogleTest', undefined);
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

  private async _reloadFromXml(xmlStream: Readable, _cancellationToken: CancellationToken): Promise<void> {
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

    await pipeOutputStreams2Parser(xmlStream, undefined, parser, undefined);
  }

  private static readonly testGroupRe = /^([A-z][\/A-z0-9_\-]*)\.(?:\s+(#\s+TypeParam(?:\(\))?\s+=\s*(.+)))?$/;
  private static readonly testRe = /^\s+([A-z0-9][\/A-z0-9_\-]*)(?:\s+(#\s+GetParam(?:\(\))?\s+=\s*(.+)))?$/;

  private async _reloadFromString(
    stdout: Readable | string,
    stderr: Readable | string,
    _cancellationToken: CancellationToken,
  ): Promise<void> {
    let testGroupM: RegExpMatchArray | null = null;
    const createAndAddTest = this._createAndAddTest;

    const parser = new TextStreamParser(this.shared.log, {
      async online(line: string): Promise<void> {
        const newTestGroupM = line.match(GoogleTestExecutable.testGroupRe);
        if (newTestGroupM !== null) {
          testGroupM = newTestGroupM;
          return;
        }

        if (testGroupM === null) return;

        const testM = line.match(GoogleTestExecutable.testRe);
        if (testM) {
          const suiteName = testGroupM[1];
          const typeParam: string | undefined = testGroupM[3];

          const testName = testM[1];
          const valueParam: string | undefined = testM[3];

          await createAndAddTest(testName, suiteName, undefined, undefined, typeParam, valueParam);
        }
      },
    });

    if (typeof stdout === 'string') {
      parser.write(stdout);
      parser.writeStdErr(stderr as string);
      await parser.end();
    } else {
      await pipeOutputStreams2Parser(stdout, stderr as Readable, parser, undefined);
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
    const resolvedFile = this.findSourceFilePath(file);
    const id = suiteName + '.' + testName;
    // gunit
    if (testName === '') {
      return this._createTreeAndAddTest(
        this.getTestGrouping(),
        '<GUnit>',
        resolvedFile,
        line,
        [suiteName],
        undefined,
        (parent: TestItemParent) =>
          new GoogleTestTest(this, parent, id, '<GUnit>', suiteName, typeParam, valueParam, resolvedFile, line),
        (test: GoogleTestTest) => test.update2('<GUnit>', suiteName, resolvedFile, line, typeParam, valueParam),
      );
    } else {
      return this._createTreeAndAddTest(
        this.getTestGrouping(),
        testName,
        resolvedFile,
        line,
        [suiteName],
        undefined,
        (parent: TestItemParent) =>
          new GoogleTestTest(this, parent, id, testName, suiteName, typeParam, valueParam, resolvedFile, line),
        (test: GoogleTestTest) => test.update2(testName, suiteName, resolvedFile, line, typeParam, valueParam),
      );
    }
  };

  protected async _reloadChildren(cancellationToken: CancellationToken): Promise<void> {
    const cacheFile = this.shared.path + '.TestMate.testListCache.xml';

    if (this.shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.shared.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this.shared.log.info('loading from cache: ', cacheFile);
          const xmlStream = fs.createReadStream(cacheFile, 'utf8');

          return await this._reloadFromXml(xmlStream, cancellationToken);
        }
      } catch (e) {
        this.shared.log.info('coudnt use cache', e);
      }
    }

    const prependTestListingArgs = await Promise.all(this.shared.prependTestListingArgs.map(x => this.resolveText(x)));
    const args = prependTestListingArgs.concat([
      `--${this._argumentPrefix}list_tests`,
      `--${this._argumentPrefix}output=xml:${cacheFile}`,
    ]);

    const pathForExecution = await this._getPathForExecution();
    this.shared.log.info('discovering tests', this.shared.path, pathForExecution, args, this.shared.options.cwd);
    const googleTestListProcess = await this.shared.spawner.spawn(pathForExecution, args, this.shared.options);

    const loadFromFileIfHas = async (): Promise<boolean> => {
      const hasXmlFile = await promisify(fs.exists)(cacheFile);

      if (hasXmlFile) {
        const xmlStream = fs.createReadStream(cacheFile, 'utf8');

        await this._reloadFromXml(xmlStream, cancellationToken);

        if (!this.shared.enabledTestListCaching) {
          fs.unlink(cacheFile, (err: Error | null) => {
            err && this.shared.log.warn("Couldn't remove: ", cacheFile, err);
          });
        }

        return true;
      } else {
        this.shared.log.warn(
          "Couldn't parse output file. Possibly it is an older version of Google Test framework, NAVIGATION MIGHT WON'T WORK.",
        );

        return false;
      }
    };

    try {
      const [stdout, stderr] = await pipeOutputStreams2String(
        googleTestListProcess.stdout,
        googleTestListProcess.stderr,
      );
      const loadedFromFile = await loadFromFileIfHas();
      if (!loadedFromFile) {
        await this._reloadFromString(stdout, stderr, cancellationToken);
      }
    } catch (e) {
      this.shared.log.warn('reloadChildren error:', e);
      return await this._createAndAddUnexpectedStdError(e.toString(), '');
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
    const colouring = this.shared.enableDebugColouring ? 'yes' : 'no';
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

    const parser = new TextStreamParser(
      this.shared.log,
      {
        async online(line: string): Promise<void | LineProcessor> {
          const beginMatch = testBeginRe.exec(line);
          if (beginMatch) {
            const testNameAsId = beginMatch[1];
            const testName = beginMatch[3];
            const suiteName = beginMatch[2];
            let test = executable._getTest(testNameAsId);
            if (!test) {
              log.info('TestCase not found in children', testNameAsId);
              test = await executable._createAndAddTest(
                testName,
                suiteName,
                undefined,
                undefined,
                undefined,
                undefined,
              );
              unexpectedTests.push(test);
            } else {
              expectedToRunAndFoundTests.push(test);
            }
            data.lastBuilder = new TestResultBuilder(test, testRun, runInfo.runPrefix, false);
            return new TestCaseProcessor(executable.shared, testEndRe(test.id), data.lastBuilder);
          } else if (line.startsWith('[----------] Global test environment tear-down')) {
            return executable.shared.shared.hideUninterestingOutput
              ? new NoOpLineProcessor()
              : new LambdaLineProcessor(l => testRun.appendOutput(runInfo.runPrefix + l + '\r\n'));
          } else {
            if (
              line === '' ||
              ['Running main()', 'Note: Google Test filter =', '[==========]', '[----------]'].some(x =>
                line.startsWith(x),
              )
            ) {
              if (executable.shared.shared.hideUninterestingOutput == false)
                testRun.appendOutput(runInfo.runPrefix + line + '\r\n');
            } else {
              testRun.appendOutput(runInfo.runPrefix + line + '\r\n');
            }
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

  async onopentag(tag: XmlTag): Promise<void> {
    switch (tag.name) {
      case 'testcase': {
        assert(this.suiteName);
        assert(typeof tag.attribs.name == 'string'); // for gunit it can be empty
        await this.create(
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
const testBeginRe = /\[ RUN {6}\] ((.+)\.(.*))$/m;
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
  constructor(
    readonly shared: SharedVarOfExec,
    readonly builder: TestResultBuilder,
  ) {}

  gMockWarningCount = 0;
}

///

class TestCaseProcessor implements LineProcessor {
  constructor(
    shared: SharedVarOfExec,
    private readonly testEndRe: RegExp,
    private readonly builder: TestResultBuilder,
  ) {
    this.testCaseShared = new TestCaseSharedData(shared, builder);
    builder.started();
  }

  private readonly testCaseShared: TestCaseSharedData;

  begin(line: string): void {
    const loc = this.builder.getLocationAtStr(
      this.testCaseShared.builder.test.file,
      this.testCaseShared.builder.test.line,
      true,
    );
    this.testCaseShared.builder.addReindentedOutput(0, ansi.bold(line) + loc);
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
        this.testCaseShared.builder.addReindentedOutput(
          1,
          '⚠️' + this.testCaseShared.gMockWarningCount + ' GMock warning(s) in the output!',
        );
      }

      this.testCaseShared.builder.build();

      this.testCaseShared.builder.addReindentedOutput(
        0,
        testEndMatch[1] +
          styleFunc(testEndMatch[2]) +
          testEndMatch[3] +
          testEndMatch[4] +
          testEndMatch[5] +
          ansi.dim(testEndMatch[6]),
        '',
      );

      return true;
    }

    const failureMatch = failureRe.exec(line);
    if (failureMatch) {
      const type = failureMatch[6] as FailureType;
      const file = this.testCaseShared.builder.test.exec.findSourceFilePath(failureMatch[2]);
      const line = failureMatch[3];
      const fullMsg = failureMatch[5];
      const failureMsg = failureMatch[7];

      this.testCaseShared.builder.addReindentedOutput(
        1,
        ansi.red(type) + failureMsg + this.builder.getLocationAtStr(file, line, false),
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

    this.testCaseShared.builder.addOutput(1, line);
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

  private treatRemainingAsPart: boolean = false;
  private lines: string[] = [];

  online(line: string): void | false {
    if (this.treatRemainingAsPart) {
      if (line.startsWith('[')) {
        return false;
      }
      this.lines.push(line);
    } else if (acceptedAndDecoratedPrefixes.some(prefix => line.startsWith(prefix))) {
      if (isDecorationEnabled) {
        const first = line.indexOf(':');
        if (first != -1) {
          const value = line.substring(first + 1).trim();
          const decoratedValue = value ? ' `' + line.substring(first + 1).trim() + '`' : '';
          this.lines.push(line.substring(0, first + 1) + decoratedValue);
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
    } else if (line.startsWith('Failed')) {
      this.lines.push(line);
      this.treatRemainingAsPart = true;
    } else {
      return false;
    }
  }

  end(): void {
    this.testCaseShared.builder.addReindentedOutput(2, ...this.lines);

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
    this.testCaseShared.builder.addReindentedOutput(2, ...this.lines);

    this.testCaseShared.builder.addMessage(this.file, this.line, this.expected, ...this.actual);
  }
}
