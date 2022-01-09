import * as vscode from 'vscode';
import * as ansi from 'ansi-colors';

import { parseLine } from './Util';
import { AbstractTest, SubTest } from './AbstractTest';
import { debugBreak } from './util/DevelopmentHelper';

type TestResult = 'skipped' | 'failed' | 'errored' | 'passed';

// TODO:shared variable to control and colorization  vscode.window.activeColorTheme.kind;
// also gtest could be colorized if we change the processor

export class TestResultBuilder<T extends AbstractTest = AbstractTest> {
  constructor(
    readonly test: T,
    readonly testRun: vscode.TestRun,
    private readonly runPrefix: string,
    private readonly addBeginEndMsg: boolean,
    readonly level = 0,
  ) {}

  readonly log = this.test.log;

  private readonly _messages: vscode.TestMessage[] = [];
  private _result: TestResult | undefined = undefined;
  //private readonly _outputLines: string[] = [];

  started(): void {
    this.log.info('Test', this.test.id, 'has started.');
    this.testRun.started(this.test.item);

    if (this.addBeginEndMsg) {
      const locStr = this.getLocationAtStr(this.test.file, this.test.line, true);
      if (this.level === 0) {
        this.addOutputLine(0, ansi.bold(`[ RUN      ] \`${ansi.italic(this.test.label)}\``) + `${locStr}`);
      } else {
        this.addOutputLine(-1, ansi.dim('├') + '`' + ansi.italic(this.test.label) + '`' + locStr);
      }
    }
  }

  passed(): void {
    if (this._result === undefined) this._result = 'passed';
  }

  failed(): void {
    if (this._result !== 'errored') this._result = 'failed';
  }

  errored(): void {
    this._result = 'errored';
  }

  skipped(): void {
    this._result = 'skipped';
  }

  private _duration: number | undefined = undefined;

  setDurationMilisec(duration: number | undefined): void {
    // this will deal with NaN
    if (duration) this._duration = duration;
  }

  failedByTimeout(timeoutMilisec: number): void {
    this.addOutputLine(1, '⌛️ Timed out: "testMate.cpp.test.runtimeLimit": ' + timeoutMilisec / 1000 + ' second(s).');
    this.failed();
  }

  addOutputLine(indent: number, ...msgs: string[]): void {
    const lines = indentStr(this.level + indent, ...msgs);

    //this._outputLines.push(...lines);

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
        return new vscode.Location(vscode.Uri.file(file), new vscode.Range(lineP - 1, 0, lineP, 0));
      }
    }
    return undefined;
  }

  static readonly relativeLocPrefix = ' @ ./';

  getLocationAtStr(file: string | undefined, line: number | string | undefined, lineIsZeroBased: boolean): string {
    if (file) {
      let lineSuffix = '';
      parseLine(line, l => (lineSuffix = `:${l + (lineIsZeroBased ? 1 : 0)}`));
      // const wp = this.test.exec.shared.workspacePath + '/';
      // if (file.startsWith(wp)) {
      //   return ansi.dim(TestResultBuilder.relativeLocPrefix) + ansi.dim(file.substring(wp.length) + lineSuffix);
      // }
      return ansi.dim(` @ ${file}${lineSuffix}`);
    }
    return '';
  }

  addDiffMessage(
    file: string | undefined,
    line: number | string | undefined,
    message: string,
    expected: string,
    actual: string,
  ): void {
    file = this.test.exec.findSourceFilePath(file);
    const msg = vscode.TestMessage.diff(message, expected, actual);
    msg.location = TestResultBuilder._getLocation(file, line);
    this._messages.push(msg);
  }

  addExpressionMsg(
    file: string | undefined,
    line: string | undefined,
    original: string,
    expanded: string,
    _type: string | undefined,
  ): void {
    file = this.test.exec.findSourceFilePath(file);
    this.addMessage(file, line, 'Expanded: `' + expanded + '`');

    const loc = this.getLocationAtStr(file, line, false);
    this.addOutputLine(1, 'Expression ' + ansi.red('failed') + loc + ':');
    this.addOutputLine(2, '❕Original:  ' + original);
    this.addOutputLine(2, '❗️Expanded:  ' + expanded);
  }

  addMessageWithOutput(
    file: string | undefined,
    line: number | string | undefined,
    title: string,
    ...message: string[]
  ): void {
    file = this.test.exec.findSourceFilePath(file);
    this.addMessage(file, line, [`${title}`, ...message].join('\r\n'));
    const loc = this.getLocationAtStr(file, line, false);
    this.addOutputLine(1, `${title}${loc}`);
    this.addOutputLine(2, ...message);
  }

  addMessage(file: string | undefined, line: number | string | undefined, ...message: string[]): void {
    file = this.test.exec.findSourceFilePath(file);
    const msg = new vscode.TestMessage(message.join('\r\n'));
    msg.location = TestResultBuilder._getLocation(file, line);
    this._messages.push(msg);
  }

  addMarkdownMsg(file: string | undefined, line: number | string | undefined, ...message: string[]): void {
    file = this.test.exec.findSourceFilePath(file);
    const msg = new vscode.TestMessage(new vscode.MarkdownString(message.join('\r\n\n')));
    msg.location = TestResultBuilder._getLocation(file, line);
    this._messages.push(msg);
  }

  addQuoteWithLocation(
    file: string | undefined,
    line: number | string | undefined,
    title: string,
    ...message: string[]
  ): void {
    file = this.test.exec.findSourceFilePath(file);
    const loc = this.getLocationAtStr(file, line, false);
    this.addOutputLine(1, `${title}${loc}${message.length ? ':' : ''}`);
    this.addOutputLine(2, ...message);
  }

  ///

  private coloredResult(): string {
    switch (this._result) {
      case 'passed':
        return '[' + ansi.greenBright('       OK ') + ']';
      case 'failed':
        return '[' + ansi.bold.red('  FAILED  ') + ']';
      case 'skipped':
        return '[' + '  SKIPPED ' + ']';
      case 'errored':
        return '[' + ansi.bold.bgRed('  ERRORED ') + ']';
      case undefined:
        return '';
    }
  }

  endMessage(): void {
    if (this.addBeginEndMsg) {
      const d = this._duration ? ansi.dim(` in ${Math.round(this._duration * 1000) / 1000000} second(s)`) : '';

      if (this.level === 0) {
        this.addOutputLine(0, `${this.coloredResult()} \`${ansi.italic(this.test.label)}\`` + `${d}`, '');
      }
    }
  }

  ///

  build(): void {
    this.log.info('Test', this.test.id, 'has stopped.');

    if (this._built) {
      debugBreak();
      throw Error('TestEventBuilder should not be built again');
    }
    if (this._result === undefined) {
      debugBreak();
      throw Error('TestEventBuilder state was not set for test: ' + this.test.id);
    }

    this.endMessage();

    const messages = this._messages;
    // const messages = [];
    // if (this.level === 0) {
    //   messages.push(...this._message);
    //   for (const sub of this.getSubTestResultBuilders()) messages.push(...sub._message);
    // }

    switch (this._result) {
      case undefined:
        throw Error('result is not finalized');
      case 'errored':
        this.testRun.errored(this.test.item, messages, this._duration);
        break;
      case 'failed':
        this.testRun.failed(this.test.item, messages, this._duration);
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

  get built(): boolean {
    return this._built;
  }

  ///

  private readonly _subTestResultBuilders: TestResultBuilder[] = [];

  *getSubTestResultBuilders(): IterableIterator<TestResultBuilder> {
    for (const b of this._subTestResultBuilders) {
      yield b;
      for (const subB of b.getSubTestResultBuilders()) yield subB;
    }
  }

  createSubTestBuilder(test: SubTest): TestResultBuilder {
    const subTestBuilder = new TestResultBuilder(test, this.testRun, this.runPrefix, true, this.level + 1);
    this._subTestResultBuilders.push(subTestBuilder);
    return subTestBuilder;
  }
}

///

const indentPrefix = (level: number) => ansi.dim('│ '.repeat(level));

const indentStr = (indent: number, ...strs: string[]) => {
  return reindentStr(...strs).map(l => indentPrefix(indent) + l);
};

const reindentLines = (lines: string[]): string[] => {
  let indent = 9999;
  lines.forEach(l => {
    let spaces = 0;
    while (spaces < l.length && l[spaces] === ' ') ++spaces;
    indent = Math.min(indent, spaces);
  });
  const reindented = lines.map(l => l.substring(indent).trimEnd());
  return reindented;
};

const reindentStr = (...strs: string[]): string[] => {
  const lines = strs.flatMap(x => x.split(/\r?\n/));
  return reindentLines(lines);
};
