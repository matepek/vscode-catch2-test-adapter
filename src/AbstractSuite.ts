import { TestSuiteInfo, TestSuiteEvent } from 'vscode-test-adapter-api';

import { generateId, milisecToStr } from './Util';
import { SharedVariables } from './SharedVariables';
import { AbstractTest } from './AbstractTest';
import { GroupSuite } from './GroupSuite';

///

export abstract class AbstractSuite implements TestSuiteInfo {
  public readonly type: 'suite' = 'suite';
  public readonly id: string;
  public children: (AbstractSuite | AbstractTest)[] = [];
  private _runningCounter = 0;

  public constructor(
    protected readonly _shared: SharedVariables,
    private readonly _label: string,
    private readonly _description: string | undefined,
    id: string | undefined,
  ) {
    this.id = id !== undefined ? id : generateId();
  }

  public get label(): string {
    return this._label;
  }

  public get description(): string | undefined {
    return this._description;
  }

  public get tooltip(): string {
    return 'Name: ' + this._label + (this._description ? '\nDescription: ' + this._description : '');
  }

  public get file(): string | undefined {
    this._calculateFileAndLine();
    return this._file!;
  }

  public get line(): number | undefined {
    this._calculateFileAndLine();
    return this._line!;
  }

  private _file: null | string | undefined = null; // null means has to be calculated
  private _line: null | number | undefined = null; // null means has to be calculated

  private _calculateFileAndLine(): void {
    if (this._file === null || this._line === null) {
      this._file = undefined;
      this._line = undefined;

      if (this.children.length === 0) return;

      const children = this.children.map(v => {
        return {
          file: v.file,
          line: v.line,
        };
      });

      if (children.some(v => children[0].file !== v.file)) return;

      this._file = children[0].file;

      if (this._file === undefined) return;

      this._line = children
        .filter(v => v.line !== undefined)
        .reduce(
          (prev, curr) => (curr.line === undefined ? prev : prev === 0 ? curr.line : Math.min(prev, curr.line)),
          0,
        );
    }
  }

  private _getRunningEvent(): TestSuiteEvent {
    return { type: 'suite', suite: this, state: 'running' };
  }

  public sendRunningEventIfNeeded(): void {
    if (this._runningCounter++ === 0) {
      this._shared.log.local.debug('Suite running event fired', this.label);
      this._shared.testStatesEmitter.fire(this._getRunningEvent());
    }
  }

  private _getCompletedEvent(): TestSuiteEvent {
    let testCount = 0;
    let durationSum: number | undefined = undefined;
    const stateStat: { [prop: string]: number } = {};

    this.enumerateTestInfos((test: AbstractTest) => {
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
      this._shared.log.local.debug('Suite completed event fired', this.label);
      this._shared.testStatesEmitter.fire(this._getCompletedEvent());
    }
  }

  public sendMinimalEventsIfNeeded(completed: AbstractSuite[], running: AbstractSuite[]): void {
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

  protected _addChild(child: AbstractSuite | AbstractTest): void {
    if (this.children.indexOf(child) != -1) {
      this._shared.log.error('should not try to add the child twice', this, child);
      return;
    }

    this._file = null;
    this._line = null;

    this.children.push(child);
  }

  public addChild<T extends AbstractSuite | AbstractTest>(child: T): T {
    this._addChild(child);
    return child;
  }

  public enumerateDescendants(fn: (v: AbstractSuite | AbstractTest) => void): void {
    this.enumerateChildren(child => {
      fn(child);
      if (child instanceof AbstractSuite) child.enumerateDescendants(fn);
    });
  }

  public enumerateChildren(fn: (v: AbstractSuite | AbstractTest) => void): void {
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      fn(child);
    }
  }

  public enumerateTestInfos(fn: (v: AbstractTest) => void): void {
    this.enumerateDescendants(v => {
      if (v instanceof AbstractTest) fn(v);
    });
  }

  public findRouteToTestInfo(pred: (v: AbstractTest) => boolean): [AbstractSuite[], AbstractTest | undefined] {
    for (let i = 0; i < this.children.length; ++i) {
      const [route, test] = this.children[i].findRouteToTestInfo(pred);
      if (test !== undefined) {
        route.unshift(this);
        return [route, test];
      }
    }
    return [[], undefined];
  }

  public findTestInfo(pred: (v: AbstractTest) => boolean): AbstractTest | undefined {
    return this.findTestInfoInArray(this.children, pred);
  }

  public findTestInfoInArray(
    array: (AbstractSuite | AbstractTest)[],
    pred: (v: AbstractTest) => boolean,
  ): AbstractTest | undefined {
    for (let i = 0; i < array.length; i++) {
      const res = array[i].findTestInfo(pred);
      if (res !== undefined) return res;
    }
    return undefined;
  }

  public findGroup(pred: (v: GroupSuite) => boolean): GroupSuite | undefined {
    return this.findGroupInArray(this.children, pred);
  }

  public findGroupInArray(
    array: (AbstractSuite | AbstractTest)[],
    pred: (v: GroupSuite) => boolean,
  ): GroupSuite | undefined {
    for (let i = 0; i < array.length; i++) {
      const res = array[i].findGroup(pred);
      if (res !== undefined) return res;
    }
    return undefined;
  }

  /** If the return value is not empty then we should run the parent */
  public collectTestToRun(tests: ReadonlyArray<string>, isParentIn: boolean): AbstractTest[] {
    const isCurrParentIn = isParentIn || tests.indexOf(this.id) != -1;

    return this.children
      .map(v => v.collectTestToRun(tests, isCurrParentIn))
      .reduce((prev: AbstractTest[], curr: AbstractTest[]) => prev.concat(...curr), []);
  }

  public getTestInfoCount(countSkipped: boolean): number {
    let count = 0;
    this.enumerateTestInfos(v => {
      if (countSkipped || !v.skipped) ++count;
    });
    return count;
  }
}
