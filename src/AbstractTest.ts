import * as path from 'path';
import { TestEvent, TestInfo } from 'vscode-test-adapter-api';
import { generateId, milisecToStr } from './Util';
import { SharedVariables } from './SharedVariables';
import { RunningTestExecutableInfo } from './RunningTestExecutableInfo';
import { Suite } from './Suite';
import { AbstractRunnable } from './AbstractRunnable';

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
    public readonly runnable: AbstractRunnable,
    public readonly parent: Suite, // ascending
    id: string | undefined,
    public readonly testName: string,
    public readonly label: string,
    file: string | undefined,
    line: number | undefined,
    public readonly skipped: boolean,
    public readonly staticEvent: TestEvent | undefined,
    private readonly _pureTags: string[], // without brackets
    _testDescription: string | undefined,
    _typeParam: string | undefined, // gtest specific
    _valueParam: string | undefined, // gtest specific
  ) {
    if (line && line < 0) throw Error('line smaller than zero');

    this.id = id ? id : generateId();
    this.file = file ? path.normalize(file) : undefined;
    this.line = file ? line : undefined;

    const description: string[] = [];

    const tooltip = [`Name: ${testName}`];

    if (_pureTags.length > 0) {
      const tagsStr = _pureTags.map(t => `[${t}]`).join('');
      description.push(tagsStr);
      tooltip.push(`Tags: ${tagsStr}`);
    }

    if (_testDescription) {
      tooltip.push(`Description: ${_testDescription}`);
    }

    if (_typeParam) {
      description.push(`#️⃣Type: ${_typeParam}`);
      tooltip.push(`#️⃣TypeParam() = ${_typeParam}`);
    }

    if (_valueParam) {
      description.push(`#️⃣Value: ${_valueParam}`);
      tooltip.push(`#️⃣GetParam() = ${_valueParam}`);
    }

    this.description = description.join('');
    this.tooltip = tooltip.join('\n');

    if (staticEvent) {
      staticEvent.test = this;
    }
  }

  public abstract get testNameInOutput(): string;

  public get tags(): string[] {
    return this._pureTags.filter(v => v != '.' && v != 'hide');
  }

  public *route(): IterableIterator<Suite> {
    let parent: Suite | undefined = this.parent;
    do {
      yield parent;
      parent = parent.parent;
    } while (parent);
  }

  public reverseRoute(): Suite[] {
    return [...this.route()].reverse();
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
    stderr: string | undefined,
  ): TestEvent;

  public getCancelledEvent(testOutput: string): TestEvent {
    const ev = this.getFailedEventBase();
    ev.message += '⏹ Run is stopped by user. ✋';
    ev.message += '\n\nTest Output : R"""';
    ev.message += testOutput;
    ev.message += '"""';
    return ev;
  }

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
    ev.tooltip = this.tooltip + (this.tooltip ? '\n' : '') + '⏱Duration: ' + durationStr;
  }

  public enumerateTestInfos(fn: (v: AbstractTest) => void): void {
    fn(this);
  }

  public findTest(pred: (v: AbstractTest) => boolean): AbstractTest | undefined {
    return pred(this) ? this : undefined;
  }

  public collectTestToRun(tests: ReadonlyArray<string>, isParentIn: boolean): AbstractTest[] {
    if ((isParentIn && !this.skipped) || tests.indexOf(this.id) !== -1) {
      return [this];
    } else {
      return [];
    }
  }
}
