import * as vscode from 'vscode';
import { TestInfo } from 'vscode-test-adapter-api';
import { ExecutableConfig } from './ExecutableConfig';
import { Suite } from './Suite';
import { AbstractRunnable } from './AbstractRunnable';
import { AbstractTest } from './AbstractTest';
import { SharedVariables } from './SharedVariables';

export class RootSuite extends Suite implements vscode.Disposable {
  private _executables: ExecutableConfig[] = [];

  public constructor(id: string | undefined, shared: SharedVariables) {
    super(shared, undefined, 'Catch2/GTest/DOCTest', '', '', id);
  }

  public get file(): string | undefined {
    return undefined;
  }

  public get line(): number | undefined {
    return undefined;
  }

  public dispose(): void {
    this._executables.forEach(e => e.dispose());
  }

  public cancel(): void {
    this._executables.forEach(c => c.cancel());
  }

  public load(executables: ExecutableConfig[]): Promise<void> {
    this._executables.forEach(e => e.dispose());

    this._executables = executables;

    return Promise.all(executables.map(v => v.load(this).catch(e => this._shared.log.exceptionS(e, v)))).then(
      (): void => undefined,
    );
  }

  public sendRunningEventIfNeeded(): void {
    // do nothing, special handling
  }

  public sendCompletedEventIfNeeded(): void {
    // do nothing, special handling
  }

  public sendStartEventIfNeeded(tests: string[]): void {
    if (this._runningCounter++ === 0) {
      this._shared.log.debug('RootSuite start event fired', this.label);
      this._shared.testStatesEmitter.fire({ type: 'started', tests: tests });
    }
  }

  public sendFinishedEventIfNeeded(): void {
    if (this._runningCounter < 1) {
      this._shared.log.error('Root Suite running counter is too low');
      this._runningCounter = 0;
      return;
    }
    if (this._runningCounter-- === 1) {
      this._shared.log.debug('RootSuite finished event fired', this.label);
      this._shared.testStatesEmitter.fire({ type: 'finished' });
    }
  }

  public run(tests: string[]): Promise<void> {
    this.sendStartEventIfNeeded(tests);

    const isParentIn = tests.indexOf(this.id) !== -1;

    const childrenToRun = this.collectTestToRun(tests, isParentIn);

    const runnables = childrenToRun.reduce((prev, curr) => {
      const arr = prev.get(curr.runnable);
      if (arr) arr.push(curr);
      else prev.set(curr.runnable, [curr]);
      return prev;
    }, new Map<AbstractRunnable, AbstractTest[]>());

    const ps: Promise<void>[] = [];

    for (const [runnable, runnableTests] of runnables) {
      ps.push(
        runnable.run(runnableTests, this._shared.taskPool).catch(err => {
          this._shared.log.error('RootTestSuite.run.for.child', runnable.properties.path, err);
        }),
      );
    }

    return Promise.all(ps)
      .catch((e: Error) => {
        debugger;
        this._shared.log.error('everything should be handled', e);
      })
      .then(() => {
        this.sendFinishedEventIfNeeded();
      });
  }

  public findTestById(idOrInfo: string | TestInfo): AbstractTest | undefined {
    if (typeof idOrInfo === 'string') return this.findTest(x => x.id === idOrInfo);
    else return this.findTest(x => x === idOrInfo);
  }
}
