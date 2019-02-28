//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { TestEvent } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';
import { EOL } from 'os';

import { SpawnOptions } from './FsWrapper';
import { AbstractTestInfo } from './AbstractTestInfo';
import { inspect } from 'util';
import { SharedVariables } from './SharedVariables';
import { RunningTestExecutableInfo } from './RunningTestExecutableInfo';

interface XmlObject {
  [prop: string]: any; //eslint-disable-line
}

class Frame {
  public constructor(name: string, filename: string, line: number) {
    this.name = name;
    this.filename = filename;
    this.line = line;
  }

  public readonly name: string;
  public readonly filename: string;
  public readonly line: number;
}

function getTitle(stack: Frame[]): string {
  if (stack.length == 0) throw new Error('stack should contains at least 1 frame');
  return '⬇️⬇️⬇️ ' + stack.map(f => '"' + f.name + '" at line ' + f.line).join(' ➡️ ');
}

export class Catch2TestInfo extends AbstractTestInfo {
  public constructor(
    shared: SharedVariables,
    id: string | undefined,
    testNameFull: string,
    description: string,
    tags: string[],
    file: string,
    line: number,
    execPath: string,
    execOptions: SpawnOptions,
  ) {
    super(
      shared,
      id,
      testNameFull,
      testNameFull + (tags.length > 0 ? ' ' + tags.join('') : ''),
      tags.some((v: string) => {
        return v.startsWith('[.') || v == '[hide]';
      }) || testNameFull.startsWith('./'),
      file,
      line,
      execPath,
      execOptions,
    );
  }

  public getEscapedTestName(): string {
    /*',' has special meaning */
    let t = this.testNameFull;
    t = t.replace(/,/g, '\\,');
    t = t.replace(/\[/g, '\\[');
    t = t.replace(/\*/g, '\\*');
    if (t.startsWith(' ')) t = '*' + t.substr(1);
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
      return this.getTimeoutEvent(runInfo.timeout);
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

    return testEvent;
  }

  private _processXmlTagTestCaseInner(testCase: XmlObject, testEvent: TestEvent): void {
    const stack: Frame[] = [new Frame(testCase.$.name, testCase.$.filename, testCase.$.line)];

    if (testCase.OverallResult[0].$.hasOwnProperty('durationInSeconds')) {
      testEvent.message += '⏱ Duration: ' + testCase.OverallResult[0].$.durationInSeconds + ' second(s).\n';
    }

    this._processInfoWarningAndFailureTags(testCase, stack, testEvent);

    this._processXmlTagExpressions(testCase, stack, testEvent);

    this._processXmlTagSections(testCase, stack, testEvent);

    this._processXmlTagFatalErrorConditions(testCase, stack, testEvent);

    if (testCase.OverallResult[0].hasOwnProperty('StdOut')) {
      testEvent.message += '⬇️⬇️⬇️ std::cout:';
      for (let i = 0; i < testCase.OverallResult[0].StdOut.length; i++) {
        const element = testCase.OverallResult[0].StdOut[i];
        testEvent.message += element.trimRight();
      }
      testEvent.message += '\n⬆️⬆️⬆️ std::cout\n';
    }

    if (testCase.OverallResult[0].hasOwnProperty('StdErr')) {
      testEvent.message += '⬇️⬇️⬇️ std::err:';
      for (let i = 0; i < testCase.OverallResult[0].StdErr.length; i++) {
        const element = testCase.OverallResult[0].StdErr[i];
        testEvent.message += element.trimRight();
      }
      testEvent.message += '\n⬆️⬆️⬆️ std::err\n';
    }

    if (testCase.OverallResult[0].$.success === 'true') {
      testEvent.state = 'passed';
    }
  }

  private _processInfoWarningAndFailureTags(xml: XmlObject, stack: Frame[], testEvent: TestEvent): void {
    if (xml.hasOwnProperty('Info')) {
      for (let j = 0; j < xml.Info.length; ++j) {
        const info = xml.Info[j];
        testEvent.message += '⬇️⬇️⬇️ Info: ' + info.trim() + ' ⬆️⬆️⬆️\n';
      }
    }
    if (xml.hasOwnProperty('Warning')) {
      for (let j = 0; j < xml.Warning.length; ++j) {
        const warning = xml.Warning[j];
        testEvent.message += '⬇️⬇️⬇️ Warning: ' + warning.trim() + ' ⬆️⬆️⬆️\n';
      }
    }
    if (xml.hasOwnProperty('Failure')) {
      for (let j = 0; j < xml.Failure.length; ++j) {
        const failure = xml.Failure[j];
        testEvent.message += '⬇️⬇️⬇️ Failure: ' + failure._.trim() + ' ⬆️⬆️⬆️\n';
        testEvent.decorations!.push({
          line: Number(failure.$.line) - 1 /*It looks vscode works like this.*/,
          message:
            '⬅️ ' +
            failure._.split(EOL)
              .map((l: string) => l.trim())
              .filter((l: string) => l.length > 0)
              .join('; '),
        });
      }
    }
  }

  private _processXmlTagExpressions(xml: XmlObject, stack: Frame[], testEvent: TestEvent): void {
    if (xml.hasOwnProperty('Expression')) {
      for (let j = 0; j < xml.Expression.length; ++j) {
        try {
          const expr = xml.Expression[j];
          const currStack = stack.concat(
            new Frame(expr.$.type ? expr.$.type : '<unknown>', expr.$.filename, expr.$.line),
          );
          try {
            testEvent.message +=
              getTitle(currStack) +
              ':\n  Original:\n    ' +
              expr.Original.map((x: string) => x.trim()).join('; ') +
              '\n  Expanded:\n    ' +
              expr.Expanded.map((x: string) => x.trim()).join('; ') +
              '\n' +
              '⬆️⬆️⬆️\n\n';
            testEvent.decorations!.push({
              line: Number(expr.$.line) - 1 /*It looks vscode works like this.*/,
              message: '⬅️ ' + expr.Expanded.map((x: string) => x.trim()).join('; '),
            });
          } catch (error) {
            this._shared.log.error(error);
          }
          this._processXmlTagFatalErrorConditions(expr, currStack, testEvent);
        } catch (error) {
          this._shared.log.error(error);
        }
      }
    }
  }

  private _processXmlTagSections(xml: XmlObject, stack: Frame[], testEvent: TestEvent): void {
    if (xml.hasOwnProperty('Section')) {
      for (let j = 0; j < xml.Section.length; ++j) {
        const section = xml.Section[j];
        try {
          const currStack = stack.concat(new Frame(section.$.name, section.$.filename, section.$.line));

          this._processInfoWarningAndFailureTags(xml, currStack, testEvent);

          this._processXmlTagExpressions(section, currStack, testEvent);

          this._processXmlTagSections(section, currStack, testEvent);
        } catch (error) {
          this._shared.log.error(error);
        }
      }
    }
  }

  private _processXmlTagFatalErrorConditions(expr: XmlObject, stack: Frame[], testEvent: TestEvent): void {
    if (expr.hasOwnProperty('FatalErrorCondition')) {
      try {
        for (let j = 0; j < expr.FatalErrorCondition.length; ++j) {
          const fatal = expr.FatalErrorCondition[j];
          const currStack = stack.concat(new Frame('Fatal Error', expr.$.filename, expr.$.line));

          testEvent.message += getTitle(currStack) + ':\n';
          if (fatal.hasOwnProperty('_')) {
            testEvent.message += '  Error: ' + fatal._.trim() + '\n';
          } else {
            testEvent.message += '  Error: unknown: ' + inspect(fatal) + '\n';
          }
          testEvent.message += '⬆️⬆️⬆️\n\n';
        }
      } catch (error) {
        this._shared.log.error(error);
        testEvent.message += 'Unknown fatal error: ' + inspect(error);
      }
    }
  }
}
