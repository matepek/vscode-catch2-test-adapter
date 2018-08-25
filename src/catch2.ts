//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the public
// domain. The author hereby disclaims copyright to this source code.

import { ChildProcess, ExecFileOptions, execFile } from "child_process";
import {
  TestDecoration,
  TestEvent,
  TestInfo,
  TestSuiteInfo,
  TestSuiteEvent
} from "vscode-test-adapter-api";
import { Catch2TestAdapter } from "./adapter";
import * as xml2js from "xml2js";
import * as path from "path";

export class TestTaskPool {
  constructor(
    private availableSlot: number,
    private readonly parentPool: TestTaskPool | undefined
  ) {}

  acquire(): boolean {
    if (this.availableSlot == 0) return false;
    this.availableSlot -= 1;

    if (this.parentPool !== undefined) {
      if (this.parentPool.acquire()) {
        return true;
      } else {
        this.availableSlot += 1;
        return false;
      }
    }
    return true;
  }

  release(): void {
    if (this.parentPool !== undefined) {
      this.parentPool.release();
    }
    this.availableSlot += 1;
  }
}

export interface TaskInfo {
  taskPool: TestTaskPool;
}

export interface ExtendedTestSuiteInfo extends TestSuiteInfo, TaskInfo {}

export interface ExtendedTestInfo extends TestInfo, TaskInfo {
  execPath: string;
  execParams: Array<string>;
  execOptions: ExecFileOptions;
}

export class TestTask {
  private isKill: boolean = false;
  private proc: ChildProcess | undefined = undefined;
  private children: TestTask[] = [];
  private readonly promise: Promise<void>;

  constructor(
    private readonly adapter: Catch2TestAdapter,
    private readonly info: TestSuiteInfo | TestInfo
  ) {
    if (info.type == "suite") {
      adapter.testStatesEmitter.fire(<TestSuiteEvent>{
        type: "suite",
        suite: info,
        state: "running"
      });

      let ps: Promise<void>[] = [];
      info.children.forEach(child => {
        const task = new TestTask(adapter, child);
        this.children.push(task);
        ps.push(task.getPromise());
      });

      this.promise = Promise.all(ps).then(
        () => {
          adapter.testStatesEmitter.fire(<TestSuiteEvent>{
            type: "suite",
            suite: info,
            state: "completed"
          });
        },
        (err: Error) => {
          console.error("Serious error.", err);
        }
      );
    } else {
      this.adapter.testStatesEmitter.fire(<TestEvent>{
        type: "test",
        test: info,
        state: "running"
      });

      this.promise = this.test().then(
        () => {},
        (err: Error) => {
          console.error("Serious error.", err);
        }
      );
    }
  }

  getPromise(): Promise<void> {
    return this.promise;
  }

  cancel(): void {
    this.isKill = true;
    this.children.forEach(child => {
      child.cancel();
    });
    if (this.proc) {
      this.proc.kill();
    }
  }

  private test(): Promise<void> {
    const catch2Info = <ExtendedTestInfo>this.info;
    if (!catch2Info.taskPool.acquire()) {
      return new Promise<void>(r => setTimeout(r, 64)).then(() => {
        return this.test();
      });
    }

    return new Promise<TestEvent>((resolve, reject) => {
      if (this.isKill) {
        reject(Error(this.info.label + " was killed."));
      }

      this.proc = execFile(
        catch2Info.execPath,
        catch2Info.execParams,
        catch2Info.execOptions,
        (error: Error | null, stdout: string, stderr: string) => {
          try {
            // error code means test failure

            let parser = new xml2js.Parser();

            parser.parseString(stdout, (err: any, result: any) => {
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
          } finally {
            this.proc = undefined;
          }
        }
      );
    }).then(
      testEvent => {
        this.adapter.testStatesEmitter.fire(testEvent);
        catch2Info.taskPool.release();
      },
      (err: Error) => {
        this.adapter.testStatesEmitter.fire(<TestEvent>{
          type: "test",
          test: catch2Info,
          state: "failed",
          message: err.toString()
        });
        catch2Info.taskPool.release();
      }
    );
  }

  private processXml(result: any): TestEvent {
    const catch2Info = <ExtendedTestInfo>this.info;

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
      catch2Info.label.indexOf(testCase.$.description) == -1
    ) {
      catch2Info.label += " | " + testCase.$.description;
    }

    if (
      (catch2Info.file == undefined || catch2Info.line == undefined) &&
      testCase.$.hasOwnProperty("filename") &&
      testCase.$.hasOwnProperty("line")
    ) {
      const filePath = catch2Info.execOptions.cwd
        ? path.resolve(catch2Info.execOptions.cwd, testCase.$.filename)
        : testCase.$.filename;
      catch2Info.file = filePath;
      catch2Info.line = Number(testCase.$.line) - 1 /*It looks Catch2 works like this.*/;
    }

    try {
      let message = undefined;
      let decorations = undefined;
      let success = false;
      [message, decorations, success] = this.processXmlTagTestCaseInner(testCase, "");
      const testEvent: TestEvent = {
        type: "test",
        test: catch2Info,
        state: success ? "passed" : "failed",
        message: message.length ? message : undefined,
        decorations: decorations.length ? decorations : undefined
      };
      return testEvent;
    } catch (e) {
      throw e;
    }
  }

  processXmlTagTestCaseInner(testCase: any, title: string): [string, TestDecoration[], boolean] {
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

  processXmlTagExpressionInner(expr: any, title: string): [string, TestDecoration[]] {
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

  processXmlTagSectionInner(section: any, title: string): [string, TestDecoration[]] {
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
