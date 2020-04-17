import * as path from 'path';
import { TestEvent, TestInfo } from 'vscode-test-adapter-api';
import { generateId, milisecToStr } from './Util';
import { SharedVariables } from './SharedVariables';
import { RunningTestExecutableInfo } from './RunningTestExecutableInfo';
import { Suite } from './Suite';

export abstract class AbstractTest implements TestInfo {
  public readonly type: 'test' = 'test';
  public readonly id: string;
  public readonly description: string;
  public readonly tooltip: string;
  public readonly file: string | undefined;
  public readonly line: number | undefined;

  public lastRunEvent: TestEvent | undefined = undefined;
  public lastRunMilisec: number | undefined = undefined;

  protected constructor(
    protected readonly _shared: SharedVariables,
    id: string | undefined,
    public readonly testName: string,
    private readonly _label: string,
    public readonly skipped: boolean,
    file: string | undefined,
    line: number | undefined,
    description: string | undefined,
    tooltip: string | undefined,
  ) {
    this.id = id ? id : generateId();
    this.description = description ? description : '';
    this.file = file ? path.normalize(file) : undefined;
    this.line = file ? line : undefined;
    this.tooltip = 'Name: ' + testName + (tooltip ? '\n' + tooltip : '');
    if (line && line < 0) throw Error('line smaller than zero');
  }

  public get label(): string {
    // TODO if force ignore
    return this._label;
  }

  public getStartEvent(): TestEvent {
    return { type: 'test', test: this, state: 'running' };
  }

  public getSkippedEvent(): TestEvent {
    return { type: 'test', test: this, state: 'skipped' };
  }

  public abstract getDebugParams(breakOnFailure: boolean): string[];

  public abstract parseAndProcessTestCase(
    output: string,
    rngSeed: number | undefined,
    runInfo: RunningTestExecutableInfo,
  ): TestEvent;

  public getTimeoutEvent(milisec: number): TestEvent {
    const ev = this.getFailedEventBase();
    ev.message += '⌛️ Timed out: "catch2TestExplorer.defaultRunningTimeoutSec": ' + milisec / 1000 + ' second(s).';
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

  protected _extendDescriptionAndTooltip(ev: TestEvent, durationInMilisec: number): void {
    this.lastRunMilisec = durationInMilisec;

    const durationStr = milisecToStr(durationInMilisec);

    ev.description = this.description + (this.description ? ' ' : '') + '(' + durationStr + ')';
    ev.tooltip = this.tooltip + (this.tooltip ? '\n\n' : '') + '⏱Duration: ' + durationStr;
  }

  public enumerateTestInfos(fn: (v: AbstractTest) => void): void {
    fn(this);
  }

  public findTestInfo(pred: (v: AbstractTest) => boolean): AbstractTest | undefined {
    return pred(this) ? this : undefined;
  }

  public findRouteToTestInfo(pred: (v: AbstractTest) => boolean): [Suite[], AbstractTest | undefined] {
    return [[], pred(this) ? this : undefined];
  }

  public collectTestToRun(tests: ReadonlyArray<string>, isParentIn: boolean): AbstractTest[] {
    if (/*!this._forceIgnore && */ (isParentIn && !this.skipped) || tests.indexOf(this.id) !== -1) {
      return [this];
    } else {
      return [];
    }
  }
}
