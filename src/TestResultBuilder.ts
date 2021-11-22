import * as vscode from 'vscode';
import * as ansi from 'ansi-colors';

import { generateId, parseLine } from './Util';
import { LoggerWrapper } from './LoggerWrapper';
import { AbstractTest, SubTest } from './AbstractTest';
import { debugBreak } from './util/DevelopmentHelper';
import { RunningExecutable } from './RunningExecutable';

type TestResult = 'skipped' | 'failed' | 'errored' | 'passed';

// TODO:shared variable to control and colorization  vscode.window.activeColorTheme.kind;
// also gtest could be colorized if we change the processor

export class TestResultBuilder<T extends AbstractTest = AbstractTest> {
  public constructor(
    public readonly test: T,
    public readonly testRun: vscode.TestRun,
    private readonly runPrefix: string,
    private readonly addBeginEndMsg: boolean,
    public readonly level = 0,
  ) {
    this._log = test.shared.log;
  }

  public static calcRunPrefix(_runInfo: RunningExecutable): string {
    //return `[#${runInfo.pid}] `;
    return `[#${generateId()}] `;
  }

  private readonly _log: LoggerWrapper;
  private readonly _message: vscode.TestMessage[] = [];
  private _result: TestResult | undefined = undefined;

  public started(): void {
    this._log.info('Test', this.test.id, 'has started.');
    this.testRun.started(this.test.item);

    if (this.addBeginEndMsg) {
      const locStr = TestResultBuilder.getLocationAtStr(this.test.file, this.test.line);
      if (this.level === 0) {
        this.addOutputLine(ansi.bold(`# \`${this.test.label}\` started`) + `${locStr}`);
      } else {
        this.addOutputLine(-1, prefixForNewSubCase(this.level) + '`' + ansi.italic(this.test.label) + '`' + locStr);
      }
    }
  }

  public passed(): void {
    if (this._result === undefined) this._result = 'passed';
  }

  public failed(): void {
    if (this._result !== 'errored') this._result = 'failed';
  }

  public errored(): void {
    this._result = 'errored';
  }

  public skipped(): void {
    this._result = 'skipped';
  }

  private _duration: number | undefined = undefined;

  public setDurationMilisec(duration: number | undefined): void {
    // this will deal with NaN
    if (duration) this._duration = duration;
  }

  public failedByTimeout(timeoutMilisec: number): void {
    this.addOutputLine(1, '⌛️ Timed out: "testMate.cpp.test.runtimeLimit": ' + timeoutMilisec / 1000 + ' second(s).');
    this.failed();
  }

  public addOutputLine(indentOrMsg: number | string | undefined, ...msgs: string[]): void {
    let lines: string[];
    if (typeof indentOrMsg == 'number') {
      lines = reindentStr(this.level + indentOrMsg, ...msgs);
    } else if (typeof indentOrMsg == 'string') {
      lines = reindentStr(this.level, indentOrMsg, ...msgs);
    } else {
      lines = msgs;
    }
    this.testRun.appendOutput(lines.map(x => this.runPrefix + x + '\r\n').join(''));
  }

  ///

  private static _getLocation(
    file: string | undefined,
    line: number | string | undefined,
  ): vscode.Location | undefined {
    if (file) {
      const lineP = parseLine(line);
      if (typeof lineP == 'number') {
        return new vscode.Location(vscode.Uri.file(file), new vscode.Range(lineP - 1, 0, lineP - 1, 999));
      }
    }
    return undefined;
  }

  public static getLocationAtStr(file: string | undefined, line: number | string | undefined): string {
    if (file) {
      const lineP = parseLine(line);
      if (typeof lineP == 'number') {
        return ansi.grey(` (at ${file}:${lineP})`);
      } else {
        return ansi.grey(` (at ${file})`);
      }
    }
    return '';
  }

  public addDiffMessage(
    file: string | undefined,
    line: number | string | undefined,
    message: string,
    expected: string,
    actual: string,
  ): void {
    const msg = vscode.TestMessage.diff(message, expected, actual);
    msg.location = TestResultBuilder._getLocation(file, line);
    this._message.push(msg);
  }

  public addExpressionMsg(
    file: string | undefined,
    line: string | undefined,
    original: string,
    expanded: string,
    _type: string | undefined,
  ): void {
    this.addMessage(file, line, 'Expanded: `' + expanded + '`');

    const loc = TestResultBuilder.getLocationAtStr(file, line);
    this.addOutputLine(1, `Expression failed${loc}:`);
    this.addOutputLine(2, '❕Original:  ' + original);
    this.addOutputLine(2, '❗️Expanded:  ' + expanded);
  }

  public addMessageWithOutput(
    file: string | undefined,
    line: number | string | undefined,
    title: string,
    ...message: string[]
  ): void {
    this.addMessage(file, line, [`${title}`, ...message].join('\r\n'));
    const loc = TestResultBuilder.getLocationAtStr(file, line);
    this.addOutputLine(1, `${title}${loc}`);
    this.addOutputLine(2, ...message);
  }

  public addMessage(file: string | undefined, line: number | string | undefined, ...message: string[]): void {
    const msg = new vscode.TestMessage(message.join('\r\n'));
    msg.location = TestResultBuilder._getLocation(file, line);
    this._message.push(msg);
  }

  public addMarkdownMsg(file: string | undefined, line: number | string | undefined, ...message: string[]): void {
    const msg = new vscode.TestMessage(new vscode.MarkdownString(message.join('\r\n\n')));
    msg.location = TestResultBuilder._getLocation(file, line);
    this._message.push(msg);
  }

  public addQuoteWithLocation(
    file: string | undefined,
    line: number | string | undefined,
    title: string,
    ...message: string[]
  ): void {
    const loc = TestResultBuilder.getLocationAtStr(file, line);
    this.addOutputLine(1, `${title}${loc}${message.length ? ':' : ''}`);
    this.addOutputLine(2, ...message);
    //if (message.length) this.addOutputLine(1, `⬆ ${title}`);
  }

  ///

  private coloredResult(): string {
    switch (this._result) {
      case 'passed':
        return ansi.green(this._result);
      case 'failed':
        return ansi.red(this._result);
      case 'skipped':
        return this._result;
      case 'errored':
        return ansi.bgRedBright(this._result);
      case undefined:
        return '';
    }
  }

  public endMessage(): void {
    if (this.addBeginEndMsg) {
      const d = this._duration ? ansi.grey(` in ${Math.round(this._duration * 1000) / 1000000} second(s)`) : '';

      if (this.level === 0) {
        this.addOutputLine(ansi.bold(`# \`${this.test.label}\` ${this.coloredResult()}`) + `${d}`, '');
      } else if (this._result !== 'passed') {
        this.addOutputLine(ansi.bold(`# ${this.coloredResult()}`) + `${d}`);
      }
    }
  }

  ///

  public build(): void {
    this._log.info('Test', this.test.id, 'has stopped.');

    if (this._built) {
      debugBreak();
      throw Error('TestEventBuilder should not be built again');
    }
    if (this._result === undefined) {
      debugBreak();
      throw Error('TestEventBuilder state was not set for test: ' + this.test.id);
    }

    this.endMessage();

    switch (this._result) {
      case undefined:
        throw Error('result is not finalized');
      case 'errored':
        this.testRun.errored(this.test.item, this._message, this._duration);
        break;
      case 'failed':
        this.testRun.failed(this.test.item, this._message, this._duration);
        break;
      case 'skipped':
        this.testRun.skipped(this.test.item);
        break;
      case 'passed':
        this.testRun.passed(this.test.item, this._duration);
        break;
    }
    this._built = true;
  }

  private _built = false;

  public get built(): boolean {
    return this._built;
  }

  ///

  private readonly _subTestResultBuilders: TestResultBuilder[] = [];

  public get subTestResultBuilders(): ReadonlyArray<TestResultBuilder> {
    return this._subTestResultBuilders.flatMap(b => [b, ...b.subTestResultBuilders]);
  }

  public createSubTestBuilder(test: SubTest): TestResultBuilder {
    const subTestBuilder = new TestResultBuilder(test, this.testRun, this.runPrefix, true, this.level + 1);
    this._subTestResultBuilders.push(subTestBuilder);
    return subTestBuilder;
  }
}

///

const indentPrefix = '| ';

const prefixForNewSubCase = (indentLevel: number): string => {
  if (indentLevel === 0) return '';
  else return indentPrefix.repeat(indentLevel - 1) + '| ';
};

const reindentLines = (indentLevel: number, lines: string[]): string[] => {
  let indent = 9999;
  lines.forEach(l => {
    let spaces = 0;
    while (spaces < l.length && l[spaces] === ' ') ++spaces;
    indent = Math.min(indent, spaces);
  });
  const reindented = lines.map(l => indentPrefix.repeat(indentLevel) + l.substr(indent).trimRight());
  return reindented;
};

const reindentStr = (indentLevel: number, ...strs: string[]): string[] => {
  const lines = strs.flatMap(x => x.split(/\r?\n/));
  return reindentLines(indentLevel, lines);
};
