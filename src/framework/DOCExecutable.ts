import * as vscode from 'vscode';
import * as fs from 'fs';
import { inspect, promisify } from 'util';

import { AbstractExecutable, HandleProcessResult } from '../AbstractExecutable';

import { DOCTest } from './DOCTest';
import { WorkspaceShared } from '../WorkspaceShared';
import { RunningExecutable } from '../RunningExecutable';
import { RunnableProperties } from '../RunnableProperties';
import { CancellationFlag, Version } from '../Util';
import { TestGrouping } from '../TestGroupingInterface';
import { XmlParser, XmlTag, XmlTagProcessor } from '../util/XmlParser';
import { assert, debugAssert, debugBreak } from '../util/DevelopmentHelper';
import { TestResultBuilder } from '../TestResultBuilder';

export class DOCExecutable extends AbstractExecutable {
  public constructor(shared: WorkspaceShared, execInfo: RunnableProperties, docVersion: Version | undefined) {
    super(shared, execInfo, 'doctest', docVersion);
  }

  private getTestGrouping(): TestGrouping {
    if (this.properties.testGrouping) {
      return this.properties.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      return grouping;
    }
  }

  private async _reloadFromXml(testListOutput: string, _cancellationFlag: CancellationFlag): Promise<void> {
    const createAndAddTest = this._createAndAddTest;

    const parser = new XmlParser(
      this.shared.log,
      {
        async onopentag(tag: XmlTag): Promise<void> {
          switch (tag.name) {
            case 'TestCase':
              {
                debugAssert(tag.attribs.name);
                await createAndAddTest(
                  tag.attribs.name,
                  tag.attribs.testsuite, // currently doctest doesn't provide it
                  tag.attribs.filename,
                  tag.attribs.line,
                  tag.attribs.description, // currently doctest doesn't provide it
                  tag.attribs.skipped, // currently doctest doesn't provide it
                );
              }
              break;
            default:
            case 'doctest':
            case 'OverallResultsTestCases':
            case 'Options':
              return;
          }
        },
      },
      error => {
        this.shared.log.error('reloadFromXml', error);
        throw error;
      },
    );

    parser.write(testListOutput);
    await parser.end();
  }

  private readonly _createAndAddTest = async (
    testName: string,
    suiteName: string | undefined,
    file: string | undefined,
    line: string | undefined,
    description: string | undefined,
    skipped: string | undefined,
  ): Promise<DOCTest> => {
    const tags: string[] = suiteName ? [suiteName] : [];
    const skippedB = skipped === 'true';
    const resolvedFile = await this._resolveAndFindSourceFilePath(file);
    return this._createTreeAndAddTest(
      this.getTestGrouping(),
      testName,
      resolvedFile,
      tags,
      description,
      (container: vscode.TestItemCollection) =>
        new DOCTest(this.shared, this, container, testName, tags, resolvedFile, line, description, skippedB),
      (test: DOCTest) => test.update2(resolvedFile, line, tags, skippedB, description),
    );
  };

  protected async _reloadChildren(cancellationFlag: CancellationFlag): Promise<void> {
    const cacheFile = this.properties.path + '.TestMate.testListCache.txt';

    if (this.shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.properties.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this.shared.log.info('loading from cache: ', cacheFile);
          const content = await promisify(fs.readFile)(cacheFile, 'utf8');

          return await this._reloadFromXml(content, cancellationFlag);
        }
      } catch (e) {
        this.shared.log.warn('coudnt use cache', e);
      }
    }

    const args = this.properties.prependTestListingArgs.concat([
      '--list-test-cases',
      '--reporters=xml',
      '--no-skip=true',
      '--no-color=true',
    ]);

    this.shared.log.info('discovering tests', this.properties.path, args, this.properties.options.cwd);
    const docTestListOutput = await this.properties.spawner.spawnAsync(
      this.properties.path,
      args,
      this.properties.options,
      30000,
    );

    if (docTestListOutput.stderr && !this.properties.ignoreTestEnumerationStdErr) {
      this.shared.log.warn(
        'reloadChildren -> docTestListOutput.stderr',
        docTestListOutput.stdout,
        docTestListOutput.stderr,
        docTestListOutput.error,
        docTestListOutput.status,
      );
      return await this._createAndAddUnexpectedStdError(docTestListOutput.stdout, docTestListOutput.stderr);
    }

    const result = await this._reloadFromXml(docTestListOutput.stdout, cancellationFlag);

    if (this.shared.enabledTestListCaching) {
      promisify(fs.writeFile)(cacheFile, docTestListOutput.stdout).catch(err =>
        this.shared.log.warn('couldnt write cache file:', err),
      );
    }

    return result;
  }

  private _getRunParamsCommon(childrenToRun: readonly Readonly<DOCTest>[]): string[] {
    const execParams: string[] = [];

    const testNames = childrenToRun.map(c => c.getEscapedTestName());
    execParams.push('--test-case=' + testNames.join(','));
    execParams.push('--no-skip=true');

    execParams.push('--case-sensitive=true');
    execParams.push('--duration=true');

    if (this.shared.isNoThrow) execParams.push('--no-throw=true');

    if (this.shared.rngSeed !== null) {
      execParams.push('--order-by=rand');
      execParams.push('--rand-seed=' + this.shared.rngSeed.toString());
    }

    return execParams;
  }

  protected _getRunParamsInner(childrenToRun: readonly Readonly<DOCTest>[]): string[] {
    const execParams: string[] = this._getRunParamsCommon(childrenToRun);
    execParams.push('--reporters=xml');
    return execParams;
  }

  // eslint-disable-next-line
  protected _getDebugParamsInner(childrenToRun: readonly Readonly<DOCTest>[], breakOnFailure: boolean): string[] {
    const execParams: string[] = this._getRunParamsCommon(childrenToRun);
    execParams.push('--reporters=console');
    execParams.push('--no-breaks=' + (breakOnFailure ? 'false' : 'true'));
    return execParams;
  }

  protected async _handleProcess(testRun: vscode.TestRun, runInfo: RunningExecutable): Promise<HandleProcessResult> {
    const unexpectedTests: DOCTest[] = [];
    const expectedToRunAndFoundTests: DOCTest[] = [];
    const executable = this; //eslint-disable-line
    let options: Option = {};
    const runPrefix = TestResultBuilder.calcRunPrefix(runInfo);

    const parser = new XmlParser(
      this.shared.log,
      {
        async onopentag(tag: XmlTag): Promise<void | XmlTagProcessor> {
          switch (tag.name) {
            case 'Options':
              options = tag.attribs;
              testRun.appendOutput(`🔀 Randomness seeded to: ${options.rand_seed!.toString()}\r\n\r\n`);
              return;
            case 'TestSuite':
              return new TestSuiteTagProcessor(
                executable.shared,
                testRun,
                runPrefix,
                (testNameAsId: string) => executable._getTest<DOCTest>(testNameAsId),
                executable._createAndAddTest,
                unexpectedTests,
                expectedToRunAndFoundTests,
                tag.attribs,
                options,
              );
          }
        },
      },
      (error: Error) => {
        this.shared.log.exceptionS('onerror', error);
      },
    );

    runInfo.process.stdout.on('data', (chunk: Uint8Array) => parser.write(chunk.toLocaleString()));

    runInfo.process.stderr.on('data', (chunk: Uint8Array) => {
      const c = chunk.toLocaleString();

      parser.writeStdErr(c).then(hasHandled => {
        if (!hasHandled) {
          testRun.appendOutput('std::cerr:\n');
          testRun.appendOutput(c);
          c.endsWith('\n') || testRun.appendOutput('\n');
          testRun.appendOutput('⬆ std::cerr\n');
        }
      });
    });

    await runInfo.result;
    // order matters
    await parser.end();

    const leftBehind = parser.parserStack.reverse().find(x => x instanceof TestCaseTagProcessor) as
      | TestCaseTagProcessor
      | undefined;

    return {
      unexpectedTests,
      expectedToRunAndFoundTests,
      leftBehindBuilder: leftBehind?.builder,
    };
  }
}

///

type Option = Record<string, string> & { rand_seed?: string };

///

class TestSuiteTagProcessor implements XmlTagProcessor {
  constructor(
    private readonly shared: WorkspaceShared,
    private readonly testRun: vscode.TestRun,
    private readonly runPrefix: string,
    private readonly findTest: (testNameAsId: string) => DOCTest | undefined,
    private readonly create: (
      testName: string,
      suiteName: string | undefined,
      file: string | undefined,
      line: string | undefined,
      description: string | undefined,
      skipped: string | undefined,
    ) => Promise<DOCTest>,
    private readonly unexpectedTests: DOCTest[],
    private readonly expectedToRunAndFoundTests: DOCTest[],
    attribs: Record<string, string>,
    private readonly options: Option,
  ) {
    this.suiteName = attribs.name;
  }

  private readonly suiteName: string | undefined;

  async onopentag(tag: XmlTag): Promise<void | TestCaseTagProcessor> {
    switch (tag.name) {
      case 'TestCase': {
        const name: string = tag.attribs.name;
        const skipped = tag.attribs.skipped === 'true';

        assert(typeof name === 'string' && name.length > 0);

        let test = this.findTest(name);
        if (!test) {
          this.shared.log.info('TestCase not found in children', tag, name);
          test = await this.create(
            name,
            this.suiteName,
            tag.attribs.filename,
            tag.attribs.line,
            tag.attribs.description,
            tag.attribs.skipped,
          );
          if (!skipped) this.unexpectedTests.push(test);
        } else {
          if (!skipped) this.expectedToRunAndFoundTests.push(test);
        }

        if (skipped) return;

        const builder = new TestResultBuilder(test, this.testRun, this.runPrefix, true);
        return new TestCaseTagProcessor(this.shared, builder, test as DOCTest, tag.attribs, this.options);
      }
    }
  }
}

///

type CaseData = { hasException?: true; hasFailedExpression?: true };

///

abstract class TagProcessorBase implements XmlTagProcessor {
  constructor(
    public readonly builder: TestResultBuilder,
    protected readonly shared: WorkspaceShared,
    protected readonly caseData: CaseData,
  ) {}

  public onopentag(tag: XmlTag): XmlTagProcessor | void {
    const procCreator = TagProcessorBase.openTagProcessorMap.get(tag.name);
    if (procCreator) {
      return procCreator(tag, this.builder, this.caseData, this.shared);
    } else if (procCreator === null) {
      // known tag, do nothing
    } else {
      const p = TagProcessorBase.textProcessorMap.get(tag.name);
      if (p || p === null) {
        // known tag, do nothing
      } else {
        this.shared.log.errorS('unhandled tag:' + tag.name);
        this.builder.addOutputLine(1, `Unknown XML tag: ${tag.name} with ${JSON.stringify(tag.attribs)}`);
      }
    }
  }

  public ontext(dataTrimmed: string, parentTag: XmlTag): void {
    const processor = TagProcessorBase.textProcessorMap.get(parentTag.name);
    if (processor) {
      try {
        return processor(dataTrimmed, parentTag, this.builder, this.caseData, this.shared);
      } catch (e) {
        this.shared.log.exceptionS(e);
        this.builder.addOutputLine(1, 'Unknown fatal error: ' + inspect(e));
        this.builder.errored(); //TODO: check this is really working
      }
    } else if (processor === null) {
      // known tag, do nothing
    } else {
      this.builder.addOutputLine(1, '> ' + dataTrimmed);
    }
  }

  public onstderr(data: string, _parentTag: XmlTag | undefined): void {
    this.builder.addQuoteWithLocation(
      undefined,
      undefined,
      'std::cerr (stderr arrived during running this test)',
      data,
    );
  }

  private static readonly openTagProcessorMap: Map<
    string,
    | null
    | ((tag: XmlTag, builder: TestResultBuilder, caseData: CaseData, shared: WorkspaceShared) => void | XmlTagProcessor)
  > = new Map([
    [
      'SubCase',
      (
        tag: XmlTag,
        builder: TestResultBuilder,
        caseData: CaseData,
        shared: WorkspaceShared,
      ): void | XmlTagProcessor => {
        // if name is missing we don't create subcase for it
        if (tag.attribs.name) return new SubCaseProcessor(shared, builder, tag.attribs, caseData);
      },
    ],
    [
      'Message',
      (tag: XmlTag, builder: TestResultBuilder, caseData: CaseData, shared: WorkspaceShared): XmlTagProcessor =>
        new MessageProcessor(shared, builder, tag.attribs, caseData),
    ],
    [
      'Expression',
      (tag: XmlTag, builder: TestResultBuilder, caseData: CaseData, shared: WorkspaceShared): XmlTagProcessor =>
        new ExpressionProcessor(shared, builder, tag.attribs, caseData),
    ],
  ]);

  private static readonly textProcessorMap: Map<
    string,
    | null
    | ((
        dataTrimmed: string,
        parentTag: XmlTag,
        builder: TestResultBuilder,
        caseData: CaseData,
        shared: WorkspaceShared,
      ) => void)
  > = new Map([
    [
      'Exception',
      (
        dataTrimmed: string,
        parentTag: XmlTag,
        builder: TestResultBuilder,
        caseData: CaseData,
        _shared: WorkspaceShared,
      ) => {
        builder.addMessageWithOutput(
          parentTag.attribs.filename,
          parentTag.attribs.line,
          'Exception (crash=' + parentTag.attribs.crash + '): `' + dataTrimmed + '`',
        );
        caseData.hasException = true;
      },
    ],
  ]);
}

///

class TestCaseTagProcessor extends TagProcessorBase {
  constructor(
    shared: WorkspaceShared,
    builder: TestResultBuilder,
    test: DOCTest,
    private readonly attribs: Record<string, string>,
    _option: Option,
  ) {
    super(builder, shared, {});
    builder.started();

    //TODO:release: can we do better?
    // if (attribs.filename !== test.file) {
    //   shared.log.info(
    //     'Test file location mismatch. Indicates that the executable is outdated.',
    //     test.label,
    //     test.file,
    //     attribs.filename,
    //   );
    //   //:TODO:future:race condition
    //   test.executable.reloadTests(shared.taskPool, shared.cancellationFlag);
    // }
    test.line = attribs.line;
  }

  public override onopentag(tag: XmlTag): XmlTagProcessor | void {
    if (tag.name === 'OverallResultsAsserts') {
      const durationSec = parseFloat(tag.attribs.duration) || undefined;
      if (durationSec === undefined) this.shared.log.errorS('doctest: duration is NaN: ' + tag.attribs.duration);
      else this.builder.setDurationMilisec(durationSec * 1000);

      const mayFail = this.attribs.may_fail === 'true';
      const shouldFail = this.attribs.should_fail === 'true';
      const failures = parseInt(tag.attribs.failures) || 0;
      const expectedFailures = parseInt(tag.attribs.expected_failures) || 0;
      const hasException = this.caseData.hasException === true;
      const timeoutSec = parseFloat(this.attribs.timeout) || undefined;
      const hasTimedOut = timeoutSec !== undefined && durationSec !== undefined ? durationSec > timeoutSec : false;

      let result: undefined | 'passed' | 'failed' = undefined;

      // The logic is coming from the console output of ./doctest1.exe
      if (shouldFail) {
        if (failures > 0 || hasException || hasTimedOut) result = 'passed';
        else result = 'failed';
      } else if (mayFail) {
        result = 'passed';
      } else {
        if (expectedFailures !== failures || hasException || hasTimedOut) result = 'failed';
        else result = 'passed';
      }

      this.builder[result]();
      this.builder.build();
    } else {
      return super.onopentag(tag);
    }
  }
}

///

class SubCaseProcessor extends TagProcessorBase {
  public constructor(
    shared: WorkspaceShared,
    testBuilder: TestResultBuilder,
    attribs: Record<string, string>,
    parentCaseData: CaseData,
  ) {
    if (typeof attribs.name !== 'string' || !attribs.name) throw Error('Section must have name attribute');

    let label: string | undefined = undefined;
    if (attribs.name) {
      const m = attribs.name.match(/^\s*((?:Given|When|Then):.*)/);
      if (m) label = m[1];
    }

    const subTest = testBuilder.test.getOrCreateSubTest(attribs.name, label, attribs.filename, attribs.line);
    const subTestBuilder = testBuilder.createSubTestBuilder(subTest);
    subTestBuilder.started();

    super(subTestBuilder, shared, parentCaseData);
  }

  //doctest does not provide result for sub-cases, no point to build
  //public end(): void { this.builder.build() }
}

///

class ExpressionProcessor implements XmlTagProcessor {
  public constructor(
    private readonly _shared: WorkspaceShared,
    private readonly builder: TestResultBuilder,
    private readonly attribs: Record<string, string>,
    caseData: CaseData,
  ) {
    if (attribs.success === 'false') caseData.hasFailedExpression = true;
  }

  private original?: string;
  private expanded?: string;
  private other = new Map<string, string>();

  public ontext(dataTrimmed: string, parentTag: XmlTag): void {
    switch (parentTag.name) {
      case 'Original':
        this.original = dataTrimmed;
        break;
      case 'Expanded':
        this.expanded = dataTrimmed;
        break;
      default:
        this.other.set(parentTag.name, dataTrimmed);
        break;
    }
  }

  public end(): void {
    debugAssert(this.original);

    if (this.other.size) {
      if (this.expanded) this._shared.log.errorS('unknown doctest expression with expanded', this.expanded, this.other);
      const exps = [...this.other.entries()].map(e => `${e[0]}: ${e[1]}`);
      const first = exps.shift()!;
      this.builder.addMessageWithOutput(this.attribs.filename, this.attribs.line, first, ...exps);
    } else if (this.expanded) {
      this.builder.addExpressionMsg(
        this.attribs.filename,
        this.attribs.line,
        this.original!,
        this.expanded!,
        this.attribs.type,
      );
    } else {
      this._shared.log.errorS('unhandled doctest Expression', this);
    }
  }
}

///

class MessageProcessor implements XmlTagProcessor {
  public constructor(
    private readonly _shared: WorkspaceShared,
    private readonly builder: TestResultBuilder,
    private readonly attribs: Record<string, string>,
    private readonly caseData: CaseData,
  ) {}

  private text = '';

  public ontext(dataTrimmed: string, parentTag: XmlTag): void {
    switch (parentTag.name) {
      case 'Text':
        this.text = dataTrimmed;
        break;
      default:
        this._shared.log.errorS('unknown tag', parentTag);
        debugBreak();
        break;
    }
  }

  public end(): void {
    debugAssert(this.text !== undefined);

    if (this.attribs.type === 'FATAL ERROR') {
      this.caseData.hasFailedExpression = true;
      this.builder.addMessageWithOutput(this.attribs.filename, this.attribs.line, this.attribs.type, this.text!);
    } else if (this.attribs.type === 'WARNING') {
      this.builder.addMessageWithOutput(this.attribs.filename, this.attribs.line, this.attribs.type, this.text!);
    } else {
      debugBreak();
      this._shared.log.errorS('doctest: unexpected message type', this.attribs);
    }
  }
}
