//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { TestEvent, TestInfo } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';

import { C2TestSuiteInfo } from './C2TestSuiteInfo';
import { generateUniqueId } from './IdGenerator';
import { inspect } from 'util';

export class C2TestInfo implements TestInfo {
  readonly type: 'test' = 'test';
  readonly id: string;
  readonly label: string;
  readonly skipped: boolean;
  readonly testNameTrimmed: string;

  constructor(
    id: string | undefined,
    public readonly testNameFull: string,
    description: string,
    tags: string[],
    public readonly file: string,
    public readonly line: number,
    public readonly parent: C2TestSuiteInfo,
  ) {
    this.testNameTrimmed = this.testNameFull.trim();
    this.skipped = tags.some((v: string) => {
      return v.startsWith('[.') || v == '[hide]';
    }) ||
      this.testNameFull.startsWith('./');
    this.label = C2TestInfo._generateLabel(this.testNameFull, description, tags);
    this.id = id ? id : generateUniqueId();
  }

  private static _generateLabel(
    testNameFull: string, description: string, tags: string[]): string {
    return testNameFull + (tags.length > 0 ? ' ' + tags.join('') : '');
  }

  getEscapedTestName(): string {
    /*',' has special meaning */
    let t = this.testNameFull;
    t = t.replace(/,/g, '\\,')
    t = t.replace(/\[/g, '\\[');
    t = t.replace(/\*/g, '\\*');
    if (t.startsWith(' ')) t = '*' + t.substr(1);
    return t;
  }

  getStartEvent(): TestEvent {
    return { type: 'test', test: this, state: 'running' };
  }

  getSkippedEvent(): TestEvent {
    return { type: 'test', test: this, state: 'skipped' };
  }

  parseAndProcessTestCase(xmlStr: string, rngSeed: number | undefined):
    TestEvent {
    let res: any = undefined;
    new xml2js.Parser({ explicitArray: true })
      .parseString(xmlStr, (err: any, result: any) => {
        if (err) {
          throw err;
        } else {
          res = result;
        }
      });

    return this._processXmlTagTestCase(res.TestCase, rngSeed);
  }

  private _processXmlTagTestCase(testCase: any, rngSeed: number | undefined):
    TestEvent {
    try {
      const testEvent: TestEvent = {
        type: 'test',
        test: this,
        state: 'failed',
        message: '',
        decorations: []
      };

      if (rngSeed) {
        testEvent.message += 'Randomness seeded to: ' + rngSeed.toString() + '\n';
      }

      this._processXmlTagTestCaseInner(testCase, '', testEvent);

      if (testEvent.message === '') testEvent.message = '';
      if (testEvent.decorations.length == 0) testEvent.decorations = undefined;

      return testEvent;
    } catch (e) {
      throw e;
    }
  }

  private _processXmlTagTestCaseInner(testCase: any, title: string, testEvent: TestEvent):
    void {
    title = testCase.$.name + '(line: ' + testCase.$.line + ')';

    if (testCase.OverallResult[0].$.success === 'true') {
      testEvent.state = 'passed';
    }

    if (testCase.OverallResult[0].$.hasOwnProperty('durationInSeconds')) {
      testEvent.message += 'Duration: ' + testCase.OverallResult[0].$.durationInSeconds + ' second(s)\n';
    }

    this._processXmlTagExpressions(testCase, title, testEvent);

    this._processXmlTagSections(testCase, title, testEvent);

    this._processXmlTagFatalErrorConditions(testCase, title, testEvent);
  }

  private _processXmlTagExpressions(xml: any, title: string, testEvent: TestEvent):
    void {
    if (xml.hasOwnProperty('Expression')) {
      for (let j = 0; j < xml.Expression.length; ++j) {
        const expr = xml.Expression[j];
        try {
          testEvent.message += '>>> ' + title + ' ' + expr.$.type + ' (line: ' + expr.$.line + ')\n'
            + '  Original:\n    '
            + expr.Original.map((x: string) => x.trim()).join(' | ') + '\n'
            + '  Expanded:\n    '
            + expr.Expanded.map((x: string) => x.trim()).join(' | ') + '\n'
            + '<<<\n';
          testEvent.decorations!.push({
            line: Number(expr.$.line) - 1 /*It looks vscode works like this.*/,
            message:
              'Expanded: ' + expr.Expanded.map((x: string) => x.trim()).join(' | ')
          });
        } catch (error) {
          this.parent.allTests.log.error(inspect(error));
        }
        this._processXmlTagFatalErrorConditions(expr, title, testEvent);
      }
    }
  }

  private _processXmlTagSections(xml: any, title: string, testEvent: TestEvent):
    void {
    if (xml.hasOwnProperty('Section')) {
      for (let j = 0; j < xml.Section.length; ++j) {
        const section = xml.Section[j];
        try {
          title += ' | ' + section.$.name + '(line: ' + section.$.line + ')';

          this._processXmlTagExpressions(section, title, testEvent);

          this._processXmlTagSections(section, title, testEvent);
        } catch (error) {
          this.parent.allTests.log.error(inspect(error));
        }
      }
    }
  }

  private _processXmlTagFatalErrorConditions(expr: any, title: string, testEvent: TestEvent):
    void {
    if (expr.hasOwnProperty('FatalErrorCondition')) {
      try {
        for (let j = 0; j < expr.FatalErrorCondition.length; ++j) {
          const fatal = expr.FatalErrorCondition[j];

          testEvent.message += '>>> ' + title + ' ' + expr.$.type + ' (line: ' + expr.$.line + ')\n';
          if (fatal.hasOwnProperty('_')) {
            testEvent.message += 'Fatal error: ' + fatal._.trim() + '\n';
          } else {
            testEvent.message += 'Unknown fatal error: ' + inspect(fatal) + '\n';
          }
        }
      }
      catch (error) {
        testEvent.message += 'Unknown fatal error: ' + inspect(error);
        this.parent.allTests.log.error(inspect(error));
      }
    }
  }
}
