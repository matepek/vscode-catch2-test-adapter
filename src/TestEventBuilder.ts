import { TestEvent, TestInfo, TestDecoration } from 'vscode-test-adapter-api';
import { reindentStr, reindentLines, milisecToStr } from './Util';

export type TestEventState = 'running' | 'passed' | 'failed' | 'skipped' | 'errored';

export class TestEventBuilder {
  public constructor(public test: TestInfo) {}

  private _durationMilisec: number | undefined = undefined;
  private _message: string[] = [];
  private _decorations: TestDecoration[] = [];
  private _description: string = '';
  private _tooltip: string[] = [];
  private _state: TestEventState = 'failed';

  public setState(state: TestEventState): void {
    this._state = state;
  }

  public appendDescription(str: string): void {
    this._description += str;
  }

  public setDurationMilisec(duration: number): void {
    this._durationMilisec = duration;
  }

  public appendTooltip(str: string): void {
    this._tooltip.push(str);
  }

  public appendMessage(str: string | undefined, reindent: number | null): void {
    if (reindent !== null) {
      this._message.push(...reindentStr(reindent, str));
    } else if (str) {
      this._message.push(str);
    }
  }

  public appendDecorator(line: number, msg: string | string[] | undefined, hover?: string): void {
    const reindented =
      typeof msg === 'string' ? [reindentStr(0, msg)] : Array.isArray(msg) ? reindentLines(0, msg) : [];

    this._decorations.push({
      line,
      message: '⬅ ' + reindented.length ? reindented.join('; ').substr(0, 200) : 'failed',
      hover: hover ? reindentStr(0, hover).join('\n') : reindented.length ? reindented.join('\n') : undefined,
    });
  }

  public appendMessageWithDecorator(line: number, str: string | undefined, reindent: number | null): void {
    this.appendMessage(str, reindent);
    this.appendDecorator(line, str);
  }

  public build(): TestEvent {
    const duration = this._durationMilisec ? milisecToStr(this._durationMilisec) : undefined;

    const description: string[] = [];
    const message: string[] = [];
    const tooltip: string[] = [];

    if (this.test.description) description.push(this.test.description);

    if (duration && this._durationMilisec) {
      message.push(`⏱Duration: ${Math.round(this._durationMilisec * 1000) / 1000000} second(s).`);
      description.push(`(${duration})`);
    }

    message.push(...this._message);

    if (this._description) description.push(this._description);

    if (this.test.tooltip) tooltip.push(this.test.tooltip);

    tooltip.push(...this._tooltip);

    if (duration) tooltip.push(`⏱Duration: ${duration}`);

    return {
      type: 'test',
      test: this.test,
      state: this._state,
      message: message.length ? message.join('\n') : undefined,
      decorations: this._decorations.length ? this._decorations : [],
      description: description.length ? description.join(' ') : undefined,
      tooltip: tooltip.length ? tooltip.join('\n') : undefined,
    };
  }
}
