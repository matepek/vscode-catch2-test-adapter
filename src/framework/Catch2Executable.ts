import * as vscode from 'vscode';
import * as fs from 'fs';
import { inspect, promisify } from 'util';

import { XmlParser, XmlTag, XmlTagProcessor } from '../util/XmlParser';
import { RunnableProperties } from '../RunnableProperties';
import { AbstractExecutable, HandleProcessResult } from '../AbstractExecutable';
import { Catch2Test } from './Catch2Test';
import { WorkspaceShared } from '../WorkspaceShared';
import { RunningExecutable } from '../RunningExecutable';
import { AbstractTest } from '../AbstractTest';
import { CancellationFlag, Version } from '../Util';
import { TestGrouping } from '../TestGroupingInterface';
import { TestResultBuilder } from '../TestResultBuilder';
import { debugAssert, debugBreak } from '../util/DevelopmentHelper';
import { assert } from 'console';

export class Catch2Executable extends AbstractExecutable {
  public constructor(
    shared: WorkspaceShared,
    execInfo: RunnableProperties,
    private readonly _catch2Version: Version | undefined,
  ) {
    super(shared, execInfo, 'Catch2', _catch2Version);
  }

  protected override _addTest(testId: string, test: AbstractTest): void {
    // Catch2: xml output trimmes the name of the test
    super._addTest(testId.trim(), test);
  }

  protected override _getTest<T extends AbstractTest>(testId: string): T | undefined {
    // Catch2: xml output trimmes the name of the test
    return super._getTest<T>(testId.trim());
  }

  private getTestGrouping(): TestGrouping {
    if (this.properties.testGrouping) {
      return this.properties.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      return grouping;
    }
  }

  private async _reloadFromString(testListOutput: string, cancellationFlag: CancellationFlag): Promise<void> {
    const lines = testListOutput.split(/\r?\n/);

    const startRe = /Matching test cases:/;
    const endRe = /[0-9]+ matching test cases?/;

    let i = 0;

    while (i < lines.length) {
      const m = lines[i++].match(startRe);
      if (m !== null) break;
    }

    if (i >= lines.length) {
      this.shared.log.error('Wrong test list output format #1', testListOutput);
      throw Error('Wrong test list output format');
    }

    while (i < lines.length) {
      if (cancellationFlag.isCancellationRequested) return;

      const m = lines[i].match(endRe);
      if (m !== null) break;

      if (!lines[i].startsWith('  ')) this.shared.log.error('Wrong test list output format', i, lines);

      if (lines[i].startsWith('    ')) {
        this.shared.log.warn('Probably too long test name', i, lines);

        this._createAndAddError(
          `⚡️ Too long test name`,
          [
            '⚠️ Probably too long test name or the test name starts with space characters!',
            '🛠 - Try to define `CATCH_CONFIG_CONSOLE_WIDTH 300` before `catch2.hpp` is included.',
            '🛠 - Remove whitespace characters from the beggining of test "' + lines[i].substr(2) + '"',
          ].join('\n'),
        );

        return;
      }
      const testName = lines[i++].substr(2);

      let filePath: string | undefined = undefined;
      let line: string | undefined = undefined;
      {
        const fileLine = lines[i++].substr(4);
        const fileLineRe = /(?:(.+):([0-9]+)|(.+)\(([0-9]+)\))/;
        const match = fileLine.match(fileLineRe);

        if (match && match.length == 5) {
          const matchedPath = match[1] ? match[1] : match[3];
          filePath = matchedPath;
          line = match[2] ? match[2] : match[4];
        } else {
          if (i < lines.length) {
            const match = (fileLine + lines[i].substr(4)).match(fileLineRe);
            if (match && match.length == 5) {
              const matchedPath = match[1] ? match[1] : match[3];
              filePath = matchedPath;
              line = match[2] ? match[2] : match[4];
              i += 1;
            } else {
              if (i + 1 < lines.length) {
                const match = (fileLine + lines[i].substr(4) + lines[i + 1].substr(4)).match(fileLineRe);
                if (match && match.length == 5) {
                  const matchedPath = match[1] ? match[1] : match[3];
                  filePath = matchedPath;
                  line = match[2] ? match[2] : match[4];
                  i += 2;
                } else {
                  this.shared.log.error('Could not find catch2 file info3', lines);
                }
              } else {
                this.shared.log.error('Could not find catch2 file info2', lines);
              }
            }
          } else {
            this.shared.log.error('Could not find catch2 file info1', lines);
          }
        }

        filePath = await this._resolveAndFindSourceFilePath(filePath);
      }

      let description: string | undefined = lines[i++].substr(4);
      if (description.startsWith('(NO DESCRIPTION)')) description = undefined;

      let tagsStr: string | undefined = undefined;
      if (i < lines.length && lines[i].startsWith('      [')) {
        tagsStr = lines[i].trim();
        ++i;
      }

      await this._createAndAddTest(testName, tagsStr, filePath, line, description);
    }

    if (i >= lines.length) this.shared.log.error('Wrong test list output format #2', lines);
  }

  private async _reloadFromXml(testListOutput: string, _cancellationFlag: CancellationFlag): Promise<void> {
    const createAndAddTest = this._createAndAddTest;

    const parser = new XmlParser(
      this.shared.log,
      {
        onopentag(tag: XmlTag): void | XmlTagProcessor {
          switch (tag.name) {
            case 'TestCase':
              return new TestCaseListingProcessor(createAndAddTest);
            default:
            case 'MatchingTests':
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
    tagsStr: string | undefined,
    file: string | undefined,
    line: string | undefined,
    description: string | undefined,
  ): Promise<Catch2Test> => {
    const tags: string[] = [];
    if (tagsStr) {
      const matches = tagsStr.match(/\[[^\[\]]+\]/g);
      if (matches) matches.forEach((t: string) => tags.push(t.substring(1, t.length - 1)));
    }

    const resolvedFile = await this._resolveAndFindSourceFilePath(file);

    return this._createTreeAndAddTest(
      this.getTestGrouping(),
      testName,
      resolvedFile,
      tags,
      description,
      (container: vscode.TestItemCollection) =>
        new Catch2Test(
          this.shared,
          this,
          container,
          this._catch2Version,
          testName,
          resolvedFile,
          line,
          tags,
          description,
        ),
      (test: Catch2Test) => test.update2(resolvedFile, line, tags, description),
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

          if (content === '') {
            this.shared.log.debug('loading from cache failed because file is empty');
          } else {
            if (this._catch2Version && this._catch2Version.major >= 3)
              await this._reloadFromXml(content, cancellationFlag);
            //TODO:future: streaming
            else await this._reloadFromString(content, cancellationFlag);
          }
        }
      } catch (e) {
        this.shared.log.warn('coudnt use cache', e);
      }
    }

    const args = this.properties.prependTestListingArgs.concat([
      '[.],*',
      '--verbosity',
      'high',
      '--list-tests',
      '--use-colour',
      'no',
    ]);

    if (this._catch2Version && this._catch2Version.major >= 3) args.push('--reporter', 'xml');

    this.shared.log.info('discovering tests', this.properties.path, args, this.properties.options.cwd);
    const catch2TestListOutput = await this.properties.spawner.spawnAsync(
      this.properties.path,
      args,
      this.properties.options,
      30000,
    );

    if (catch2TestListOutput.stderr && !this.properties.ignoreTestEnumerationStdErr) {
      this.shared.log.warn('reloadChildren -> catch2TestListOutput.stderr', catch2TestListOutput);
      await this._createAndAddUnexpectedStdError(catch2TestListOutput.stdout, catch2TestListOutput.stderr);
      return;
    }

    if (catch2TestListOutput.stdout.length === 0) {
      this.shared.log.debug(catch2TestListOutput);
      throw Error('stoud is empty');
    }

    const result =
      this._catch2Version && this._catch2Version.major >= 3
        ? await this._reloadFromXml(catch2TestListOutput.stdout, cancellationFlag)
        : await this._reloadFromString(catch2TestListOutput.stdout, cancellationFlag);

    if (this.shared.enabledTestListCaching) {
      promisify(fs.writeFile)(cacheFile, catch2TestListOutput.stdout).catch(err =>
        this.shared.log.warn('couldnt write cache file:', err),
      );
    }

    return result;
  }

  protected _getRunParamsInner(childrenToRun: readonly Readonly<Catch2Test>[]): string[] {
    const execParams: string[] = [];

    const testNames = childrenToRun.map(c => c.getEscapedTestName());
    execParams.push(testNames.join(','));

    execParams.push('--reporter');
    execParams.push('xml');
    execParams.push('--durations');
    execParams.push('yes');

    if (this.shared.isNoThrow) execParams.push('--nothrow');

    if (this.shared.rngSeed !== null) {
      execParams.push('--order');
      execParams.push('rand');
      execParams.push('--rng-seed');
      execParams.push(this.shared.rngSeed.toString());
    }

    return execParams;
  }

  protected _getDebugParamsInner(childrenToRun: readonly Catch2Test[], breakOnFailure: boolean): string[] {
    const debugParams: string[] = [];

    const testNames = childrenToRun.map(c => c.getEscapedTestName());
    debugParams.push(testNames.join(','));

    debugParams.push('--reporter');
    debugParams.push('console');
    debugParams.push('--durations');
    debugParams.push('yes');

    if (this.shared.isNoThrow) debugParams.push('--nothrow');

    if (this.shared.rngSeed !== null) {
      debugParams.push('--order');
      debugParams.push('rand');
      debugParams.push('--rng-seed');
      debugParams.push(this.shared.rngSeed.toString());
    }

    // TODO:future colouring 'debug.enableOutputColouring'

    if (breakOnFailure) debugParams.push('--break');
    return debugParams;
  }

  protected async _handleProcess(testRun: vscode.TestRun, runInfo: RunningExecutable): Promise<HandleProcessResult> {
    const unexpectedTests: Catch2Test[] = [];
    const expectedToRunAndFoundTests: Catch2Test[] = [];
    const executable = this; //eslint-disable-line
    const log = this.shared.log;
    let rngSeed: number | undefined = undefined;

    const parser = new XmlParser(
      this.shared.log,
      {
        async onopentag(tag: XmlTag): Promise<void | XmlTagProcessor> {
          switch (tag.name) {
            case 'Randomness':
              rngSeed = parseInt(tag.attribs['seed']);
              testRun.appendOutput(`🔀 Randomness seeded to: ${rngSeed.toString()}\r\n\r\n`);
              break;
            case 'TestCase': {
              let test = executable._getTest<Catch2Test>(tag.attribs.name);
              if (!test) {
                log.info('TestCase not found in children', tag);
                test = await executable._createAndAddTest(
                  tag.attribs.name,
                  tag.attribs.tags,
                  tag.attribs.filename,
                  tag.attribs.line,
                  tag.attribs.description,
                );
                unexpectedTests.push(test);
              } else {
                expectedToRunAndFoundTests.push(test);
              }
              const builder = new TestResultBuilder(test, testRun, runInfo.runPrefix, true);
              return new TestCaseTagProcessor(executable.shared, builder, test, tag.attribs);
            }
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
          executable.processStdErr(testRun, runInfo.runPrefix, c);
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

class TestCaseListingProcessor implements XmlTagProcessor {
  constructor(
    private readonly create: (
      testName: string,
      tagsStr: string | undefined,
      file: string | undefined,
      line: string | undefined,
      description: string | undefined,
    ) => Promise<Catch2Test>,
  ) {}

  private name: string | undefined = undefined;
  private className: string | undefined = undefined;
  private tags: string | undefined = undefined;
  private file: string | undefined = undefined;
  private line: string | undefined = undefined;

  ontext(dataTrimmed: string, parentTag: XmlTag): void {
    switch (parentTag.name) {
      case 'Name':
        this.name = dataTrimmed;
        break;
      case 'ClassName':
        this.className = dataTrimmed;
        break;
      case 'Tags':
        this.tags = dataTrimmed;
        break;
      case 'File':
        this.file = dataTrimmed;
        break;
      case 'Line':
        this.line = dataTrimmed;
        break;
    }
  }

  async end(): Promise<void> {
    debugAssert(this.name);
    await this.create(this.name!, this.tags, this.file, this.line, this.className);
  }
}

///

abstract class TagProcessorBase implements XmlTagProcessor {
  constructor(public readonly builder: TestResultBuilder, protected readonly shared: WorkspaceShared) {}

  public onopentag(tag: XmlTag): XmlTagProcessor | void {
    const procCreator = TagProcessorBase.openTagProcessorMap.get(tag.name);
    if (procCreator) {
      return procCreator(tag, this.builder, this.shared);
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
        return processor(dataTrimmed, parentTag, this.builder, this.shared);
      } catch (e) {
        this.shared.log.exceptionS(e);
        this.builder.addOutputLine(1, 'Unknown fatal error: ' + inspect(e));
        this.builder.errored();
      }
    } else if (processor === null) {
      // known tag, do nothing
    } else {
      const p = TagProcessorBase.openTagProcessorMap.get(parentTag.name);
      if (p || p === null) {
        // known tag, do nothing
      } else {
        this.shared.log.errorS('unhandled tag:' + parentTag.name, parentTag);
        this.builder.addOutputLine(1, `Unknown XML tag: ${parentTag.name} with ${JSON.stringify(parentTag.attribs)}`);
      }
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
    null | ((tag: XmlTag, builder: TestResultBuilder, shared: WorkspaceShared) => void | XmlTagProcessor)
  > = new Map([
    [
      'OverallResult',
      (tag: XmlTag, builder: TestResultBuilder, _shared: WorkspaceShared) => {
        builder.setDurationMilisec(parseFloat(tag.attribs.durationInSeconds) * 1000);
        if (tag.attribs.success === 'true') {
          builder.passed();
        } else {
          builder.failed();
        }
      },
    ],
    [
      'OverallResults',
      (tag: XmlTag, builder: TestResultBuilder, _shared: WorkspaceShared) => {
        builder.setDurationMilisec(parseFloat(tag.attribs.durationInSeconds) * 1000);
        if (
          (!tag.attribs.expectedFailures && tag.attribs.failures !== '0') ||
          (tag.attribs.expectedFailures && tag.attribs.failures !== tag.attribs.expectedFailures)
        ) {
          builder.failed();
        } else {
          builder.passed();
        }
      },
    ],
    [
      'Expression',
      (tag: XmlTag, builder: TestResultBuilder, shared: WorkspaceShared): XmlTagProcessor =>
        new ExpressionProcessor(shared, builder, tag.attribs),
    ],
    [
      'Section',
      (tag: XmlTag, builder: TestResultBuilder, shared: WorkspaceShared): XmlTagProcessor =>
        new SectionProcessor(shared, builder, tag.attribs),
    ],
    [
      'BenchmarkResults',
      (tag: XmlTag, builder: TestResultBuilder, shared: WorkspaceShared): XmlTagProcessor => {
        assert(tag.attribs.name);
        const subTest = builder.test.getOrCreateSubTest(tag.attribs.name, undefined, undefined, undefined);
        const subBuilder = builder.createSubTestBuilder(subTest);
        return new BenchmarkResultsProcessor(shared, subBuilder, tag.attribs);
      },
    ],
  ]);

  private static readonly textProcessorMap: Map<
    string,
    null | ((dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, shared: WorkspaceShared) => void)
  > = new Map([
    [
      'StdOut',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: WorkspaceShared) => {
        builder.addQuoteWithLocation(parentTag.attribs.filename, parentTag.attribs.line, 'std::cout', dataTrimmed);
      },
    ],
    [
      'StdErr',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: WorkspaceShared) => {
        builder.addQuoteWithLocation(parentTag.attribs.filename, parentTag.attribs.line, 'std::cerr', dataTrimmed);
      },
    ],
    [
      'Exception',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: WorkspaceShared) => {
        builder.addMessageWithOutput(
          parentTag.attribs.filename,
          parentTag.attribs.line,
          'Exception: `' + dataTrimmed + '`',
        );
      },
    ],
    [
      'FatalErrorCondition',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: WorkspaceShared) => {
        builder.addMessageWithOutput(
          parentTag.attribs.filename,
          parentTag.attribs.line,
          'FatalErrorCondition',
          dataTrimmed,
        );
      },
    ],
    [
      'Failure',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: WorkspaceShared) => {
        builder.addMessageWithOutput(parentTag.attribs.filename, parentTag.attribs.line, 'Failure', dataTrimmed);
      },
    ],
    [
      'Warning',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: WorkspaceShared) => {
        builder.addQuoteWithLocation(parentTag.attribs.filename, parentTag.attribs.line, 'Warning', dataTrimmed);
      },
    ],
    [
      'Info',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: WorkspaceShared) => {
        builder.addQuoteWithLocation(parentTag.attribs.filename, parentTag.attribs.line, 'Info', dataTrimmed);
      },
    ],
  ]);
}

///

class TestCaseTagProcessor extends TagProcessorBase {
  public constructor(
    shared: WorkspaceShared,
    builder: TestResultBuilder,
    test: Catch2Test,
    attribs: Record<string, string>,
  ) {
    super(builder, shared);
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

  public end(): void {
    this.builder.build();
  }
}

///

class SectionProcessor extends TagProcessorBase {
  public constructor(shared: WorkspaceShared, testBuilder: TestResultBuilder, attribs: Record<string, string>) {
    if (typeof attribs.name !== 'string' || !attribs.name) throw Error('Section must have name attribute');

    const subTest = testBuilder.test.getOrCreateSubTest(attribs.name, undefined, attribs.filename, attribs.line);
    const subTestBuilder = testBuilder.createSubTestBuilder(subTest);
    subTestBuilder.started();

    super(subTestBuilder, shared);
  }

  public end(): void {
    this.builder.build();
  }
}

class ExpressionProcessor implements XmlTagProcessor {
  public constructor(
    private readonly _shared: WorkspaceShared,
    private readonly builder: TestResultBuilder,
    private readonly attribs: Record<string, string>,
  ) {}

  private original?: string;
  private expanded?: string;
  private exception?: string;
  private fatalErrorCondition?: string;

  public ontext(dataTrimmed: string, parentTag: XmlTag): void {
    switch (parentTag.name) {
      case 'Original':
        this.original = dataTrimmed;
        break;
      case 'Expanded':
        this.expanded = dataTrimmed;
        break;
      case 'Exception':
        this.exception = dataTrimmed;
        break;
      case 'FatalErrorCondition':
        this.fatalErrorCondition = dataTrimmed;
        break;
      default:
        this._shared.log.errorS('unknown tag', parentTag);
        debugBreak();
        break;
    }
  }

  public end(): void {
    debugAssert(this.original && this.expanded);
    if (this.fatalErrorCondition) {
      this.builder.addMessageWithOutput(
        this.attribs.filename,
        this.attribs.line,
        `FatalErrorCondition: \`${this.fatalErrorCondition}\``,
      );
    } else if (this.exception) {
      this.builder.addMessageWithOutput(
        this.attribs.filename,
        this.attribs.line,
        `${this.attribs.type} threw an exception: \`${this.exception}\``,
        'Original:  ' + this.original,
      );
    } else {
      this.builder.addExpressionMsg(
        this.attribs.filename,
        this.attribs.line,
        this.original!,
        this.expanded!,
        this.attribs.type,
      );
    }
  }
}

///

class BenchmarkResultsProcessor implements XmlTagProcessor {
  /*
      <BenchmarkResults name="Fibonacci 30" samples="100" resamples="100000" iterations="1" clockResolution="77" estimatedDuration="498765100">
        <!--All values in nano seconds-->
        <mean value="5097080" lowerBound="5044540" upperBound="5174158" ci="0.95"/>
        <standardDeviation value="320856" lowerBound="241766" upperBound="471240" ci="0.95"/>
        <outliers variance="0.595328" lowMild="0" lowSevere="0" highMild="3" highSevere="2"/>
      </BenchmarkResults>
   */
  public constructor(
    private readonly shared: WorkspaceShared,
    private readonly builder: TestResultBuilder,
    private readonly attribs: Record<string, string>,
  ) {
    builder.started();
  }

  private readonly started = Date.now();

  private mean?: Record<string, string>;
  private standardDeviation?: Record<string, string>;
  private outliers?: Record<string, string>;
  private failed?: Record<string, string>;

  onopentag(tag: XmlTag): void {
    switch (tag.name) {
      case 'mean':
        this.mean = tag.attribs;
        break;
      case 'standardDeviation':
        this.standardDeviation = tag.attribs;
        break;
      case 'outliers':
        this.outliers = tag.attribs;
        break;
      case 'failed':
        this.failed = tag.attribs;
        break;
      default:
        this.shared.log.errorS('unexpected tag for catch2 benchmark', tag);
        break;
    }
  }

  public end(): void {
    if (this.failed) {
      this.builder.addOutputLine(1, 'Failed: `' + this.failed.message + '`');
      this.builder.failed();
    } else {
      {
        const attribs = this.attribs;
        assert(attribs.name);

        const params = Object.keys(attribs)
          .filter(n => n !== 'name')
          .map(key => `- ${key}: ${attribs[key]}`);

        this.builder.addOutputLine(1, ...params);
      }
      if (this.mean) {
        const mean = this.mean;
        const params = Object.keys(mean)
          .filter(n => n !== 'value')
          .map(key => `- ${key}: ${mean[key]} ns`);

        this.builder.addOutputLine(1, `Mean: ${mean.value} ns:`);
        this.builder.addOutputLine(1, ...params);
      }
      if (this.standardDeviation) {
        const standardDeviation = this.standardDeviation;
        const params = Object.keys(standardDeviation)
          .filter(n => n !== 'value')
          .map(key => `- ${key}: ${standardDeviation[key]} ns`);

        this.builder.addOutputLine(1, `Standard Deviation: ${standardDeviation.value} ns:`);
        this.builder.addOutputLine(1, ...params);
      }
      if (this.outliers) {
        const outliers = this.outliers;
        const params = Object.keys(outliers).map(key => `- ${key}: ${outliers[key]} ns`);

        this.builder.addOutputLine(1, `Outliers:`);
        this.builder.addOutputLine(1, ...params);
      }

      this.builder.setDurationMilisec(Date.now() - this.started);
      this.builder.passed();
    }
    this.builder.build();
  }
}
