import { TestEvent } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';
import { AbstractTestInfo } from '../AbstractTestInfo';
import { inspect } from 'util';
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

export class Catch2Section implements Frame {
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
  public readonly children: Catch2Section[] = [];
  public failed: boolean = false;
}

export class Catch2TestInfo extends AbstractTestInfo {
  public constructor(
    shared: SharedVariables,
    id: string | undefined,
    testNameAsId: string,
    catch2Description: string,
    tags: string[],
    file: string,
    line: number,
    sections?: Catch2Section[],
  ) {
    super(
      shared,
      id,
      testNameAsId,
      testNameAsId,
      tags.some((v: string) => {
        return v.startsWith('[.') || v == '[hide]';
      }) || testNameAsId.startsWith('./'),
      file,
      line,
      tags.join(''),
      [tags.length > 0 ? 'Tags: ' + tags.join('') : '', catch2Description ? 'Description: ' + catch2Description : '']
        .filter(v => v.length)
        .join('\n'),
    );
    this._sections = sections;
  }

  private _sections: undefined | Catch2Section[];

  public get sections(): undefined | Catch2Section[] {
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

  public getDebugParams(breakOnFailure: boolean): string[] {
    const debugParams: string[] = [this.getEscapedTestName(), '--reporter', 'console'];
    if (breakOnFailure) debugParams.push('--break');
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

    const testEventBuilder = new TestEventBuilder(this);

    if (rngSeed) testEventBuilder.appendMessage(`🔀 Randomness seeded to: ${rngSeed.toString()}`);

    this._processXmlTagTestCaseInner(res.TestCase, testEventBuilder);

    const testEvent = testEventBuilder.build();

    this.lastRunState = testEvent.state;

    return testEvent;
  }

  private _processXmlTagTestCaseInner(testCase: XmlObject, testEventBuilder: TestEventBuilder): void {
    if (testCase.OverallResult[0].$.hasOwnProperty('durationInSeconds')) {
      this.lastRunMilisec = Number(testCase.OverallResult[0].$.durationInSeconds) * 1000;
      testEventBuilder.setDurationMilisec(this.lastRunMilisec);
    }

    testEventBuilder.appendMessage(testCase._);

    const title: Catch2Section = new Catch2Section(testCase.$.name, testCase.$.filename, testCase.$.line);

    this._processTags(testCase, title, [], testEventBuilder);

    this._processXmlTagSections(testCase, title, [], testEventBuilder, title);

    this._sections = title.children;

    if (testCase.OverallResult[0].StdOut) {
      testEventBuilder.appendMessage('⬇ std::cout:');
      for (let i = 0; i < testCase.OverallResult[0].StdOut.length; i++)
        testEventBuilder.appendMessage(testCase.OverallResult[0].StdOut[i]);
      testEventBuilder.appendMessage('⬆ std::cout');
    }

    if (testCase.OverallResult[0].StdErr) {
      testEventBuilder.appendMessage('⬇ std::err:');
      for (let i = 0; i < testCase.OverallResult[0].StdErr.length; i++)
        testEventBuilder.appendMessage(testCase.OverallResult[0].StdErr[i]);
      testEventBuilder.appendMessage('⬆ std::err');
    }

    if (testCase.OverallResult[0].$.success === 'true') {
      testEventBuilder.setState('passed');
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

      testEventBuilder.appendDescription(` [${branchMsg}]`);
      testEventBuilder.appendTooltip(`ᛦ ${branchMsg} branches`);
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
    'OverallResult',
    'OverallResults',
    'FatalErrorCondition',
  ]);

  private _processTags(xml: XmlObject, title: Frame, stack: Catch2Section[], testEventBuilder: TestEventBuilder): void {
    {
      Object.getOwnPropertyNames(xml).forEach(n => {
        if (!Catch2TestInfo._expectedPropertyNames.has(n)) {
          this._shared.log.error('undexpected Catch2 tag', n);
          testEventBuilder.appendMessage('unexpected Catch2 tag:' + n);
          testEventBuilder.setState('errored');
        }
      });
    }

    testEventBuilder.appendMessage(xml._);

    try {
      if (xml.Info) {
        testEventBuilder.appendMessage('⬇ Info:');
        for (let i = 0; i < xml.Info.length; i++) testEventBuilder.appendMessage(xml.Info[i]);
        testEventBuilder.appendMessage('⬆ Info');
      }
    } catch (e) {
      this._shared.log.exception(e);
    }

    try {
      if (xml.Warning) {
        testEventBuilder.appendMessage('⬇ Warning:');
        for (let i = 0; i < xml.Warning.length; i++)
          testEventBuilder.appendMessageWithDecorator(Number(xml.Warning[i].$.line) - 1, xml.Warning[i]);
        testEventBuilder.appendMessage('⬆ Warning');
      }
    } catch (e) {
      this._shared.log.exception(e);
    }

    try {
      if (xml.Failure) {
        testEventBuilder.appendMessage('⬇ Failure:');
        for (let i = 0; i < xml.Failure.length; i++)
          testEventBuilder.appendMessageWithDecorator(Number(xml.Failure[i].$.line) - 1, xml.Failure[i]);
        testEventBuilder.appendMessage('⬆ Failure');
      }
    } catch (e) {
      this._shared.log.exception(e);
    }

    try {
      if (xml.Expression) {
        for (let j = 0; j < xml.Expression.length; ++j) {
          const expr = xml.Expression[j];
          const message =
            '  ❕Original:  ' +
            expr.Original.map((x: string) => x.trim()).join('; ') +
            '\n' +
            '  ❗️Expanded:  ' +
            expr.Expanded.map((x: string) => x.trim()).join('; ');

          testEventBuilder.appendMessage(message);
          testEventBuilder.appendDecorator(
            Number(expr.$.line) - 1,
            '⬅ ' + expr.Expanded.map((x: string) => x.trim()).join(' | '),
            message,
          );
        }
      }
    } catch (e) {
      this._shared.log.exception(e);
    }

    try {
      for (let j = 0; xml.Exception && j < xml.Exception.length; ++j) {
        testEventBuilder.appendMessageWithDecorator(
          Number(xml.Exception[j].$.line) - 1,
          'Exception were thrown: ' + xml.Exception[j]._.trim(),
        );
      }
    } catch (e) {
      this._shared.log.exception(e);
    }

    try {
      if (xml.FatalErrorCondition) {
        testEventBuilder.appendMessage('⬇ FatalErrorCondition:');
        for (let j = 0; j < xml.FatalErrorCondition.length; ++j) {
          testEventBuilder.appendMessageWithDecorator(
            Number(xml.FatalErrorCondition[j].$.line) - 1,
            xml.FatalErrorCondition[j]._,
          );
        }
        testEventBuilder.appendMessage('⬆ FatalErrorCondition');
      }
    } catch (error) {
      this._shared.log.exception(error);
      testEventBuilder.appendMessage('Unknown fatal error: ' + inspect(error));
    }
  }

  private _processXmlTagSections(
    xml: XmlObject,
    title: Frame,
    stack: Catch2Section[],
    testEventBuilder: TestEventBuilder,
    parentSection: Catch2Section,
  ): void {
    for (let j = 0; xml.Section && j < xml.Section.length; ++j) {
      const section = xml.Section[j];

      try {
        let currSection = parentSection.children.find(
          v => v.name === section.$.name && v.filename === section.$.filename && v.line === section.$.line,
        );

        if (currSection === undefined) {
          currSection = new Catch2Section(section.$.name, section.$.filename, section.$.line);
          parentSection.children.push(currSection);
        }

        const isLeaf = section.Section === undefined || section.Section.length === 0;

        if (
          isLeaf &&
          section.OverallResults &&
          section.OverallResults.length > 0 &&
          section.OverallResults[0].$.failures !== '0'
        ) {
          currSection.failed = true;
        }

        const msg =
          '   '.repeat(stack.length) +
          '⮑ ' +
          (isLeaf ? (currSection.failed ? ' ❌ ' : ' ✅ ') : '') +
          `${section.$.name}`;

        testEventBuilder.appendMessage(msg + ` (line:${section.$.line})`);

        const currStack = stack.concat(currSection);

        this._processTags(section, title, currStack, testEventBuilder);

        this._processXmlTagSections(section, title, currStack, testEventBuilder, currSection);
      } catch (error) {
        testEventBuilder.appendMessage('Fatal error processing section');
        this._shared.log.exception(error);
      }
    }
  }
}
