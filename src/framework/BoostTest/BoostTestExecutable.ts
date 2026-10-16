import * as vscode from 'vscode';
import * as fs from 'fs';
import { promisify } from 'util';

import { AbstractExecutable, HandleProcessResult } from '../AbstractExecutable';
import { BoostTestTest } from './BoostTestTest';
import { BoostTestCaseInfo, parseBoostTestDot } from './BoostTestDotParser';
import { SharedVarOfExec } from '../SharedVarOfExec';
import { RunningExecutable } from '../../RunningExecutable';
import { CancellationFlag } from '../../Util';
import { TestGroupingConfig } from '../../TestGroupingInterface';
import { XmlParser, XmlTag, XmlTagProcessor } from '../../util/XmlParser';
import { addOutputForTestRun, TestResultBuilder } from '../../TestResultBuilder';
import { TestItemParent } from '../../TestItemManager';
import { AbstractTest } from '../AbstractTest';
import { pipeOutputStreams2Parser } from '../../util/ParserInterface';

export class BoostTestExecutable extends AbstractExecutable<BoostTestTest> {
  constructor(sharedVarOfExec: SharedVarOfExec) {
    super(sharedVarOfExec, 'Boost.Test', undefined);
  }

  private getTestGrouping(): TestGroupingConfig {
    if (this.shared.testGrouping) {
      return this.shared.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      grouping.groupByExecutable.groupBySplittedTestName = { splitBy: '/' };
      return grouping;
    }
  }

  private async _reloadFromDot(dot: string, cancellationFlag: CancellationFlag): Promise<void> {
    for (const info of parseBoostTestDot(dot)) {
      if (cancellationFlag.isCancellationRequested) return;
      await this._createAndAddTest(info);
    }
  }

  private readonly _createAndAddTest = async (info: BoostTestCaseInfo): Promise<BoostTestTest> => {
    const id = info.path.join('/');
    const resolvedFile = await this.findSourceFilePath(info.file);
    return this._createTreeAndAddTest(
      this.getTestGrouping(),
      id,
      resolvedFile,
      info.line,
      [...info.labels],
      undefined,
      (parent: TestItemParent, testName: string | undefined) =>
        new BoostTestTest(
          this,
          parent,
          id,
          testName ?? id,
          resolvedFile,
          info.line,
          info.enabled,
          info.labels,
          info.expectedFailures,
          info.timeoutSec,
        ),
      (test: BoostTestTest) =>
        test.update2(resolvedFile, info.line, info.enabled, info.labels, info.expectedFailures, info.timeoutSec),
    );
  };

  protected async _reloadChildren(cancellationFlag: CancellationFlag): Promise<void> {
    const cacheFile = this.shared.path + `.TestMate.testListCache.${this.shared.optionsHash}.txt`;

    if (this.shared.enabledTestListCaching) {
      try {
        const cacheStat = await promisify(fs.stat)(cacheFile);
        const execStat = await promisify(fs.stat)(this.shared.path);

        if (cacheStat.size > 0 && cacheStat.mtime > execStat.mtime) {
          this.shared.log.info('loading from cache: ', cacheFile);
          const content = await promisify(fs.readFile)(cacheFile, 'utf8');

          return await this._reloadFromDot(content, cancellationFlag);
        }
      } catch (e) {
        this.shared.log.warn('coudnt use cache', e);
      }
    }

    const prependTestListingArgs = await Promise.all(this.shared.prependTestListingArgs.map(x => this.resolveText(x)));
    const args = prependTestListingArgs.concat(['--list_content=DOT']);

    const pathForExecution = await this._getPathForExecution();
    this.shared.log.info('discovering tests', this.shared.path, pathForExecution, args, this.shared.options);
    const listOutput = await this.shared.spawnerForListing.spawnAsync(
      pathForExecution,
      args,
      this.shared.options,
      30000,
    );

    // Boost.Test lists to stderr, stdout can have the output of a custom main function
    if (listOutput.stdout) this.shared.log.debug('reloadChildren -> stdout', listOutput.stdout);

    const dotStart = listOutput.stderr.indexOf('digraph G {');
    if (
      dotStart === -1 ||
      (listOutput.stderr.substring(0, dotStart).trim() && !this.shared.ignoreTestEnumerationStdErr)
    ) {
      this.shared.log.warn(
        'reloadChildren -> unexpected listing output',
        listOutput.stdout,
        listOutput.stderr,
        listOutput.error,
        listOutput.status,
      );
      return await this._createAndAddUnexpectedStdError(listOutput.stdout, listOutput.stderr);
    }

    const dot = listOutput.stderr.substring(dotStart);
    const result = await this._reloadFromDot(dot, cancellationFlag);

    if (this.shared.enabledTestListCaching) {
      promisify(fs.writeFile)(cacheFile, dot).catch(err => this.shared.log.warn('couldnt write cache file:', err));
    }

    return result;
  }

  private _getBoostTestFilterParams(childrenToRun: readonly Readonly<AbstractTest>[] | null): string[] {
    if (childrenToRun === null) return [];

    const namesByParentPath = new Map<string, string[]>();
    for (const test of childrenToRun) {
      if (!(test instanceof BoostTestTest)) {
        this.log.warnS('wrong run/debug combo', childrenToRun);
        throw Error('Cannot run/debug this combination.');
      }
      const sep = test.id.lastIndexOf('/');
      const parentPath = test.id.substring(0, sep + 1);
      const names = namesByParentPath.get(parentPath);
      if (names) names.push(test.id.substring(sep + 1));
      else namesByParentPath.set(parentPath, [test.id.substring(sep + 1)]);
    }

    const filter = [...namesByParentPath.entries()].map(([parentPath, names]) => parentPath + names.join(','));
    return ['--run_test=' + filter.join(':')];
  }

  private _getBoostTestCommonParams(): string[] {
    const params: string[] = [];
    const yesNo = (b: boolean): string => (b ? 'yes' : 'no');

    if (this.shared.catchSystemErrors !== undefined)
      params.push('--catch_system_errors=' + yesNo(this.shared.catchSystemErrors));

    if (this.shared.detectFpExceptions !== undefined)
      params.push('--detect_fp_exceptions=' + yesNo(this.shared.detectFpExceptions));

    if (this.shared.detectMemoryLeaks !== undefined)
      params.push('--detect_memory_leaks=' + this.shared.detectMemoryLeaks.toString());

    if (this.shared.rngSeed !== null)
      params.push('--random=' + (this.shared.rngSeed === 'time' ? '1' : this.shared.rngSeed.toString()));

    return params;
  }

  protected _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[] | null): string[] {
    return [
      ...this._getBoostTestFilterParams(childrenToRun),
      '--log_format=XML',
      '--log_level=' + (this.shared.logPassedAssertions ? 'success' : 'test_suite'),
      // stdout is not flushed by the framework: no streaming and a crash would lose the whole log
      '--log_sink=stderr',
      '--report_level=no',
      '--color_output=no',
      ...this._getBoostTestCommonParams(),
    ];
  }

  protected _getDebugParamsInner(childrenToRun: readonly Readonly<AbstractTest>[], _breakOnFailure: boolean): string[] {
    // Boost.Test has no command line option to break on a failed assertion
    return [
      ...this._getBoostTestFilterParams(childrenToRun),
      '--log_format=HRF',
      '--log_level=' + (this.shared.logPassedAssertions ? 'success' : 'message'),
      '--report_level=short',
      '--color_output=' + (this.shared.enableDebugColouring ? 'yes' : 'no'),
      ...this._getBoostTestCommonParams(),
    ];
  }

  protected async _handleProcess(testRun: vscode.TestRun, runInfo: RunningExecutable): Promise<HandleProcessResult> {
    const unexpectedTests: BoostTestTest[] = [];
    const expectedToRunAndFoundTests: BoostTestTest[] = [];
    const executable = this; //eslint-disable-line
    const requestedTestIds = runInfo.childrenToRun ? new Set(runInfo.childrenToRun.map(t => t.id)) : undefined;
    const suiteStack: string[] = []; // the first one is the master test suite
    let unfinished: TestCaseTagProcessor | undefined = undefined;

    const addRunOutput = async (entry: LogEntry): Promise<void> => {
      const loc = entry.file ? ` @ ${entry.file}${entry.line ? ':' + entry.line : ''}` : '';
      addOutputForTestRun(testRun, runInfo.runPrefix, 0, 0, true, `${entry.kind}${loc}:`);
      addOutputForTestRun(testRun, runInfo.runPrefix, 0, 1, true, ...entry.lines());
    };

    const parser = new XmlParser(
      this.shared.log,
      {
        async onopentag(tag: XmlTag): Promise<void | XmlTagProcessor> {
          switch (tag.name) {
            case 'TestSuite':
              suiteStack.push(tag.attribs.name);
              return;
            case 'TestCase': {
              const path = [...suiteStack.slice(1), tag.attribs.name];
              const testId = path.join('/');
              let test = executable._getTest(testId);

              if (tag.attribs.skipped === 'yes') {
                // filtered out tests are also reported as skipped
                if (test && (requestedTestIds === undefined || requestedTestIds.has(testId))) {
                  expectedToRunAndFoundTests.push(test);
                  const builder = new TestResultBuilder(test, testRun, runInfo.runPrefix, true);
                  builder.started();
                  if (tag.attribs.reason) builder.addReindentedOutput(1, `Skipped: ${tag.attribs.reason}`);
                  builder.skipped();
                  builder.build();
                }
                return;
              }

              if (!test) {
                executable.shared.log.info('TestCase not found in children', tag, testId);
                test = await executable._createAndAddTest({
                  path,
                  file: tag.attribs.file,
                  line: tag.attribs.line,
                  enabled: true,
                  labels: [],
                  expectedFailures: 0,
                  timeoutSec: undefined,
                });
                unexpectedTests.push(test);
              } else {
                expectedToRunAndFoundTests.push(test);
              }

              const builder = new TestResultBuilder(test, testRun, runInfo.runPrefix, true);
              return new TestCaseTagProcessor(executable.shared, builder, tag.attribs, p => (unfinished = p));
            }
            case 'Error':
            case 'FatalError':
            case 'Exception':
            case 'Warning':
            case 'Message':
            case 'Info':
              // suite level messages like global fixture failures
              return new LogEntryProcessor(tag, addRunOutput);
            default:
              return;
          }
        },
        onclosetag(tag: XmlTag): void {
          if (tag.name === 'TestSuite') suiteStack.pop();
        },
        ontext: (text: string) => {
          addOutputForTestRun(testRun, runInfo.runPrefix, 0, 0, false, text);
        },
      },
      (error: Error) => {
        this.shared.log.exceptionS('onerror', error);
      },
    );

    // the log is written to stderr (see --log_sink) so the roles of the streams are swapped
    await pipeOutputStreams2Parser(runInfo.process.stderr, runInfo.process.stdout, parser, (data: string) =>
      addOutputForTestRun(testRun, runInfo.runPrefix, 0, 0, false, data),
    );

    const leftBehind =
      (parser.parserStack.reverse().find(x => x instanceof TestCaseTagProcessor) as TestCaseTagProcessor | undefined) ??
      unfinished;

    return {
      unexpectedTests,
      expectedToRunAndFoundTests,
      leftBehindBuilder: leftBehind?.builder,
    };
  }
}

///

const getLocationAttribs = (attribs: Record<string, string>): { file?: string; line?: string } => {
  const file = attribs.file;
  if (!file || file === 'unknown location' || file === 'boost.test framework') return {};
  return { file, line: attribs.line && attribs.line !== '0' ? attribs.line : undefined };
};

class LogEntry {
  constructor(
    readonly kind: string,
    readonly file: string | undefined,
    readonly line: string | undefined,
  ) {}

  text = '';
  readonly context: string[] = [];
  checkpoint: { file?: string; line?: string; text: string } | undefined = undefined;

  lines(): string[] {
    const lines = [this.text];
    if (this.context.length) lines.push('Context:', ...this.context.map(c => '  ' + c));
    if (this.checkpoint) {
      const loc = this.checkpoint.file ? ` @ ${this.checkpoint.file}:${this.checkpoint.line ?? ''}` : '';
      lines.push(`Last checkpoint${loc}${this.checkpoint.text ? ': ' + this.checkpoint.text : ''}`);
    }
    return lines;
  }
}

class LogEntryProcessor implements XmlTagProcessor {
  constructor(
    tag: XmlTag,
    private readonly onEnd: (entry: LogEntry) => Promise<void>,
  ) {
    const loc = getLocationAttribs(tag.attribs);
    this.entry = new LogEntry(tag.name, loc.file, loc.line);
  }

  private readonly entry: LogEntry;

  onopentag(tag: XmlTag): void {
    if (tag.name === 'LastCheckpoint') this.entry.checkpoint = { ...getLocationAttribs(tag.attribs), text: '' };
  }

  ontext(dataTrimmed: string, parentTag: XmlTag): void {
    switch (parentTag.name) {
      case 'Frame':
        this.entry.context.push(dataTrimmed);
        break;
      case 'LastCheckpoint':
        if (this.entry.checkpoint) this.entry.checkpoint.text = dataTrimmed;
        break;
      default:
        this.entry.text = this.entry.text ? this.entry.text + '\n' + dataTrimmed : dataTrimmed;
        break;
    }
  }

  end(): Promise<void> {
    return this.onEnd(this.entry);
  }
}

///

class TestCaseTagProcessor implements XmlTagProcessor {
  constructor(
    private readonly shared: SharedVarOfExec,
    readonly builder: TestResultBuilder<BoostTestTest>,
    private readonly attribs: Record<string, string>,
    private readonly onUnfinished: (processor: TestCaseTagProcessor) => void,
  ) {}

  private failures = 0;
  private aborted = false;
  private finished = false;

  async begin(): Promise<void> {
    this.builder.started();
    const file = await this.builder.test.exec.findSourceFilePath(this.attribs.file);
    await this.builder.test.updateFL(file, this.attribs.line);
  }

  onopentag(tag: XmlTag): void | XmlTagProcessor {
    switch (tag.name) {
      case 'FatalError':
      case 'Exception':
      case 'Error':
        if (tag.name !== 'Error') this.aborted = true;
        this.failures++;
        return new LogEntryProcessor(tag, this.addFailure);
      case 'Warning':
      case 'Message':
      case 'Info':
        return new LogEntryProcessor(tag, this.addQuote);
      case 'TestingTime':
        return;
      default:
        this.shared.log.errorS('unhandled tag:' + tag.name);
        this.builder.addReindentedOutput(1, `Unknown XML tag: ${tag.name} with ${JSON.stringify(tag.attribs)}`);
        return;
    }
  }

  private readonly addFailure = async (entry: LogEntry): Promise<void> => {
    const file = entry.file ?? entry.checkpoint?.file;
    const line = entry.file ? entry.line : entry.checkpoint?.line;
    await this.builder.addMessageWithOutput(file, line, entry.kind, ...entry.lines());
  };

  private readonly addQuote = async (entry: LogEntry): Promise<void> => {
    await this.builder.addQuoteWithLocation(entry.file, entry.line, entry.kind, ...entry.lines());
  };

  async ontext(dataTrimmed: string, parentTag: XmlTag): Promise<void> {
    switch (parentTag.name) {
      case 'TestingTime':
        // the framework always writes it as the last child of a finished TestCase
        this.finished = true;
        this.builder.setDurationMilisec(parseInt(dataTrimmed) / 1000);
        break;
      case 'TestCase':
        await this.builder.addQuoteWithLocation(undefined, undefined, 'std::cerr', dataTrimmed);
        break;
      default:
        this.builder.addReindentedOutput(1, dataTrimmed);
        break;
    }
  }

  // called with the stdout of the process because the log is on stderr
  async onstderr(data: string, _parentTag: XmlTag | undefined): Promise<void> {
    await this.builder.addQuoteWithLocation(undefined, undefined, 'std::cout', data);
  }

  end(): void {
    // the parser closes the open tags when the stream ends, for example in case of a crash
    if (!this.finished) {
      this.onUnfinished(this);
      return;
    }

    const expectedFailures = this.builder.test.expectedFailures;
    if (this.aborted || this.failures > expectedFailures) {
      this.builder.failed();
    } else {
      if (this.failures > 0)
        this.builder.addReindentedOutput(1, `Expected failures: ${this.failures}/${expectedFailures}`);
      this.builder.passed();
    }
    this.builder.build();
  }
}
