import { TestEvent } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';
import { AbstractTestInfo } from '../AbstractTestInfo';
import { SharedVariables } from '../SharedVariables';
import { RunningTestExecutableInfo } from '../RunningTestExecutableInfo';
import { TestEventBuilder } from '../TestEventBuilder';

interface XmlObject {
  [prop: string]: any; //eslint-disable-line
}

interface Frame {
  name: string;
  filename: string;
  line: number;
}

export class DOCSection implements Frame {
  public constructor(name: string, filename: string, line: number) {
    this.name = name;
    // some debug adapter on ubuntu starts debug session in shell,
    // this prevents the SECTION("`pwd`") to be executed
    this.name = this.name.replace(/`/g, '\\`');

    this.filename = filename;
    this.line = line;
  }

  public readonly name: string;
  public readonly filename: string;
  public readonly line: number;
  public readonly children: DOCSection[] = [];
  public failed: boolean = false;
}

export class DOCTestInfo extends AbstractTestInfo {
  public constructor(
    shared: SharedVariables,
    id: string | undefined,
    testNameAsId: string,
    skipped: boolean,
    file: string | undefined,
    line: number | undefined,
    old?: DOCTestInfo,
  ) {
    super(
      shared,
      id,
      testNameAsId,
      testNameAsId.startsWith('  Scenario:') ? '⒮' + testNameAsId.substr(11) : testNameAsId,
      skipped,
      file ? file : old ? old.capturedFilename : undefined,
      line ? line : old ? old.capturedLine : undefined,
      undefined,
      undefined,
    );
    this._sections = old ? old.sections : undefined;
  }

  public capturedFilename: string | undefined = undefined;
  public capturedLine: number | undefined = undefined;

  private _sections: undefined | DOCSection[];

  public get sections(): undefined | DOCSection[] {
    return this._sections;
  }

  public getEscapedTestName(): string {
    /* ',' has special meaning */
    let t = this.testNameAsId;
    t = t.replace(/,/g, '\\,');
    t = t.replace(/\[/g, '\\[');
    t = t.replace(/\*/g, '\\*');
    t = t.replace(/`/g, '\\`');
    if (t.startsWith(' ')) t = '*' + t.trimLeft();
    return t;
  }

  // eslint-disable-next-line
  public getDebugParams(breakOnFailure: boolean): string[] {
    const debugParams: string[] = ['--test-case=' + this.getEscapedTestName()];
    return debugParams;
  }

  public parseAndProcessTestCase(
    xmlStr: string,
    rngSeed: number | undefined,
    runInfo: RunningTestExecutableInfo,
  ): TestEvent {
    if (runInfo.timeout !== null) {
      const ev = this.getTimeoutEvent(runInfo.timeout);
      this.lastRunState = ev.state;
      return ev;
    }

    let res: XmlObject = {};
    new xml2js.Parser({ explicitArray: true }).parseString(xmlStr, (err: Error, result: XmlObject) => {
      if (err) {
        throw err;
      } else {
        res = result;
      }
    });

    this.capturedFilename = res.TestCase.$.filename;
    this.capturedLine = Number(res.TestCase.$.line) - 1;

    const testEventBuilder = new TestEventBuilder(this);

    if (rngSeed) testEventBuilder.appendTooltip(`🔀 Randomness seeded to: ${rngSeed.toString()}`);

    this._processXmlTagTestCaseInner(res.TestCase, testEventBuilder);

    const testEvent = testEventBuilder.build();

    this.lastRunState = testEvent.state;

    return testEvent;
  }

  private _processXmlTagTestCaseInner(testCase: XmlObject, testEventBuilder: TestEventBuilder): void {
    if (testCase.OverallResultsAsserts[0].$.duration) {
      this.lastRunMilisec = Number(testCase.OverallResultsAsserts[0].$.duration) * 1000;
      testEventBuilder.setDurationMilisec(this.lastRunMilisec);
    }

    testEventBuilder.appendMessage(testCase._);

    const title: DOCSection = new DOCSection(testCase.$.name, testCase.$.filename, testCase.$.line);

    this._processTags(testCase, title, [], testEventBuilder);

    this._processXmlTagSubcase(testCase, title, [], testEventBuilder, title);

    this._sections = title.children;

    if (testCase.OverallResultsAsserts[0].$.failures === '0') {
      testEventBuilder.setState('passed');
    }

    if (this._sections.length) {
      let failedBranch = 0;
      let succBranch = 0;

      const traverse = (section: DOCSection): void => {
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

      testEventBuilder.appendDescription(` [${branchMsg}]`);
      testEventBuilder.appendTooltip(`ᛦ ${branchMsg} branches`);
    }
  }

  private static readonly _expectedPropertyNames = new Set([
    '_',
    '$',
    'SubCase',
    'OverallResultsAsserts',
    'Message',
    'Expression',
  ]);

  private _processTags(xml: XmlObject, title: Frame, stack: DOCSection[], testEventBuilder: TestEventBuilder): void {
    {
      Object.getOwnPropertyNames(xml).forEach(n => {
        if (!DOCTestInfo._expectedPropertyNames.has(n)) {
          this._shared.log.error('undexpected doctest tag', n);
          testEventBuilder.appendMessage('unexpected doctest tag:' + n);
          testEventBuilder.setState('errored');
        }
      });
    }

    testEventBuilder.appendMessage(xml._);

    try {
      if (xml.Message) {
        for (let j = 0; j < xml.Message.length; ++j) {
          const msg = xml.Message[j];

          testEventBuilder.appendMessage(msg.$.type);

          msg.Text.forEach((m: string) => testEventBuilder.appendMessage(m));

          testEventBuilder.appendDecorator(
            Number(msg.$.line) - 1,
            '⬅ ' + msg.Text.map((x: string) => x.trim()).join(' | '),
          );
        }
      }
    } catch (e) {
      this._shared.log.exception(e);
    }

    try {
      if (xml.Expression) {
        for (let j = 0; j < xml.Expression.length; ++j) {
          const expr = xml.Expression[j];

          testEventBuilder.appendMessage('  ❕Original:  ' + expr.Original.map((x: string) => x.trim()).join('\n'));

          const line = Number(expr.$.line) - 1;

          try {
            for (let j = 0; expr.Expanded && j < expr.Expanded.length; ++j) {
              testEventBuilder.appendMessage(
                '  ❗️Expanded:  ' + expr.Expanded.map((x: string) => x.trim()).join('\n'),
              );
              testEventBuilder.appendDecorator(line, '⬅ ' + expr.Expanded.map((x: string) => x.trim()).join(' | '));
            }
          } catch (e) {
            this._shared.log.exception(e);
          }

          try {
            for (let j = 0; expr.Exception && j < expr.Exception.length; ++j) {
              testEventBuilder.appendMessage(
                '  ❗️Exception:  ' + expr.Exception.map((x: string) => x.trim()).join('\n'),
              );
              testEventBuilder.appendDecorator(line, '⬅ ' + expr.Exception.map((x: string) => x.trim()).join(' | '));
            }
          } catch (e) {
            this._shared.log.exception(e);
          }

          try {
            for (let j = 0; expr.ExpectedException && j < expr.ExpectedException.length; ++j) {
              testEventBuilder.appendMessage(
                '  ❗️ExpectedException:  ' + expr.ExpectedException.map((x: string) => x.trim()).join('\n'),
              );
              testEventBuilder.appendDecorator(
                line,
                '⬅ ' + expr.ExpectedException.map((x: string) => x.trim()).join(' | '),
              );
            }
          } catch (e) {
            this._shared.log.exception(e);
          }

          try {
            for (let j = 0; expr.ExpectedExceptionString && j < expr.ExpectedExceptionString.length; ++j) {
              testEventBuilder.appendMessage(
                '  ❗️ExpectedExceptionString  ' + expr.ExpectedExceptionString[j]._.trim(),
              );
              testEventBuilder.appendDecorator(
                line,
                '⬅ ' + expr.ExpectedExceptionString.map((x: string) => x.trim()).join(' | '),
              );
            }
          } catch (e) {
            this._shared.log.exception(e);
          }
        }
      }
    } catch (e) {
      this._shared.log.exception(e);
    }
  }

  private _processXmlTagSubcase(
    xml: XmlObject,
    title: Frame,
    stack: DOCSection[],
    testEventBuilder: TestEventBuilder,
    parentSection: DOCSection,
  ): void {
    for (let j = 0; xml.SubCase && j < xml.SubCase.length; ++j) {
      const subcase = xml.SubCase[j];

      try {
        let currSection = parentSection.children.find(
          v => v.name === subcase.$.name && v.filename === subcase.$.filename && v.line === subcase.$.line,
        );

        if (currSection === undefined) {
          currSection = new DOCSection(subcase.$.name || '', subcase.$.filename, subcase.$.line);
          parentSection.children.push(currSection);
        }

        const isLeaf = subcase.Section === undefined || subcase.Section.length === 0;

        if (
          isLeaf &&
          subcase.OverallResults &&
          subcase.OverallResults.length > 0 &&
          subcase.OverallResults[0].$.failures !== '0'
        ) {
          currSection.failed = true;
        }

        const msg =
          '   '.repeat(stack.length) +
          '⮑ ' +
          (isLeaf ? (currSection.failed ? ' ❌ ' : ' ✅ ') : '') +
          `${subcase.$.name}`;

        testEventBuilder.appendMessage(msg + ` (line:${subcase.$.line})`);

        const currStack = stack.concat(currSection);

        this._processTags(subcase, title, currStack, testEventBuilder);

        this._processXmlTagSubcase(subcase, title, currStack, testEventBuilder, currSection);
      } catch (error) {
        testEventBuilder.appendMessage('Fatal error processing subcase');
        this._shared.log.exception(error);
      }
    }
  }
}
