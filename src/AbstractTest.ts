import * as path from 'path';
import { TestEvent, TestInfo } from 'vscode-test-adapter-api';
import { generateId, milisecToStr, concat } from './Util';
import { Suite } from './Suite';
import { AbstractRunnable } from './AbstractRunnable';
import { LoggerWrapper } from './LoggerWrapper';

interface SharedWithAbstractTest {
  log: LoggerWrapper;
}

export abstract class AbstractTest implements TestInfo {
  public readonly type: 'test' = 'test';
  public readonly id: string;
  public readonly file: string | undefined;
  public readonly line: number | undefined;

  private readonly _descriptionBase: string;
  private readonly _tooltipBase: string;
  private _additionalDesciption: string;
  private _additionalTooltip: string;

  public lastRunEvent: TestEvent | undefined;
  public lastRunMilisec: number | undefined;

  protected constructor(
    protected readonly _shared: SharedWithAbstractTest,
    public readonly runnable: AbstractRunnable,
    public readonly parent: Suite, // ascending
    old: AbstractTest | undefined,
    public readonly testName: string,
    public readonly label: string,
    file: string | undefined,
    line: number | undefined,
    public readonly skipped: boolean,
    public readonly staticEvent: TestEvent | undefined,
    private readonly _pureTags: string[], // without brackets
    testDescription: string | undefined,
    typeParam: string | undefined, // gtest specific
    valueParam: string | undefined, // gtest specific
  ) {
    if (line && line < 0) throw Error('line smaller than zero');

    this.id = old ? old.id : generateId();
    this.file = file ? path.normalize(file) : undefined;
    this.line = file ? line : undefined;

    const description: string[] = [];

    const tooltip = [`Name: ${testName}`];

    if (_pureTags.length > 0) {
      const tagsStr = _pureTags.map(t => `[${t}]`).join('');
      description.push(tagsStr);
      tooltip.push(`Tags: ${tagsStr}`);
    }

    if (testDescription) {
      tooltip.push(`Description: ${testDescription}`);
    }

    if (typeParam) {
      description.push(`#️⃣Type: ${typeParam}`);
      tooltip.push(`#️⃣TypeParam() = ${typeParam}`);
    }

    if (valueParam) {
      description.push(`#️⃣Value: ${valueParam}`);
      tooltip.push(`#️⃣GetParam() = ${valueParam}`);
    }

    this._descriptionBase = description.join('');
    this._tooltipBase = tooltip.join('\n');

    if (staticEvent) {
      staticEvent.test = this;
    }

    if (old) {
      this.lastRunEvent = old.lastRunEvent;
      this.lastRunMilisec = old.lastRunMilisec;
      this._additionalDesciption = old._additionalDesciption;
      this._additionalTooltip = old._additionalTooltip;
    } else {
      this._additionalDesciption = '';
      this._additionalTooltip = '';
    }
  }

  public compare(testNameInOutput: string): boolean {
    return this.testNameInOutput === testNameInOutput;
  }

  // should be used only from TestEventBuilder
  public _updateDescriptionAndTooltip(description: string, tooltip: string): void {
    this._additionalDesciption = description;
    this._additionalTooltip = tooltip;
  }

  public get description(): string {
    return concat(this._descriptionBase, this._additionalDesciption, ' ');
  }

  public get tooltip(): string {
    return concat(this._tooltipBase, this._additionalTooltip, '\n');
  }

  protected abstract get testNameInOutput(): string;

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

  private _reverseRoute: Suite[] | undefined = undefined;

  public reverseRoute(): Suite[] {
    if (this._reverseRoute === undefined) this._reverseRoute = [...this.route()].reverse();
    return this._reverseRoute;
  }

  public removeWithLeafAscendants(): void {
    const index = this.parent.children.indexOf(this);
    if (index == -1) {
      this._shared.log.info(
        'Removing an already removed one.',
        'Probably it was deleted and recompiled but there was no fs-change event and no reload has happened',
        this,
      );
      return;
    } else {
      this.parent.children.splice(index, 1);

      this.parent.removeIfLeaf();
    }
  }

  public getStartEvent(): TestEvent {
    return { type: 'test', test: this, state: 'running' };
  }

  public getSkippedEvent(): TestEvent {
    return { type: 'test', test: this, state: 'skipped' };
  }

  public abstract parseAndProcessTestCase(
    output: string,
    rngSeed: number | undefined,
    timeout: number | null,
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
    ev.message += '⌛️ Timed out: "testMate.cpp.test.runtimeLimit": ' + milisec / 1000 + ' second(s).';
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

    ev.description = this._descriptionBase + (this._descriptionBase ? ' ' : '') + '(' + durationStr + ')';
    ev.tooltip = this._tooltipBase + (this._tooltipBase ? '\n' : '') + '⏱Duration: ' + durationStr;
  }

  public enumerateTestInfos(fn: (v: AbstractTest) => void): void {
    fn(this);
  }

  public findTest(pred: (v: AbstractTest) => boolean): Readonly<AbstractTest> | undefined {
    return pred(this) ? this : undefined;
  }

  public collectTestToRun(tests: readonly string[], isParentIn: boolean): AbstractTest[] {
    if ((isParentIn && !this.skipped) || tests.indexOf(this.id) !== -1) {
      return [this];
    } else {
      return [];
    }
  }
}
