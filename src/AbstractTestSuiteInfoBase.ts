import { TestSuiteInfo, TestSuiteEvent } from 'vscode-test-adapter-api';

import { generateUniqueId, milisecToStr } from './Util';
import { SharedVariables } from './SharedVariables';
import { AbstractTestInfo } from './AbstractTestInfo';

///

export abstract class AbstractTestSuiteInfoBase implements TestSuiteInfo {
  public readonly type: 'suite' = 'suite';
  public readonly id: string;
  public readonly origLabel: string;
  public children: (AbstractTestSuiteInfoBase | AbstractTestInfo)[] = [];
  public file?: string;
  public line?: number;
  private _tooltip: string;
  private _runningCounter = 0;

  public constructor(
    protected readonly _shared: SharedVariables,
    public label: string,
    public description: string | undefined,
    id: string | undefined,
  ) {
    this.origLabel = label;
    this.id = id ? id : generateUniqueId();
    this._tooltip = 'Name: ' + this.origLabel + (description ? '\nDescription: ' + description : '');
  }

  public get tooltip(): string {
    return this._tooltip;
  }

  private _getRunningEvent(): TestSuiteEvent {
    return { type: 'suite', suite: this, state: 'running' };
  }

  public sendRunningEventIfNeeded(): void {
    if (this._runningCounter++ === 0) {
      this._shared.log.local.debug('Suite running event fired', this.label, this.origLabel);
      this._shared.testStatesEmitter.fire(this._getRunningEvent());
    }
  }

  private _getCompletedEvent(): TestSuiteEvent {
    let testCount = 0;
    let durationSum: number | undefined = undefined;
    const stateStat: { [prop: string]: number } = {};

    this.enumerateTestInfos((test: AbstractTestInfo) => {
      testCount++;
      if (test.lastRunMilisec !== undefined) durationSum = (durationSum ? durationSum : 0) + test.lastRunMilisec;
      if (test.lastRunEvent) {
        if (test.lastRunEvent.state in stateStat) stateStat[test.lastRunEvent.state]++;
        else stateStat[test.lastRunEvent.state] = 1;
      }
    });

    let description: string | undefined = undefined;
    let tooltip: string | undefined = undefined;

    if (durationSum !== undefined) {
      const durationStr = milisecToStr(durationSum);

      description = (this.description ? this.description + ' ' : '') + '(' + durationStr + ')';

      tooltip =
        this.tooltip +
        '\n\n' +
        'Tests: ' +
        testCount +
        '\n' +
        Object.keys(stateStat)
          .map(state => '  - ' + state + ': ' + stateStat[state])
          .join('\n') +
        '\n\n⏱Duration: ' +
        durationStr;
    }

    return { type: 'suite', suite: this, state: 'completed', description, tooltip };
  }

  public sendCompletedEventIfNeeded(): void {
    if (this._runningCounter < 1) {
      this._shared.log.error('running counter is too low');
      this._runningCounter = 0;
      return;
    }
    if (this._runningCounter-- === 1) {
      this._shared.log.local.debug('Suite completed event fired', this.label, this.origLabel);
      this._shared.testStatesEmitter.fire(this._getCompletedEvent());
    }
  }

  public sendMinimalEventsIfNeeded(completed: AbstractTestSuiteInfoBase[], running: AbstractTestSuiteInfoBase[]): void {
    if (completed.length === 0) {
      running.forEach(v => v.sendRunningEventIfNeeded());
    } else if (running.length === 0) {
      completed.reverse().forEach(v => v.sendCompletedEventIfNeeded());
    } else if (completed[completed.length - 1] === running[running.length - 1]) {
      if (completed.length !== running.length) this._shared.log.error('completed.length !== running.length');
    } else {
      let completedIndex = completed.length;
      let runningIndex = 0;

      do {
        --completedIndex;
        runningIndex = running.lastIndexOf(completed[completedIndex]);
      } while (completedIndex >= 0 && runningIndex === -1);

      for (let i = completedIndex + 1; i < completed.length; ++i) completed[i].sendCompletedEventIfNeeded();
      for (let i = running.length - 1; i > runningIndex; --i) running[i].sendRunningEventIfNeeded();
    }
  }

  protected _addChild(child: AbstractTestSuiteInfoBase | AbstractTestInfo): void {
    if (this.children.indexOf(child) != -1) {
      this._shared.log.error('should not try to add the child twice', this, child);
      return;
    }

    if (this.children.length == 0) {
      this.file = child.file;
      this.line = child.file ? 0 : undefined;
    } else if (this.file != child.file) {
      this.file = undefined;
      this.line = undefined;
    }

    this.children.push(child);
  }

  public addChild<T extends AbstractTestSuiteInfoBase | AbstractTestInfo>(child: T): T {
    this._addChild(child);
    return child;
  }

  public enumerateDescendants(fn: (v: AbstractTestSuiteInfoBase | AbstractTestInfo) => void): void {
    this.enumerateChildren(child => {
      fn(child);
      if (child instanceof AbstractTestSuiteInfoBase) child.enumerateDescendants(fn);
    });
  }

  public enumerateChildren(fn: (v: AbstractTestSuiteInfoBase | AbstractTestInfo) => void): void {
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      fn(child);
    }
  }

  public enumerateTestInfos(fn: (v: AbstractTestInfo) => void): void {
    this.enumerateDescendants(v => {
      if (v instanceof AbstractTestInfo) fn(v);
    });
  }

  public findRouteToTestInfo(
    pred: (v: AbstractTestInfo) => boolean,
  ): [AbstractTestSuiteInfoBase[], AbstractTestInfo | undefined] {
    for (let i = 0; i < this.children.length; ++i) {
      const [route, test] = this.children[i].findRouteToTestInfo(pred);
      if (test !== undefined) {
        route.unshift(this);
        return [route, test];
      }
    }
    return [[], undefined];
  }

  public findTestInfo(pred: (v: AbstractTestInfo) => boolean): AbstractTestInfo | undefined {
    return this.findTestInfoInArray(this.children, pred);
  }

  public findTestInfoInArray(
    array: (AbstractTestSuiteInfoBase | AbstractTestInfo)[],
    pred: (v: AbstractTestInfo) => boolean,
  ): AbstractTestInfo | undefined {
    for (let i = 0; i < array.length; i++) {
      const res = array[i].findTestInfo(pred);
      if (res !== undefined) return res;
    }
    return undefined;
  }

  public getTestInfoCount(countSkipped: boolean): number {
    let count = 0;
    this.enumerateTestInfos(v => {
      if (countSkipped || !v.skipped) ++count;
    });
    return count;
  }
}
