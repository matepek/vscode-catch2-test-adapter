//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { TestEvent, TestInfo } from 'vscode-test-adapter-api';
import { SpawnOptions } from 'child_process';

import { generateUniqueId } from './IdGenerator';
import { SharedVariables } from './SharedVariables';

export abstract class TestInfoBase implements TestInfo {
  readonly type: 'test' = 'test';
  readonly id: string;

  constructor(
    protected readonly _shared: SharedVariables,
    id: string | undefined,
    public readonly testNameFull: string,
    public readonly label: string,
    public readonly skipped: boolean,
    public readonly file: string | undefined,
    public readonly line: number | undefined,
    public readonly execPath: string,
    public readonly execOptions: SpawnOptions
  ) {
    this.id = id ? id : generateUniqueId();

    if (line && line < 0) throw Error('line smaller than zero');
  }

  abstract getDebugParams(breakOnFailure: boolean): string[];

  getStartEvent(): TestEvent {
    return { type: 'test', test: this, state: 'running' };
  }

  getSkippedEvent(): TestEvent {
    return { type: 'test', test: this, state: 'skipped' };
  }

  findRouteToTestById(id: string): TestInfoBase[] | undefined {
    if (this.id === id)
      return [this];
    else
      return undefined;
  }
}
