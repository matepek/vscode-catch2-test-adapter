import * as path from 'path';
import * as api from 'vscode-test-adapter-api';
import { reindentStr, reindentLines, milisecToStr, concatU } from './Util';
import { AbstractTest, AbstractTestEvent } from './AbstractTest';

export type TestEventState = 'running' | 'passed' | 'failed' | 'skipped' | 'errored';

export class TestEventBuilder {
  public constructor(public test: AbstractTest, private readonly _testRunId: string) {}

  private _message: string[] = [];
  private _decorations: api.TestDecoration[] = [];
  private _description: string[] = [];
  private _tooltip: string[] = [];
  private _state: TestEventState | undefined = undefined;

  public passed(): void {
    if (this._state === undefined) this._state = 'passed';
  }

  public failed(): void {
    if (this._state !== 'errored') this._state = 'failed';
  }

  public errored(): void {
    this._state = 'errored';
  }

  public skipped(): void {
    this._state = 'skipped';
  }

  public appendDescription(str: string): void {
    this._description.push(str);
  }

  public setDurationMilisec(duration: number | undefined): void {
    this.test.lastRunMilisec = duration;
  }

  public appendTooltip(str: string): void {
    this._tooltip.push(str);
  }

  public appendMessage(str: string | undefined, reindent: number | null, indentWidth?: number): void {
    if (reindent !== null) {
      this._message.push(...reindentStr(reindent, str, indentWidth));
    } else if (str) {
      this._message.push(str);
    }
  }

  public appendDecorator(
    file: string | undefined,
    line: number,
    msg: string | string[] | undefined,
    hover?: string | string[],
  ): void {
    const normalizedFile = file ? path.normalize(file) : undefined;
    let decoration = this._decorations.find(d => d.file === normalizedFile && d.line === line);

    const reindentedMsg =
      typeof msg === 'string' ? reindentStr(0, msg) : Array.isArray(msg) ? reindentLines(0, msg) : [];

    const reindentedHov =
      typeof hover === 'string' ? reindentStr(0, hover) : Array.isArray(hover) ? reindentLines(0, hover) : [];

    const hoverStr = reindentedHov.length
      ? reindentedHov.join('\n')
      : reindentedMsg.length
      ? reindentedMsg.join('\n')
      : undefined;

    if (decoration === undefined) {
      decoration = {
        file: normalizedFile,
        line,
        message:
          '⬅ ' +
          (reindentedMsg.length
            ? reindentedMsg
                .map((x: string) => x.trim())
                .join('; ')
                .substr(0, 200)
            : 'failed'),
        hover: hoverStr,
      };
      this._decorations.push(decoration);
    } else {
      decoration.message = '⬅ multiple failures';
      decoration.hover = concatU(
        decoration.hover,
        hoverStr,
        '\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n',
      );
    }
  }

  public appendMessageWithDecorator(
    file: string | undefined,
    line: number,
    str: string | undefined,
    reindent: number | null,
  ): void {
    this.appendMessage(str, reindent);
    this.appendDecorator(file, line, str);
  }

  public build(overwriteMessage?: string): AbstractTestEvent {
    const duration = this.test.lastRunMilisec !== undefined ? milisecToStr(this.test.lastRunMilisec) : undefined;

    const description: string[] = [];
    const message: string[] = [];
    const tooltip: string[] = [];

    if (duration !== undefined && this.test.lastRunMilisec !== undefined) {
      description.push(`(${duration})`);
      message.push(`⏱Duration: ${Math.round(this.test.lastRunMilisec * 1000) / 1000000} second(s).`);
    }

    description.push(...this._description);
    tooltip.push(...this._tooltip);
    message.push(...this._message);

    if (duration) tooltip.push(`⏱Duration: ${duration}`);

    if (this._state === undefined) throw Error('TestEventBuilder state was not set');

    const descriptionStr = description.join(' ');
    const tooltipStr = tooltip.join('\n');

    this.test._updateDescriptionAndTooltip(descriptionStr, tooltipStr);

    const ev: AbstractTestEvent = {
      testRunId: this._testRunId,
      type: 'test',
      test: this.test.id,
      state: this._state,
      message: overwriteMessage ? overwriteMessage : message.length ? message.join('\n') : undefined,
      decorations: this._decorations.length ? this._decorations : [],
      description: this.test.description,
      tooltip: this.test.tooltip,
    };

    this.test.lastRunEvent = ev;

    return ev;
  }
}
