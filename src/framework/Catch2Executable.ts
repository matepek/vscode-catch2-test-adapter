import * as vscode from 'vscode';
import * as fs from 'fs';
import { inspect, promisify } from 'util';

import { XmlParser, XmlTag, XmlTagProcessor } from '../util/XmlParser';
import { SharedVarOfExec } from '../SharedVarOfExec';
import { AbstractExecutable, HandleProcessResult } from '../AbstractExecutable';
import { Catch2Test } from './Catch2Test';
import { RunningExecutable } from '../RunningExecutable';
import { SubTestTree } from '../AbstractTest';
import { CancellationFlag, Version } from '../Util';
import { TestGroupingConfig } from '../TestGroupingInterface';
import { TestResultBuilder } from '../TestResultBuilder';
import { assert, debugBreak } from '../util/DevelopmentHelper';
import { pipeOutputStreams2Parser, pipeOutputStreams2String, pipeProcess2Parser } from '../util/ParserInterface';
import { Readable } from 'stream';

export class Catch2Executable extends AbstractExecutable<Catch2Test> {
  constructor(sharedVarOfExec: SharedVarOfExec, private readonly _catch2Version: Version | undefined) {
    super(sharedVarOfExec, 'Catch2', _catch2Version);
  }

  protected override _addTest(testId: string, test: Catch2Test): void {
    // Catch2: xml output trimmes the name of the test
    super._addTest(testId.trim(), test);
  }

  protected override _getTest(testId: string): Catch2Test | undefined {
    // Catch2: xml output trimmes the name of the test
    return super._getTest(testId.trim());
  }

  private getTestGrouping(): TestGroupingConfig {
    if (this.shared.testGrouping) {
      return this.shared.testGrouping;
    } else {
      const grouping = { groupByExecutable: this._getGroupByExecutable() };
      return grouping;
    }
  }

  private async _reloadFromString(stream: Readable, cancellationFlag: CancellationFlag): Promise<void> {
    const [stdout, stderr] = await pipeOutputStreams2String(stream, undefined);

    if (stderr && !this.shared.ignoreTestEnumerationStdErr) {
      this.shared.log.warn('reloadChildren -> stderr', stderr);
      await this._createAndAddUnexpectedStdError(stdout, stderr);
      return;
    }

    const lines = stdout.split(/\r?\n/);

    const startRe = /Matching test cases:/;
    const endRe = /[0-9]+ matching test cases?/;

    let i = 0;

    while (i < lines.length) {
      const m = lines[i++].match(startRe);
      if (m !== null) break;
    }

    if (i >= lines.length) {
      this.shared.log.error('Wrong test list output format #1', stdout);
      throw Error('Wrong test list output format');
    }

    while (i < lines.length) {
      if (cancellationFlag.isCancellationRequested) return;

      const m = lines[i].match(endRe);
      if (m !== null) break;

      if (!lines[i].startsWith('  ')) this.shared.log.error('Wrong test list output format', i, lines);

      if (lines[i].startsWith('    ')) {
        this.shared.log.warn('Probably too long test name', i, lines);

        await this._createAndAddError(
          `⚡️ Too long test name`,
          [
            '⚠️ Probably too long test name or the test name starts with space characters!',
            '🛠 - Try to define `CATCH_CONFIG_CONSOLE_WIDTH 300` before `catch2.hpp` is included.',
            '🛠 - Remove whitespace characters from the beggining of test "' + lines[i].substring(2) + '"',
          ].join('\n'),
        );

        return;
      }
      const testName = lines[i++].substring(2);

      let filePath: string | undefined = undefined;
      let line: string | undefined = undefined;
      {
        const fileLine = lines[i++].substring(4);
        const fileLineRe = /(?:(.+):([0-9]+)|(.+)\(([0-9]+)\))/;
        const match = fileLine.match(fileLineRe);

        if (match && match.length == 5) {
          const matchedPath = match[1] ? match[1] : match[3];
          filePath = matchedPath;
          line = match[2] ? match[2] : match[4];
        } else {
          if (i < lines.length) {
            const match = (fileLine + lines[i].substring(4)).match(fileLineRe);
            if (match && match.length == 5) {
              const matchedPath = match[1] ? match[1] : match[3];
              filePath = matchedPath;
              line = match[2] ? match[2] : match[4];
              i += 1;
            } else {
              if (i + 1 < lines.length) {
                const match = (fileLine + lines[i].substring(4) + lines[i + 1].substring(4)).match(fileLineRe);
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
      }

      let description: string | undefined = lines[i++].substring(4);
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

  private async _reloadFromXml(stream: Readable, _cancellationFlag: CancellationFlag): Promise<void> {
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

    await pipeOutputStreams2Parser(stream, undefined, parser, undefined);
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

    const resolvedFile = await this.resolveAndFindSourceFilePath(file);

    return this._createTreeAndAddTest(
      this.getTestGrouping(),
      testName,
      resolvedFile,
      tags,
      description,
      (parent: vscode.TestItem | undefined) =>
        new Catch2Test(this, parent, this._catch2Version, testName, resolvedFile, line, tags, description),
      (test: Catch2Test) => test.update2(resolvedFile, line, tags, description),
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
          const stream = fs.createReadStream(cacheFile, 'utf8');

          if (this._catch2Version && this._catch2Version.major >= 3)
            await this._reloadFromXml(stream, cancellationFlag);
          else await this._reloadFromString(stream, cancellationFlag);
        }
      } catch (e) {
        this.shared.log.warn('coudnt use cache', e);
      }
    }

    const args = this.shared.prependTestListingArgs.concat([
      '[.],*',
      '--verbosity',
      'high',
      '--list-tests',
      '--use-colour',
      'no',
    ]);

    if (this._catch2Version && this._catch2Version.major >= 3) args.push('--reporter', 'xml');

    this.shared.log.info('discovering tests', this.shared.path, args, this.shared.options.cwd);

    //const process = await this.sharedVarOfExec.spawner.spawn(this.sharedVarOfExec.path, args, this.sharedVarOfExec.options);

    const catch2TestListingProcess = await this.shared.spawner.spawn(this.shared.path, args, this.shared.options);

    const result =
      this._catch2Version && this._catch2Version.major >= 3
        ? await this._reloadFromXml(catch2TestListingProcess.stdout, cancellationFlag)
        : await this._reloadFromString(catch2TestListingProcess.stdout, cancellationFlag);

    if (this.shared.enabledTestListCaching) {
      const writeStream = fs.createWriteStream(cacheFile);
      catch2TestListingProcess.stdout.pipe(writeStream);
      writeStream.once('error', (err: Error) => {
        this.shared.log.warn('couldnt write cache file:', err);
      });
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
              testRun.appendOutput(runInfo.runPrefix + `🔀 Randomness seeded to: ${rngSeed.toString()}\r\n\r\n`);
              break;
            case 'TestCase': {
              let test = executable._getTest(tag.attribs.name);
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
    assert(this.name);
    await this.create(this.name!, this.tags, this.file, this.line, this.className);
  }
}

///

abstract class TagProcessorBase implements XmlTagProcessor {
  constructor(
    readonly builder: TestResultBuilder,
    protected readonly shared: SharedVarOfExec,
    protected readonly sections: SubTestTree,
  ) {}

  onopentag(tag: XmlTag): void | XmlTagProcessor | Promise<void | XmlTagProcessor> {
    const procCreator = TagProcessorBase.openTagProcessorMap.get(tag.name);
    if (procCreator) {
      return procCreator(tag, this.builder, this.shared, this.sections);
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

  ontext(dataTrimmed: string, parentTag: XmlTag): void {
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

  onstderr(data: string, _parentTag: XmlTag | undefined): void {
    this.builder.addQuoteWithLocation(undefined, undefined, 'std::cerr', data);
  }

  private static readonly openTagProcessorMap: Map<
    string,
    | null
    | ((
        tag: XmlTag,
        builder: TestResultBuilder,
        shared: SharedVarOfExec,
        sections: SubTestTree,
      ) => void | XmlTagProcessor | Promise<void | XmlTagProcessor>)
  > = new Map([
    [
      'OverallResult',
      (tag: XmlTag, builder: TestResultBuilder, _shared: SharedVarOfExec, _sections: SubTestTree): void => {
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
      (tag: XmlTag, builder: TestResultBuilder, _shared: SharedVarOfExec) => {
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
      (tag: XmlTag, builder: TestResultBuilder, shared: SharedVarOfExec): XmlTagProcessor =>
        new ExpressionProcessor(shared, builder, tag.attribs),
    ],
    [
      'Section',
      (
        tag: XmlTag,
        builder: TestResultBuilder,
        shared: SharedVarOfExec,
        sections: SubTestTree,
      ): Promise<XmlTagProcessor> => SectionProcessor.create(shared, builder, tag.attribs, sections),
    ],
    [
      'BenchmarkResults',
      async (
        tag: XmlTag,
        builder: TestResultBuilder,
        shared: SharedVarOfExec,
        sections: SubTestTree,
      ): Promise<XmlTagProcessor> => {
        assert(tag.attribs.name);
        const subTest = await builder.test.getOrCreateSubTest(tag.attribs.name, undefined, undefined, undefined);
        const subBuilder = builder.createSubTestBuilder(subTest);

        let subSections = sections.get(tag.attribs.name);
        if (subSections === undefined) {
          subSections = new Map();
          sections.set(tag.attribs.name, subSections);
        }

        return new BenchmarkResultsProcessor(shared, subBuilder, tag.attribs);
      },
    ],
  ]);

  private static readonly textProcessorMap: Map<
    string,
    null | ((dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, shared: SharedVarOfExec) => void)
  > = new Map([
    [
      'StdOut',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: SharedVarOfExec) => {
        builder.addQuoteWithLocation(parentTag.attribs.filename, parentTag.attribs.line, 'std::cout', dataTrimmed);
      },
    ],
    [
      'StdErr',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: SharedVarOfExec) => {
        builder.addQuoteWithLocation(parentTag.attribs.filename, parentTag.attribs.line, 'std::cerr', dataTrimmed);
      },
    ],
    [
      'Exception',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: SharedVarOfExec) => {
        builder.addMessageWithOutput(
          parentTag.attribs.filename,
          parentTag.attribs.line,
          'Exception: `' + dataTrimmed + '`',
        );
      },
    ],
    [
      'FatalErrorCondition',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: SharedVarOfExec) => {
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
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: SharedVarOfExec) => {
        builder.addMessageWithOutput(parentTag.attribs.filename, parentTag.attribs.line, 'Failure', dataTrimmed);
      },
    ],
    [
      'Warning',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: SharedVarOfExec) => {
        builder.addQuoteWithLocation(parentTag.attribs.filename, parentTag.attribs.line, 'Warning', dataTrimmed);
      },
    ],
    [
      'Info',
      (dataTrimmed: string, parentTag: XmlTag, builder: TestResultBuilder, _shared: SharedVarOfExec) => {
        builder.addQuoteWithLocation(parentTag.attribs.filename, parentTag.attribs.line, 'Info', dataTrimmed);
      },
    ],
  ]);
}

///

class TestCaseTagProcessor extends TagProcessorBase {
  constructor(
    shared: SharedVarOfExec,
    builder: TestResultBuilder,
    private readonly test: Catch2Test,
    private readonly attribs: Record<string, string>,
  ) {
    super(builder, shared, new Map());
  }

  async begin(): Promise<void> {
    this.builder.started();
    await this.test.updateFL(this.attribs.filename, this.attribs.line);
  }

  end(): void {
    this.builder.test.removeMissingSubTests(this.sections);
    this.builder.build();
  }
}

///

class SectionProcessor extends TagProcessorBase {
  static async create(
    shared: SharedVarOfExec,
    testBuilder: TestResultBuilder,
    attribs: Record<string, string>,
    sections: SubTestTree,
  ) {
    if (typeof attribs.name !== 'string' || !attribs.name) throw Error('Section must have name attribute');

    const subTest = await testBuilder.test.getOrCreateSubTest(attribs.name, undefined, attribs.filename, attribs.line);
    const subTestBuilder = testBuilder.createSubTestBuilder(subTest);

    let subSections = sections.get(attribs.name);
    if (subSections === undefined) {
      subSections = new Map();
      sections.set(attribs.name, subSections);
    }

    return new SectionProcessor(shared, subTestBuilder, subSections);
  }

  private constructor(shared: SharedVarOfExec, testBuilder: TestResultBuilder, sections: SubTestTree) {
    testBuilder.started();
    super(testBuilder, shared, sections);
  }

  end(): void {
    this.builder.build();
  }
}

class ExpressionProcessor implements XmlTagProcessor {
  constructor(
    private readonly _shared: SharedVarOfExec,
    private readonly builder: TestResultBuilder,
    private readonly attribs: Record<string, string>,
  ) {}

  private original?: string;
  private expanded?: string;
  private exception?: string;
  private fatalErrorCondition?: string;

  ontext(dataTrimmed: string, parentTag: XmlTag): void {
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

  end(): void {
    assert(this.original && this.expanded);
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
  constructor(
    private readonly shared: SharedVarOfExec,
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

  end(): void {
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
