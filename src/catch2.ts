//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the public
// domain. The author hereby disclaims copyright to this source code.

import { ChildProcess, ExecFileOptions, execFile } from "child_process";
import {
  TestDecoration,
  TestSuiteEvent,
  TestEvent,
  TestInfo,
  TestSuiteInfo
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

  protected run(runningEvent: TestSuiteEvent | TestEvent): Promise<object> {
    this.isKill = false;

    return this.runInner(runningEvent);
  }

  private runInner(runningEvent: TestSuiteEvent | TestEvent): Promise<object> {
    if (this.isKill) return Promise.reject(Error("Test was killed."));

    if (!this.acquireSlot()) {
      return new Promise<void>(resolve => setTimeout(resolve, 64)).then(() => {
        return this.runInner(runningEvent);
      });
    }

    return new Promise<object>((resolve, reject) => {
      if (this.isKill) {
        reject(Error("Test was killed."));
        return;
      }

      this.adapter.testStatesEmitter.fire(runningEvent);

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
                resolve(result);
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
    execPath: string,
    execParams: Array<string>,
    execOptions: ExecFileOptions
  ) {
    super(adapter, taskPools, execPath, execParams, execOptions);
  }

  createChildSuite(
    label: string,
    workerMaxNumber: number,
    execPath: string,
    execParams: Array<string>,
    execOptions: ExecFileOptions
  ): C2TestSuiteInfo {
    const suite = new C2TestSuiteInfo(
      label,
      this.adapter,
      [...this.taskPools, new TaskPool(workerMaxNumber)],
      execPath,
      execParams,
      execOptions
    );

    this.children.push(suite);

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

  getChildIds(ids: string[]): string[] {
    let childs: string[] = [];
    this.children.forEach(child => {
      const index = ids.indexOf(child.id);
      if (index != -1) {
        childs.push(child.id);
        ids.slice(index, 1);
      } else if (child.type == "suite") {
        childs = childs.concat(child.getChildIds(ids));
      }
    });
  }
}

export class C2AllTestSuiteInfo extends C2TestSuiteInfoBase implements TestSuiteInfo {
  readonly label: string = "AllTests";

  constructor(adapter: Catch2TestAdapter, globalWorkerMaxNumber: number) {
    super(adapter, [new TaskPool(globalWorkerMaxNumber)], "", [], {});
  }

  findById(byId: string): TestSuiteInfo | C2TestInfo | undefined {
    let search: Function = (
      t: C2TestSuiteInfo | C2TestInfo
    ): C2TestSuiteInfo | C2TestInfo | undefined => {
      if (t.id === byId) return t;
      if (t.type == "test") return undefined;
      for (let i = 0; i < (<C2TestSuiteInfo>t).children.length; ++i) {
        let tt = search((<C2TestSuiteInfo>t).children[i]);
        if (tt != undefined) return tt;
      }
      return undefined;
    };
    return search(this);
  }

  test(tests: string[]): Promise<void> {
    this.adapter.testStatesEmitter.fire({ type: "started", tests: tests });

    let subTests: string[] = [];
    if (tests.indexOf(this.id) != -1) {
      this.children.forEach(child => {
        subTests.push(child.id);
      });
    } else {
      subTests = tests;
    }

    const ps: Promise<void>[] = [];
    this.children.forEach(child => {
      ps.push(child.test(subTests));
    });

    const always = () => {
      this.adapter.testStatesEmitter.fire({ type: "finished" });
    };

    return Promise.all(ps).then(always, always);
  }
}

export class C2TestSuiteInfo extends C2TestSuiteInfoBase implements TestSuiteInfo {
  constructor(
    public readonly label: string,
    adapter: Catch2TestAdapter,
    taskPools: TaskPool[],
    execPath: string,
    execParams: Array<string>,
    execOptions: ExecFileOptions
  ) {
    super(adapter, taskPools, execPath, execParams, execOptions);
  }

  createChildTest(label: string, file: string, line: number): C2TestInfo {
    const test = new C2TestInfo(
      label,
      file,
      line,
      this.adapter,
      this.taskPools,
      this.execPath,
      this.execParams,
      this.execOptions
    );
    this.children.push(test);
    return test;
  }

  test(tests: string[]): Promise<void> {
    this.adapter.testStatesEmitter.fire({
      type: "suite",
      suite: this,
      state: "running"
    });

    const subTests: string[] = [];
    if (tests.indexOf(this.id) != -1) {
      this.children.forEach(child => {
        subTests.push(child.id);
      });
    }

    const ps: Promise<void>[] = [];
    this.children.forEach(child => {
      ps.push(child.test(subTests));
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
    execParams: Array<string>,
    execOptions: ExecFileOptions
  ) {
    super(
      adapter,
      taskPools,
      execPath,
      [label.replace(",", "\\,"), "--reporter", "xml", ...execParams],
      execOptions
    );
  }

  test(tests: string[]): Promise<void> {
    return this.run({
      type: "test",
      test: this,
      state: "running"
    })
      .then((xml: object) => {
        const testEvent = this.processXml(xml);
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

  private processXml(res: object): TestEvent {
    const result: any = res; //TODO
    if (result.Catch.Group.length != 1) {
      // this code expects 1, because it runs tests 1 by 1
      console.error("Something is wrong.", result);
      throw Error("Serious error.");
    }

    if (result.Catch.Group[0].TestCase.length != 1) {
      // this code expects 1, because it runs tests 1 by 1
      console.error("Something is wrong.", result);
      throw Error("Serious error.");
    }

    const testCase = result.Catch.Group[0].TestCase[0];

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
