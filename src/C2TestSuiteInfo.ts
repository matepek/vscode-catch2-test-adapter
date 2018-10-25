//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import {ChildProcess, spawn, SpawnOptions} from 'child_process';
import * as path from 'path';
import {TestEvent, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';

import {C2TestAdapter} from './C2TestAdapter';
import {C2TestInfo} from './C2TestInfo';
import * as c2fs from './FsWrapper';
import {generateUniqueId} from './IdGenerator';
import {TaskPool} from './TaskPool';

export class C2TestSuiteInfo implements TestSuiteInfo {
  readonly type: 'suite' = 'suite';
  readonly id: string;
  children: C2TestInfo[] = [];
  file?: string = undefined;
  line?: number = undefined;

  private isKill: boolean = false;
  private proc: ChildProcess|undefined = undefined;

  constructor(
      public readonly label: string, private readonly adapter: C2TestAdapter,
      public readonly execPath: string,
      public readonly execOptions: SpawnOptions) {
    this.id = generateUniqueId();
  }

  createChildTest(
      testName: string, description: string, tags: string[], file: string,
      line: number): C2TestInfo {
    const test =
        new C2TestInfo(testName, description, tags, file, line - 1, this);

    if (this.children.length == 0) {
      this.file = file;
      this.line = 0;
    } else if (this.file != file) {
      this.file = undefined;
      this.line = undefined;
    }

    this.children.push(test);

    return test;
  }

  cancel(): void {
    this.isKill = true;

    if (this.proc != undefined) {
      this.proc.kill();
      this.proc = undefined;
    }
  }

  run(tests: Set<string>, taskPool: TaskPool): Promise<void> {
    this.isKill = false;
    this.proc = undefined;

    if (tests.delete(this.id)) {
      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        tests.delete(c.id);
      }

      return this.runInner('all', taskPool);
    } else {
      let childrenToRun: C2TestInfo[] = [];

      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        if (tests.delete(c.id)) childrenToRun.push(c);
      }

      if (childrenToRun.length == 0) return Promise.resolve();

      return this.runInner(childrenToRun, taskPool);
    }
  }

  private runInner(childrenToRun: C2TestInfo[]|'all', taskPool: TaskPool):
      Promise<void> {
    if (this.isKill) return Promise.reject(Error('Test was killed.'));

    if (!taskPool.acquire()) {
      return new Promise<void>(resolve => setTimeout(resolve, 64)).then(() => {
        return this.runInner(childrenToRun, taskPool);
      });
    }

    this.adapter.testStatesEmitter.fire(
        <TestSuiteEvent>{type: 'suite', suite: this, state: 'running'});

    const execParams: string[] = [];
    if (childrenToRun != 'all') {
      let testNames: string[] = [];
      for (let i = 0; i < childrenToRun.length; i++) {
        const c = childrenToRun[i];
        /*',' has special meaning */
        testNames.push(c.getEscapedTestName());
      }
      execParams.push(testNames.join(','));
    } else {
      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        if (c.skipped) {
          this.adapter.testStatesEmitter.fire(c.getStartEvent());
          this.adapter.testStatesEmitter.fire(c.getSkippedEvent());
        }
      }
    }
    execParams.push('--reporter');
    execParams.push('xml');
    execParams.push('--durations')
    execParams.push('yes');
    {
      const rng = this.adapter.getRngSeed();
      if (rng != null) {
        execParams.push('--rng-seed')
        execParams.push(rng.toString());
      }
    }

    this.proc = spawn(this.execPath, execParams, this.execOptions);
    let pResolver: Function|undefined = undefined;
    let pRejecter: Function|undefined = undefined;
    const p = new Promise<void>((resolve, reject) => {
      pResolver = resolve;
      pRejecter = reject;
    });

    const data = new class {
      buffer: string = '';
      currentChild: C2TestInfo|undefined = undefined;
      beforeFirstTestCase: boolean = true;
      rngSeed: number|undefined = undefined;
      inTestCase(): boolean {
        return this.currentChild != undefined;
      };
    }
    ();

    const processChunk = (chunk: string) => {
      data.buffer = data.buffer + chunk;
      do {
        if (!data.inTestCase()) {
          const b = data.buffer.indexOf('<TestCase');
          if (b == -1) return;

          const testCaseTagRe = '<TestCase(?:\\s+[^\n]+)?>';
          const m = data.buffer.match(testCaseTagRe);
          if (m == null || m.length != 1) return;
          let name: string = '';
          new xml2js.Parser({explicitArray: true})
              .parseString(m[0] + '</TestCase>', (err: any, result: any) => {
                if (err) {
                  this.adapter.log.error(err.toString());
                  throw err;
                } else {
                  name = result.TestCase.$.name;
                }
              });

          if (data.beforeFirstTestCase) {
            const ri =
                data.buffer.match('<Randomness\\s+seed="([0-9]+)"\\s*/?>');
            if (ri != null && ri.length == 2) {
              data.rngSeed = Number(ri[1]);
            }
          }
          data.beforeFirstTestCase = false;
          data.currentChild = this.children.find((v: C2TestInfo) => {
            return v.testNameTrimmed == name;
          });

          if (data.currentChild != undefined) {
            const ev = data.currentChild.getStartEvent();
            this.adapter.testStatesEmitter.fire(ev);
          } else {
            this.adapter.log.error('TestCase not found in children: ' + name);
          }

          data.buffer = data.buffer.substr(b);
        } else {
          const endTestCase = '</TestCase>';
          const b = data.buffer.indexOf(endTestCase);
          if (b == -1) return;

          if (data.currentChild != undefined) {
            try {
              const ev: TestEvent = data.currentChild.parseAndProcessTestCase(
                  data.buffer.substring(0, b + endTestCase.length),
                  data.rngSeed);
              if (!this.adapter.getIsEnabledSourceDecoration())
                ev.decorations = undefined;
              this.adapter.testStatesEmitter.fire(ev);
            } catch (e) {
              this.adapter.log.error(
                  'Parsing and processing test: ' + data.currentChild.label);
            }
          }

          data.currentChild = undefined;
          data.buffer = data.buffer.substr(b + endTestCase.length);
        }
      } while (data.buffer.length > 0);
    };

    this.proc.stdout.on('data', (chunk: Uint8Array) => {
      const xml = chunk.toLocaleString();
      processChunk(xml);
    });

    this.proc.on('close', (code: number) => {
      if (data.inTestCase()) {
        (pRejecter != undefined) && pRejecter();
      } else {
        (pResolver != undefined) && pResolver();
      }
    });

    const suiteFinally = () => {
      this.proc = undefined;
      taskPool.release();
      this.adapter.testStatesEmitter.fire(
          <TestSuiteEvent>{type: 'suite', suite: this, state: 'completed'});
    };
    return p
        .then(() => {
          suiteFinally();
        })
        .catch((err: Error) => {
          if (data.inTestCase()) {
            this.adapter.testStatesEmitter.fire({
              type: 'test',
              test: data.currentChild!,
              state: 'failed',
              message: 'Unexpected test error. (Is Catch2 crashed?)\n'
            });
          }
          suiteFinally();
          try {
            this.adapter.log.error(err.message);
          } catch (e) {
          }
        });
  }

  reloadChildren(): Promise<void> {
    return c2fs.existsAsync(this.execPath).then((exists: boolean) => {
      if (!exists) throw new Error('Path not exists: ' + this.execPath);
      return c2fs
          .spawnAsync(
              this.execPath,
              [
                '[.],*', '--verbosity', 'high', '--list-tests', '--use-colour',
                'no'
              ],
              this.execOptions)
          .then((r) => {
            const oldChildren = this.children;
            this.children = [];

            let lines = r.stdout.split(/\r?\n/);

            if (lines.length == 0) this.adapter.log.error('Empty test list.');

            while (lines[lines.length - 1].trim().length == 0) lines.pop();

            let i = 1;
            while (i < lines.length - 1) {
              if (lines[i][0] != ' ')
                this.adapter.log.error(
                    'Wrong test list output format: ' + lines.toString());

              const testNameFull = lines[i++].substr(2);

              let filePath = '';
              let line = 0;
              {
                const fileLine = lines[i++].substr(4);
                const match =
                    fileLine.match(/(?:(.+):([0-9]+)|(.+)\(([0-9]+)\))/);
                if (match && match.length == 5) {
                  filePath = match[1] ? match[1] : match[3];
                  filePath =
                      path.resolve(path.dirname(this.execPath), filePath);
                  if (!c2fs.existsSync(filePath) && this.execOptions.cwd) {
                    const r = path.resolve(this.execOptions.cwd, filePath);
                    if (c2fs.existsSync(r)) filePath = r;
                  }
                  line = Number(match[2] ? match[2] : match[4]);
                }
              }

              let description = lines[i++].substr(4);
              if (description.startsWith('(NO DESCRIPTION)')) description = '';

              let tags: string[] = [];
              if (lines[i].length > 6 && lines[i][6] === '[') {
                tags = lines[i].trim().split(']');
                tags.pop();
                for (let j = 0; j < tags.length; ++j) tags[j] += ']';
                ++i;
              }

              const index = oldChildren.findIndex(
                  (c: C2TestInfo): boolean => {return c.testNameFull ==
                                               testNameFull});
              if (index != -1 &&
                  oldChildren[index].label ==
                      C2TestInfo.generateLabel(
                          testNameFull, description, tags)) {
                this.children.push(oldChildren[index]);
              } else {
                this.createChildTest(
                    testNameFull, description, tags, filePath, line);
              }
            }
          });
    });
  }
}
