import { TestSuiteInfo, TestSuiteEvent } from 'vscode-test-adapter-api';

import { generateId, milisecToStr } from './Util';
import { SharedVariables } from './SharedVariables';
import { AbstractTest } from './AbstractTest';

///

export class Suite implements TestSuiteInfo {
  public readonly type: 'suite' = 'suite';
  public readonly id: string;
  public readonly debuggable = false;
  public children: (Suite | AbstractTest)[] = [];
  protected _runningCounter = 0;

  public constructor(
    protected readonly _shared: SharedVariables,
    public readonly parent: Suite | undefined,
    private readonly _label: string,
    private readonly _descriptionBase: string,
    private readonly _tooltipBase: string,
    id: string | undefined,
  ) {
    this.id = id ? id : generateId();
  }

  // LiveShare serialization: https://github.com/hbenl/vscode-test-explorer-liveshare/pull/5
  public getInterfaceObj(): TestSuiteInfo {
    return {
      type: 'suite',
      id: this.id,
      label: this.label,
      description: this.description,
      tooltip: this.tooltip,
      file: this.file,
      line: this.line,
      debuggable: this.debuggable,
      children: this.children.map(c => c.getInterfaceObj()),
      errored: this.errored,
      message: this.message,
    };
  }

  public compare(label: string, description: string): boolean {
    return this._label === label && this._descriptionBase === description;
  }

  public get label(): string {
    return this._label;
  }

  private _additionalDesciption = '';
  private _additionalTooltip = '';

  public get description(): string | undefined {
    const val = this._descriptionBase + this._additionalDesciption;
    return val ? val : undefined;
  }

  public get tooltip(): string {
    return (
      `Name: ${this._label}` +
      (this._descriptionBase ? `\nDescription: ${this._descriptionBase}` : '') +
      (this._tooltipBase ? `\n\n${this._tooltipBase}` : '') +
      this._additionalTooltip
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
      this._line = this._file ? 0 : undefined;
    }
  }

  public readonly errored = undefined;

  public readonly message = undefined;

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

  private _getRunningEvent(testRunId: string): TestSuiteEvent {
    return { testRunId, type: 'suite', suite: this.id, state: 'running' };
  }

  public sendRunningEventIfNeeded(testRunId: string): void {
    if (this._runningCounter++ === 0) {
      this._shared.sendTestRunEvent(this._getRunningEvent(testRunId));
    }
  }

  private _updateDescriptionAndTooltip(): void {
    this._additionalDesciption = '';
    this._additionalTooltip = '';

    let testCount = 0;
    let notSkippedTestCount = 0;
    let testWithRunTimeCount = 0;
    let durationSum: number | undefined = undefined;
    const stateStat: { [prop: string]: number } = {};

    this.enumerateTestInfos((test: AbstractTest) => {
      testCount++;
      if (!test.skipped) notSkippedTestCount++;
      if (test.lastRunMilisec !== undefined) {
        testWithRunTimeCount++;
        durationSum = (durationSum ? durationSum : 0) + test.lastRunMilisec;
      }
      if (test.lastRunEvent) {
        if (test.lastRunEvent.state in stateStat) stateStat[test.lastRunEvent.state]++;
        else stateStat[test.lastRunEvent.state] = 1;
      }
    });

    this._additionalTooltip =
      (this.tooltip ? '\n\n' : '') +
      'Tests: ' +
      testCount +
      '\n' +
      Object.keys(stateStat)
        .map(state => '  - ' + state + ': ' + stateStat[state])
        .join('\n');

    if (durationSum !== undefined) {
      const durationStr = milisecToStr(durationSum);

      const prefix =
        testWithRunTimeCount < notSkippedTestCount ? (testWithRunTimeCount < notSkippedTestCount / 2 ? '>>' : '>') : '';

      this._additionalDesciption = (this.description ? ' ' : '') + '(' + prefix + durationStr + ')';

      this._additionalTooltip += '\n⏱Duration: ' + prefix + durationStr;
    }
  }

  private _getCompletedEvent(testRunId: string): TestSuiteEvent {
    this._updateDescriptionAndTooltip();

    return {
      testRunId,
      type: 'suite',
      suite: this.id,
      state: 'completed',
      description: this.description,
      tooltip: this.tooltip,
    };
  }

  public sendCompletedEventIfNeeded(testRunId: string): void {
    if (this._runningCounter < 1) {
      this._shared.log.error('Suite running counter is too low');
      this._runningCounter = 0;
      return;
    }
    if (this._runningCounter-- === 1) {
      this._shared.sendTestRunEvent(this._getCompletedEvent(testRunId));
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

  public findTest(pred: (v: AbstractTest) => boolean): Readonly<AbstractTest> | undefined {
    return Suite.findTestInArray(this.children, pred);
  }

  public static findTestInArray(
    array: (Suite | AbstractTest)[],
    pred: (v: AbstractTest) => boolean,
  ): Readonly<AbstractTest> | undefined {
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
  public collectTestToRun(
    tests: readonly string[],
    isParentIn: boolean,
    filter: (test: AbstractTest) => boolean = (): boolean => true,
  ): AbstractTest[] {
    const isCurrParentIn = isParentIn || tests.indexOf(this.id) != -1;

    return this.children
      .map(v => v.collectTestToRun(tests, isCurrParentIn, filter))
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
