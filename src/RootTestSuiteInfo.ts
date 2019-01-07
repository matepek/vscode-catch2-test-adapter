//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { inspect } from 'util';
import * as vscode from 'vscode';
import { TestEvent, TestInfo, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo } from 'vscode-test-adapter-api';
import * as util from 'vscode-test-adapter-util';

import { TestExecutableInfo } from './TestExecutableInfo'
import { TestInfoBase } from './TestInfoBase';
import { TestSuiteInfoBase } from './TestSuiteInfoBase';
import { generateUniqueId } from './IdGenerator';
import { TaskQueue } from './TaskQueue';
import { TaskPool } from './TaskPool';

export class RootTestSuiteInfo implements TestSuiteInfo, vscode.Disposable {
  readonly type: 'suite' = 'suite';
  readonly id: string;
  readonly label: string;
  readonly children: TestSuiteInfoBase[] = [];
  private readonly _executables: TestExecutableInfo[] = [];
  private _wasDisposed = false;
  private readonly _taskPool: TaskPool;

  constructor(
    private readonly _allTasks: TaskQueue,
    public readonly log: util.Log,
    public readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly _loadFinishedEmitter: vscode.EventEmitter<string | undefined>,
    private readonly _testsEmitter:
      vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>,
    public readonly testStatesEmitter:
      vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent |
        TestSuiteEvent | TestEvent>,
    public readonly variableToValue: [string, string][],
    public isEnabledSourceDecoration: boolean,
    public rngSeed: string | number | null,
    public execWatchTimeout: number,
    private _execRunningTimeout: null | number,
    public isNoThrow: boolean,
    workerMaxNumber: number,
  ) {
    this.label = workspaceFolder.name + ' (Catch2 and Google Test Explorer)';
    this.id = generateUniqueId();
    this._taskPool = new TaskPool(workerMaxNumber);
  }

  set workerMaxNumber(workerMaxNumber: number) {
    this._taskPool.maxTaskCount = workerMaxNumber;
  }

  get execRunningTimeout() { return this._execRunningTimeout; }

  set execRunningTimeout(value: null | number) {
    this._execRunningTimeout = value;
    this._execRunningTimeoutChangeEmitter.fire();
  }

  private readonly _execRunningTimeoutChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidExecRunningTimeoutChange = this._execRunningTimeoutChangeEmitter.event;

  dispose() {
    this._wasDisposed = true;
    this._execRunningTimeoutChangeEmitter.dispose();
    for (let i = 0; i < this._executables.length; i++) {
      this._executables[i].dispose();
    }
  }

  sendLoadEvents(task: (() => Promise<void>)) {
    return this._allTasks.then(() => {
      if (this._wasDisposed) {
        return task().catch(() => { });
      } else {
        this._testsEmitter.fire({ type: 'started' });
        return task().then(
          () => {
            this._loadFinishedEmitter.fire(undefined);
          },
          (reason: any) => {
            this.log.error(reason);
            this._loadFinishedEmitter.fire(inspect(reason));
            debugger;
          });
      }
    });
  }

  sendTestSuiteStateEventsWithParent(events: (TestSuiteEvent | TestEvent)[]) {
    this._allTasks.then(() => {
      if (this._wasDisposed) return;

      const tests =
        events.filter(ev => ev.type == 'test' && ev.state == 'running')
          .map(ev => (<TestInfo>((<TestEvent>ev).test)).id);

      this.testStatesEmitter.fire({ type: 'started', tests: tests });

      for (let i = 0; i < events.length; i++) {
        this.testStatesEmitter.fire(events[i]);
      }

      this.testStatesEmitter.fire({ type: 'finished' });
    });
  }

  removeChild(child: TestSuiteInfoBase): boolean {
    const i = this.children.findIndex(val => val.id == child.id);
    if (i != -1) {
      this.children.splice(i, 1);
      return true;
    }
    return false;
  }

  findTestById(id: string): TestInfoBase | undefined {
    for (let i = 0; i < this.children.length; ++i) {
      const test = this.children[i].findTestById(id);
      if (test) return test;
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
        this.log.error(e, i, executables);
      }
    }
  }

  run(tests: string[]): Promise<void> {
    this.testStatesEmitter.fire({ type: 'started', tests: tests });

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
      this.log.error('Some tests have remained: ', testSet);
    }

    return Promise.all(ps).catch(e => {
      this.testStatesEmitter.fire({ type: 'finished' });
      this.log.warn(__filename, e);
      throw e;
    }).then(() => {
      this.testStatesEmitter.fire({ type: 'finished' });
    });
  }
}
