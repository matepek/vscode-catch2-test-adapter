import { TestEvent, TestInfo, TestDecoration } from 'vscode-test-adapter-api';
import { reindentArr, milisecToStr } from './Util';

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

  public appendMessage(str: string | undefined): void {
    this._message.push(...reindentArr(0, str));
  }

  public appendDecorator(line: number, str: string | undefined): void {
    const reindented = reindentArr(0, str);

    this._decorations.push({
      line,
      message: '⬅ ' + reindented.length ? reindented.join('; ').substr(0, 200) : 'failed',
      hover: reindented.length ? reindented.join('\n') : undefined,
    });
  }

  public appendMessageWithDecorator(line: number, str: string | undefined): void {
    this.appendMessage(str);
    this.appendDecorator(line, str);
  }

  public build(): TestEvent {
    const duration = this._durationMilisec ? milisecToStr(this._durationMilisec) : '';

    const description =
      (this.test.description ? this.test.description + ' ' : '') +
      duration +
      (this._description ? this._description : '');

    const message =
      (duration ? `⏱ Duration: ${duration}.\n` : '') + (this._message.length ? this._message.join('\n') : '');

    const tooltip =
      (this.test.tooltip ? this.test.tooltip + '\n' : '') + (this._tooltip.length ? this._tooltip.join('\n') : '');

    return {
      type: 'test',
      test: this.test,
      state: this._state,
      message: message ? message : undefined,
      decorations: this._decorations.length ? this._decorations : undefined,
      description: description ? description : undefined,
      tooltip: tooltip ? tooltip : undefined,
    };
  }
}
