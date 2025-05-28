import * as vscode from 'vscode';
import * as fs from 'fs';
import { inspect, promisify } from 'util';

import { AbstractExecutable, HandleProcessResult } from '../AbstractExecutable';

import { DOCTest } from './DOCTest';
import { SharedVarOfExec } from '../SharedVarOfExec';
import { RunningExecutable } from '../../RunningExecutable';
import { CancellationFlag, Version } from '../../Util';
import { TestGroupingConfig } from '../../TestGroupingInterface';
import { XmlParser, XmlTag, XmlTagProcessor } from '../../util/XmlParser';
import { assert, debugBreak } from '../../util/DevelopmentHelper';
import { TestResultBuilder } from '../../TestResultBuilder';
import { TestItemParent } from '../../TestItemManager';
import { AbstractTest, SubTest, SubTestTree } from '../AbstractTest';
import { pipeProcess2Parser } from '../../util/ParserInterface';

export class DOCExecutable extends AbstractExecutable<DOCTest> {
  constructor(sharedVarOfExec: SharedVarOfExec, docVersion: Version | undefined) {
    super(sharedVarOfExec, 'doctest', docVersion);
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

  private async _reloadFromXml(testListOutput: string, _cancellationFlag: CancellationFlag): Promise<void> {
    const createAndAddTest = this._createAndAddTest;

    const parser = new XmlParser(
      this.shared.log,
      {
        async onopentag(tag: XmlTag): Promise<void> {
          switch (tag.name) {
            case 'TestCase':
              {
                assert(tag.attribs.name);
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
    testId: string,
    suiteId: string | undefined,
    file: string | undefined,
    line: string | undefined,
    description: string | undefined,
    skipped: string | undefined,
  ): Promise<DOCTest> => {
    const id = getTestId(file, line, testId);
    const tags: string[] = suiteId ? [suiteId] : [];
    const skippedB = skipped === 'true';
    const resolvedFile = this.findSourceFilePath(file);
    return this._createTreeAndAddTest(
      this.getTestGrouping(),
      testId,
      resolvedFile,
      line,
      tags,
      description,
      (parent: TestItemParent, testName: string | undefined) =>
        new DOCTest(this, parent, id, testName ?? testId, suiteId, tags, resolvedFile, line, description, skippedB),
      (test: DOCTest) => test.update2(resolvedFile, line, tags, skippedB, description),
    );
  };

  protected async _reloadChildren(cancellationFlag: CancellationFlag): Promise<void> {
    const cacheFile = this.shared.path + '.TestMate.testListCache.txt';

    if (this.shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.shared.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this.shared.log.info('loading from cache: ', cacheFile);
          const content = await promisify(fs.readFile)(cacheFile, 'utf8');

          return await this._reloadFromXml(content, cancellationFlag);
        }
      } catch (e) {
        this.shared.log.warn('coudnt use cache', e);
      }
    }

    const prependTestListingArgs = await Promise.all(this.shared.prependTestListingArgs.map(x => this.resolveText(x)));
    const args = prependTestListingArgs.concat([
      '--list-test-cases',
      '--reporters=xml',
      '--no-skip=true',
      '--no-color=true',
    ]);

    const pathForExecution = await this._getPathForExecution();
    this.shared.log.info('discovering tests', this.shared.path, pathForExecution, args, this.shared.options.cwd);
    const docTestListOutput = await this.shared.spawner.spawnAsync(pathForExecution, args, this.shared.options, 30000);

    if (docTestListOutput.stderr && !this.shared.ignoreTestEnumerationStdErr) {
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

  private _getDocTestRunParams(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    const params: string[] = [];

    if (childrenToRun.length == 1 && childrenToRun[0] instanceof SubTest) {
      const subTests: SubTest[] = [childrenToRun[0]];
      let p = childrenToRun[0].parentTest;
      while (p instanceof SubTest) {
        subTests.unshift(p);
        p = p.parentTest;
      }
      if (!(p instanceof DOCTest)) throw Error('unexpected doctest issue');
      if (p.suiteName !== undefined) {
        params.push('--test-suite=' + p.suiteName);
      }
      params.push('--test-case=' + p.getEscapedTestName());
      params.push('--subcase=' + subTests.map(s => s.id.replaceAll(',', '?')).join(','));
      params.push('--subcase-filter-levels=' + subTests.length);
    } else if (childrenToRun.every(v => v instanceof DOCTest)) {
      const dc = childrenToRun as readonly DOCTest[];
      if (dc.length && dc[0].suiteName && dc.every(v => v.suiteName === dc[0].suiteName)) {
        params.push('--test-suite=' + dc[0].suiteName);
      }
      const testNames = dc.map(c => c.getEscapedTestName());
      params.push('--test-case=' + testNames.join(','));
    } else {
      this.log.warnS('wrong run/debug combo', childrenToRun);
      throw Error('Cannot run/debug this combination. Only 1 section or multiple tests can be selected.');
    }

    params.push('--no-skip=true');
    params.push('--case-sensitive=true');
    params.push('--duration=true');
    if (this.shared.isNoThrow) params.push('--no-throw=true');
    if (this.shared.rngSeed !== null) {
      params.push('--order-by=rand');
      params.push('--rand-seed=' + this.shared.rngSeed.toString());
    }

    return params;
  }

  protected _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    const execParams: string[] = this._getDocTestRunParams(childrenToRun);
    execParams.push('--reporters=xml');
    return execParams;
  }

  protected _getDebugParamsInner(childrenToRun: readonly Readonly<AbstractTest>[], breakOnFailure: boolean): string[] {
    const execParams: string[] = this._getDocTestRunParams(childrenToRun);
    execParams.push('--reporters=console');
    execParams.push('--no-breaks=' + (breakOnFailure ? 'false' : 'true'));
    return execParams;
  }

  protected override _splitTests(tests: readonly AbstractTest[]): (readonly AbstractTest[])[] {
    const withoutSuite: AbstractTest[] = [];
    const suites = new Map<string, AbstractTest[]>();
    for (const test of tests) {
      if (test instanceof DOCTest) {
        if (test.suiteName) {
          const f = suites.get(test.suiteName);
          if (f) f.push(test);
          else {
            const s = [test];
            suites.set(test.suiteName, s);
          }
        } else {
          withoutSuite.push(test);
        }
      } else {
        this.shared.log.error('expected DOCTest but got something else');
      }
    }
    const result: AbstractTest[][] = [];
    if (withoutSuite.length) result.push(withoutSuite);
    result.push(...suites.values());
    return result;
  }

  protected async _handleProcess(testRun: vscode.TestRun, runInfo: RunningExecutable): Promise<HandleProcessResult> {
    const unexpectedTests: DOCTest[] = [];
    const expectedToRunAndFoundTests: DOCTest[] = [];
    const executable = this; //eslint-disable-line
    let options: Option = {};

    const parser = new XmlParser(
      this.shared.log,
      {
        async onopentag(tag: XmlTag): Promise<void | XmlTagProcessor> {
          switch (tag.name) {
            case 'Options':
              options = tag.attribs;
              testRun.appendOutput(
                runInfo.runPrefix + `🔀 Randomness seeded to: ${options.rand_seed!.toString()}\r\n\r\n`,
              );
              return;
            case 'TestSuite':
              return new TestSuiteTagProcessor(
                executable.shared,
                runInfo,
                testRun,
                runInfo.runPrefix,
                (testNameAsId: string) => executable._getTest(testNameAsId),
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

    await pipeProcess2Parser(runInfo, parser, (data: string) =>
      executable.processStdErr(testRun, runInfo.runPrefix, data),
    );

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

const getTestId = (file: string | undefined, line: string | undefined, testName: string) =>
  `${file ?? ''}:${line ?? ''}:${testName}`;

///

type Option = Record<string, string> & { rand_seed?: string };

///

class TestSuiteTagProcessor implements XmlTagProcessor {
  constructor(
    private readonly shared: SharedVarOfExec,
    private readonly runInfo: RunningExecutable,
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

        const testId = getTestId(tag.attribs.filename, tag.attribs.line, name);
        let test = this.findTest(testId);
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
        return new TestCaseTagProcessor(this.shared, builder, this.runInfo, test as DOCTest, tag.attribs, this.options);
      }
    }
  }
}

///

type CaseData = { hasException?: true; hasFailedExpression?: true };

///

abstract class TagProcessorBase implements XmlTagProcessor {
  constructor(
    readonly builder: TestResultBuilder,
    protected readonly shared: SharedVarOfExec,
    protected readonly caseData: CaseData,
    protected readonly subCases: SubTestTree,
  ) {}

  onopentag(tag: XmlTag): void | XmlTagProcessor | Promise<void | XmlTagProcessor> {
    const procCreator = TagProcessorBase.openTagProcessorMap.get(tag.name);
    if (procCreator) {
      return procCreator(tag, this.builder, this.caseData, this.shared, this.subCases);
    } else if (procCreator === null) {
      // known tag, do nothing
    } else {
      const p = TagProcessorBase.textProcessorMap.get(tag.name);
      if (p || p === null) {
        // known tag, do nothing
      } else {
        this.shared.log.errorS('unhandled tag:' + tag.name);
        this.builder.addReindentedOutput(1, `Unknown XML tag: ${tag.name} with ${JSON.stringify(tag.attribs)}`);
      }
    }
  }

  ontext(dataTrimmed: string, parentTag: XmlTag): void {
    const processor = TagProcessorBase.textProcessorMap.get(parentTag.name);
    if (processor) {
      try {
        return processor(dataTrimmed, parentTag, this.builder, this.caseData, this.shared);
      } catch (e) {
        this.shared.log.exceptionS(e);
        this.builder.addReindentedOutput(1, 'Unknown fatal error: ' + inspect(e));
        this.builder.errored(); //TODO: check this is really working
      }
    } else if (processor === null) {
      // known tag, do nothing
    } else {
      this.builder.addReindentedOutput(1, dataTrimmed);
    }
  }

  onstderr(data: string, _parentTag: XmlTag | undefined): void {
    this.builder.addQuoteWithLocation(undefined, undefined, 'std::cerr', data);
  }

  private static readonly openTagProcessorMap: Map<
    string,
    | null
    | ((
        tag: XmlTag,
        builder: TestResultBuilder,
        caseData: CaseData,
        shared: SharedVarOfExec,
        subCases: SubTestTree,
      ) => void | XmlTagProcessor | Promise<void | XmlTagProcessor>)
  > = new Map([
    [
      'SubCase',
      (
        tag: XmlTag,
        builder: TestResultBuilder,
        caseData: CaseData,
        shared: SharedVarOfExec,
        subCases: SubTestTree,
      ): void | XmlTagProcessor | Promise<XmlTagProcessor> => {
        // if name is missing we don't create subcase for it
        if (tag.attribs.name) return SubCaseProcessor.create(shared, builder, tag.attribs, caseData, subCases);
      },
    ],
    [
      'Message',
      (tag: XmlTag, builder: TestResultBuilder, caseData: CaseData, shared: SharedVarOfExec): XmlTagProcessor =>
        new MessageProcessor(shared, builder, tag.attribs, caseData),
    ],
    [
      'Expression',
      (tag: XmlTag, builder: TestResultBuilder, caseData: CaseData, shared: SharedVarOfExec): XmlTagProcessor =>
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
        shared: SharedVarOfExec,
      ) => void)
  > = new Map([
    [
      'Exception',
      (
        dataTrimmed: string,
        parentTag: XmlTag,
        builder: TestResultBuilder,
        caseData: CaseData,
        _shared: SharedVarOfExec,
      ) => {
        builder.addMessageWithOutput(
          parentTag.attribs.filename,
          parentTag.attribs.line,
          'Exception (crash=' + parentTag.attribs.crash + '): `' + dataTrimmed + '`',
        );
        caseData.hasException = true;
        builder.failed();
      },
    ],
  ]);
}

///

class TestCaseTagProcessor extends TagProcessorBase {
  constructor(
    shared: SharedVarOfExec,
    builder: TestResultBuilder,
    private readonly runInfo: RunningExecutable,
    private readonly test: DOCTest,
    private readonly attribs: Record<string, string>,
    _option: Option,
  ) {
    super(builder, shared, {}, new Map());
  }

  async begin(): Promise<void> {
    this.builder.started();
    const file = this.test.exec.findSourceFilePath(this.attribs.filename);
    await this.test.updateFL(file, this.attribs.line);
  }

  override onopentag(tag: XmlTag): void | XmlTagProcessor | Promise<void | XmlTagProcessor> {
    if (tag.name === 'OverallResultsAsserts') {
      const durationSec = parseFloat(tag.attribs.duration) || undefined;
      if (durationSec === undefined) this.shared.log.errorS('doctest: duration is NaN: ' + tag.attribs.duration);
      else this.builder.setDurationMilisec(durationSec * 1000);

      let result: undefined | 'passed' | 'failed' = undefined;

      if (tag.attribs.test_case_success !== undefined) {
        if (tag.attribs.test_case_success === 'true') this.builder.passed(true);
        else this.builder.failed();
      } else {
        const mayFail = this.attribs.may_fail === 'true';
        const shouldFail = this.attribs.should_fail === 'true';
        const failures = parseInt(tag.attribs.failures) || 0;
        const expectedFailures = parseInt(tag.attribs.expected_failures) || 0;
        const hasException = this.caseData.hasException === true;
        const timeoutSec = parseFloat(this.attribs.timeout) || undefined;
        const hasTimedOut = timeoutSec !== undefined && durationSec !== undefined ? durationSec > timeoutSec : false;

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
      }

      // if has no modifier
      if (
        this.attribs.may_fail === undefined &&
        this.attribs.should_fail === undefined &&
        tag.attribs.expected_failures === undefined
      ) {
        for (const b of this.builder.getSubTestResultBuilders()) b.build();
      } else {
        this.shared.log.info('For doctest there are modifier so sub-cases are not reported', {
          id: this.builder.test.id,
          label: this.builder.test.label,
          testAttribs: this.attribs,
          resultTag: tag,
        });
      }

      // if a subtest is run then we don't expect all the sections to arrive so we assume the missing ones weren't run.
      if (this.runInfo.childrenToRun.length !== 1 || !(this.runInfo.childrenToRun[0] instanceof SubTest)) {
        this.builder.test.removeMissingSubTests(this.subCases);
      }

      this.builder.build();
    } else {
      return super.onopentag(tag);
    }
  }
}

///

class SubCaseProcessor extends TagProcessorBase {
  static async create(
    shared: SharedVarOfExec,
    testBuilder: TestResultBuilder,
    attribs: Record<string, string>,
    parentCaseData: CaseData,
    subCases: SubTestTree,
  ): Promise<SubCaseProcessor> {
    if (typeof attribs.name !== 'string' || !attribs.name) throw Error('Section must have name attribute');

    let label: string | undefined = undefined;
    if (attribs.name) {
      const m = attribs.name.match(/^\s*((?:Given|When|Then):.*)/);
      if (m) label = m[1];
    }

    const subTest = await testBuilder.test.getOrCreateSubTest(
      attribs.name,
      label,
      attribs.filename,
      attribs.line,
      true,
    );
    const subTestBuilder = testBuilder.createSubTestBuilder(subTest);
    subTestBuilder.passed(); // set as passed and make it failed lateer if error happens

    let subSubCases = subCases.get(attribs.name);
    if (subSubCases === undefined) {
      subSubCases = new Map();
      subCases.set(attribs.name, subSubCases);
    }

    return new SubCaseProcessor(shared, subTestBuilder, parentCaseData, subSubCases);
  }

  private constructor(
    shared: SharedVarOfExec,
    testBuilder: TestResultBuilder,
    parentCaseData: CaseData,
    subCases: SubTestTree,
  ) {
    testBuilder.started();

    super(testBuilder, shared, parentCaseData, subCases);
  }

  //doctest does not provide result for sub-cases, no point to build
  // end(): void { this.builder.build() }
}

///

class ExpressionProcessor implements XmlTagProcessor {
  constructor(
    private readonly _shared: SharedVarOfExec,
    private readonly builder: TestResultBuilder,
    private readonly attribs: Record<string, string>,
    caseData: CaseData,
  ) {
    if (attribs.success === 'false') {
      caseData.hasFailedExpression = true;
      builder.failed();
    }
  }

  private original?: string;
  private expanded?: string;
  private messages: string[] = [];
  private unknowns = new Map<string, string>();

  ontext(dataTrimmed: string, parentTag: XmlTag): void {
    // https://github.com/doctest/doctest/blob/1da23a3e8119ec5cce4f9388e91b065e20bf06f5/doctest/doctest.h#L5628-L5646
    switch (parentTag.name) {
      case 'Original':
        this.original = dataTrimmed;
        break;
      case 'Expanded':
        this.expanded = dataTrimmed;
        break;
      case 'Exception':
      case 'ExpectedException':
      case 'ExpectedExceptionString':
        this.messages.push(parentTag.name + ': ' + dataTrimmed);
        break;
      case 'Info':
        this.messages.push(dataTrimmed);
        break;
      default:
        this.unknowns.set(parentTag.name, dataTrimmed);
        break;
    }
  }

  end(): void {
    assert(this.original);

    if (this.unknowns.size) {
      if (this.expanded)
        this._shared.log.warnS('unknown doctest expression with expanded', this.expanded, this.unknowns);
      const exps = [...this.unknowns.entries()].map(e => `${e[0]}: ${e[1]}`);
      const first = exps.shift()!;
      this.builder.addMessageWithOutput(this.attribs.filename, this.attribs.line, first, ...exps);
    } else if (this.expanded) {
      this.builder.addExpressionMsg(
        this.attribs.filename,
        this.attribs.line,
        this.original!,
        this.expanded!,
        this.attribs.type,
        ...this.messages,
      );
    } else {
      this._shared.log.errorS('unhandled doctest Expression', this);
    }
  }
}

///

class MessageProcessor implements XmlTagProcessor {
  constructor(
    private readonly _shared: SharedVarOfExec,
    private readonly builder: TestResultBuilder,
    private readonly attribs: Record<string, string>,
    private readonly caseData: CaseData,
  ) {}

  private text = '';

  ontext(dataTrimmed: string, parentTag: XmlTag): void {
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

  end(): void {
    assert(this.text !== undefined);

    if (this.attribs.type === 'FATAL ERROR' || this.attribs.type === 'ERROR') {
      this.builder.addMessageWithOutput(this.attribs.filename, this.attribs.line, 'failed', this.text);
      this.caseData.hasFailedExpression = true;
      this.builder.failed();
    } else if (this.attribs.type === 'WARNING') {
      this.builder.addMessageWithOutput(this.attribs.filename, this.attribs.line, 'warning', this.text);
    } else {
      debugBreak();
      this.builder.addMessageWithOutput(
        this.attribs.filename,
        this.attribs.line,
        this.attribs.type,
        '!! Unhandled case, contact: https://github.com/matepek/vscode-catch2-test-adapter/issues; ' + this.text,
      );
      this._shared.log.errorS('doctest: unexpected message type', this.attribs);
    }
  }
}
