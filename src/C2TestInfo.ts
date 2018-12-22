//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { TestEvent, TestInfo } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';

import { Catch2TestSuiteInfo, C2TestSuiteInfoBase, GoogleTestSuiteInfo } from './C2TestSuiteInfo';
import { generateUniqueId } from './IdGenerator';
import { inspect } from 'util';

export abstract class C2TestInfoBase implements TestInfo {
  readonly type: 'test' = 'test';
  readonly id: string;

  constructor(id: string | undefined,
    public readonly testNameFull: string,
    public readonly label: string,
    public readonly skipped: boolean,
    public readonly file: string | undefined,
    public readonly line: number | undefined,
    public readonly parent: C2TestSuiteInfoBase,
  ) {
    this.id = id ? id : generateUniqueId();
  }

  abstract getEscapedTestName(): string;

  getStartEvent(): TestEvent {
    return { type: 'test', test: this, state: 'running' };
  }

  getSkippedEvent(): TestEvent {
    return { type: 'test', test: this, state: 'skipped' };
  }

  abstract getDebugParams(breakOnFailure: boolean): string[];
}

export class Catch2TestInfo extends C2TestInfoBase {
  constructor(
    id: string | undefined,
    testNameFull: string,
    description: string,
    tags: string[],
    file: string,
    line: number,
    parent: Catch2TestSuiteInfo,
  ) {
    super(id,
      testNameFull,
      Catch2TestInfo._generateLabel(testNameFull, description, tags),
      tags.some((v: string) => { return v.startsWith('[.') || v == '[hide]'; }) || testNameFull.startsWith('./'),
      file,
      line,
      parent);

    if (line < 0) throw Error('line smaller than zero');
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

  getDebugParams(breakOnFailure: boolean): string[] {
    const debugParams: string[] = [this.getEscapedTestName(), '--reporter', 'console'];
    if (breakOnFailure) debugParams.push('--break');
    return debugParams;
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
        testEvent.message += 'Randomness seeded to: ' + rngSeed.toString() + '.\n';
      }

      this._processXmlTagTestCaseInner(testCase, testEvent);

      if (testEvent.message === '') testEvent.message = '';
      if (testEvent.decorations!.length == 0) testEvent.decorations = undefined;

      return testEvent;
    } catch (e) {
      throw e;
    }
  }

  private _processXmlTagTestCaseInner(testCase: any, testEvent: TestEvent):
    void {
    const title = '>>> "' + testCase.$.name + '" at line ' + testCase.$.line;

    if (testCase.OverallResult[0].$.success === 'true') {
      testEvent.state = 'passed';
    }

    if (testCase.OverallResult[0].$.hasOwnProperty('durationInSeconds')) {
      testEvent.message += 'Duration: ' + testCase.OverallResult[0].$.durationInSeconds + ' second(s).\n';
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
          testEvent.message += title + ' -> '
            + (expr.$.type ? expr.$.type : '<unknown>')
            + ' at line ' + expr.$.line + ':\n'
            + '  Original:\n    '
            + expr.Original.map((x: string) => x.trim()).join(' | ') + '\n'
            + '  Expanded:\n    '
            + expr.Expanded.map((x: string) => x.trim()).join(' | ') + '\n'
            + '<<<\n\n';
          testEvent.decorations!.push({
            line: Number(expr.$.line) - 1 /*It looks vscode works like this.*/,
            message:
              '-> ' + expr.Expanded.map((x: string) => x.trim()).join(' | ')
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
          title += ' -> "' + section.$.name + '" at line ' + section.$.line;

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

          testEvent.message += title + ' -> at line ' + expr.$.line + ':\n';
          if (fatal.hasOwnProperty('_')) {
            testEvent.message += '  Fatal error: ' + fatal._.trim() + '\n';
          } else {
            testEvent.message += '  Unknown fatal error: ' + inspect(fatal) + '\n';
          }
          testEvent.message += '<<<\n\n';
        }
      }
      catch (error) {
        testEvent.message += 'Unknown fatal error: ' + inspect(error);
        this.parent.allTests.log.error(inspect(error));
      }
    }
  }
}

export class GoogleTestInfo extends C2TestInfoBase {
  constructor(
    id: string | undefined,
    testNameFull: string,
    file: string | undefined,
    line: number | undefined,
    parent: GoogleTestSuiteInfo,
  ) {
    super(id,
      testNameFull,
      testNameFull,
      testNameFull.startsWith('DISABLED_') || testNameFull.indexOf('.DISABLED_') != -1,
      file,
      line,
      parent);
  }

  getEscapedTestName(): string {
    let t = this.testNameFull;
    t = t.replace(/\*/g, '\\*');
    if (t.startsWith(' ')) t = '*' + t.substr(1);
    return t;
  }

  getDebugParams(breakOnFailure: boolean): string[] {
    const debugParams: string[] = [this.getEscapedTestName()];
    if (breakOnFailure) debugParams.push('--gtest_break_on_failure');
    return debugParams;
  }

  parseAndProcessTestCase(output: string): TestEvent {
    const ev: TestEvent = {
      type: 'test',
      test: this,
      state: 'failed',
      decorations: [],
      message: output,
    };


    const lastLineIndex = output.lastIndexOf('\n') + 1;

    if (output.indexOf('[       OK ]', lastLineIndex) != -1)
      ev.state = 'passed';

    const failure = /^(.+):([0-9]+): Failure$/;

    const lines = output.split(/\r?\n/);

    for (let i = 1; i < lines.length - 1; ++i) {
      const m = lines[i].match(failure);
      if (m !== null) {
        if (i + 2 < lines.length - 1
          && lines[i + 1].startsWith('Expected: ')
          && lines[i + 2].startsWith('  Actual: ')) {
          ev.decorations!.push({ line: Number(m[2]) - 1, message: lines[i + 1] + ';  ' + lines[i + 2] });
        } else if (i + 1 < lines.length - 1
          && lines[i + 1].startsWith('Expected: ')) {
          ev.decorations!.push({ line: Number(m[2]) - 1, message: lines[i + 1] });
        } else if (i + 3 < lines.length - 1
          && lines[i + 1].startsWith('Value of: ')
          && lines[i + 2].startsWith('  Actual: ')
          && lines[i + 3].startsWith('Expected: ')) {
          ev.decorations!.push({ line: Number(m[2]) - 1, message: lines[i + 2].trim() + ';  ' + lines[i + 3].trim() + ';' });
        } else {
          ev.decorations!.push({ line: Number(m[2]) - 1, message: '<-- failure' });
        }
      }
    }

    return ev;
  }
}