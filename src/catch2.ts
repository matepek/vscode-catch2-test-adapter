//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the public
// domain. The author hereby disclaims copyright to this source code.

import { ChildProcess, ExecFileOptions, execFile } from "child_process";
import { TestDecoration, TestEvent, TestInfo, TestSuiteInfo } from "vscode-test-adapter-api";
import { Catch2TestAdapter } from "./adapter";
import * as xml2js from "xml2js";
import * as path from "path";

export class C2TestSuiteInfo implements TestSuiteInfo {
  readonly type: "suite" = "suite";
  readonly id: string;
  file?: string;
  line?: number;
  children: (C2TestSuiteInfo | C2TestInfo)[] = [];

  constructor(
    public readonly label: string,
    private readonly parent: C2TestSuiteInfo | undefined,
    private readonly adapter: Catch2TestAdapter,
    private readonly taskPool: TaskPool
  ) {
    this.id = adapter.generateUniqueId();
  }

  cancel(): void {
    this.children.forEach(child => {
      child.cancel();
    });
  }

  acquireSlot(): boolean {
    const isAcquired = this.taskPool.acquire();
    if (!isAcquired) return false;
    if (this.parent != undefined) {
      if (this.parent.acquireSlot()) {
        return true;
      } else {
        this.taskPool.release();
        return false;
      }
    } else {
      return true;
    }
  }

  releaseSlot(): void {
    this.taskPool.release();
    if (this.parent != undefined) this.parent.releaseSlot();
  }

  removeChild(child: C2TestSuiteInfo): boolean {
    const i = this.children.findIndex(val => val.id == child.id);
    if (i != -1) {
      this.children.splice(i, 1);
      return true;
    }
    return false;
  }

  test(): Promise<void> {
    this.adapter.testStatesEmitter.fire({
      type: "suite",
      suite: this,
      state: "running"
    });

    let ps: Promise<void>[] = [];
    this.children.forEach(child => {
      ps.push(child.test());
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
        console.error("Serious error.", err);
      }
    );
  }
}

export class C2TestInfo implements TestInfo {
  readonly type: "test" = "test";
  readonly id: string;
  file?: string = undefined;
  line?: number = undefined;
  skipped?: boolean = false;

  private isKill: boolean = false;
  private proc: ChildProcess | undefined = undefined;

  constructor(
    public label: string,
    private readonly adapter: Catch2TestAdapter,
    private readonly parent: C2TestSuiteInfo,
    private readonly execPath: string,
    private readonly execParams: Array<string>,
    private readonly execOptions: ExecFileOptions
  ) {
    this.id = adapter.generateUniqueId();
  }

  cancel(): void {
    this.isKill = true;

    if (this.proc != undefined) {
      this.proc.kill();
      this.proc = undefined;
    }
  }

  test(): Promise<void> {
    this.isKill = false;

    return this.runTest();
  }

  private runTest(): Promise<void> {
    if (this.isKill) return Promise.reject(Error("Test was killed."));

    if (!this.parent.acquireSlot()) {
      return new Promise<void>(resolve => setTimeout(resolve, 64)).then(() => {
        return this.runTest();
      });
    }

    return new Promise<TestEvent>((resolve, reject) => {
      if (this.isKill) {
        reject(Error(this.label + " was killed."));
        return;
      }

      this.adapter.testStatesEmitter.fire({
        type: "test",
        test: this,
        state: "running"
      });

      this.proc = execFile(
        this.execPath,
        this.execParams,
        this.execOptions,
        (error: Error | null, stdout: string, stderr: string) => {
          // error code means test failure
          if (this.isKill) {
            reject(Error(this.label + " was killed."));
            return;
          }
          try {
            new xml2js.Parser().parseString(stdout, (err: any, result: any) => {
              if (err) {
                console.error("Something is wrong.", err);
                reject(err);
              } else {
                const testEvent = this.processXml(result);
                resolve(testEvent);
              }
            });
          } catch (e) {
            reject(e);
          }
        }
      );
    }).then(
      (testEvent: TestEvent) => {
        this.proc = undefined;
        this.parent.releaseSlot();
        this.adapter.testStatesEmitter.fire(testEvent);
      },
      (err: Error) => {
        this.proc = undefined;
        this.parent.releaseSlot();
        this.adapter.testStatesEmitter.fire({
          type: "test",
          test: this,
          state: "failed",
          message: err.toString()
        });
      }
    );
  }

  private processXml(result: any): TestEvent {
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

    if (
      (this.file == undefined || this.line == undefined) &&
      testCase.$.hasOwnProperty("filename") &&
      testCase.$.hasOwnProperty("line")
    ) {
      const filePath = this.execOptions.cwd
        ? path.resolve(this.execOptions.cwd, testCase.$.filename)
        : testCase.$.filename;
      this.file = filePath;
      this.line = Number(testCase.$.line) - 1 /*It looks Catch2 works like this.*/;
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
        decorations: decorations.length ? decorations : undefined
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

export class TaskPool {
  constructor(private availableSlot: number) {}

  acquire(): boolean {
    if (this.availableSlot == 0) return false;
    this.availableSlot -= 1;
    return true;
  }

  release(): void {
    this.availableSlot += 1;
  }
}
