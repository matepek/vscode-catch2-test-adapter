//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { TestEvent, TestInfo } from 'vscode-test-adapter-api';

import { generateUniqueId } from './Util';
import { SharedVariables } from './SharedVariables';

export abstract class AbstractTestInfo implements TestInfo {
  public readonly type: 'test' = 'test';
  public readonly id: string;
  public readonly origLabel: string;
  public readonly description: string;
  public readonly tooltip: string;

  public lastRunState: string | undefined = undefined;
  public lastRunMilisec: number | undefined = undefined;

  protected constructor(
    protected readonly _shared: SharedVariables,
    id: string | undefined,
    public readonly testNameAsId: string,
    public readonly label: string,
    public readonly skipped: boolean,
    public readonly file: string | undefined,
    public readonly line: number | undefined,
    description: string | undefined,
    tooltip: string | undefined,
  ) {
    this.id = id ? id : generateUniqueId();
    this.origLabel = label;
    this.description = description ? description : '';
    this.tooltip = 'Name: ' + testNameAsId + (tooltip ? '\n' + tooltip : '');
    if (line && line < 0) throw Error('line smaller than zero');
  }

  abstract getDebugParams(breakOnFailure: boolean): string[];

  public getStartEvent(): TestEvent {
    return { type: 'test', test: this, state: 'running' };
  }

  public getSkippedEvent(): TestEvent {
    return { type: 'test', test: this, state: 'skipped' };
  }

  public getTimeoutEvent(milisec: number): TestEvent {
    const ev = this.getFailedEventBase();
    ev.message += '⌛️ Timed out: "catch2TestExplorer.defaultRunningTimeoutSec": ' + milisec / 1000 + ' second(s).\n';
    ev.state = 'errored';
    return ev;
  }

  public getFailedEventBase(): TestEvent {
    return {
      type: 'test',
      test: this,
      state: 'failed',
      message: '',
      decorations: [],
    };
  }

  public static milisecToStr(durationInMilisec: number): string {
    const minute = Math.floor(durationInMilisec / 60000);
    const sec = Math.floor((durationInMilisec - minute * 60000) / 1000);
    const miliSec = durationInMilisec - minute * 60000 - sec * 1000;

    let durationArr = [[minute, 'm'], [sec, 's'], [miliSec, 'ms']].filter(v => v[0]);

    if (durationArr.length === 0) durationArr.push([0, 'ms']);

    return durationArr.map(v => v[0].toString() + v[1]).join(' ');
  }

  protected _extendDescriptionAndTooltip(ev: TestEvent, durationInMilisec: number): void {
    this.lastRunMilisec = durationInMilisec;

    const durationStr = AbstractTestInfo.milisecToStr(durationInMilisec);

    ev.description = this.description + (this.description ? ' ' : '') + '(' + durationStr + ')';
    ev.tooltip = this.tooltip + (this.tooltip ? '\n\n' : '') + '⏱ ' + durationStr;
  }

  public findRouteToTestById(id: string): AbstractTestInfo[] | undefined {
    return this.id === id ? [this] : undefined;
  }

  public enumerateTestInfos(fn: (v: AbstractTestInfo) => void): void {
    fn(this);
  }

  public findTestInfo(pred: (v: AbstractTestInfo) => boolean): AbstractTestInfo | undefined {
    return pred(this) ? this : undefined;
  }
}
