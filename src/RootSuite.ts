import * as vscode from 'vscode';
import { TestInfo } from 'vscode-test-adapter-api';
import { Executable } from './Executable';
import { Suite } from './Suite';
import { AbstractRunnable } from './AbstractRunnable';
import { AbstractTest } from './AbstractTest';
import { SharedVariables } from './SharedVariables';

export class RootSuite extends Suite implements vscode.Disposable {
  public readonly children: AbstractRunnable[] = [];
  private _executables: Executable[] = [];

  public constructor(id: string | undefined, shared: SharedVariables) {
    super(shared, undefined, 'Catch2/GTest/DOCTest', undefined);
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
    this.children.forEach(c => c.cancel());
  }

  public load(executables: Executable[]): Promise<void> {
    this._executables.forEach(e => e.dispose());

    this._executables = executables;

    return Promise.all(executables.map(v => v.load().catch(e => this._shared.log.exception(e, v)))).then(
      (): void => undefined,
    );
  }

  public sendStartEventIfNeeded(tests: string[]): void {
    if (this._runningCounter++ === 0) {
      this._shared.log.localDebug('RootSuite start event fired', this.label);
      this._shared.testStatesEmitter.fire({ type: 'started', tests: tests });
    }
  }

  public sendFinishedventIfNeeded(): void {
    if (this._runningCounter < 1) {
      this._shared.log.error('Root Suite running counter is too low');
      this._runningCounter = 0;
      return;
    }
    if (this._runningCounter-- === 1) {
      this._shared.log.localDebug('RootSuite finished event fired', this.label);
      this._shared.testStatesEmitter.fire({ type: 'finished' });
    }
  }

  public run(tests: string[]): Promise<void> {
    this.sendStartEventIfNeeded(tests);

    const childrenToRun = tests.indexOf(this.id) !== -1 ? [...tests, ...this.children.map(s => s.id)] : tests;

    const ps: Promise<void>[] = [];
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      ps.push(
        child.run(childrenToRun, this._shared.taskPool).catch(err => {
          this._shared.log.error('RootTestSuite.run.for.child', child.label, child.execInfo.path, err);
        }),
      );
    }

    return Promise.all(ps)
      .catch((e: Error) => {
        debugger;
        this._shared.log.error('everything should be handled', e);
      })
      .then(() => {
        this.sendFinishedventIfNeeded();
      });
  }

  public hasChild(suite: AbstractRunnable): boolean {
    return this.children.indexOf(suite) != -1;
  }

  public insertChild(suite: AbstractRunnable, uniquifyLabels: boolean): boolean {
    if (this.hasChild(suite)) return false;

    {
      // we want to filter the situation when 2 patterns match the same file
      const other = this.children.find((s: AbstractRunnable) => {
        return suite.execInfo.path == s.execInfo.path;
      });
      if (other) {
        this._shared.log.warn('execPath duplication: suite is skipped:', suite.execInfo.path, suite.label, other.label);
        return false;
      }
    }

    super._addChild(suite);

    uniquifyLabels && this.uniquifySuiteLabels();

    return true;
  }

  public removeChild(child: AbstractRunnable): boolean {
    const i = this.children.findIndex(val => val.id == child.id);
    if (i != -1) {
      this.children.splice(i, 1);
      this.uniquifySuiteLabels();
      return true;
    }
    return false;
  }

  public uniquifySuiteLabels(): void {
    const uniqueNames = new Map<string /* name */, AbstractRunnable[]>();

    for (const suite of this.children) {
      suite.labelPrefix = '';
      const suites = uniqueNames.get(suite.label);
      if (suites) {
        suites.push(suite);
      } else {
        uniqueNames.set(suite.label, [suite]);
      }
    }

    for (const suites of uniqueNames.values()) {
      if (suites.length > 1) {
        let i = 1;
        for (const suite of suites) {
          suite.labelPrefix = String(i++) + ') ';
        }
      }
    }
  }

  public findTestById(idOrInfo: string | TestInfo): AbstractTest | undefined {
    if (typeof idOrInfo === 'string') return this.findTest(x => x.id === idOrInfo);
    else return this.findTest(x => x === idOrInfo);
  }
}
