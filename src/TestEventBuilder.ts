import * as vscode from 'vscode';

import { reindentStr } from './Util';
import { AbstractTest } from './AbstractTest';

type TestResult = 'skipped' | 'failed' | 'errored' | 'passed';

export class TestEventBuilder {
  public constructor(private readonly test: AbstractTest, public readonly testRun: vscode.TestRun) {}

  private _output: string[] = [];
  private _testMessage: vscode.TestMessage[] = [];
  private _result: TestResult | undefined = undefined;

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
    this._duration = duration;
  }

  public appendOutput(str: string | undefined, reindent: number | undefined, indentWidth?: number): void {
    if (reindent) {
      this._output.push(...reindentStr(reindent, str, indentWidth));
    } else if (str) {
      this._output.push(str);
    }
  }

  ///

  private _getLocation(file: string | undefined, line: string | undefined): vscode.Location | undefined {
    const lineP = parseInt(line ?? '') - 1;
    if (file && line) return new vscode.Location(vscode.Uri.file(file), new vscode.Range(lineP, 0, lineP, 999));
    else return undefined;
  }

  private getLocationAtStr(file: string | undefined, line: string | undefined): string {
    const lineP = parseInt(line ?? '') - 1;
    if (file && line) return ` (at ${file}:${lineP})`;
    else return '';
  }

  private getMarkdownLocationLink(title: string, file: string | undefined, line: string | undefined): string {
    const lineP = parseInt(line ?? '') - 1;
    if (file && line) return `[${title}](${file}:${lineP})`;
    else return title;
  }

  public addDiffMessage(
    file: string | undefined,
    line: string | undefined,
    message: string,
    expected: string,
    actual: string,
  ): void {
    const msg = vscode.TestMessage.diff(message, expected, actual);
    msg.location = this._getLocation(file, line);
    this._testMessage.push(msg);
  }

  public addExpression(
    file: string | undefined,
    line: string | undefined,
    original: string,
    expanded: string,
    type: string | undefined,
  ): void {
    const msg = new vscode.TestMessage((type ? `${type} e` : 'E') + 'xpanded: `' + expanded + '`');
    msg.location = this._getLocation(file, line);
    this._testMessage.push(msg);

    this.appendOutput(`Expression failed${this.getLocationAtStr(file, line)}:`, 1);
    this.appendOutput('❕Original:  ' + original + '\n' + '❗️Expanded:  ' + expanded, 2);
  }

  public addMessage(file: string | undefined, line: string | undefined, title: string, ...message: string[]): void {
    const msg = new vscode.TestMessage([`${title}`, ...message].join('\n'));
    msg.location = this._getLocation(file, line);
    this._testMessage.push(msg);

    this.appendOutput(`${title}${this.getLocationAtStr(file, line)}`, 1);
    this.appendOutput(message.join('\n'), 2);
  }

  public addMarkdown(file: string | undefined, line: string | undefined, title: string, ...message: string[]): void {
    const msg = new vscode.TestMessage(new vscode.MarkdownString([`${title}`, ...message].join('\n\n')));
    msg.location = this._getLocation(file, line);
    this._testMessage.push(msg);

    this.appendOutput(`${title}${this.getLocationAtStr(file, line)}`, 1);
    this.appendOutput(message.join('\n'), 2);
  }

  ///

  public build(overwriteMessage?: string): void {
    if (this._result === undefined) throw Error('TestEventBuilder state was not set');

    const finalMessage = overwriteMessage
      ? overwriteMessage.replace('\n', '\r\n')
      : this._output.length
      ? this._output.map(l => l + '\r\n').join('')
      : undefined;
    if (finalMessage) this.testRun.appendOutput(finalMessage);

    this.test.stopped(this.testRun, this._duration);

    switch (this._result) {
      case undefined:
        throw Error('result is not finalized');
      case 'errored':
        this.testRun.errored(this.test.item, this._testMessage, this._duration);
        break;
      case 'failed':
        this.testRun.failed(this.test.item, this._testMessage, this._duration);
        break;
      case 'skipped':
        this.testRun.skipped(this.test.item);
        break;
      case 'passed':
        this.testRun.passed(this.test.item, this._duration);
        break;
    }
  }
}
