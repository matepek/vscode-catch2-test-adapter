//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import {ChildProcess, spawn, SpawnOptions} from 'child_process';
import {TestDecoration, TestEvent, TestInfo, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';

import {Catch2TestAdapter} from './adapter';
import {TaskPool} from './TaskPool';

////////////////////
////////////////////

export class C2AllTestSuiteInfo implements TestSuiteInfo {
  readonly type: 'suite' = 'suite';
  readonly id: string;
  readonly label: string = 'AllTests';
  readonly children: C2TestSuiteInfo[] = [];
  private readonly taskPool: TaskPool;

  constructor(private readonly adapter: Catch2TestAdapter, slotCount: number) {
    this.id = adapter.generateUniqueId();
    this.taskPool = new TaskPool(slotCount);
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
    const suite = new C2TestSuiteInfo(
        label, this.adapter, [this.taskPool], execPath, execOptions);

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

  run(tests: string[]): Promise<void> {
    this.adapter.testStatesEmitter.fire(
        <TestRunStartedEvent>{type: 'started', tests: tests});

    // everybody should remove what they use from it.
    // and put their children into if they are in it
    const testSet = new Set(tests);

    if (testSet.delete(this.id)) {
      this.children.forEach(child => {
        testSet.add(child.id);
      });
    }

    const ps: Promise<void>[] = [];
    this.children.forEach(child => {
      ps.push(child.run(testSet));
    });

    if (testSet.size > 0) {
      this.adapter.log.error('Some tests have remained.');
    }

    const always = () => {
      this.adapter.testStatesEmitter.fire(
          <TestRunFinishedEvent>{type: 'finished'});
    };

    return Promise.all(ps).then(always, always);
  }
}

export class C2TestSuiteInfo implements TestSuiteInfo {
  readonly type: 'suite' = 'suite';
  readonly id: string;
  readonly children: C2TestInfo[] = [];
  file?: string = undefined;
  line?: number = undefined;

  private isKill: boolean = false;
  private proc: ChildProcess|undefined = undefined;

  constructor(
      public readonly label: string,
      private readonly adapter: Catch2TestAdapter,
      private readonly taskPools: TaskPool[], public readonly execPath: string,
      public readonly execOptions: SpawnOptions) {
    this.id = adapter.generateUniqueId();
  }

  createChildTest(
      testName: string, description: string, tags: string[], file: string,
      line: number): C2TestInfo {
    const test = new C2TestInfo(
        testName, description, tags, file, line - 1, this, this.adapter);

    if (this.children.length == 0) {
      this.file = file;
      this.line = 0;
    }

    this.children.push(test);
    // this.children.sort((a: C2TestInfo, b: C2TestInfo): number => {
    //  return a.testNameTrimmed.localeCompare(b.testNameTrimmed);
    //});

    return test;
  }

  acquireSlot(): boolean {
    let i: number = 0;
    while (i < this.taskPools.length && this.taskPools[i].acquire()) ++i;

    if (i == this.taskPools.length) return true;

    while (--i >= 0) this.taskPools[i].release();  // rollback

    return false;
  }

  releaseSlot(): void {
    let i: number = this.taskPools.length;

    while (--i >= 0) this.taskPools[i].release();
  }

  cancel(): void {
    this.isKill = true;

    if (this.proc != undefined) {
      this.proc.kill();
      this.proc = undefined;
    }
  }

  run(tests: Set<string>): Promise<void> {
    this.isKill = false;
    this.proc = undefined;

    if (tests.delete(this.id)) {
      this.children.forEach(c => {
        tests.delete(c.id);
      });

      return this.runInner('all');
    } else {
      let childrenToRun: C2TestInfo[] = [];

      this.children.forEach(c => {
        if (tests.delete(c.id)) childrenToRun.push(c);
      });

      if (childrenToRun.length == 0) return Promise.resolve();

      return this.runInner(childrenToRun);
    }
  }

  private runInner(childrenToRun: (C2TestInfo[]|'all')): Promise<void> {
    if (this.isKill) return Promise.reject(Error('Test was killed.'));

    if (!this.acquireSlot()) {
      return new Promise<void>(resolve => setTimeout(resolve, 64)).then(() => {
        return this.runInner(childrenToRun);
      });
    }

    const execParams: string[] = [];
    if (childrenToRun != 'all') {
      let testNames: string[] = [];
      childrenToRun.forEach(c => {
        /*',' has special meaning */
        testNames.push(c.getEscapedTestName());
      });
      execParams.push(testNames.join(','));
    } else {
      this.children.forEach(c => {
        if (c.skipped) {
          this.adapter.testStatesEmitter.fire(c.getStartEvent());
          this.adapter.testStatesEmitter.fire(c.getSkippedEvent());
        }
      });
    }
    execParams.push('--reporter');
    execParams.push('xml');

    this.adapter.testStatesEmitter.fire(
        <TestSuiteEvent>{type: 'suite', suite: this, state: 'running'});

    this.proc = spawn(this.execPath, execParams, this.execOptions);
    let resolver: Function|undefined = undefined;
    const p = new Promise<void>((resolve, reject) => {
      resolver = resolve;
    });

    const data:
        {[prop: string]:
             any} = {buffer: '', currentChild: undefined, inTestCase: false};

    const processChunk = (chunk: string, isEnd: boolean) => {
      data.buffer = data.buffer + chunk;
      do {
        if (!data.inTestCase) {
          const testCaseTag = '<TestCase name="';
          const b = data.buffer.indexOf(testCaseTag);
          if (b == -1) return;
          const ee = data.buffer.indexOf('>', b + testCaseTag.length + 1);
          if (ee == -1) return;
          const e = data.buffer.indexOf('"', b + testCaseTag.length + 1);
          const name = data.buffer.substring(b + testCaseTag.length, e);

          data.inTestCase = true;

          data.currentChild = this.children.find((v: C2TestInfo) => {
            return v.testNameTrimmed == name;
          });

          if (data.currentChild != undefined) {
            const ev = data.currentChild.getStartEvent();
            this.adapter.testStatesEmitter.fire(ev);
          } else {
            this.adapter.log.error('Tescase not found in children: ' + name);
          }

          data.buffer = data.buffer.substr(b);
        } else {
          const endTestCase = '</TestCase>';
          const b = data.buffer.indexOf(endTestCase);
          if (b == -1) return;

          if (data.currentChild != undefined) {
            try {
              const ev: TestEvent = data.currentChild.parseAndProcessTestCase(
                  data.buffer.substring(0, b + endTestCase.length));
              if (!this.adapter.getIsEnabledSourceDecoration())
                ev.decorations = undefined;
              this.adapter.testStatesEmitter.fire(ev);
            } catch (e) {
              this.adapter.log.error(
                  'Parsing and processing test: ' + data.currentChild.label);
            }
          }

          data.inTestCase = false;
          data.currentChild = undefined;
          data.buffer = data.buffer.substr(b + endTestCase.length);
        }
      } while (data.buffer.length > 0);
    };

    this.proc.stdout.on('data', (chunk: Uint8Array) => {
      const xml = chunk.toLocaleString();
      processChunk(xml, false);
    });

    this.proc.stdout.on('end', () => {
      processChunk('', true);
    });

    this.proc.on('close', (code: number) => {
      if (resolver != undefined) resolver();
    });

    return p
        .then(() => {
          this.releaseSlot();
          this.proc = undefined;
        })
        .catch((err: Error) => {
          this.releaseSlot();
          this.adapter.log.error(err.message);
        })
        .then(() => {
          this.adapter.testStatesEmitter.fire(
              <TestSuiteEvent>{type: 'suite', suite: this, state: 'completed'});
        });
  }
}

export class C2TestInfo implements TestInfo {
  readonly type: 'test' = 'test';
  readonly id: string;
  readonly label: string;
  readonly skipped: boolean;
  readonly testNameFull: string;
  readonly testNameTrimmed: string;

  constructor(
      testName: string, description: string, tags: string[],
      public readonly file: string, public readonly line: number,
      public readonly parent: C2TestSuiteInfo, adapter: Catch2TestAdapter) {
    this.testNameFull = testName;
    this.testNameTrimmed = testName.trim();
    this.skipped = tags.indexOf('[.]') != -1;
    this.label = testName + (tags.length > 0 ? ' ' + tags.join('') : '');
    this.id = adapter.generateUniqueId();
  }

  getEscapedTestName(): string {
    let t = this.testNameFull.replace(',', '\\,');
    if (t[0] == ' ') t = '*' + t.substr(1);
    return t;
  }

  getStartEvent(): TestEvent {
    return {type: 'test', test: this, state: 'running'};
  }

  getSkippedEvent(): TestEvent {
    return {type: 'test', test: this, state: 'skipped'};
  }

  parseAndProcessTestCase(xmlStr: string): TestEvent {
    let res: any = undefined;
    new xml2js.Parser({explicitArray: true})
        .parseString(xmlStr, (err: any, result: any) => {
          if (err) {
            throw err;
          } else {
            res = result;
          }
        });

    return this.processXmlTagTestCase(res.TestCase);
  }

  private processXmlTagTestCase(testCase: any): TestEvent {
    try {
      let message = undefined;
      let decorations = undefined;
      let success = false;
      [message, decorations, success] =
          this.processXmlTagTestCaseInner(testCase, '');
      const testEvent: TestEvent = {
        type: 'test',
        test: this,
        state: success ? 'passed' : 'failed',
        message: message.length ? message : undefined,
        decorations: decorations.length ? decorations : undefined
      };

      return testEvent;
    } catch (e) {
      throw e;
    }
  }

  private processXmlTagTestCaseInner(testCase: any, title: string):
      [string, TestDecoration[], boolean] {
    title = testCase.$.name + '(line: ' + testCase.$.line + ')';
    let message = '';
    let decorations: TestDecoration[] = [];
    let success = false;

    if (testCase.OverallResult[0].$.success === 'true') {
      success = true;
    }

    if (testCase.hasOwnProperty('Expression')) {
      for (let j = 0; j < testCase.Expression.length; ++j) {
        try {
          let messageL = undefined;
          let decorationsL = undefined;
          [messageL, decorationsL] =
              this.processXmlTagExpressionInner(testCase.Expression[j], title);
          message += messageL;
          decorations = decorations.concat(decorationsL);
        } catch (error) {
        }
      }
    }

    if (testCase.hasOwnProperty('Section')) {
      for (let j = 0; j < testCase.Section.length; ++j) {
        try {
          let messageL = undefined;
          let decorationsL = undefined;
          [messageL, decorationsL] =
              this.processXmlTagSectionInner(testCase.Section[j], title);
          message += messageL;
          decorations = decorations.concat(decorationsL);
        } catch (error) {
        }
      }
    }

    return [message, decorations, success];
  }

  private processXmlTagExpressionInner(expr: any, title: string):
      [string, TestDecoration[]] {
    let message = '';
    let decorations: TestDecoration[] = [];

    message += '>>> ' + title + ' ' + expr.$.type + ' (line: ' + expr.$.line +
        ')' +
        ' \n';
    message += '  Original:\n    ';
    message += expr.Original.map((x: string) => x.trim()).join(' | ');
    message += '\n  Expanded:\n    ';
    message += expr.Expanded.map((x: string) => x.trim()).join(' | ') + '\n';
    message += '<<<\n';
    decorations.push({
      line: Number(expr.$.line) - 1 /*It looks cathc works like this.*/,
      message:
          'Expanded: ' + expr.Expanded.map((x: string) => x.trim()).join(' | ')
    });

    return [message, decorations];
  }

  private processXmlTagSectionInner(section: any, title: string):
      [string, TestDecoration[]] {
    title += ' | ' + section.$.name + '(line: ' + section.$.line + ')';
    let message = '';
    let decorations: TestDecoration[] = [];

    if (section.hasOwnProperty('Expression')) {
      for (let j = 0; j < section.Expression.length; ++j) {
        try {
          let messageL = undefined;
          let decorationsL = undefined;
          [messageL, decorationsL] =
              this.processXmlTagExpressionInner(section.Expression[j], title);
          message += messageL;
          decorations = decorations.concat(decorationsL);
        } catch (error) {
        }
      }
    }

    if (section.hasOwnProperty('Section')) {
      for (let j = 0; j < section.Section.length; ++j) {
        try {
          let messageL = undefined;
          let decorationsL = undefined;
          [messageL, decorationsL] =
              this.processXmlTagSectionInner(section.Section[j], title);
          message += messageL;
          decorations = decorations.concat(decorationsL);
        } catch (error) {
        }
      }
    }

    return [message, decorations];
  }
}
