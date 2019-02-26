//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { TestEvent, TestInfo } from 'vscode-test-adapter-api';

import { SpawnOptions } from './FsWrapper';
import { generateUniqueId } from './IdGenerator';
import { SharedVariables } from './SharedVariables';

export abstract class AbstractTestInfo implements TestInfo {
  public readonly type: 'test' = 'test';
  public readonly id: string;
  public readonly origLabel: string;
  public readonly tooltip: string;

  protected constructor(
    protected readonly _shared: SharedVariables,
    id: string | undefined,
    public readonly testNameFull: string,
    public readonly label: string,
    public readonly skipped: boolean,
    public readonly file: string | undefined,
    public readonly line: number | undefined,
    public readonly execPath: string,
    public readonly execOptions: SpawnOptions,
  ) {
    this.id = id ? id : generateUniqueId();
    this.origLabel = label;
    this.tooltip = testNameFull;
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
    return ev;
  }

  public getFailedEventBase(): TestEvent {
    return {
      type: 'test',
      test: this,
      state: 'failed',
      message: '', //TODO: complicated because of tests: '🧪 Executable: ' + this.execPath + '\n',
      decorations: [],
    };
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
