import { TestSuiteInfo, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';

import { generateId, milisecToStr } from './Util';
import { SharedVariables } from './SharedVariables';
import { AbstractTest } from './AbstractTest';
import { AbstractRunnable } from './AbstractRunnable';

///

export class Suite implements TestSuiteInfo {
  public readonly type: 'suite' = 'suite';
  public readonly id: string;
  public children: (Suite | AbstractTest)[] = [];
  protected _runningCounter = 0;

  public constructor(
    protected readonly _shared: SharedVariables,
    public readonly parent: Suite | undefined,
    private readonly _label: string,
    private readonly _description: string | undefined,
    private readonly _tooltip: string | undefined,
  ) {
    this.id = generateId();
  }

  public get label(): string {
    return this._label;
  }

  public get description(): string | undefined {
    return this._description;
  }

  public get tooltip(): string {
    return (
      this._label + (this._description ? ' - ' + this._description : '') + (this._tooltip ? '\n\n' + this._tooltip : '')
    );
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

  public removeIfLeaf(): void {
    if (this.children.length == 0 && this.parent !== undefined) {
      const index = this.parent.children.indexOf(this);

      if (index == -1) {
        this._shared.log.error("assert: couldn't found in parent", this);
        return;
      }

      this.parent.children.splice(index, 1);

      this.parent.removeIfLeaf();
    }
  }

  private _getRunningEvent(): TestSuiteEvent {
    return { type: 'suite', suite: this, state: 'running' };
  }

  public sendRunningEventIfNeeded(): void {
    if (this._runningCounter++ === 0) {
      this._shared.log.localDebug('Suite running event fired', this.label);
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
        '\n⏱Duration: ' +
        durationStr;
    }

    return { type: 'suite', suite: this, state: 'completed', description, tooltip };
  }

  public sendCompletedEventIfNeeded(): void {
    if (this._runningCounter < 1) {
      this._shared.log.error('Suite running counter is too low');
      this._runningCounter = 0;
      return;
    }
    if (this._runningCounter-- === 1) {
      this._shared.log.localDebug('Suite completed event fired', this.label);
      this._shared.testStatesEmitter.fire(this._getCompletedEvent());
    }
  }

  protected _addChild(child: Suite | AbstractTest): void {
    if (this.children.indexOf(child) != -1) {
      this._shared.log.error('should not try to add the child twice', this, child);
      return;
    }

    // this will result in recalculation
    this._file = null;
    this._line = null;

    this.children.push(child);
  }

  public addTest(child: AbstractTest): AbstractTest {
    this._addChild(child);
    return child;
  }

  public addSuite(child: Suite): Suite {
    this._addChild(child);
    return child;
  }

  public enumerateDescendants(fn: (v: Suite | AbstractTest) => void): void {
    this.enumerateChildren(child => {
      fn(child);
      if (child instanceof Suite) child.enumerateDescendants(fn);
    });
  }

  public enumerateChildren(fn: (v: Suite | AbstractTest) => void): void {
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

  public findTest(pred: (v: AbstractTest) => boolean): AbstractTest | undefined {
    return Suite.findTestInArray(this.children, pred);
  }

  public static findTestInArray(
    array: (Suite | AbstractTest)[],
    pred: (v: AbstractTest) => boolean,
  ): AbstractTest | undefined {
    for (let i = 0; i < array.length; ++i) {
      const found = array[i].findTest(pred);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  public findChildSuite(pred: (v: Suite) => boolean): Suite | undefined {
    return Suite.findChildSuiteInArray(this.children, pred);
  }

  public static findChildSuiteInArray(array: (Suite | AbstractTest)[], pred: (v: Suite) => boolean): Suite | undefined {
    for (let i = 0; i < array.length; i++) {
      if (array[i].type === 'suite' && pred(array[i] as Suite)) return array[i] as Suite;
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

  public addError(runnable: AbstractRunnable, message: string): void {
    const shared = this._shared;
    const parent = this as Suite;
    const test = parent.addTest(
      new (class extends AbstractTest {
        public constructor() {
          super(
            shared,
            runnable,
            parent,
            undefined,
            'dummyErrorTest',
            '⚡️ ERROR (run me to see the issue)',
            undefined,
            undefined,
            true,
            {
              type: 'test',
              test: '',
              state: 'errored',
              message,
            },
            [],
            'Run this test to see the error message in the output.',
            undefined,
            undefined,
          );
        }

        public get testNameInOutput(): string {
          return this.testName;
        }

        public getDebugParams(): string[] {
          throw Error('assert');
        }

        public parseAndProcessTestCase(): TestEvent {
          throw Error('assert');
        }
      })(),
    );

    this._shared.sendTestEventEmitter.fire([test.staticEvent!]);
  }
}
