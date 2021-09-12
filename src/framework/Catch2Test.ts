import * as vscode from 'vscode';
import * as xml2js from 'xml2js';
import { AbstractTest, SharedWithTest } from '../AbstractTest';
import { inspect } from 'util';
import { TestEventBuilder } from '../TestEventBuilder';
import * as pathlib from 'path';
import { generateId, Version } from '../Util';
import { AbstractRunnable } from '../AbstractRunnable';

interface XmlObject {
  [prop: string]: any; //eslint-disable-line
}

export class Catch2Section {
  public constructor(name: string, file: string | undefined, line: number) {
    this.name = name;
    this.filename = file ? pathlib.normalize(file) : undefined;
    this.line = line;
  }

  public readonly name: string;
  public readonly filename: string | undefined;
  public readonly line: number;
  public readonly children: Catch2Section[] = [];
  public failed = false;

  public get escapedName(): string {
    // some debug adapter on ubuntu starts debug session in shell,
    // this prevents the SECTION("`pwd`") to be executed
    return this.name.replace(/`/g, '\\`');
  }
}

const EscapeCharParserFix = new Version(2, 11, 4);

export class Catch2Test extends AbstractTest {
  public constructor(
    shared: SharedWithTest,
    runnable: AbstractRunnable,
    frameworkVersion: Version | undefined,
    testNameAsId: string,
    tags: string[],
    file: string | undefined,
    line: number | undefined,
    description: string | undefined,
  ) {
    const badChars = [
      // this 3 relates some catch2 bug
      '[',
      '\\',
      ',',
      // this two has some on windows
      '±',
      '§',
    ];
    const forceIgnoreError: string[] | undefined =
      frameworkVersion &&
      frameworkVersion.smaller(EscapeCharParserFix) &&
      badChars.some(b => testNameAsId.indexOf(b) != -1)
        ? [
            '⚡️ This extension is unable to run this test.',
            `Current Catch2 framework version ${frameworkVersion} has a bug (https://github.com/catchorg/Catch2/issues/1905).`,
            `Update your framework to at least ${EscapeCharParserFix}.`,
            'Avoid test names with the following characters: ' + badChars.map(b => `'${b}'`).join(', ') + '.',
          ]
        : undefined;

    super(
      shared,
      runnable,
      testNameAsId,
      testNameAsId,
      file,
      line,
      Catch2Test._isSkipped(tags, testNameAsId),
      forceIgnoreError,
      tags,
      description,
      undefined,
      undefined,
    );
  }

  private static _isSkipped(tags: string[], testNameAsId: string): boolean {
    return tags.some((v: string) => v.startsWith('.') || v == 'hide' || v == '!hide') || testNameAsId.startsWith('./');
  }

  public update(
    tags: string[],
    file: string | undefined,
    line: number | undefined,
    description: string | undefined,
  ): boolean {
    return this._updateBase(
      this._label,
      file,
      line,
      Catch2Test._isSkipped(tags, this.testNameAsId),
      tags,
      description,
      undefined,
      undefined,
      undefined,
    );
  }

  public compare(testNameAsId: string): boolean {
    // Catch2: xml output trimmes the name of the test
    return this.testNameAsId.trim() === testNameAsId.trim();
  }

  private _sections: undefined | Catch2Section[];

  public get sections(): undefined | Catch2Section[] {
    return this._sections;
  }

  public getEscapedTestName(): string {
    /* ',' and '[' has special meaning */
    return this.testNameAsId.replace('\\', '\\\\').replace(/,/g, '\\,').replace(/\[/g, '\\[');
  }

  public parseAndProcessTestCase(
    testRun: vscode.TestRun,
    output: string,
    rngSeed: number | undefined,
    timeout: number | null,
    stderr: string | undefined,
  ): void {
    const resultBuilder = new TestEventBuilder(this, testRun);

    if (timeout !== null) {
      resultBuilder.appendOutput(
        '⌛️ Timed out: "testMate.cpp.test.runtimeLimit": ' + timeout / 1000 + ' second(s).',
        undefined,
        undefined,
      );
      resultBuilder.build();
      return;
    }

    let res: XmlObject = {};
    new xml2js.Parser({ explicitArray: true }).parseString(output, (err: Error, result: XmlObject) => {
      if (err) {
        throw Error(inspect(err));
      } else {
        res = result;
      }
    });

    if (rngSeed) resultBuilder.appendOutput(`🔀 Randomness seeded to: ${rngSeed.toString()}`, 0);

    this._processXmlTagTestCaseInner(res.TestCase, resultBuilder);

    if (stderr) {
      resultBuilder.appendOutput('stderr arrived during running this test', undefined);
      resultBuilder.appendOutput('⬇ std::cerr:', undefined);
      resultBuilder.appendOutput(stderr, 1);
      resultBuilder.appendOutput('⬆ std::cerr', undefined);
    }

    const testEvent = resultBuilder.build();

    return testEvent;
  }

  private _processXmlTagTestCaseInner(testCase: XmlObject, resultBuilder: TestEventBuilder): void {
    if (testCase.OverallResult[0].$.hasOwnProperty('durationInSeconds'))
      resultBuilder.setDurationMilisec(Number(testCase.OverallResult[0].$.durationInSeconds) * 1000);

    if (testCase._) {
      resultBuilder.appendOutput('⬇ std::cout:', 1);
      resultBuilder.appendOutput(testCase._.trim(), 2);
      resultBuilder.appendOutput('⬆ std::cout', 1);
    }

    const main: Catch2Section = new Catch2Section(testCase.$.name, testCase.$.filename, testCase.$.line);

    this._processTags(testCase, main, [], resultBuilder);

    this._processXmlTagSections(testCase, main, [], resultBuilder, main);

    this._sections = main.children;

    if (testCase.OverallResult[0].StdOut) {
      resultBuilder.appendOutput('⬇ std::cout:', 1);
      for (let i = 0; i < testCase.OverallResult[0].StdOut.length; i++)
        resultBuilder.appendOutput(testCase.OverallResult[0].StdOut[i].trim(), 2);
      resultBuilder.appendOutput('⬆ std::cout', 1);
    }

    if (testCase.OverallResult[0].StdErr) {
      resultBuilder.appendOutput('⬇ std::cerr:', 1);
      for (let i = 0; i < testCase.OverallResult[0].StdErr.length; i++)
        resultBuilder.appendOutput(testCase.OverallResult[0].StdErr[i].trim(), 2);
      resultBuilder.appendOutput('⬆ std::cerr', 1);
    }

    if (testCase.OverallResult[0].$.success === 'true') {
      resultBuilder.passed();
    } else {
      resultBuilder.failed();
    }

    if (this._sections.length) {
      let failedBranch = 0;
      let succBranch = 0;

      const traverse = (section: Catch2Section): void => {
        if (section.children.length === 0) {
          section.failed ? ++failedBranch : ++succBranch;
        } else {
          for (let i = 0; i < section.children.length; ++i) {
            traverse(section.children[i]);
          }
        }
      };

      this._sections.forEach(section => traverse(section));

      const branchMsg = (failedBranch ? '✘' + failedBranch + '|' : '') + '✔︎' + succBranch;

      resultBuilder.appendOutput(`ᛦ ${branchMsg} branches`, 1);
      //this.item.children.replace([]);
      this.item.canResolveChildren = true;
    }
  }

  public expandSections(testRun: vscode.TestRun): void {
    if (this._sections?.length) {
      const generateBranchItems = (sections: Catch2Section[], itemCollection: vscode.TestItemCollection): void => {
        for (const s of sections) {
          const item = this._shared.testItemCreator(generateId(), s.name, s.filename, s.line, undefined);
          itemCollection.add(item);

          if (s.failed) testRun.failed(item, []);
          else testRun.passed(item);

          generateBranchItems(s.children, item.children);
        }
      };

      generateBranchItems(this._sections, this.item.children);
    }
  }

  private static readonly _expectedPropertyNames = new Set([
    '_',
    '$',
    'Section',
    'Info',
    'Warning',
    'Failure',
    'Expression',
    'Exception',
    'OverallResult',
    'OverallResults',
    'FatalErrorCondition',
    'BenchmarkResults',
  ]);

  private _processTags(
    xml: XmlObject,
    main: Catch2Section,
    stack: Catch2Section[],
    resultBuilder: TestEventBuilder,
  ): void {
    {
      Object.getOwnPropertyNames(xml).forEach(n => {
        if (!Catch2Test._expectedPropertyNames.has(n)) {
          this._shared.log.error('unexpected Catch2 tag: ' + n);
          resultBuilder.appendOutput('unexpected Catch2 tag:' + n, 0);
          resultBuilder.errored();
        }
      });
    }

    if (xml._) {
      resultBuilder.appendOutput('⬇ std::cout:', 1);
      resultBuilder.appendOutput(xml._.trim(), 2);
      resultBuilder.appendOutput('⬆ std::cout', 1);
    }

    if (xml.Info) {
      for (let i = 0; i < xml.Info.length; i++) {
        try {
          const piece = xml.Info[i];
          const location =
            piece.$ && piece.$.filename && piece.$.line ? ` (at ${piece.$.filename}:${piece.$.line})` : '';
          resultBuilder.appendOutput(`⬇ Info:${location}`, 1);
          resultBuilder.appendOutput(piece, 2);
          resultBuilder.appendOutput('⬆ Info', 1);
        } catch (e) {
          this._shared.log.exceptionS(e);
          resultBuilder.appendOutput('Error during processing output', 2);
        }
      }
    }

    if (xml.Warning) {
      for (let i = 0; i < xml.Warning.length; i++) {
        try {
          const piece = xml.Warning[i];

          resultBuilder.addMessage(undefined, undefined, 'Warning', piece.trim());
        } catch (e) {
          this._shared.log.exceptionS(e);
          resultBuilder.appendOutput('Error during processing output', 2);
        }
      }
    }

    if (xml.Failure) {
      for (let i = 0; i < xml.Failure.length; i++) {
        try {
          const piece = xml.Failure[i];
          const msg = typeof piece._ === 'string' ? piece._.trim() : piece.toString();

          resultBuilder.addMessage(piece.$?.filename, piece.$?.line, 'Failure', msg);
        } catch (e) {
          this._shared.log.exceptionS(e);
          resultBuilder.appendOutput('Error during processing output', 2);
        }
      }
    }

    try {
      if (xml.BenchmarkResults) {
        for (let i = 0; i < xml.BenchmarkResults.length; i++) {
          this._processBenchmark(xml.BenchmarkResults[i], stack, resultBuilder);
        }
      }
    } catch (e) {
      this._shared.log.exceptionS(e);
    }

    if (xml.Expression) {
      for (let i = 0; i < xml.Expression.length; ++i) {
        try {
          const expr = xml.Expression[i];
          const file = expr.$.filename;
          const line = expr.$.line;
          const type = expr.$.type;
          const original = expr.Original[0].trim();
          const expanded = expr.Expanded[0].trim();

          resultBuilder.addExpression(file, line, original, expanded, type);
        } catch (e) {
          this._shared.log.exceptionS(e);
        }
      }
    }

    for (let i = 0; xml.Exception && i < xml.Exception.length; ++i) {
      try {
        const piece = xml.Exception[i];
        if (typeof piece._ !== 'string') this._shared.log.warn('No _ under exception', piece);

        const file = piece.$.filename;
        const line = piece.$.line;
        const msg = typeof piece._ === 'string' ? piece._.trim() : piece.toString();

        resultBuilder.addMessage(file, line, 'Exception: `' + msg + '`');
      } catch (e) {
        this._shared.log.exceptionS(e);
      }
    }

    if (xml.FatalErrorCondition) {
      for (let i = 0; i < xml.FatalErrorCondition.length; ++i) {
        try {
          const piece = xml.FatalErrorCondition[i];
          resultBuilder.addMessage(piece.$.filename, piece.$.line, 'FatalErrorCondition', piece._);
        } catch (error) {
          this._shared.log.exceptionS(error);
          resultBuilder.appendOutput('Unknown fatal error: ' + inspect(error), 1);
          resultBuilder.errored();
        }
      }
    }
  }

  private _processXmlTagSections(
    xml: XmlObject,
    main: Catch2Section,
    stack: Catch2Section[],
    resultBuilder: TestEventBuilder,
    parentSection: Catch2Section,
  ): void {
    for (let j = 0; xml.Section && j < xml.Section.length; ++j) {
      const section = xml.Section[j];

      try {
        const currSection = ((): Catch2Section => {
          const found = parentSection.children.find(
            v => v.name === section.$.name && v.filename === section.$.filename && v.line === section.$.line,
          );
          if (found) return found;

          const currSection = new Catch2Section(section.$.name, section.$.filename, section.$.line);
          parentSection.children.push(currSection);
          return currSection;
        })();

        const isLeaf = section.Section === undefined || section.Section.length === 0;

        if (
          isLeaf &&
          section.OverallResults &&
          section.OverallResults.length > 0 &&
          section.OverallResults[0].$.failures !== '0'
        ) {
          currSection.failed = true;
        }

        const msg = `⮑ ${isLeaf ? (currSection.failed ? '❌' : '✅') : ''}"${currSection.name}"`;

        resultBuilder.appendOutput(msg, stack.length, 3);

        const currStack = stack.concat(currSection);

        this._processTags(section, main, currStack, resultBuilder);

        this._processXmlTagSections(section, main, currStack, resultBuilder, currSection);
      } catch (error) {
        resultBuilder.appendOutput('Fatal error processing section', 0);
        this._shared.log.exceptionS(error);
      }
    }
  }

  private _processBenchmark(benchmark: XmlObject, stack: Catch2Section[], resultBuilder: TestEventBuilder): void {
    const currSection = new Catch2Section(benchmark.$.name, undefined, 0);

    const msg = `⮑ benchmark of "${currSection.name}"`;

    resultBuilder.appendOutput(msg, stack.length, 3);

    for (let j = 0; benchmark.mean && j < benchmark.mean.length; ++j) {
      const mean = benchmark.mean[j].$;
      const params = Object.keys(mean)
        .filter(n => n !== 'value')
        .map(key => `${key}: ${mean[key]} ns`)
        .join(', ');
      resultBuilder.appendOutput(`Mean: ${mean.value} ns  (${params})`, 2);
    }

    for (let j = 0; benchmark.standardDeviation && j < benchmark.standardDeviation.length; ++j) {
      const standardDeviation = benchmark.standardDeviation[j].$;
      const params = Object.keys(standardDeviation)
        .filter(n => n !== 'value')
        .map(key => `${key}: ${standardDeviation[key]} ns`)
        .join(', ');
      resultBuilder.appendOutput(`Standard Deviation: ${standardDeviation.value} ns  (${params})`, 2);
    }

    for (let j = 0; benchmark.outliers && j < benchmark.outliers.length; ++j) {
      const outliers = benchmark.outliers[j].$;
      const params = Object.keys(outliers)
        .map(key => `${key}: ${outliers[key]} ns`)
        .join(', ');
      resultBuilder.appendOutput(`Outliers: ${params}`, 2);
    }

    resultBuilder.appendOutput(
      'Parameters: ' +
        Object.keys(benchmark.$)
          .filter(n => n !== 'name')
          .map(key => `${key}: ${benchmark.$[key]}`)
          .join(', '),
      2,
    );
  }
}
