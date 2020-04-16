import * as vscode from 'vscode';
import { TestInfo } from 'vscode-test-adapter-api';
import { Executable } from './Executable';
import { AbstractSuite } from './AbstractSuite';
import { AbstractRunnableSuite } from './AbstractRunnableSuite';
import { AbstractTest } from './AbstractTest';
import { SharedVariables } from './SharedVariables';

export class RootSuite extends AbstractSuite implements vscode.Disposable {
  public readonly children: AbstractRunnableSuite[] = [];
  private _executables: Executable[] = [];

  public constructor(id: string | undefined, shared: SharedVariables) {
    super(shared, 'Catch2/GTest/DOCTest', undefined, id);
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

  public run(tests: string[]): Promise<void> {
    this._shared.testStatesEmitter.fire({ type: 'started', tests: tests });

    // everybody should remove what they use from it.
    // and put their children into if they are in it
    const testSet = new Set(tests);

    if (testSet.delete(this.id)) {
      this.children.forEach(child => {
        testSet.add(child.id);
      });
    }

    const ps: Promise<void>[] = [];
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      ps.push(
        child.run(testSet, this._shared.taskPool).catch(err => {
          this._shared.log.error('RootTestSuite.run.for.child', child.label, child.execInfo.path, err);
        }),
      );
    }

    if (testSet.size > 0) {
      this._shared.log.error('Some tests have remained: ', testSet);
    }

    return Promise.all(ps)
      .catch((e: Error) => {
        debugger;
        this._shared.log.error('everything should be handled', e);
      })
      .then(() => {
        this._shared.testStatesEmitter.fire({ type: 'finished' });
      });
  }

  public hasChild(suite: AbstractRunnableSuite): boolean {
    return this.children.indexOf(suite) != -1;
  }

  public insertChild(suite: AbstractRunnableSuite, uniquifyLabels: boolean): boolean {
    if (this.hasChild(suite)) return false;

    {
      // we want to filter the situation when 2 patterns match the same file
      const other = this.children.find((s: AbstractRunnableSuite) => {
        return suite.execInfo.path == s.execInfo.path;
      });
      if (other) {
        this._shared.log.warn(
          'execPath duplication: suite is skipped:',
          suite.execInfo.path,
          suite.origLabel,
          other.origLabel,
        );
        return false;
      }
    }

    super._addChild(suite);

    this.file = undefined;
    this.line = undefined;

    uniquifyLabels && this.uniquifySuiteLabels();

    return true;
  }

  public removeChild(child: AbstractRunnableSuite): boolean {
    const i = this.children.findIndex(val => val.id == child.id);
    if (i != -1) {
      this.children.splice(i, 1);
      this.uniquifySuiteLabels();
      return true;
    }
    return false;
  }

  public uniquifySuiteLabels(): void {
    const uniqueNames = new Map<string /* name */, AbstractRunnableSuite[]>();

    for (const suite of this.children) {
      const suites = uniqueNames.get(suite.origLabel);
      if (suites) {
        suites.push(suite);
      } else {
        uniqueNames.set(suite.origLabel, [suite]);
      }
    }

    for (const suites of uniqueNames.values()) {
      if (suites.length > 1) {
        let i = 1;
        for (const suite of suites) {
          suite.label = String(i++) + ') ' + suite.origLabel;
        }
      }
    }
  }

  public findRouteToTestInfo(pred: (v: AbstractTest) => boolean): [AbstractSuite[], AbstractTest | undefined] {
    for (let i = 0; i < this.children.length; ++i) {
      const found = this.children[i].findRouteToTestInfo(pred);
      if (found[1] !== undefined) {
        return found;
      }
    }
    return [[], undefined];
  }

  public findRouteToTest(idOrInfo: string | TestInfo): [AbstractSuite[], AbstractTest | undefined] {
    if (typeof idOrInfo === 'string') return this.findRouteToTestInfo(x => x.id === idOrInfo);
    else return this.findRouteToTestInfo(x => x === idOrInfo);
  }
}
