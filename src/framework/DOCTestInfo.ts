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
  public failed = false;
}

export class DOCTestInfo extends AbstractTestInfo {
  public constructor(
    shared: SharedVariables,
    id: string | undefined,
    testNameAsId: string,
    description: string | undefined,
    skipped: boolean | undefined,
    file: string | undefined,
    line: number | undefined,
    old?: DOCTestInfo,
  ) {
    super(
      shared,
      id != undefined ? id : old ? old.id : undefined,
      testNameAsId,
      testNameAsId.startsWith('  Scenario:') ? '⒮' + testNameAsId.substr(11) : testNameAsId,
      skipped !== undefined ? skipped : false,
      file,
      line,
      description,
      undefined,
    );
    this._sections = old ? old.sections : undefined;
    this._isSecnario = testNameAsId.startsWith('  Scenario:');
    if (old) {
      this.lastRunEvent = old.lastRunEvent;
      this.lastRunMilisec = old.lastRunMilisec;
    }
  }

  private _sections: undefined | DOCSection[];
  private _isSecnario: boolean;

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
      this.lastRunEvent = ev;
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

    const testEventBuilder = new TestEventBuilder(this);

    if (rngSeed) testEventBuilder.appendTooltip(`🔀 Randomness seeded to: ${rngSeed.toString()}`);

    this._processXmlTagTestCaseInner(res.TestCase, testEventBuilder);

    const testEvent = testEventBuilder.build();

    this.lastRunEvent = testEvent;

    return testEvent;
  }

  private _processXmlTagTestCaseInner(testCase: XmlObject, testEventBuilder: TestEventBuilder): void {
    if (testCase.OverallResultsAsserts[0].$.duration) {
      this.lastRunMilisec = Number(testCase.OverallResultsAsserts[0].$.duration) * 1000;
      testEventBuilder.setDurationMilisec(this.lastRunMilisec);
    }

    testEventBuilder.appendMessage(testCase._, 0);

    const title: DOCSection = new DOCSection(testCase.$.name, testCase.$.filename, testCase.$.line);

    if (testCase.OverallResultsAsserts[0].$.failures === '0' && testCase.Exception === undefined) {
      testEventBuilder.passed();
    } else {
      testEventBuilder.failed();
    }

    this._processTags(testCase, title, [], testEventBuilder);

    this._processXmlTagSubcase(testCase, title, [], testEventBuilder, title);

    this._sections = title.children;

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
    'Exception',
  ]);

  private _processTags(xml: XmlObject, title: Frame, stack: DOCSection[], testEventBuilder: TestEventBuilder): void {
    {
      Object.getOwnPropertyNames(xml).forEach(n => {
        if (!DOCTestInfo._expectedPropertyNames.has(n)) {
          this._shared.log.error('unexpected doctest tag: ' + n);
          testEventBuilder.appendMessage('unexpected doctest tag:' + n, 0);
          testEventBuilder.errored();
        }
      });
    }

    testEventBuilder.appendMessage(xml._, 0);

    try {
      if (xml.Message) {
        for (let j = 0; j < xml.Message.length; ++j) {
          const msg = xml.Message[j];

          testEventBuilder.appendMessage(msg.$.type, 0);

          msg.Text.forEach((m: string) => testEventBuilder.appendMessage(m, 1));

          testEventBuilder.appendDecorator(
            msg.$.filename,
            Number(msg.$.line) - 1,
            '⬅ ' + msg.Text.map((x: string) => x.trim()).join(' | '),
          );
        }
      }
    } catch (e) {
      this._shared.log.exception(e);
    }

    try {
      if (xml.Exception) {
        for (let j = 0; j < xml.Exception.length; ++j) {
          const e = xml.Exception[j];

          testEventBuilder.failed();

          testEventBuilder.appendMessage('Exception was thrown: ' + e._.trim(), 0);
        }
      }
    } catch (e) {
      this._shared.log.exception(e);
    }

    try {
      if (xml.Expression) {
        for (let j = 0; j < xml.Expression.length; ++j) {
          const expr = xml.Expression[j];

          testEventBuilder.appendMessage('❕Original:  ' + expr.Original.map((x: string) => x.trim()).join('\n'), 1);

          const file = expr.$.filename;
          const line = Number(expr.$.line) - 1;

          try {
            for (let j = 0; expr.Expanded && j < expr.Expanded.length; ++j) {
              testEventBuilder.appendMessage(
                '❗️Expanded:  ' + expr.Expanded.map((x: string) => x.trim()).join('\n'),
                1,
              );
              testEventBuilder.appendDecorator(
                file,
                line,
                '⬅ ' + expr.Expanded.map((x: string) => x.trim()).join(' | '),
              );
            }
          } catch (e) {
            this._shared.log.exception(e);
          }

          try {
            for (let j = 0; expr.Exception && j < expr.Exception.length; ++j) {
              testEventBuilder.appendMessage(
                '  ❗️Exception:  ' + expr.Exception.map((x: string) => x.trim()).join('\n'),
                1,
              );
              testEventBuilder.appendDecorator(
                file,
                line,
                '⬅ ' + expr.Exception.map((x: string) => x.trim()).join(' | '),
              );
            }
          } catch (e) {
            this._shared.log.exception(e);
          }

          try {
            for (let j = 0; expr.ExpectedException && j < expr.ExpectedException.length; ++j) {
              testEventBuilder.appendMessage(
                '❗️ExpectedException:  ' + expr.ExpectedException.map((x: string) => x.trim()).join('\n'),
                1,
              );
              testEventBuilder.appendDecorator(
                file,
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
                '❗️ExpectedExceptionString  ' + expr.ExpectedExceptionString[j]._.trim(),
                1,
              );
              testEventBuilder.appendDecorator(
                file,
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

        const isLeaf = subcase.SubCase === undefined || subcase.SubCase.length === 0;

        if (
          isLeaf &&
          subcase.Expression &&
          subcase.Expression.length > 0 &&
          // eslint-disable-next-line
          subcase.Expression.some((x: any) => x.$ && x.$.success && x.$.success == 'false')
        ) {
          currSection.failed = true;
        }

        const name = this._isSecnario ? subcase.$.name.trimLeft() : subcase.$.name;

        const msg =
          '   '.repeat(stack.length) + '⮑ ' + (isLeaf ? (currSection.failed ? ' ❌ ' : ' ✅ ') : '') + `${name}`;

        testEventBuilder.appendMessage(msg + ` (line:${subcase.$.line})`, null);

        const currStack = stack.concat(currSection);

        this._processTags(subcase, title, currStack, testEventBuilder);

        this._processXmlTagSubcase(subcase, title, currStack, testEventBuilder, currSection);
      } catch (error) {
        testEventBuilder.appendMessage('Fatal error processing subcase', 1);
        this._shared.log.exception(error);
      }
    }
  }
}
