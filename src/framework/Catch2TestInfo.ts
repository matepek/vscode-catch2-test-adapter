import { TestEvent } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';
import { EOL } from 'os';

import { AbstractTestInfo } from '../AbstractTestInfo';
import { inspect } from 'util';
import { SharedVariables } from '../SharedVariables';
import { RunningTestExecutableInfo } from '../RunningTestExecutableInfo';

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

    const testEvent = this.getFailedEventBase();

    if (rngSeed) {
      testEvent.message += '🔀 Randomness seeded to: ' + rngSeed.toString() + '.\n';
    }

    this._processXmlTagTestCaseInner(res.TestCase, testEvent);

    this.lastRunState = testEvent.state;

    return testEvent;
  }

  private _processXmlTagTestCaseInner(testCase: XmlObject, testEvent: TestEvent): void {
    if (testCase.OverallResult[0].$.hasOwnProperty('durationInSeconds')) {
      testEvent.message += '⏱ Duration: ' + testCase.OverallResult[0].$.durationInSeconds + ' second(s).\n';
      this._extendDescriptionAndTooltip(
        testEvent,
        Math.round(Number(testCase.OverallResult[0].$.durationInSeconds) * 1000),
      );
    }

    if (typeof testCase._ === 'string')
      testEvent.message += testCase._.split(EOL)
        .map((x: string) => x.trim())
        .filter((l: string) => l.length > 0)
        .join('\n');

    const title: Catch2Section = new Catch2Section(testCase.$.name, testCase.$.filename, testCase.$.line);

    this._processInfoWarningAndFailureTags(testCase, title, [], testEvent);

    this._processXmlTagExpressions(testCase, title, [], testEvent);

    this._processXmlTagSections(testCase, title, [], testEvent, title);

    this._sections = title.children;

    this._processXmlTagFatalErrorConditions(testCase, title, [], testEvent);

    if (testCase.OverallResult[0].hasOwnProperty('StdOut')) {
      if (testEvent.message) testEvent.message = testEvent.message.trimRight();

      testEvent.message += '\n⬇ std::cout:\n';
      for (let i = 0; i < testCase.OverallResult[0].StdOut.length; i++) {
        const element = testCase.OverallResult[0].StdOut[i];
        testEvent.message += element.trimRight();
      }
      testEvent.message += '\n⬆ std::cout';
    }

    if (testCase.OverallResult[0].hasOwnProperty('StdErr')) {
      if (testEvent.message) testEvent.message = testEvent.message.trimRight();

      testEvent.message += '\n⬇ std::err:\n';
      for (let i = 0; i < testCase.OverallResult[0].StdErr.length; i++) {
        const element = testCase.OverallResult[0].StdErr[i];
        testEvent.message += element.trimRight();
      }
      testEvent.message += '\n⬆ std::err';
    }

    if (testCase.OverallResult[0].$.success === 'true') {
      testEvent.state = 'passed';
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
      testEvent.description += ' [' + branchMsg + ']';
      testEvent.tooltip += '\n🔀 ' + branchMsg + ' branches';
    }
  }

  private _processInfoWarningAndFailureTags(
    xml: XmlObject,
    title: Frame,
    stack: Catch2Section[],
    testEvent: TestEvent,
  ): void {
    if (xml.hasOwnProperty('Info')) {
      if (testEvent.message) testEvent.message = testEvent.message.trimRight();

      for (let j = 0; j < xml.Info.length; ++j) {
        const info = xml.Info[j];
        testEvent.message += '\n⬇ Info: ' + info.trim() + '\n⬆';
      }
    }
    if (xml.hasOwnProperty('Warning')) {
      for (let j = 0; j < xml.Warning.length; ++j) {
        const warning = xml.Warning[j];

        if (testEvent.message) testEvent.message = testEvent.message.trimRight();
        testEvent.message += '\n⬇ Warning: ' + warning.trim() + '\n⬆';

        testEvent.decorations!.push({
          line: Number(warning.$.line) - 1 /*It looks vscode works like this.*/,
          message:
            '⬅ ' +
            warning._.split(EOL)
              .map((l: string) => l.trim())
              .filter((l: string) => l.length > 0)
              .join('; ')
              .substr(0, 200),
          hover: warning._,
        });
      }
    }
    if (xml.hasOwnProperty('Failure')) {
      for (let j = 0; j < xml.Failure.length; ++j) {
        const failure = xml.Failure[j];

        if (testEvent.message) testEvent.message = testEvent.message.trimRight();
        testEvent.message += '\n⬇ Failure: ' + failure._.trim() + '\n⬆';

        testEvent.decorations!.push({
          line: Number(failure.$.line) - 1 /*It looks vscode works like this.*/,
          message:
            '⬅ ' +
            failure._.split(EOL)
              .map((l: string) => l.trim())
              .filter((l: string) => l.length > 0)
              .join('; ')
              .substr(0, 200),
          hover: failure._,
        });
      }
    }
  }

  private _processXmlTagExpressions(xml: XmlObject, title: Frame, stack: Catch2Section[], testEvent: TestEvent): void {
    if (xml.hasOwnProperty('Expression')) {
      for (let j = 0; j < xml.Expression.length; ++j) {
        const expr = xml.Expression[j];
        try {
          const message =
            '  Original:\n    ' +
            expr.Original.map((x: string) => x.trim()).join('; ') +
            '\n  Expanded:\n    ' +
            expr.Expanded.map((x: string) => x.trim()).join('; ');

          if (testEvent.message) testEvent.message = testEvent.message.trimRight();
          testEvent.message +=
            '\n' +
            this._getTitle(title, stack, {
              name: expr.$.type ? expr.$.type : '<unknown>',
              filename: expr.$.filename,
              line: expr.$.line,
            }) +
            ':\n' +
            message +
            '\n' +
            '⬆';
          testEvent.decorations!.push({
            line: Number(expr.$.line) - 1 /*It looks vscode works like this.*/,
            message: '⬅ ' + expr.Expanded.map((x: string) => x.trim()).join('; '),
            hover: message,
          });
        } catch (error) {
          this._shared.log.exception(error);
        }
        this._processXmlTagFatalErrorConditions(expr, title, stack, testEvent);
      }
    }
  }

  private _processXmlTagSections(
    xml: XmlObject,
    title: Frame,
    stack: Catch2Section[],
    testEvent: TestEvent,
    parentSection: Catch2Section,
  ): void {
    if (xml.hasOwnProperty('Section')) {
      for (let j = 0; j < xml.Section.length; ++j) {
        const section = xml.Section[j];

        try {
          if (testEvent.message) testEvent.message = testEvent.message.trimRight();
          testEvent.message +=
            '\n' + '⏩ '.repeat(stack.length + 1) + `${section.$.name} (${section.$.filename}:${section.$.line})\n`;

          if (typeof section._ === 'string')
            testEvent.message +=
              section._.split(EOL)
                .map((x: string) => x.trim())
                .filter((l: string) => l.length > 0)
                .join('\n') + '\n';

          let currSection = parentSection.children.find(
            v => v.name === section.$.name && v.filename === section.$.filename && v.line === section.$.line,
          );

          if (currSection === undefined) {
            currSection = new Catch2Section(section.$.name, section.$.filename, section.$.line);
            parentSection.children.push(currSection);
          }

          if (
            section.OverallResults &&
            section.OverallResults.length > 0 &&
            section.OverallResults[0].$.failures !== '0'
          ) {
            currSection.failed = true;
          }

          const currStack = stack.concat(currSection);

          this._processInfoWarningAndFailureTags(section, title, currStack, testEvent);

          this._processXmlTagExpressions(section, title, currStack, testEvent);

          this._processXmlTagSections(section, title, currStack, testEvent, currSection);
        } catch (error) {
          this._shared.log.exception(error);
        }
      }
    }
  }

  private _processXmlTagFatalErrorConditions(
    expr: XmlObject,
    title: Frame,
    stack: Catch2Section[],
    testEvent: TestEvent,
  ): void {
    if (expr.hasOwnProperty('FatalErrorCondition')) {
      try {
        for (let j = 0; j < expr.FatalErrorCondition.length; ++j) {
          const fatal = expr.FatalErrorCondition[j];

          if (testEvent.message) testEvent.message = testEvent.message.trimRight();
          testEvent.message +=
            '\n' +
            this._getTitle(title, stack, { name: 'Fatal Error', filename: expr.$.filename, line: expr.$.line }) +
            ':\n';

          if (fatal.hasOwnProperty('_')) {
            testEvent.message += '  Error: ' + fatal._.trim() + '\n';
          } else {
            testEvent.message += '  Error: unknown: ' + inspect(fatal) + '\n';
          }
          testEvent.message += '⬆';
        }
      } catch (error) {
        this._shared.log.exception(error);
        testEvent.message += 'Unknown fatal error: ' + inspect(error);
      }
    }
  }

  private _getTitle(title: Frame, stack: Frame[], suffix: Frame): string {
    const format = (f: Frame) => f.name + ' (at ' + f.line + ')';

    let s = '⬇ ' + format(title);

    if (title.name.startsWith('Scenario:')) {
      const semicolonPos = s.indexOf(':') - 1;

      stack.forEach(f => {
        s += '\n⬇';
        let sc = f.name.indexOf(':');
        if (sc == -1) {
          sc = 0;
        }
        s += ' '.repeat(semicolonPos - sc) + format(f);
      });
    } else {
      s += [...stack].map(format).map(x => '\n⬇   ' + x);
    }

    return s + '\n' + format(suffix);
  }
}
