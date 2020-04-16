import * as path from 'path';
import { TestEvent, TestInfo } from 'vscode-test-adapter-api';
import { generateId, milisecToStr } from './Util';
import { SharedVariables } from './SharedVariables';
import { RunningTestExecutableInfo } from './RunningTestExecutableInfo';
import { AbstractSuite } from './AbstractSuite';
import { GroupSuite } from './GroupSuite';

export abstract class AbstractTest implements TestInfo {
  public readonly type: 'test' = 'test';
  public readonly id: string;
  public readonly origLabel: string;
  public readonly description: string;
  public readonly tooltip: string;
  public readonly file: string | undefined;

  public lastRunEvent: TestEvent | undefined = undefined;
  public lastRunMilisec: number | undefined = undefined;

  protected constructor(
    protected readonly _shared: SharedVariables,
    parent: AbstractSuite,
    id: string | undefined,
    public readonly testNameAsId: string,
    public readonly label: string,
    public readonly skipped: boolean,
    file: string | undefined,
    public readonly line: number | undefined,
    description: string | undefined,
    tooltip: string | undefined,
  ) {
    this.id = id && id.startsWith(parent.id) ? id : generateId();
    this.origLabel = label;
    this.description = description ? description : '';
    this.file = file ? path.normalize(file) : undefined;
    this.tooltip = 'Name: ' + testNameAsId + (tooltip ? '\n' + tooltip : '');
    if (line && line < 0) throw Error('line smaller than zero');
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

  public findRouteToTestInfo(pred: (v: AbstractTest) => boolean): [AbstractSuite[], AbstractTest | undefined] {
    return [[], pred(this) ? this : undefined];
  }

  // eslint-disable-next-line
  public findGroup(_pred: (v: GroupSuite) => boolean): undefined {
    return undefined;
  }
}
