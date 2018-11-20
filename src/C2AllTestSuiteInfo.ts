//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import {SpawnOptions} from 'child_process';
import {inspect} from 'util';
import * as vscode from 'vscode';
import {TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';
import * as util from 'vscode-test-adapter-util';

import {C2ExecutableInfo} from './C2ExecutableInfo'
import {C2TestInfo} from './C2TestInfo';
import {C2TestSuiteInfo} from './C2TestSuiteInfo';
import {generateUniqueId} from './IdGenerator';
import {QueueGraphNode} from './QueueGraph';
import {TaskPool} from './TaskPool';

export class C2AllTestSuiteInfo implements TestSuiteInfo, vscode.Disposable {
  readonly type: 'suite' = 'suite';
  readonly id: string;
  readonly label: string = 'AllTests';
  readonly children: C2TestSuiteInfo[] = [];
  private readonly _executables: C2ExecutableInfo[] = [];
  private _isDisposed = false;

  constructor(
      public readonly allTasks: QueueGraphNode,
      public readonly log: util.Log,
      public readonly workspaceFolder: vscode.WorkspaceFolder,
      private readonly _loadFinishedEmitter: vscode.EventEmitter<void>,
      private readonly _testsEmitter:
          vscode.EventEmitter<TestLoadStartedEvent|TestLoadFinishedEvent>,
      private readonly _testStatesEmitter:
          vscode.EventEmitter<TestRunStartedEvent|TestRunFinishedEvent|
                              TestSuiteEvent|TestEvent>,
      public readonly autorunEmitter: vscode.EventEmitter<void>,
      public readonly variableToValue: [string, string][],
      public isEnabledSourceDecoration: boolean,
      public rngSeed: string|number|null,
      public execWatchTimeout: number,
  ) {
    this.id = generateUniqueId();
  }

  dispose() {
    this._isDisposed = true;
    while (this._executables.length) this._executables.pop()!.dispose();
  }

  sendLoadEvents(task: (() => Promise<void>)) {
    return this.allTasks.then(() => {
      if (this._isDisposed) {
        return task();
      } else {
        this._testsEmitter.fire({type: 'started'});
        return task().then(
            () => {
              this._loadFinishedEmitter.fire();
            },
            (reason: any) => {
              this._loadFinishedEmitter.fire();
              this.log.warn(inspect(reason));
              throw reason;
            });
      }
    });
  }

  sendTestStateEvent(ev: TestSuiteEvent|TestEvent) {
    this._testStatesEmitter.fire(ev);
  }

  removeChild(child: C2TestSuiteInfo): boolean {
    const i = this.children.findIndex(val => val.id == child.id);
    if (i != -1) {
      this.children.splice(i, 1);
      return true;
    }
    return false;
  }

  findChildById(id: string): C2TestSuiteInfo|C2TestInfo|undefined {
    const recursiveSearch =
        (child: C2TestSuiteInfo|C2TestInfo): C2TestSuiteInfo|C2TestInfo|
        undefined => {
          if (child.id == id) {
            return child;
          } else if (child.type == 'suite') {
            const suite: C2TestSuiteInfo = child;
            for (let i = 0; i < suite.children.length; ++i) {
              const r = recursiveSearch(suite.children[i]);
              if (r != undefined) return r;
            }
          }
          return undefined;
        };

    for (let i = 0; i < this.children.length; ++i) {
      const r = recursiveSearch(this.children[i]);
      if (r) return r;
    }

    return undefined;
  }

  createChildSuite(label: string, execPath: string, execOptions: SpawnOptions):
      C2TestSuiteInfo {
    const suite = new C2TestSuiteInfo(label, this, execPath, execOptions);

    let i = this.children.findIndex((v: C2TestSuiteInfo) => {
      return suite.label.trim().localeCompare(v.label.trim()) < 0;
    });
    if (i == -1) i = this.children.length;
    this.children.splice(i, 0, suite);

    return suite;
  }

  cancel(): void {
    this.children.forEach(c => {
      c.cancel();
    });
  }

  async load(executables: C2ExecutableInfo[]) {
    for (let i = 0; i < executables.length; i++) {
      const executable = executables[i];
      try {
        await executable.load();
        this._executables.push(executable);
      } catch (e) {
        this.log.error(inspect([e, i, executables]));
      }
    }
  }

  run(tests: string[], workerMaxNumber: number): Promise<void> {
    this._testStatesEmitter.fire(
        <TestRunStartedEvent>{type: 'started', tests: tests});

    const taskPool = new TaskPool(workerMaxNumber);

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
      ps.push(child.run(testSet, taskPool));
    }

    if (testSet.size > 0) {
      this.log.error('Some tests have remained.');
    }

    const always = () => {
      this._testStatesEmitter.fire(<TestRunFinishedEvent>{type: 'finished'});
    };

    return Promise.all(ps).then(always, always);
  }
}
