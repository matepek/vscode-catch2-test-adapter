import * as vscode from 'vscode';
import { TestInfo } from 'vscode-test-adapter-api';
import { ExecutableConfig } from './ExecutableConfig';
import { Suite } from './Suite';
import { AbstractRunnable } from './AbstractRunnable';
import { AbstractTest } from './AbstractTest';
import { SharedVariables } from './SharedVariables';
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

  public async load(executables: ExecutableConfig[]): Promise<Error[]> {
    this._executables.forEach(e => e.dispose());

    this._executables = executables;

    const loadResults = await Promise.all(executables.map(v => v.load(this)));
    return loadResults.reduce((acc, val) => acc.concat(val), []);
  }

  private _cancellationTokenSource = new vscode.CancellationTokenSource();
  private _runningPromise: Promise<void> = Promise.resolve();
  private _runningPromiseResolver = (): void => {}; //eslint-disable-line

  public get isRunning(): boolean {
    return this._runningCounter > 0;
  }

  public async run(tests: string[]): Promise<void> {
    this.sendStartEventIfNeeded(tests); // has to be first line, initilizes important variables

    const isParentIn = tests.indexOf(this.id) !== -1;

    let runnables = this._collectRunnables(tests, isParentIn);

    try {
      await this.runTaskBefore(runnables, this._cancellationTokenSource.token);
      runnables = this._collectRunnables(tests, isParentIn); // might changed due to tasks
    } catch (e) {
      for (const [runnable, tests] of runnables) {
        runnable.sentStaticErrorEvent(tests, e);
      }

      this.sendFinishedEventIfNeeded();
      return;
    }

    const ps: Promise<void>[] = [];

    for (const [runnable] of runnables) {
      ps.push(
        runnable.run(tests, isParentIn, this._shared.taskPool, this._cancellationTokenSource.token).catch(err => {
          this._shared.log.error('RootTestSuite.run.for.child', runnable.properties.path, err);
        }),
      );
    }

    await Promise.all(ps)
      .finally(() => {
        this.sendFinishedEventIfNeeded();
      })
      .catch((e: Error) => {
        debugger;
        this._shared.log.error('everything should be handled', e);
      });

    return this._runningPromise;
  }

  public cancel(): void {
    if (this._cancellationTokenSource) this._cancellationTokenSource.cancel();
  }

  public sendStartEventIfNeeded(tests: string[]): void {
    if (this._runningCounter++ === 0) {
      this._runningPromise = new Promise(r => (this._runningPromiseResolver = r));
      this._cancellationTokenSource = new vscode.CancellationTokenSource();
      this._shared.log.debug('RootSuite start event fired', this.label);
      this._shared.testStatesEmitter.fire({ type: 'started', tests: tests });
      // TODO:future https://github.com/hbenl/vscode-test-explorer/issues/141
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
      this._runningPromiseResolver();
      this._cancellationTokenSource?.dispose();
    }
  }

  public sendRunningEventIfNeeded(): void {
    // do nothing, special handling
  }

  public sendCompletedEventIfNeeded(): void {
    // do nothing, special handling
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
            throw Error(
              `Task "${taskName}" has returned with exitCode(${exitCode}) != 0. (\`testMate.test.advancedExecutables:runTask.before\`)`,
            );
          }
        }
      }
    } catch (e) {
      throw Error('One of the tasks of the `testMate.test.advancedExecutables:runTask.before` array has failed: ' + e);
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

  public findTestById(idOrInfo: string | TestInfo): Readonly<AbstractTest> | undefined {
    if (typeof idOrInfo === 'string') return this.findTest(x => x.id === idOrInfo);
    else return this.findTest(x => x === idOrInfo);
  }
}
