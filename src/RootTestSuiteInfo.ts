//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as vscode from 'vscode';

import { TestExecutableInfo } from './TestExecutableInfo'
import { AbstractTestSuiteInfoBase } from './AbstractTestSuiteInfoBase';
import { AbstractTestSuiteInfo } from './AbstractTestSuiteInfo';
import { TaskPool } from './TaskPool';
import { SharedVariables } from './SharedVariables';

export class RootTestSuiteInfo extends AbstractTestSuiteInfoBase implements vscode.Disposable {
  readonly children: AbstractTestSuiteInfo[] = [];
  private readonly _executables: TestExecutableInfo[] = [];
  private readonly _taskPool: TaskPool;

  constructor(shared: SharedVariables, workerMaxNumber: number) {
    super(shared, 'Catch2 and Google tests');
    this._taskPool = new TaskPool(workerMaxNumber);
  }

  dispose() {
    this._executables.forEach(e => e.dispose());
  }

  set workerMaxNumber(workerMaxNumber: number) {
    this._taskPool.maxTaskCount = workerMaxNumber;
  }

  cancel(): void {
    this.children.forEach(c => c.cancel());
  }

  async load(executables: TestExecutableInfo[]) {
    for (let i = 0; i < executables.length; i++) {
      const executable = executables[i];
      try {
        await executable.load();
        this._executables.push(executable);
      } catch (e) {
        this._shared.log.error(e, i, executables);
      }
    }
  }

  run(tests: string[]): Promise<void> {
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
      ps.push(child.run(testSet, this._taskPool));
    }

    if (testSet.size > 0) {
      this._shared.log.error('Some tests have remained: ', testSet);
    }

    return Promise.all(ps).catch(e => {
      this._shared.log.error(__filename, e);
    }).then(() => {
      this._shared.testStatesEmitter.fire({ type: 'finished' });
    });
  }

  hasChild(suite: AbstractTestSuiteInfo): boolean {
    return this.children.indexOf(suite) != -1;
  }

  insertChild(suite: AbstractTestSuiteInfo, uniquifyLabels: boolean): boolean {
    if (this.hasChild(suite))
      return false;

    {// we want to filter the situation when 2 patterns match the same file
      const other = this.children.find((s: AbstractTestSuiteInfo) => { return suite.execPath == s.execPath; })
      if (other) {
        this._shared.log.warn('execPath duplication: suite is skipped', suite, other);
        return false;
      }
    }

    this.addChild(suite);

    uniquifyLabels && this.uniquifySuiteLabels();

    return true;
  }

  addChild(suite: AbstractTestSuiteInfo) {
    super.addChild(suite);

    this.file = undefined;
    this.line = undefined;
  }

  removeChild(child: AbstractTestSuiteInfo): boolean {
    const i = this.children.findIndex(val => val.id == child.id);
    if (i != -1) {
      this.children.splice(i, 1);
      this.uniquifySuiteLabels();
      return true;
    }
    return false;
  }

  uniquifySuiteLabels() {
    const uniqueNames = new Map<string /* name */, AbstractTestSuiteInfo[]>();

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

  findRouteToTestById(id: string) {
    const res = super.findRouteToTestById(id);
    if (res !== undefined) res.shift(); // remove Root/this
    return res;
  }
}
