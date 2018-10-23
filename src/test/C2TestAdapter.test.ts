//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

const child_process = require('child_process');
const deepStrictEqual = require('deep-equal');

import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import {EventEmitter} from 'events';
import {TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo, TestInfo, TestAdapter} from 'vscode-test-adapter-api';
import {Log} from 'vscode-test-adapter-util';
import {inspect, promisify} from 'util';

import {C2TestAdapter} from '../C2TestAdapter';
import {example1} from './example1';
import {ChildProcessStub} from './Helpers';
import * as c2fs from '../FsWrapper';
import * as Mocha from 'mocha';

assert.notEqual(vscode.workspace.workspaceFolders, undefined);
assert.equal(vscode.workspace.workspaceFolders!.length, 1);

const workspaceFolderUri = vscode.workspace.workspaceFolders![0].uri;

const workspaceFolder =
    vscode.workspace.getWorkspaceFolder(workspaceFolderUri)!;

const logger =
    new Log('Catch2TestAdapter', workspaceFolder, 'Catch2TestAdapter');

const dotVscodePath = path.join(workspaceFolderUri.path, '.vscode');

const sinonSandbox = sinon.createSandbox();

///

describe('C2TestAdapter', function() {
  function getConfig() {
    return vscode.workspace.getConfiguration(
        'catch2TestExplorer', workspaceFolderUri)
  };

  function updateConfig(key: string, value: any) {
    return getConfig().update(key, value)
  }

  let adapter: C2TestAdapter|undefined;
  let testsEvents: (TestLoadStartedEvent|TestLoadFinishedEvent)[];
  let testsEventsConnection: vscode.Disposable|undefined;
  let testStatesEvents: (TestRunStartedEvent|TestRunFinishedEvent|
                         TestSuiteEvent|TestEvent)[];
  let testStatesEventsConnection: vscode.Disposable|undefined;

  let spawnStub: sinon.SinonStub;
  let fsWatchStub: sinon.SinonStub;
  let c2fsStatStub: sinon.SinonStub;
  let c2fsReaddirSyncStub: sinon.SinonStub;

  function resetConfig(): Thenable<void> {
    const packageJson = fse.readJSONSync(
        path.join(workspaceFolderUri.path, '../..', 'package.json'));
    const properties: {[prop: string]: any}[] =
        packageJson['contributes']['configuration']['properties'];
    let t: Thenable<void> = Promise.resolve();
    Object.keys(properties).forEach(key => {
      assert.ok(key.startsWith('catch2TestExplorer.'));
      const k = key.replace('catch2TestExplorer.', '')
      t = t.then(function() {
        return getConfig().update(k, undefined);
      });
    });
    return t;
  }

  function testStatesEvI(o: any) {
    const i = testStatesEvents.findIndex(
        (v: TestRunStartedEvent|TestRunFinishedEvent|TestSuiteEvent|
         TestEvent) => {
          if (o.type == v.type)
            if (o.type == 'suite' || o.type == 'test')
              return o.state === (<TestSuiteEvent|TestEvent>v).state &&
                  o[o.type] === (<any>v)[v.type];
          return deepStrictEqual(o, v);
        });
    assert.notEqual(
        i, -1,
        'testStatesEvI failed to find: ' + inspect(o) + '\n\nin\n\n' +
            inspect(testStatesEvents));
    assert.deepStrictEqual(testStatesEvents[i], o);
    return i;
  };

  function createAdapterAndSubscribe() {
    adapter = new C2TestAdapter(workspaceFolder, logger);

    testsEvents = [];
    testsEventsConnection =
        adapter.tests((e: TestLoadStartedEvent|TestLoadFinishedEvent) => {
          testsEvents.push(e);
        });

    testStatesEvents = [];
    testStatesEventsConnection = adapter.testStates(
        (e: TestRunStartedEvent|TestRunFinishedEvent|TestSuiteEvent|
         TestEvent) => {
          testStatesEvents.push(e);
        });

    return adapter!;
  }

  async function doAndWaitForReloadEvent(action: Function):
      Promise<TestSuiteInfo> {
    const origCount = testsEvents.length;
    await action();
    let tryCount: number = 5000;
    while (testsEvents.length != origCount + 2 && --tryCount > 0)
      await promisify(setTimeout)(10);
    assert.equal(testsEvents.length, origCount + 2);
    const e = <TestLoadFinishedEvent>testsEvents[testsEvents.length - 1]!;
    assert.equal(e.type, 'finished');
    assert.ok(e.suite != undefined);
    return e.suite!;
  }

  function disposeAdapterAndSubscribers() {
    adapter && adapter.dispose();
    testsEventsConnection && testsEventsConnection.dispose();
    testStatesEventsConnection && testStatesEventsConnection.dispose();
    testsEvents = [];
    testStatesEvents = [];
  }

  function stubsResetToMyDefault() {
    spawnStub.reset();
    spawnStub.callThrough();
    fsWatchStub.reset();
    fsWatchStub.callThrough();
    c2fsStatStub.reset();
    c2fsStatStub.callThrough();
    c2fsReaddirSyncStub.reset();
    c2fsReaddirSyncStub.throws('Test isnt set properly error.');
  }

  before(function() {
    fse.removeSync(dotVscodePath);
    adapter = undefined;

    spawnStub = sinonSandbox.stub(child_process, 'spawn').named('spawnStub');
    fsWatchStub = sinonSandbox.stub(fs, 'watch').named('fsWatchStub');
    c2fsStatStub = sinonSandbox.stub(fs, 'stat').named('fsStat');
    c2fsReaddirSyncStub =
        sinonSandbox.stub(c2fs, 'readdirSync').named('c2fsReaddirSyncStub');

    stubsResetToMyDefault();

    // reset config can cause problem with fse.removeSync(dotVscodePath);
    return resetConfig();
  });

  after(function() {
    disposeAdapterAndSubscribers();
    sinonSandbox.restore();
  });

  describe('detect config change', function() {
    this.slow(150);

    let adapter: C2TestAdapter;

    before(function() {
      adapter = createAdapterAndSubscribe();
      assert.deepStrictEqual(testsEvents, []);
    })

    after(function() {
      disposeAdapterAndSubscribers();
      return resetConfig();
    })

    it('workerMaxNumber', function() {
      return doAndWaitForReloadEvent(() => {
        return updateConfig('workerMaxNumber', 42);
      });
    })

    it('defaultEnv', function() {
      return doAndWaitForReloadEvent(() => {
        return updateConfig('defaultEnv', {'APPLE': 'apple'});
      });
    })

    it('defaultCwd', function() {
      return doAndWaitForReloadEvent(() => {
        return updateConfig('defaultCwd', 'apple/peach');
      });
    })

    it('enableSourceDecoration', function() {
      return updateConfig('enableSourceDecoration', false).then(function() {
        assert.ok(!adapter.getIsEnabledSourceDecoration());
      });
    })

    it('defaultRngSeed', function() {
      return updateConfig('defaultRngSeed', 987).then(function() {
        assert.equal(adapter.getRngSeed(), 987);
      });
    })
  })

  it('load with empty config', async function() {
    const adapter = createAdapterAndSubscribe();
    await adapter.load();
    assert.equal(testsEvents.length, 2);
    assert.equal(testsEvents[0].type, 'started');
    assert.equal(testsEvents[1].type, 'finished');
    const suite = (<TestLoadFinishedEvent>testsEvents[1]).suite;
    assert.notEqual(suite, undefined);
    assert.equal(suite!.children.length, 0);
    disposeAdapterAndSubscribers();
  })

  context('example1', function() {
    const watchers: Map<string, EventEmitter> = new Map();

    before(function() {
      for (let suite of example1.outputs) {
        for (let scenario of suite[1]) {
          spawnStub.withArgs(suite[0], scenario[0]).callsFake(function() {
            return new ChildProcessStub(scenario[1]);
          });
        }

        c2fsStatStub.withArgs(suite[0]).callsFake(
            (path: string,
             cb: (err: NodeJS.ErrnoException|null, stats: fs.Stats|undefined) =>
                 void) => {
              cb(null, <fs.Stats>{
                isFile() {
                  return true;
                },
                isDirectory() {
                  return false;
                }
              });
            });

        fsWatchStub.withArgs(suite[0]).callsFake((path: string) => {
          const e = new class extends EventEmitter {
            close() {}
          };
          watchers.set(path, e);
          return e;
        });
      }

      const dirContent: Map<string, string[]> = new Map();
      for (let p of example1.outputs) {
        const parent = path.dirname(p[0]);
        let children: string[] = [];
        if (dirContent.has(parent))
          children = dirContent.get(parent)!;
        else
          dirContent.set(parent, children);
        children.push(path.basename(p[0]));
      }

      dirContent.forEach((v: string[], k: string) => {
        c2fsReaddirSyncStub.withArgs(k).returns(v);
      });
    })

    after(function() {
      stubsResetToMyDefault();
    })

    afterEach(function() {
      watchers.clear();
    })

    describe('load', function() {
      this.enableTimeouts(false);  // TODO

      const uniqueIdC = new Set<string>();
      let adapter: TestAdapter;

      let root: TestSuiteInfo;
      let suite1: TestSuiteInfo|any;
      let s1t1: TestInfo|any;
      let s1t2: TestInfo|any;
      let suite2: TestSuiteInfo|any;
      let s2t1: TestInfo|any;
      let s2t2: TestInfo|any;
      let s2t3: TestInfo|any;

      beforeEach(async function() {
        adapter = createAdapterAndSubscribe();
        await adapter.load();

        assert.equal(testsEvents.length, 2, inspect(testsEvents));
        assert.equal(testsEvents[1].type, 'finished');
        assert.ok((<TestLoadFinishedEvent>testsEvents[1]).suite);
        root = (<TestLoadFinishedEvent>testsEvents[1]).suite!;
        testsEvents.pop();
        testsEvents.pop();

        suite1 = undefined;
        s1t1 = undefined;
        s1t2 = undefined;
        suite2 = undefined;
        s2t1 = undefined;
        s2t2 = undefined;
        s2t3 = undefined;

        example1.assertWithoutChildren(root, uniqueIdC);
        assert.deepStrictEqual(testStatesEvents, []);
      });

      afterEach(function() {
        uniqueIdC.clear();
        disposeAdapterAndSubscribers();
      });

      context('executables="execPath1"', function() {
        before(function() {
          return updateConfig('executables', 'execPath1');
        });

        after(function() {
          return updateConfig('executables', undefined);
        });

        beforeEach(async function() {
          assert.deepStrictEqual(
              getConfig().get<any>('executables'), 'execPath1');
          assert.equal(root.children.length, 1);
          assert.equal(root.children[0].type, 'suite');
          suite1 = <TestSuiteInfo>root.children[0];
          example1.suite1.assert(
              'execPath1', ['s1t1', 's1t2'], suite1, uniqueIdC);
          assert.equal(suite1.children.length, 2);
          assert.equal(suite1.children[0].type, 'test');
          s1t1 = <TestInfo>suite1.children[0];
          assert.equal(suite1.children[1].type, 'test');
          s1t2 = <TestInfo>suite1.children[1];
        });

        it('should run with not existing test id', async function() {
          await adapter.run(['not existing id']);

          assert.deepStrictEqual(testStatesEvents, [
            {type: 'started', tests: ['not existing id']},
            {type: 'finished'},
          ]);
        });

        it('should run s1t1 with success', async function() {
          assert.equal(getConfig().get<any>('executables'), 'execPath1');
          await adapter.run([s1t1.id]);
          const expected = [
            {type: 'started', tests: [s1t1.id]},
            {type: 'suite', state: 'running', suite: suite1},
            {type: 'test', state: 'running', test: s1t1},
            {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000112 second(s)\n'
            },
            {type: 'suite', state: 'completed', suite: suite1},
            {type: 'finished'},
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([s1t1.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        });

        it('should run suite1', async function() {
          await adapter.run([suite1.id]);
          const expected = [
            {type: 'started', tests: [suite1.id]},
            {type: 'suite', state: 'running', suite: suite1},
            {type: 'test', state: 'running', test: s1t1},
            {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000132 second(s)\n'
            },
            {type: 'test', state: 'running', test: s1t2},
            {
              type: 'test',
              state: 'failed',
              test: s1t2,
              decorations: [{line: 14, message: 'Expanded: false'}],
              message:
                  'Duration: 0.000204 second(s)\n>>> s1t2(line: 13) REQUIRE (line: 15) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
            },
            {type: 'suite', state: 'completed', suite: suite1},
            {type: 'finished'},
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([suite1.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        });

        it('should run all', async function() {
          await adapter.run([root.id]);
          const expected = [
            {type: 'started', tests: [root.id]},
            {type: 'suite', state: 'running', suite: suite1},
            {type: 'test', state: 'running', test: s1t1},
            {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000132 second(s)\n'
            },
            {type: 'test', state: 'running', test: s1t2},
            {
              type: 'test',
              state: 'failed',
              test: s1t2,
              decorations: [{line: 14, message: 'Expanded: false'}],
              message:
                  'Duration: 0.000204 second(s)\n>>> s1t2(line: 13) REQUIRE (line: 15) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
            },
            {type: 'suite', state: 'completed', suite: suite1},
            {type: 'finished'},
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([root.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        });

        it('cancels without any problem', async function() {
          adapter.cancel();
          assert.deepStrictEqual(testsEvents, []);
          assert.deepStrictEqual(testStatesEvents, []);

          adapter.cancel();
          assert.deepStrictEqual(testsEvents, []);
          assert.deepStrictEqual(testStatesEvents, []);

          await adapter.run([s1t1.id]);
          const expected = [
            {type: 'started', tests: [s1t1.id]},
            {type: 'suite', state: 'running', suite: suite1},
            {type: 'test', state: 'running', test: s1t1},
            {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000112 second(s)\n'
            },
            {type: 'suite', state: 'completed', suite: suite1},
            {type: 'finished'},
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          adapter.cancel();
          assert.deepStrictEqual(testsEvents, []);
          assert.deepStrictEqual(testStatesEvents, expected);
        });

        context('with config: defaultRngSeed=2', function() {
          before(function() {
            return updateConfig('defaultRngSeed', 2);
          })

          after(function() {
            return updateConfig('defaultRngSeed', undefined);
          })

          it('should run s1t1 with success', async function() {
            await adapter.run([s1t1.id]);
            const expected = [
              {type: 'started', tests: [s1t1.id]},
              {type: 'suite', state: 'running', suite: suite1},
              {type: 'test', state: 'running', test: s1t1},
              {
                type: 'test',
                state: 'passed',
                test: s1t1,
                decorations: undefined,
                message:
                    'Randomness seeded to: 2\nDuration: 0.000327 second(s)\n'
              },
              {type: 'suite', state: 'completed', suite: suite1},
              {type: 'finished'},
            ];
            assert.deepStrictEqual(testStatesEvents, expected);

            await adapter.run([s1t1.id]);
            assert.deepStrictEqual(
                testStatesEvents, [...expected, ...expected]);
          })
        })
      })

      context('suite1 and suite2 are used', function() {
        let suite1Watcher: EventEmitter;

        beforeEach(function() {
          assert.equal(root.children.length, 2);

          assert.equal(root.children[0].type, 'suite');
          assert.equal(root.children[1].type, 'suite');
          assert.equal(example1.suite1.outputs.length, 4 + 2 * 2);
          assert.equal(example1.suite2.outputs.length, 4 + 2 * 3);
          suite1 = <TestSuiteInfo>root.children[0];
          suite2 = <TestSuiteInfo>root.children[1];
          if (suite2.children.length == 2) {
            suite1 = <TestSuiteInfo>root.children[1];
            suite2 = <TestSuiteInfo>root.children[0];
          }

          assert.equal(suite1.children.length, 2);
          assert.equal(suite1.children[0].type, 'test');
          s1t1 = <TestInfo>suite1.children[0];
          assert.equal(suite1.children[1].type, 'test');
          s1t2 = <TestInfo>suite1.children[1];

          assert.equal(suite2.children.length, 3);
          assert.equal(suite2.children[0].type, 'test');
          s2t1 = <TestInfo>suite2.children[0];
          assert.equal(suite2.children[1].type, 'test');
          s2t2 = <TestInfo>suite2.children[1];
          assert.equal(suite2.children[2].type, 'test');
          s2t3 = <TestInfo>suite2.children[2];

          assert.equal(watchers.size, 2);
          assert.ok(watchers.has(example1.suite1.execPath));
          suite1Watcher = watchers.get(example1.suite1.execPath)!;
        })

        const testsForAdapterWithSuite1AndSuite2: Mocha.Test[] = [
          new Mocha.Test(
              'test variables are fine, suite1 and suite1 are loaded',
              function() {
                assert.equal(root.children.length, 2);
                assert.ok(suite1 != undefined);
                assert.ok(s1t1 != undefined);
                assert.ok(s1t2 != undefined);
                assert.ok(suite2 != undefined);
                assert.ok(s2t1 != undefined);
                assert.ok(s2t2 != undefined);
                assert.ok(s2t3 != undefined);
              }),
          new Mocha.Test(
              'should run all',
              async function() {
                assert.equal(root.children.length, 2);
                await adapter.run([root.id]);

                const running = {type: 'started', tests: [root.id]};

                const s1running = {
                  type: 'suite',
                  state: 'running',
                  suite: suite1
                };
                const s1finished = {
                  type: 'suite',
                  state: 'completed',
                  suite: suite1
                };
                assert.ok(testStatesEvI(running) < testStatesEvI(s1running));
                assert.ok(testStatesEvI(s1running) < testStatesEvI(s1finished));

                const s2running = {
                  type: 'suite',
                  state: 'running',
                  suite: suite2
                };
                const s2finished = {
                  type: 'suite',
                  state: 'completed',
                  suite: suite2
                };
                assert.ok(testStatesEvI(running) < testStatesEvI(s1running));
                assert.ok(testStatesEvI(s2running) < testStatesEvI(s2finished));

                const s1t1running = {
                  type: 'test',
                  state: 'running',
                  test: s1t1
                };
                assert.ok(
                    testStatesEvI(s1running) < testStatesEvI(s1t1running));

                const s1t1finished = {
                  type: 'test',
                  state: 'passed',
                  test: s1t1,
                  decorations: undefined,
                  message: 'Duration: 0.000132 second(s)\n'
                };
                assert.ok(
                    testStatesEvI(s1t1running) < testStatesEvI(s1t1finished));
                assert.ok(
                    testStatesEvI(s1t1finished) < testStatesEvI(s1finished));

                const s1t2running = {
                  type: 'test',
                  state: 'running',
                  test: s1t2
                };
                assert.ok(
                    testStatesEvI(s1running) < testStatesEvI(s1t2running));

                const s1t2finished = {
                  type: 'test',
                  state: 'failed',
                  test: s1t2,
                  decorations: [{line: 14, message: 'Expanded: false'}],
                  message:
                      'Duration: 0.000204 second(s)\n>>> s1t2(line: 13) REQUIRE (line: 15) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
                };
                assert.ok(
                    testStatesEvI(s1t2running) < testStatesEvI(s1t2finished));
                assert.ok(
                    testStatesEvI(s1t2finished) < testStatesEvI(s1finished));

                const s2t1running = {
                  type: 'test',
                  state: 'running',
                  test: s2t1
                };
                assert.ok(
                    testStatesEvI(s2running) < testStatesEvI(s2t1running));

                const s2t1finished = {
                  type: 'test',
                  state: 'passed',
                  test: s2t1,
                  decorations: undefined,
                  message: 'Duration: 0.00037 second(s)\n'
                };
                assert.ok(
                    testStatesEvI(s2t1running) < testStatesEvI(s2t1finished));
                assert.ok(
                    testStatesEvI(s2t1finished) < testStatesEvI(s2finished));

                const s2t2running = {
                  type: 'test',
                  state: 'running',
                  test: s2t2
                };
                assert.ok(
                    testStatesEvI(s2running) < testStatesEvI(s2t2running));

                const s2t2finished = {
                  type: 'test',
                  state: 'skipped',
                  test: s2t2
                };
                assert.ok(
                    testStatesEvI(s2t2running) < testStatesEvI(s2t2finished));
                assert.ok(
                    testStatesEvI(s2t2finished) < testStatesEvI(s2finished));

                const s2t3running = {
                  type: 'test',
                  state: 'running',
                  test: s2t3
                };
                assert.ok(
                    testStatesEvI(s2running) < testStatesEvI(s2t3running));

                const s2t3finished = {
                  type: 'test',
                  state: 'failed',
                  test: s2t3,
                  decorations: [{line: 20, message: 'Expanded: false'}],
                  message:
                      'Duration: 0.000178 second(s)\n>>> s2t3(line: 19) REQUIRE (line: 21) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
                };
                assert.ok(
                    testStatesEvI(s2t3running) < testStatesEvI(s2t3finished));
                assert.ok(
                    testStatesEvI(s2t3finished) < testStatesEvI(s2finished));

                const finished = {type: 'finished'};
                assert.ok(testStatesEvI(s1finished) < testStatesEvI(finished));
                assert.ok(testStatesEvI(s2finished) < testStatesEvI(finished));

                assert.equal(
                    testStatesEvents.length, 16, inspect(testStatesEvents));
              }),
          new Mocha.Test(
              'should run with not existing test id',
              async function() {
                await adapter.run(['not existing id']);

                assert.deepStrictEqual(testStatesEvents, [
                  {type: 'started', tests: ['not existing id']},
                  {type: 'finished'},
                ]);
              }),
          new Mocha.Test(
              'should run s1t1',
              async function() {
                await adapter.run([s1t1.id]);
                const expected = [
                  {type: 'started', tests: [s1t1.id]},
                  {type: 'suite', state: 'running', suite: suite1},
                  {type: 'test', state: 'running', test: s1t1},
                  {
                    type: 'test',
                    state: 'passed',
                    test: s1t1,
                    decorations: undefined,
                    message: 'Duration: 0.000112 second(s)\n'
                  },
                  {type: 'suite', state: 'completed', suite: suite1},
                  {type: 'finished'},
                ];
                assert.deepStrictEqual(testStatesEvents, expected);

                await adapter.run([s1t1.id]);
                assert.deepStrictEqual(
                    testStatesEvents, [...expected, ...expected]);
              }),
          new Mocha.Test(
              'should run skipped s2t2',
              async function() {
                await adapter.run([s2t2.id]);
                const expected = [
                  {type: 'started', tests: [s2t2.id]},
                  {type: 'suite', state: 'running', suite: suite2},
                  {type: 'test', state: 'running', test: s2t2},
                  {
                    type: 'test',
                    state: 'passed',
                    test: s2t2,
                    decorations: undefined,
                    message: 'Duration: 0.001294 second(s)\n'
                  },
                  {type: 'suite', state: 'completed', suite: suite2},
                  {type: 'finished'},
                ];
                assert.deepStrictEqual(testStatesEvents, expected);

                await adapter.run([s2t2.id]);
                assert.deepStrictEqual(
                    testStatesEvents, [...expected, ...expected]);
              }),
          new Mocha.Test(
              'should run failing test s2t3',
              async function() {
                await adapter.run([s2t3.id]);
                const expected = [
                  {type: 'started', tests: [s2t3.id]},
                  {type: 'suite', state: 'running', suite: suite2},
                  {type: 'test', state: 'running', test: s2t3},
                  {
                    type: 'test',
                    state: 'failed',
                    test: s2t3,
                    decorations: [{line: 20, message: 'Expanded: false'}],
                    message:
                        'Duration: 0.000596 second(s)\n>>> s2t3(line: 19) REQUIRE (line: 21) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
                  },
                  {type: 'suite', state: 'completed', suite: suite2},
                  {type: 'finished'},
                ];
                assert.deepStrictEqual(testStatesEvents, expected);

                await adapter.run([s2t3.id]);
                assert.deepStrictEqual(
                    testStatesEvents, [...expected, ...expected]);
              }),
          new Mocha.Test(
              'should run failing test s2t3 with chunks',
              async function() {
                const withArgs = spawnStub.withArgs(
                    example1.suite2.execPath, example1.suite2.t3.outputs[0][0]);
                withArgs.onCall(withArgs.callCount)
                    .returns(
                        new ChildProcessStub(example1.suite2.t3.outputs[0][1]));

                await adapter.run([s2t3.id]);
                const expected = [
                  {type: 'started', tests: [s2t3.id]},
                  {type: 'suite', state: 'running', suite: suite2},
                  {type: 'test', state: 'running', test: s2t3},
                  {
                    type: 'test',
                    state: 'failed',
                    test: s2t3,
                    decorations: [{line: 20, message: 'Expanded: false'}],
                    message:
                        'Duration: 0.000596 second(s)\n>>> s2t3(line: 19) REQUIRE (line: 21) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
                  },
                  {type: 'suite', state: 'completed', suite: suite2},
                  {type: 'finished'},
                ];
                assert.deepStrictEqual(testStatesEvents, expected);

                await adapter.run([s2t3.id]);
                assert.deepStrictEqual(
                    testStatesEvents, [...expected, ...expected]);
              }),
          new Mocha.Test(
              'should run suite1',
              async function() {
                await adapter.run([suite1.id]);
                const expected = [
                  {type: 'started', tests: [suite1.id]},
                  {type: 'suite', state: 'running', suite: suite1},
                  {type: 'test', state: 'running', test: s1t1},
                  {
                    type: 'test',
                    state: 'passed',
                    test: s1t1,
                    decorations: undefined,
                    message: 'Duration: 0.000132 second(s)\n'
                  },
                  {type: 'test', state: 'running', test: s1t2},
                  {
                    type: 'test',
                    state: 'failed',
                    test: s1t2,
                    decorations: [{line: 14, message: 'Expanded: false'}],
                    message:
                        'Duration: 0.000204 second(s)\n>>> s1t2(line: 13) REQUIRE (line: 15) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
                  },
                  {type: 'suite', state: 'completed', suite: suite1},
                  {type: 'finished'},
                ];
                assert.deepStrictEqual(testStatesEvents, expected);

                await adapter.run([suite1.id]);
                assert.deepStrictEqual(
                    testStatesEvents, [...expected, ...expected]);
              }),
          new Mocha.Test(
              'should run with wrong xml',
              async function() {
                const m =
                    example1.suite1.t1.outputs[0][1].match('<TestCase[^>]+>');
                assert.notEqual(m, undefined);
                assert.notEqual(m!.input, undefined);
                assert.notEqual(m!.index, undefined);
                const part = m!.input!.substr(0, m!.index! + m![0].length);
                const withArgs = spawnStub.withArgs(
                    example1.suite1.execPath, example1.suite1.t1.outputs[0][0]);
                withArgs.onCall(withArgs.callCount)
                    .returns(new ChildProcessStub(part));

                await adapter.run([s1t1.id]);

                const expected = [
                  {type: 'started', tests: [s1t1.id]},
                  {type: 'suite', state: 'running', suite: suite1},
                  {type: 'test', state: 'running', test: s1t1},
                  {
                    type: 'test',
                    state: 'failed',
                    test: s1t1,
                    message: 'Unexpected test error. (Is Catch2 crashed?)\n'
                  },
                  {type: 'suite', state: 'completed', suite: suite1},
                  {type: 'finished'},
                ];
                assert.deepStrictEqual(testStatesEvents, expected);

                // this tests the sinon stubs too
                await adapter.run([s1t1.id]);
                assert.deepStrictEqual(testStatesEvents, [
                  ...expected,
                  {type: 'started', tests: [s1t1.id]},
                  {type: 'suite', state: 'running', suite: suite1},
                  {type: 'test', state: 'running', test: s1t1},
                  {
                    type: 'test',
                    state: 'passed',
                    test: s1t1,
                    decorations: undefined,
                    message: 'Duration: 0.000112 second(s)\n'
                  },
                  {type: 'suite', state: 'completed', suite: suite1},
                  {type: 'finished'},
                ]);
              }),
          new Mocha.Test(
              'should cancel without error',
              function() {
                adapter.cancel();
              }),
          new Mocha.Test(
              'cancel',
              async function() {
                let spyKill1: sinon.SinonSpy;
                let spyKill2: sinon.SinonSpy;
                {
                  const spawnEvent =
                      new ChildProcessStub(example1.suite1.outputs[2][1]);
                  spyKill1 = sinon.spy(spawnEvent, 'kill');
                  const withArgs = spawnStub.withArgs(
                      example1.suite1.execPath, example1.suite1.outputs[2][0]);
                  withArgs.onCall(withArgs.callCount).returns(spawnEvent);
                }
                {
                  const spawnEvent =
                      new ChildProcessStub(example1.suite2.outputs[2][1]);
                  spyKill2 = sinon.spy(spawnEvent, 'kill');
                  const withArgs = spawnStub.withArgs(
                      example1.suite2.execPath, example1.suite2.outputs[2][0]);
                  withArgs.onCall(withArgs.callCount).returns(spawnEvent);
                }
                const run = adapter.run([root.id]);
                adapter.cancel();
                await run;

                assert.equal(spyKill1.callCount, 1);
                assert.equal(spyKill2.callCount, 1);

                const running = {type: 'started', tests: [root.id]};

                const s1running = {
                  type: 'suite',
                  state: 'running',
                  suite: suite1
                };
                const s1finished = {
                  type: 'suite',
                  state: 'completed',
                  suite: suite1
                };
                assert.ok(testStatesEvI(running) < testStatesEvI(s1running));
                assert.ok(testStatesEvI(s1running) < testStatesEvI(s1finished));

                const s2running = {
                  type: 'suite',
                  state: 'running',
                  suite: suite2
                };
                const s2finished = {
                  type: 'suite',
                  state: 'completed',
                  suite: suite2
                };
                assert.ok(testStatesEvI(running) < testStatesEvI(s1running));
                assert.ok(testStatesEvI(s2running) < testStatesEvI(s2finished));

                const s2t2running = {
                  type: 'test',
                  state: 'running',
                  test: s2t2
                };
                assert.ok(
                    testStatesEvI(s2running) < testStatesEvI(s2t2running));

                const s2t2finished = {
                  type: 'test',
                  state: 'skipped',
                  test: s2t2
                };
                assert.ok(
                    testStatesEvI(s2t2running) < testStatesEvI(s2t2finished));
                assert.ok(
                    testStatesEvI(s2t2finished) < testStatesEvI(s2finished));

                const finished = {type: 'finished'};
                assert.ok(testStatesEvI(s1finished) < testStatesEvI(finished));
                assert.ok(testStatesEvI(s2finished) < testStatesEvI(finished));

                assert.equal(
                    testStatesEvents.length, 8, inspect(testStatesEvents));
              }),
          new Mocha.Test(
              'cancel after run finished',
              function() {
                let spyKill1: sinon.SinonSpy;
                let spyKill2: sinon.SinonSpy;
                {
                  const spawnEvent =
                      new ChildProcessStub(example1.suite1.outputs[2][1]);
                  spyKill1 = sinon.spy(spawnEvent, 'kill');
                  const withArgs = spawnStub.withArgs(
                      example1.suite1.execPath, example1.suite1.outputs[2][0]);
                  withArgs.onCall(withArgs.callCount).returns(spawnEvent);
                }
                {
                  const spawnEvent =
                      new ChildProcessStub(example1.suite2.outputs[2][1]);
                  spyKill2 = sinon.spy(spawnEvent, 'kill');
                  const withArgs = spawnStub.withArgs(
                      example1.suite2.execPath, example1.suite2.outputs[2][0]);
                  withArgs.onCall(withArgs.callCount).returns(spawnEvent);
                }
                const run = adapter.run([root.id]);
                return run.then(function() {
                  adapter.cancel();
                  assert.equal(spyKill1.callCount, 0);
                  assert.equal(spyKill2.callCount, 0);
                });
              }),
          new Mocha.Test(
              'reload because of fswatcher event: touch',
              async function(this: Mocha.Context) {
                this.slow(200);
                const newRoot = await doAndWaitForReloadEvent(async () => {
                  suite1Watcher.emit(
                      'change', 'dummyEvent', example1.suite1.execPath);
                });
                assert.deepStrictEqual(newRoot, root);
              }),
          new Mocha.Test(
              'reload because of fswatcher event: touch, retry 5 times',
              async function(this: Mocha.Context) {
                this.timeout(10000);
                this.slow(6500);
                const newRoot = await doAndWaitForReloadEvent(async () => {
                  const w = c2fsStatStub.withArgs(example1.suite1.execPath);
                  for (let cc = 0; cc < 5; cc++) {
                    w.onCall(w.callCount + cc)
                        .callsFake(
                            (path: string,
                             cb: (
                                 err: NodeJS.ErrnoException|null|any,
                                 stats: fs.Stats|undefined) => void) => {
                              cb({
                                code: 'ENOENT',
                                errno: -2,
                                message: 'ENOENT',
                                path: path,
                                syscall: 'stat'
                              },
                                 undefined);
                            });
                  }
                  assert.ok(suite1Watcher.emit(
                      'change', 'dummyEvent', example1.suite1.execPath));
                });
                assert.deepStrictEqual(newRoot, root);
              }),
          new Mocha.Test(
              'reload because of fswatcher event: test added',
              async function(this: Mocha.Context) {
                this.slow(200);
                const testListOutput =
                    example1.suite1.outputs[1][1].split('\n');
                assert.equal(testListOutput.length, 10);
                testListOutput.splice(
                    1, 0, '  s1t0', '    suite1.cpp:6', '    tag1');
                const withArgs = spawnStub.withArgs(
                    example1.suite1.execPath, example1.suite1.outputs[1][0]);
                withArgs.onCall(withArgs.callCount)
                    .returns(new ChildProcessStub(testListOutput.join('\n')));

                const oldRootChildren = [...root.children];
                const oldSuite1Children = [...suite1.children];
                const oldSuite2Children = [...suite2.children];

                const newRoot = await doAndWaitForReloadEvent(async () => {
                  suite1Watcher.emit(
                      'change', 'dummyEvent', example1.suite1.execPath);
                });

                assert.equal(newRoot, root);
                assert.equal(root.children.length, oldRootChildren.length);
                for (let i = 0; i < oldRootChildren.length; i++) {
                  assert.equal(root.children[i], oldRootChildren[i]);
                }

                assert.equal(
                    suite1.children.length, oldSuite1Children.length + 1);
                for (let i = 0; i < suite1.children.length; i++) {
                  assert.equal(suite1.children[i + 1], oldSuite1Children[i]);
                }
                const newTest = suite1.children[0];
                assert.ok(!uniqueIdC.has(newTest.id));
                assert.equal(newTest.label, 's1t0');

                assert.equal(suite2.children.length, oldSuite2Children.length);
                for (let i = 0; i < suite2.children.length; i++) {
                  assert.equal(suite2.children[i], oldSuite2Children[i]);
                }
              }),
          new Mocha.Test(
              'reload because of fswatcher event: test deleted',
              async function(this: Mocha.Context) {
                this.slow(200);
                const testListOutput =
                    example1.suite1.outputs[1][1].split('\n');
                assert.equal(testListOutput.length, 10);
                testListOutput.splice(1, 3);
                const withArgs = spawnStub.withArgs(
                    example1.suite1.execPath, example1.suite1.outputs[1][0]);
                withArgs.onCall(withArgs.callCount)
                    .returns(new ChildProcessStub(testListOutput.join('\n')));

                const oldRootChildren = [...root.children];
                const oldSuite1Children = [...suite1.children];
                const oldSuite2Children = [...suite2.children];

                const newRoot = await doAndWaitForReloadEvent(async () => {
                  suite1Watcher.emit(
                      'change', 'dummyEvent', example1.suite1.execPath);
                });

                assert.equal(newRoot, root);
                assert.equal(root.children.length, oldRootChildren.length);
                for (let i = 0; i < oldRootChildren.length; i++) {
                  assert.equal(root.children[i], oldRootChildren[i]);
                }

                assert.equal(
                    suite1.children.length + 1, oldSuite1Children.length);
                for (let i = 0; i < suite1.children.length; i++) {
                  assert.equal(suite1.children[i], oldSuite1Children[i + 1]);
                }

                assert.equal(suite2.children.length, oldSuite2Children.length);
                for (let i = 0; i < suite2.children.length; i++) {
                  assert.equal(suite2.children[i], oldSuite2Children[i]);
                }
              }),
        ];

        context(
            'executables=["execPath1", "${workspaceFolder}/execPath2"]',
            function() {
              before(function() {
                return updateConfig(
                    'executables',
                    ['execPath1', '${workspaceFolder}/execPath2']);
              });

              after(function() {
                return updateConfig('executables', undefined);
              });

              beforeEach(async function() {
                example1.suite1.assert(
                    'execPath1', ['s1t1', 's1t2'], suite1, uniqueIdC);

                example1.suite2.assert(
                    path.join(workspaceFolderUri.path, 'execPath2'),
                    ['s2t1', 's2t2 [.]', 's2t3'], suite2, uniqueIdC);
              })

              for (let t of testsForAdapterWithSuite1AndSuite2) this.addTest(
                  t.clone());
            })

        context('executables=[{<regex>}] and env={...}', function() {
          before(async function() {
            await updateConfig('executables', [{
                                 name: '${dirname}: ${name} (${absDirname})',
                                 path: '.',
                                 regex: 'execPath(1|2)',
                                 cwd: '${workspaceFolder}/cwd',
                                 env: {
                                   'C2LOCALTESTENV': 'c2localtestenv',
                                   'C2OVERRIDETESTENV': 'c2overridetestenv-l',
                                 }
                               }]);
            await updateConfig('defaultEnv', {
              'C2GLOBALTESTENV': 'c2globaltestenv',
              'C2OVERRIDETESTENV': 'c2overridetestenv-g',
            });
          });

          after(async function() {
            await updateConfig('executables', undefined);
            await updateConfig('defaultEnv', undefined);
          });

          beforeEach(async function() {
            example1.suite1.assert(
                ': execPath1 (' + workspaceFolderUri.path + ')',
                ['s1t1', 's1t2'], suite1, uniqueIdC);

            example1.suite2.assert(
                ': execPath2 (' + workspaceFolderUri.path + ')',
                ['s2t1', 's2t2 [.]', 's2t3'], suite2, uniqueIdC);
          })

          for (let t of testsForAdapterWithSuite1AndSuite2) this.addTest(
              t.clone());

          it('should get execution options', async function() {
            {
              const withArgs = spawnStub.withArgs(
                  example1.suite1.execPath, sinon.match.any, sinon.match.any);
              withArgs.onCall(withArgs.callCount)
                  .callsFake((p: string, args: string[], ops: any) => {
                    assert.equal(
                        ops.cwd, path.join(workspaceFolderUri.path, 'cwd'));
                    assert.equal(ops.env.C2LOCALTESTENV, 'c2localtestenv');
                    assert.ok(!ops.env.hasOwnProperty('C2GLOBALTESTENV'));
                    assert.equal(
                        ops.env.C2OVERRIDETESTENV, 'c2overridetestenv-l');
                    return new ChildProcessStub(example1.suite1.outputs[2][1]);
                  });

              await adapter.run([suite1.id]);
            }
            {
              const withArgs = spawnStub.withArgs(
                  example1.suite2.execPath, sinon.match.any, sinon.match.any);
              withArgs.onCall(withArgs.callCount)
                  .callsFake((p: string, args: string[], ops: any) => {
                    assert.equal(
                        ops.cwd, path.join(workspaceFolderUri.path, 'cwd'));
                    assert.equal(ops.env.C2LOCALTESTENV, 'c2localtestenv');
                    assert.ok(!ops.env.hasOwnProperty('C2GLOBALTESTENV'));
                    assert.equal(
                        ops.env.C2OVERRIDETESTENV, 'c2overridetestenv-l');
                    return new ChildProcessStub(example1.suite2.outputs[2][1]);
                  });

              await adapter.run([suite2.id]);
            }
          })
        })
      })
    })

    specify('load executables=<full path of execPath1>', async function() {
      this.slow(300);
      await updateConfig('executables', example1.suite1.execPath);
      adapter = createAdapterAndSubscribe();
      await adapter.load();
      assert.equal(testsEvents.length, 2);
      assert.equal(
          (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1])
              .suite!.children.length,
          1);
      await updateConfig('executables', undefined);
    })

    specify(
        'load executables=["execPath1", "execPath2"] with error',
        async function() {
          this.slow(300);
          await updateConfig('executables', ['execPath1', 'execPath2'])
          adapter = createAdapterAndSubscribe();

          const withArgs = spawnStub.withArgs(
              example1.suite2.execPath, example1.suite2.outputs[1][0]);
          withArgs.onCall(withArgs.callCount).throws(
              'dummy error for testing (should be handled)');

          await adapter.load();

          await updateConfig('executables', undefined);
        })

    specify.skip(  // TODO
        'load executables=["execPath1", "execPath2Copy"] and delete second because of fswatcher event',
        async function() {
          this.slow(300);

          const fullPath = path.join(workspaceFolderUri.path, 'execPath2Copy');

          for (let o of example1.suite2.outputs)
            spawnStub.withArgs(example1.suite2.outputs, o[0]).callsFake(() => {
              return new ChildProcessStub(o[1]);
            });

          c2fsStatStub.withArgs(fullPath).callsFake(
              (path: string,
               cb: (
                   err: NodeJS.ErrnoException|null|any,
                   stats: fs.Stats|undefined) => void) => {
                cb({
                  code: 'ENOENT',
                  errno: -2,
                  message: 'ENOENT',
                  path: path,
                  syscall: 'stat'
                },
                   undefined);
              });

          fsWatchStub.withArgs(fullPath).callsFake((path: string) => {
            return new class extends EventEmitter {
              close() {}
            };
          });

          await updateConfig('executables', ['execPath1', 'execPath2Copy'])
          adapter = createAdapterAndSubscribe();

          await adapter.load();

          // not finished
          // const withArgs = spawnStub.withArgs(
          //     example1.suite2.execPath, example1.suite2.outputs[1][0]);
          // withArgs.onCall(withArgs.callCount).throws(
          //     'dummy error for testing (should be handled)');

          // restore
          await updateConfig('executables', undefined);
        })
  })
})