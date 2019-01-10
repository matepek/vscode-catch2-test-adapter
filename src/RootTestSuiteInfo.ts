//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as vscode from 'vscode';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';

import { TestExecutableInfo } from './TestExecutableInfo'
import { TestSuiteInfoBase } from './TestSuiteInfoBase';
import { generateUniqueId } from './IdGenerator';
import { TaskPool } from './TaskPool';
import { SharedVariables } from './SharedVariables';

export class RootTestSuiteInfo implements TestSuiteInfo, vscode.Disposable {
  readonly type: 'suite' = 'suite';
  readonly id: string;
  readonly label: string;
  readonly children: TestSuiteInfoBase[] = [];
  private readonly _executables: TestExecutableInfo[] = [];
  private readonly _taskPool: TaskPool;

  constructor(private readonly _shared: SharedVariables,
    workerMaxNumber: number,
  ) {
    this.label = this._shared.workspaceFolder.name + ' (Catch2 and Google Test Explorer)';
    this.id = generateUniqueId();
    this._taskPool = new TaskPool(workerMaxNumber);
  }

  set workerMaxNumber(workerMaxNumber: number) {
    this._taskPool.maxTaskCount = workerMaxNumber;
  }

  dispose() {
    this._executables.forEach(e => e.dispose());
  }

  removeChild(child: TestSuiteInfoBase): boolean {
    const i = this.children.findIndex(val => val.id == child.id);
    if (i != -1) {
      this.children.splice(i, 1);
      return true;
    }
    return false;
  }

  findRouteToTestById(id: string): (TestSuiteInfo | TestInfo)[] | undefined {
    for (let i = 0; i < this.children.length; ++i) {
      const res = this.children[i].findRouteToTestById(id);
      if (res) return res;
    }
    return undefined;
  }

  hasChild(suite: TestSuiteInfoBase): boolean {
    return this.children.indexOf(suite) != -1;
  }

  insertChild(suite: TestSuiteInfoBase): boolean {
    if (this.children.indexOf(suite) != -1) return false;

    // we want to filter the situation when 2 patterns match the same file
    if (this.children.find((s: TestSuiteInfoBase) => { return suite.execPath == s.execPath; })) {
      return false;
    }

    let i = this.children.findIndex((v: TestSuiteInfoBase) => {
      return suite.label.trim().localeCompare(v.label.trim()) < 0;
    });

    if (i == -1) i = this.children.length;

    this.children.splice(i, 0, suite);

    return true;
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
      this._shared.testStatesEmitter.fire({ type: 'finished' });
      this._shared.log.warn(__filename, e);
      throw e;
    }).then(() => {
      this._shared.testStatesEmitter.fire({ type: 'finished' });
    });
  }
}
