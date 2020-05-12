import * as vscode from 'vscode';
import { TestInfo } from 'vscode-test-adapter-api';
import { ExecutableConfig } from './ExecutableConfig';
import { Suite } from './Suite';
import { AbstractRunnable } from './AbstractRunnable';
import { AbstractTest } from './AbstractTest';
import { SharedVariables } from './SharedVariables';
import { CancellationToken } from './Util';
import { ResolveRule } from './util/ResolveRule';

export class RootSuite extends Suite implements vscode.Disposable {
  private _executables: ExecutableConfig[] = [];

  public constructor(id: string | undefined, shared: SharedVariables) {
    super(shared, undefined, 'C++ TestMate', '', '', id);
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

  public load(executables: ExecutableConfig[]): Promise<void> {
    this._executables.forEach(e => e.dispose());

    this._executables = executables;

    return Promise.all(executables.map(v => v.load(this))).then((): void => undefined);
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

  public async runTaskBefore(
    runnables: Map<AbstractRunnable, Readonly<AbstractTest>[]>,
    cancellationToken: vscode.CancellationToken,
  ): Promise<void> {
    const runTask = new Set<string>();
    const runnableExecArray: string[] = [];

    for (const runnable of runnables.keys()) {
      runnable.properties.runTask.before.forEach(t => runTask.add(t));
      runnableExecArray.push(runnable.properties.path);
    }

    if (runTask.size === 0) return;

    const varToValue: ResolveRule[] = [
      ...this._shared.varToValue,
      { resolve: '${absPathArrayFlat}', rule: runnableExecArray, isFlat: true },
      { resolve: '${absPathConcatWithSpace}', rule: runnableExecArray.map(r => `"${r}"`).join(' ') },
    ];

    try {
      // sequential execution of tasks
      for (const taskName of runTask) {
        const exitCode = await this._shared.executeTask(taskName, varToValue, cancellationToken);

        if (exitCode !== undefined) {
          if (exitCode !== 0) {
            return Promise.reject(Error(`Task "${taskName}" has returned with exitCode != 0: ${exitCode}`));
          }
        }
      }
    } catch (e) {
      return Promise.reject(Error('One of tasks of the `testMate.test.runTask` array has failed: ' + e));
    }
  }

  private _collectRunnables(tests: string[], isParentIn: boolean): Map<AbstractRunnable, AbstractTest[]> {
    return this.collectTestToRun(tests, isParentIn).reduce((prev, curr) => {
      const arr = prev.get(curr.runnable);
      if (arr) arr.push(curr);
      else prev.set(curr.runnable, [curr]);
      return prev;
    }, new Map<AbstractRunnable, AbstractTest[]>());
  }

  public async run(tests: string[], cancellationToken: CancellationToken): Promise<void> {
    this.sendStartEventIfNeeded(tests);

    const isParentIn = tests.indexOf(this.id) !== -1;

    let runnables = this._collectRunnables(tests, isParentIn);

    try {
      await this.runTaskBefore(runnables, cancellationToken);
      runnables = this._collectRunnables(tests, isParentIn); // might changed due to tasks
    } catch (e) {
      for (const [runnable, tests] of runnables) {
        runnable.sendStaticEvents(tests, e);
      }

      this.sendFinishedEventIfNeeded();
      return;
    }

    const ps: Promise<void>[] = [];

    for (const [runnable] of runnables) {
      ps.push(
        runnable.run(tests, isParentIn, this._shared.taskPool, cancellationToken).catch(err => {
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

  public findTestById(idOrInfo: string | TestInfo): Readonly<AbstractTest> | undefined {
    if (typeof idOrInfo === 'string') return this.findTest(x => x.id === idOrInfo);
    else return this.findTest(x => x === idOrInfo);
  }
}
