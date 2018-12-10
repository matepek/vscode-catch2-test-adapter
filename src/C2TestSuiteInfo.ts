//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import * as path from 'path';
import { inspect } from 'util';
import { TestEvent, TestSuiteInfo } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';

import { C2AllTestSuiteInfo } from './C2AllTestSuiteInfo';
import { C2TestInfo } from './C2TestInfo';
import * as c2fs from './FsWrapper';
import { generateUniqueId } from './IdGenerator';
import { TaskPool } from './TaskPool';

export class C2TestSuiteInfo implements TestSuiteInfo {
  readonly type: 'suite' = 'suite';
  readonly id: string;
  label: string;
  children: C2TestInfo[] = [];
  file?: string = undefined;
  line?: number = undefined;

  catch2Version: [number, number, number] | undefined = undefined;
  private _isKill: boolean = false;
  private _proc: ChildProcess | undefined = undefined;

  constructor(
    public readonly origLabel: string,
    private readonly allTests: C2AllTestSuiteInfo,
    public readonly execPath: string,
    public readonly execOptions: SpawnOptions) {
    this.label = origLabel;
    this.id = generateUniqueId();
  }

  createChildTest(
    id: string | undefined, testName: string, description: string,
    tags: string[], file: string, line: number): C2TestInfo {
    const test =
      new C2TestInfo(id, testName, description, tags, file, line - 1, this);

    if (this.children.length == 0) {
      this.file = file;
      this.line = 0;
    } else if (this.file != file) {
      this.file = undefined;
      this.line = undefined;
    }

    let i = this.children.findIndex((v: C2TestInfo) => {
      const f = test.file.trim().localeCompare(v.file.trim());
      if (f != 0)
        return f < 0;
      else
        return test.line < v.line;
    });
    if (i == -1) i = this.children.length;
    this.children.splice(i, 0, test);

    return test;
  }

  cancel(): void {
    this.allTests.log.info(
      'canceled: ' + inspect([this.id, this.label, this._proc != undefined]));

    this._isKill = true;

    if (this._proc != undefined) {
      this._proc.kill();
      this._proc = undefined;
    }
  }

  run(tests: Set<string>, taskPool: TaskPool): Promise<void> {
    this._isKill = false;
    this._proc = undefined;

    if (tests.delete(this.id)) {
      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        tests.delete(c.id);
      }

      return this._runInner('all', taskPool);
    } else {
      let childrenToRun: C2TestInfo[] = [];

      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        if (tests.delete(c.id)) childrenToRun.push(c);
      }

      if (childrenToRun.length == 0) return Promise.resolve();

      return this._runInner(childrenToRun, taskPool);
    }
  }

  private _runInner(childrenToRun: C2TestInfo[] | 'all', taskPool: TaskPool):
    Promise<void> {
    if (this._isKill) return Promise.reject(Error('Test was killed.'));

    if (!taskPool.acquire()) {
      return new Promise<void>(resolve => setTimeout(resolve, 64)).then(() => {
        return this._runInner(childrenToRun, taskPool);
      });
    }

    this.allTests.testStatesEmitter.fire(
      { type: 'suite', suite: this, state: 'running' });

    const execParams: string[] = [];
    if (childrenToRun !== 'all') {
      let testNames: string[] = [];
      for (let i = 0; i < childrenToRun.length; i++) {
        const c = childrenToRun[i];
        testNames.push(c.getEscapedTestName());
      }
      execParams.push(testNames.join(','));
    } else {
      for (let i = 0; i < this.children.length; i++) {
        const c = this.children[i];
        if (c.skipped) {
          this.allTests.testStatesEmitter.fire(c.getStartEvent());
          this.allTests.testStatesEmitter.fire(c.getSkippedEvent());
        }
      }
    }
    execParams.push('--reporter');
    execParams.push('xml');
    execParams.push('--durations')
    execParams.push('yes');
    if (this.allTests.isNoThrow) execParams.push('--nothrow');
    {
      const rng = this.allTests.rngSeed;
      if (rng != null) {
        execParams.push('--rng-seed')
        execParams.push(rng.toString());
      }
    }

    this._proc = spawn(this.execPath, execParams, this.execOptions);
    this.allTests.log.info(
      'proc started: ' + inspect([this.execPath, execParams]));
    let pResolver: Function | undefined = undefined;
    let pRejecter: Function | undefined = undefined;
    const p = new Promise<void>((resolve, reject) => {
      pResolver = resolve;
      pRejecter = reject;
    });

    const data = new class {
      buffer: string = '';
      inTestCase: boolean = false;
      currentChild: C2TestInfo | undefined = undefined;
      beforeFirstTestCase: boolean = true;
      rngSeed: number | undefined = undefined;
      unporessedXmlTestCases: string[] = [];
      processedTestCases: C2TestInfo[] = [];
    }
      ();

    const testCaseTagRe = /<TestCase(?:\s+[^\n\r]+)?>/;

    const processChunk = (chunk: string) => {
      data.buffer = data.buffer + chunk;
      let invariant = 99999;
      do {
        if (!data.inTestCase) {
          const b = data.buffer.indexOf('<TestCase');
          if (b == -1) return;

          const m = data.buffer.match(testCaseTagRe);
          if (m == null || m.length != 1) return;

          data.inTestCase = true;

          let name: string = '';
          new xml2js.Parser({ explicitArray: true })
            .parseString(m[0] + '</TestCase>', (err: any, result: any) => {
              if (err) {
                this.allTests.log.error(err.toString());
                throw err;
              } else {
                name = result.TestCase.$.name;
              }
            });

          if (data.beforeFirstTestCase) {
            const ri =
              data.buffer.match(/<Randomness\s+seed="([0-9]+)"\s*\/?>/);
            if (ri != null && ri.length == 2) {
              data.rngSeed = Number(ri[1]);
            }
          }

          data.beforeFirstTestCase = false;
          data.currentChild = this.children.find((v: C2TestInfo) => {
            return v.testNameTrimmed == name;
          });

          if (data.currentChild !== undefined) {
            const ev = data.currentChild.getStartEvent();
            this.allTests.testStatesEmitter.fire(ev);
          } else {
            this.allTests.log.error('TestCase not found in children: ' + name);
          }

          data.buffer = data.buffer.substr(b);
        } else {
          const endTestCase = '</TestCase>';
          const b = data.buffer.indexOf(endTestCase);
          if (b == -1) return;

          const testCaseXml = data.buffer.substring(0, b + endTestCase.length);

          if (data.currentChild !== undefined) {
            try {
              const ev: TestEvent = data.currentChild.parseAndProcessTestCase(
                testCaseXml, data.rngSeed);
              if (!this.allTests.isEnabledSourceDecoration)
                ev.decorations = undefined;
              this.allTests.testStatesEmitter.fire(ev);
              data.processedTestCases.push(data.currentChild);
            } catch (e) {
              this.allTests.log.error(
                'parsing and processing test: ' + data.currentChild.label);
            }
          } else {
            this.allTests.log.info(
              '<TestCase> found without TestInfo: ' + inspect(this, true, 1) +
              '; ' + testCaseXml);
            data.unporessedXmlTestCases.push(testCaseXml);
          }

          data.inTestCase = false;
          data.currentChild = undefined;
          data.buffer = data.buffer.substr(b + endTestCase.length);
        }
      } while (data.buffer.length > 0 && --invariant > 0);
      if (invariant == 0) {
        this._proc && this._proc.kill();
        pRejecter && pRejecter('Possible infinite loop of this extension');
      }
    };

    this._proc.stdout.on('data', (chunk: Uint8Array) => {
      const xml = chunk.toLocaleString();
      processChunk(xml);
    });

    this._proc.on('close', (code: number | null, signal: string | null) => {
      if (code !== null && code !== undefined)
        pResolver && pResolver(code);
      if (signal !== null && signal !== undefined)
        pRejecter && pRejecter(signal);
      else
        pRejecter && pRejecter('unknown');
    });

    return p.catch(
      (reason: any) => {
        this.allTests.log.error(inspect(reason));
      }).then(() => {
        if (data.inTestCase) {
          if (data.currentChild !== undefined) {
            this.allTests.log.warn('data.currentChild !== undefined: ' + inspect(data));
            this.allTests.testStatesEmitter.fire({
              type: 'test',
              test: data.currentChild!,
              state: 'failed',
              message: 'Unexpected test error. (Is Catch2 crashed?)\n'
            });
          } else {
            this.allTests.log.warn('data.inTestCase: ' + inspect(data));
          }
        }

        this.allTests.log.info(
          'proc finished: ' + inspect([this.execPath, execParams]));

        this._proc = undefined;
        taskPool.release();
        this.allTests.testStatesEmitter.fire(
          { type: 'suite', suite: this, state: 'completed' });

        const isTestRemoved = (childrenToRun === 'all' &&
          this.children.filter(c => !c.skipped).length >
          data.processedTestCases.length) ||
          (childrenToRun !== 'all' && data.processedTestCases.length == 0);

        if (data.unporessedXmlTestCases.length > 0 || isTestRemoved) {
          this.allTests
            .sendLoadEvents(() => {
              return this.reloadChildren().catch(e => {
                this.allTests.log.error(
                  'reloading-error: ' + inspect(e));
                // Suite possibly deleted: It is a dead suite.
              });
            })
            .then(() => {
              // we have test results for the newly detected tests
              // after reload we can set the results
              const events: TestEvent[] = [];

              for (let i = 0; i < data.unporessedXmlTestCases.length; i++) {
                const testCaseXml = data.unporessedXmlTestCases[i];

                const m = testCaseXml.match(testCaseTagRe);
                if (m == null || m.length != 1) break;

                let name: string | undefined = undefined;
                new xml2js.Parser({ explicitArray: true })
                  .parseString(
                    m[0] + '</TestCase>', (err: any, result: any) => {
                      if (err) {
                        this.allTests.log.error(err.toString());
                      } else {
                        name = result.TestCase.$.name;
                      }
                    });
                if (name === undefined) break;

                const currentChild = this.children.find((v: C2TestInfo) => {
                  return v.testNameTrimmed == name;
                });
                if (currentChild === undefined) break;

                const ev = currentChild.parseAndProcessTestCase(
                  testCaseXml, data.rngSeed);
                events.push(currentChild.getStartEvent());
                events.push(ev);
              }
              events.length && this._sendTestStateEventsWithParent(events);
            });
        }
      });
  }

  reloadChildren(): Promise<void> {
    return c2fs.spawnAsync(this.execPath, ['--help'])
      .then((res): [number, number, number] => {
        const m = res.stdout.match(/Catch v([0-9]+)\.([0-9]+)\.([0-9]+)\s?/);
        if (m == undefined || m.length != 4)
          throw Error(
            'reloadChildren: ' + path + ': not a Catch2 executable');
        return [
          Number(m[1].valueOf()), Number(m[2].valueOf()),
          Number(m[3].valueOf())
        ];
      })
      .then((catch2Version: [number, number, number]) => {
        if (catch2Version[0] > 2 || catch2Version[0] < 2)
          this.allTests.log.warn('Unsupported Cathc2 version: ' + inspect(catch2Version));
        this.catch2Version = catch2Version;
        return c2fs
          .spawnAsync(
            this.execPath,
            [
              "[.],*", "--verbosity", "high", "--list-tests",
              "--use-colour", "no"
            ],
            this.execOptions)
          .then((catch2TestListOutput) => {
            try {
              const oldChildren = this.children;
              this.children = [];

              let lines = catch2TestListOutput.stdout.split(/\r?\n/);

              while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

              if (lines.length == 0)
                throw Error('Wrong test list.');

              let i = 1;
              while (i < lines.length - 1) {
                if (lines[i][0] != ' ')
                  this.allTests.log.error(
                    'Wrong test list output format: ' + lines.toString());

                const testNameFull = lines[i++].substr(2);

                let filePath = '';
                let line = 0;
                {
                  const fileLine = lines[i++].substr(4);
                  const match =
                    fileLine.match(/(?:(.+):([0-9]+)|(.+)\(([0-9]+)\))/);

                  if (match && match.length == 5) {
                    const matchedPath = match[1] ? match[1] : match[3];
                    filePath = path.resolve(this.allTests.workspaceFolder.uri.fsPath, matchedPath);
                    try {
                      if (!c2fs.existsSync(filePath) && this.execOptions.cwd) {
                        filePath = path.resolve(this.execOptions.cwd, matchedPath);
                      }
                      if (!c2fs.existsSync(filePath)) {
                        let parent = path.dirname(this.execPath);
                        filePath = path.resolve(parent, matchedPath);
                        let parentParent = path.dirname(parent);
                        while (!c2fs.existsSync(filePath) && parent != parentParent) {
                          parent = parentParent;
                          filePath = path.resolve(parent, matchedPath);
                          parentParent = path.dirname(parent);
                        }
                      }
                      if (!c2fs.existsSync(filePath)) {
                        filePath = matchedPath;
                      }
                    } catch (e) {
                      filePath = path.resolve(this.allTests.workspaceFolder.uri.fsPath, matchedPath);
                    }

                    line = Number(match[2] ? match[2] : match[4]);
                  }
                }

                let description = lines[i++].substr(4);
                if (description.startsWith('(NO DESCRIPTION)'))
                  description = '';

                let tags: string[] = [];
                if (lines[i].length > 6 && lines[i][6] === '[') {
                  tags = lines[i].trim().split(']');
                  tags.pop();
                  for (let j = 0; j < tags.length; ++j) tags[j] += ']';
                  ++i;
                }

                const index = oldChildren.findIndex(c => c.testNameFull == testNameFull);
                this.createChildTest(index != -1 ? oldChildren[index].id : undefined,
                  testNameFull, description, tags, filePath, line);
              }
            } catch (e) {
              this.allTests.log.error(inspect(catch2TestListOutput));
              throw e;
            }
          });
      });
  }

  private _sendTestStateEventsWithParent(events: TestEvent[]) {
    this.allTests.sendTestSuiteStateEventsWithParent([
      { type: 'suite', suite: this, state: 'running' },
      ...events,
      { type: 'suite', suite: this, state: 'completed' },
    ]);
  }
}
