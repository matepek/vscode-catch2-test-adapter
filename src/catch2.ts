//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the public
// domain. The author hereby disclaims copyright to this source code.

import { ChildProcess, ExecFileOptions, execFile } from "child_process";
import {
  TestDecoration,
  TestSuiteEvent,
  TestEvent,
  TestInfo,
  TestSuiteInfo,
  TestRunStartedEvent,
  TestRunFinishedEvent
} from "vscode-test-adapter-api";
import { Catch2TestAdapter } from "./adapter";
import { TaskPool } from "./TaskPool";
import * as xml2js from "xml2js";

export class C2InfoBase {
  readonly id: string;
  private isKill: boolean = false;
  private proc: ChildProcess | undefined = undefined;

  constructor(
    protected readonly adapter: Catch2TestAdapter,
    protected readonly taskPools: TaskPool[],
    public readonly execPath: string,
    public readonly execParams: Array<string>,
    public readonly execOptions: ExecFileOptions
  ) {
    this.id = adapter.generateUniqueId();
  }

  protected run(startEvents: (TestSuiteEvent | TestEvent)[]): Promise<object> {
    this.isKill = false;

    return this.runInner(startEvents);
  }

  private runInner(runningEvents: (TestSuiteEvent | TestEvent)[]): Promise<object> {
    if (this.isKill) return Promise.reject(Error("Test was killed."));

    if (!this.acquireSlot()) {
      return new Promise<void>(resolve => setTimeout(resolve, 64)).then(() => {
        return this.runInner(runningEvents);
      });
    }

    return new Promise<object>((resolve, reject) => {
      if (this.isKill) {
        reject(Error("Test was killed."));
        return;
      }

      runningEvents.forEach(ev => {
        this.adapter.testStatesEmitter.fire(ev);
      });

      this.proc = execFile(
        this.execPath,
        this.execParams,
        this.execOptions,
        (error: Error | null, stdout: string, stderr: string) => {
          // error code means test failure
          if (this.isKill) {
            reject(Error("Test was killed."));
            return;
          }
          try {
            new xml2js.Parser().parseString(stdout, (err: any, result: any) => {
              if (err) {
                console.error("Something is wrong.", err);
                reject(err);
              } else {
                if (result.Catch.Group.length != 1) {
                  // this code expects 1
                  console.error("Something is wrong.", result);
                  throw Error("Serious error.");
                }
                const testCasesArray: object[] = result.Catch.Group;
                resolve(testCasesArray);
              }
            });
          } catch (e) {
            reject(e);
          }
        }
      );
    })
      .then((result: object) => {
        this.proc = undefined;
        this.releaseSlot();
        return result;
      })
      .catch((err: Error) => {
        this.proc = undefined;
        this.releaseSlot();
        throw err;
      });
  }

  cancel(): void {
    this.isKill = true;

    if (this.proc != undefined) {
      this.proc.kill();
      this.proc = undefined;
    }
  }

  acquireSlot(): boolean {
    let i: number = 0;
    while (i < this.taskPools.length && this.taskPools[i].acquire()) ++i;

    if (i == this.taskPools.length) return true;

    while (--i >= 0) this.taskPools[i].release(); // rollback

    return false;
  }

  releaseSlot(): void {
    let i: number = this.taskPools.length;

    while (--i >= 0) this.taskPools[i].release();
  }
}

export class C2TestSuiteInfoBase extends C2InfoBase {
  readonly type: "suite" = "suite";
  readonly children: (C2TestSuiteInfo | C2TestInfo)[] = [];

  constructor(
    adapter: Catch2TestAdapter,
    taskPools: TaskPool[],
    protected readonly groupFileLevelRun: boolean,
    execPath: string,
    execParams: Array<string>,
    execOptions: ExecFileOptions
  ) {
    super(adapter, taskPools, execPath, execParams, execOptions);
  }

  createChildSuite(
    label: string,
    workerMaxNumber: number,
    groupFileLevelRun: boolean,
    execPath: string,
    execOptions: ExecFileOptions,
    replace: C2TestSuiteInfo | undefined
  ): C2TestSuiteInfo {
    const suite = new C2TestSuiteInfo(
      label,
      this.adapter,
      [...this.taskPools, new TaskPool(workerMaxNumber)],
      groupFileLevelRun,
      execPath,
      execOptions
    );

    if (replace != undefined) {
      const index = this.children.findIndex(val => val.id == replace.id);
      if (index !== -1) {
        this.children[index] = suite;
      } else {
        this.adapter.log.error("Replace is given, but not found.");
      }
    } else {
      this.children.push(suite);
    }

    return suite;
  }

  removeChild(child: C2TestSuiteInfo): boolean {
    const i = this.children.findIndex(val => val.id == child.id);
    if (i != -1) {
      this.children.splice(i, 1);
      return true;
    }
    return false;
  }

  hasAtLeastOneChild(ids: Set<string>): boolean {
    if (ids.size == 0) return false;
    for (let i = 0; i < this.children.length; ++i) {
      const child = this.children[i];
      if (ids.has(child.id)) {
        return true;
      } else if (child.type == "suite") {
        if (child.hasAtLeastOneChild(ids)) return true;
      }
    }
    return false;
  }

  findChildById(id: string): C2TestSuiteInfo | C2TestInfo | undefined {
    const recursiveSearch = (
      child: C2TestSuiteInfo | C2TestInfo
    ): C2TestSuiteInfo | C2TestInfo | undefined => {
      if (child.id == id) {
        return child;
      } else if (child.type == "suite") {
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
}

export class C2AllTestSuiteInfo extends C2TestSuiteInfoBase implements TestSuiteInfo {
  readonly label: string = "AllTests";

  constructor(adapter: Catch2TestAdapter, globalWorkerMaxNumber: number) {
    super(adapter, [new TaskPool(globalWorkerMaxNumber)], false, "", [], {});
  }

  test(tests: string[]): Promise<void> {
    this.adapter.testStatesEmitter.fire(<TestRunStartedEvent>{ type: "started", tests: tests });

    // everybody should remove what they use from it.
    // and put their children into if they are in it
    const testSet = new Set(tests);

    if (testSet.has(this.id)) {
      this.children.forEach(child => {
        testSet.add(child.id);
      });
    }

    const ps: Promise<void>[] = [];
    this.children.forEach(child => {
      if (child.type == "suite") {
        ps.push(child.test(testSet));
      } else {
        this.adapter.log.error("AllTest contains type==test. Should not!");
      }
    });

    if (testSet.size > 0) {
      this.adapter.log.error("Some tests have remained.");
    }

    const always = () => {
      this.adapter.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: "finished" });
    };

    return Promise.all(ps).then(always, always);
  }
}

export class C2TestSuiteInfo extends C2TestSuiteInfoBase implements TestSuiteInfo {
  file?: string = undefined;
  line?: number = undefined;

  constructor(
    public readonly label: string,
    adapter: Catch2TestAdapter,
    taskPools: TaskPool[],
    groupFileLevelRun: boolean,
    execPath: string,
    execOptions: ExecFileOptions
  ) {
    super(adapter, taskPools, groupFileLevelRun, execPath, ["--reporter", "xml"], execOptions);
  }

  createChildTest(label: string, file: string, line: number): C2TestInfo {
    const test = new C2TestInfo(
      label,
      file,
      line,
      this.adapter,
      this.taskPools,
      this.execPath,
      this.execOptions
    );

    if (this.children.length == 0) {
      this.file = file;
      this.line = 1;
    }
    this.children.push(test);

    return test;
  }

  test(tests: Set<string>): Promise<void> {
    const startEvent: TestSuiteEvent = {
      type: "suite",
      suite: this,
      state: "running"
    };

    const hasId = tests.delete(this.id);

    if (this.groupFileLevelRun && hasId) {
      const childEvents: (TestSuiteEvent | TestEvent)[] = [];
      this.children.forEach(child => {
        tests.delete(child.id);
        if (child.type == "suite") {
          childEvents.push({ type: child.type, suite: child, state: "running" });
        } else {
          childEvents.push({ type: child.type, test: child, state: "running" });
        }
      });
      return this.run([startEvent, ...childEvents])
        .then((groupInner: object) => {
          this.processXmlTagGroupInner(groupInner);
        })
        .catch((err: Error) => {
          this.adapter.log.error(err.message);
        })
        .then(() => {
          this.adapter.testStatesEmitter.fire({
            type: "suite",
            suite: this,
            state: "completed"
          });
        });
    }

    if (hasId) {
      this.children.forEach(child => {
        tests.add(child.id);
      });
    }

    if (!this.hasAtLeastOneChild(tests)) {
      return Promise.resolve();
    }

    this.adapter.testStatesEmitter.fire(startEvent);

    const ps: Promise<void>[] = [];

    this.children.forEach(child => {
      ps.push(child.test(tests));
    });

    return Promise.all(ps).then(
      () => {
        this.adapter.testStatesEmitter.fire({
          type: "suite",
          suite: this,
          state: "completed"
        });
      },
      (err: Error) => {
        this.adapter.testStatesEmitter.fire({
          type: "suite",
          suite: this,
          state: "completed"
        });
        this.adapter.log.error(err.message);
      }
    );
  }

  private processXmlTagGroupInner(testCases: any): void {
    if (testCases.length != 1) {
      this.adapter.log.error("this code expects 1." + testCases.toString());
      throw Error("Serious error.");
    }

    for (let i = 0; i < testCases[0].TestCase.length; ++i) {
      const testCase = testCases[0].TestCase[i];
      const name = testCase.$.name.trimRight();
      const child = this.children.find((v: C2TestSuiteInfo | C2TestInfo) => {
        return v.label == name;
      });
      if (child != undefined && child.type == "test") {
        const ev = (<C2TestInfo>child).processXmlTagTestCase(testCase);
        this.adapter.testStatesEmitter.fire(ev);
      }
    }
  }
}

export class C2TestInfo extends C2InfoBase implements TestInfo {
  readonly type: "test" = "test";

  constructor(
    public label: string,
    public readonly file: string,
    public readonly line: number,
    adapter: Catch2TestAdapter,
    taskPools: TaskPool[],
    execPath: string,
    execOptions: ExecFileOptions
  ) {
    super(
      adapter,
      taskPools,
      execPath,
      [label.replace(",", "\\,") /*',' has special meaning */, "--reporter", "xml"],
      execOptions
    );
  }

  test(tests: Set<string>): Promise<void> {
    if (!tests.has(this.id)) return Promise.resolve();
    tests.delete(this.id);

    return this.run([
      <TestEvent>{
        type: "test",
        test: this,
        state: "running"
      }
    ])
      .then((groupInner: object) => {
        const testEvent = this.processXmlTagGroupInner(groupInner);
        this.adapter.testStatesEmitter.fire(testEvent);
      })
      .catch((err: Error) => {
        this.adapter.testStatesEmitter.fire({
          type: "test",
          test: this,
          state: "failed",
          message: err.toString()
        });
      });
  }

  private processXmlTagGroupInner(testCases: any): TestEvent {
    if (testCases.length != 1) {
      this.adapter.log.error("this code expects 1." + testCases.toString());
      throw Error("Serious error.");
    }

    if (testCases[0].TestCase.length != 1) {
      this.adapter.log.error("this code expects 1." + testCases.toString());
      throw Error("Serious error.");
    }

    const testCase = testCases[0].TestCase[0];

    return this.processXmlTagTestCase(testCase);
  }

  processXmlTagTestCase(testCase: any): TestEvent {
    if (
      testCase.$.hasOwnProperty("description") &&
      this.label.indexOf(testCase.$.description) == -1
    ) {
      this.label += " | " + testCase.$.description;
    }

    try {
      let message = undefined;
      let decorations = undefined;
      let success = false;
      [message, decorations, success] = this.processXmlTagTestCaseInner(testCase, "");
      const testEvent: TestEvent = {
        type: "test",
        test: this,
        state: success ? "passed" : "failed",
        message: message.length ? message : undefined,
        decorations:
          this.adapter.getIsEnabledSourceDecoration() && decorations.length
            ? decorations
            : undefined
      };
      return testEvent;
    } catch (e) {
      throw e;
    }
  }

  private processXmlTagTestCaseInner(
    testCase: any,
    title: string
  ): [string, TestDecoration[], boolean] {
    title = testCase.$.name + "(line: " + testCase.$.line + ")";
    let message = "";
    let decorations: TestDecoration[] = [];
    let success = false;

    if (testCase.OverallResult[0].$.success === "true") {
      success = true;
    }

    if (testCase.hasOwnProperty("Expression")) {
      for (let j = 0; j < testCase.Expression.length; ++j) {
        try {
          let messageL = undefined;
          let decorationsL = undefined;
          [messageL, decorationsL] = this.processXmlTagExpressionInner(
            testCase.Expression[j],
            title
          );
          message += messageL;
          decorations = decorations.concat(decorationsL);
        } catch (error) {}
      }
    }

    if (testCase.hasOwnProperty("Section")) {
      for (let j = 0; j < testCase.Section.length; ++j) {
        try {
          let messageL = undefined;
          let decorationsL = undefined;
          [messageL, decorationsL] = this.processXmlTagSectionInner(testCase.Section[j], title);
          message += messageL;
          decorations = decorations.concat(decorationsL);
        } catch (error) {}
      }
    }

    return [message, decorations, success];
  }

  private processXmlTagExpressionInner(expr: any, title: string): [string, TestDecoration[]] {
    let message = "";
    let decorations: TestDecoration[] = [];

    message += ">>> " + title + " " + expr.$.type + " (line: " + expr.$.line + ")" + " \n";
    message += "  Original:\n    ";
    message += expr.Original.map((x: string) => x.trim()).join(" | ");
    message += "\n  Expanded:\n    ";
    message += expr.Expanded.map((x: string) => x.trim()).join(" | ") + "\n";
    message += "<<<\n";
    decorations.push({
      line: Number(expr.$.line) - 1 /*It looks cathc works like this.*/,
      message: "Expanded: " + expr.Expanded.map((x: string) => x.trim()).join(" | ")
    });

    return [message, decorations];
  }

  private processXmlTagSectionInner(section: any, title: string): [string, TestDecoration[]] {
    title += " | " + section.$.name + "(line: " + section.$.line + ")";
    let message = "";
    let decorations: TestDecoration[] = [];

    if (section.hasOwnProperty("Expression")) {
      for (let j = 0; j < section.Expression.length; ++j) {
        try {
          let messageL = undefined;
          let decorationsL = undefined;
          [messageL, decorationsL] = this.processXmlTagExpressionInner(
            section.Expression[j],
            title
          );
          message += messageL;
          decorations = decorations.concat(decorationsL);
        } catch (error) {}
      }
    }

    if (section.hasOwnProperty("Section")) {
      for (let j = 0; j < section.Section.length; ++j) {
        try {
          let messageL = undefined;
          let decorationsL = undefined;
          [messageL, decorationsL] = this.processXmlTagSectionInner(section.Section[j], title);
          message += messageL;
          decorations = decorations.concat(decorationsL);
        } catch (error) {}
      }
    }

    return [message, decorations];
  }
}
