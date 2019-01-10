//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

const deepStrictEqual = require('deep-equal');

import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { inspect, promisify } from 'util';
import { EOL } from 'os';

import { TestAdapter } from '../TestAdapter';
import { example1 } from './example1';
import { ChildProcessStub, FileSystemWatcherStub } from './Helpers';
import * as Mocha from 'mocha';

assert.notStrictEqual(vscode.workspace.workspaceFolders, undefined);
assert.equal(vscode.workspace.workspaceFolders!.length, 1);

const workspaceFolderUri = vscode.workspace.workspaceFolders![0].uri;

const workspaceFolder =
  vscode.workspace.getWorkspaceFolder(workspaceFolderUri)!;

const dotVscodePath = path.join(workspaceFolderUri.fsPath, '.vscode');


const sinonSandbox = sinon.createSandbox();

///

describe('TestAdapter', function () {
  let testsEvents: (TestLoadStartedEvent | TestLoadFinishedEvent)[] = [];
  let testStatesEvents: (TestRunStartedEvent | TestRunFinishedEvent |
    TestSuiteEvent | TestEvent)[] = [];

  function getConfig() {
    return vscode.workspace.getConfiguration(
      'catch2TestExplorer', workspaceFolderUri);
  }

  async function updateConfig(key: string, value: any) {
    let count = testsEvents.length;
    await getConfig().update(key, value);
    // cleanup
    while (testsEvents.length < count--) testsEvents.pop();
  }

  let adapter: TestAdapter | undefined;

  let testsEventsConnection: vscode.Disposable | undefined;
  let testStatesEventsConnection: vscode.Disposable | undefined;

  function resetConfig(): Thenable<void> {
    const packageJson = fse.readJSONSync(
      path.join(workspaceFolderUri.fsPath, '../..', 'package.json'));
    const properties: { [prop: string]: any }[] =
      packageJson['contributes']['configuration']['properties'];
    let t: Thenable<void> = Promise.resolve();
    Object.keys(properties).forEach(key => {
      assert.ok(key.startsWith('catch2TestExplorer.'));
      const k = key.substr('catch2TestExplorer.'.length);
      if (k == 'logfile') return;
      t = t.then(function () {
        return getConfig().update(k, undefined);
      });
    });
    return t;
  }

  function testStatesEvI(o: any) {
    const i = testStatesEvents.findIndex(
      (v: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent |
        TestEvent) => {
        if (o.type == v.type)
          if (o.type == 'suite' || o.type == 'test')
            return o.state === (<TestSuiteEvent | TestEvent>v).state &&
              o[o.type] === (<any>v)[v.type];
        return deepStrictEqual(o, v);
      });
    assert.notStrictEqual(
      i, -1,
      'testStatesEvI failed to find: ' + inspect(o) + '\n\nin\n\n' +
      inspect(testStatesEvents));
    assert.deepStrictEqual(testStatesEvents[i], o);
    return i;
  }

  function createAdapterAndSubscribe() {
    adapter = new TestAdapter(workspaceFolder);

    testsEventsConnection =
      adapter.tests((e: TestLoadStartedEvent | TestLoadFinishedEvent) => {
        testsEvents.push(e);
      });

    testStatesEvents = [];
    testStatesEventsConnection = adapter.testStates(
      (e: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent |
        TestEvent) => {
        testStatesEvents.push(e);
      });

    return adapter!;
  }

  async function waitFor(
    context: Mocha.Context, condition: Function,
    timeout?: number): Promise<void> {
    if (timeout === undefined) timeout = context.timeout();
    const start = Date.now();
    let c = await condition();
    while (!(c = await condition()) &&
      (Date.now() - start < timeout || !context.enableTimeouts()))
      await promisify(setTimeout)(32);
    assert.ok(c);
  }

  async function doAndWaitForReloadEvent(
    context: Mocha.Context, action: Function): Promise<TestSuiteInfo> {
    const origCount = testsEvents.length;
    await action();
    await waitFor(context, () => {
      return testsEvents.length >= origCount + 2;
    });
    assert.equal(testsEvents.length, origCount + 2);
    const e = <TestLoadFinishedEvent>testsEvents[testsEvents.length - 1]!;
    assert.equal(e.type, 'finished');
    assert.ok(e.suite != undefined);
    return e.suite!;
  }

  async function disposeAdapterAndSubscribers(
    context: Mocha.Context, check: boolean = true) {
    if (adapter) {
      adapter.dispose();
      await waitFor(context, () => {
        return (<any>adapter)._mainTaskQueue._count == 0;
      });
    }
    testsEventsConnection && testsEventsConnection.dispose();
    testStatesEventsConnection && testStatesEventsConnection.dispose();
    testStatesEvents = [];
    if (check) {
      for (let i = 0; i < testsEvents.length; i++) {
        assert.deepStrictEqual(
          { type: 'started' }, testsEvents[i],
          inspect({ index: i, testsEvents: testsEvents }));
        i++;
        assert.ok(
          i < testsEvents.length,
          inspect({ index: i, testsEvents: testsEvents }));
        assert.equal(
          testsEvents[i].type, 'finished',
          inspect({ index: i, testsEvents: testsEvents }));
        assert.ok(
          (<TestLoadFinishedEvent>testsEvents[i]).suite,
          inspect({ index: i, testsEvents: testsEvents }));
      }
    }
    testsEvents = [];
  }

  let spawnStub: sinon.SinonStub<any[], any>;
  let vsfsWatchStub: sinon.SinonStub<any[], any>;
  let fsStatStub: sinon.SinonStub<any[], any>;
  let fsReadFileSyncStub: sinon.SinonStub<any[], any>;
  let vsFindFilesStub: sinon.SinonStub<
    [vscode.GlobPattern | sinon.SinonMatcher], Thenable<vscode.Uri[]>>;

  before(function () {
    spawnStub =
      <any>sinonSandbox.stub(child_process, 'spawn').named('spawnStub');
    vsfsWatchStub =
      <any>sinonSandbox.stub(vscode.workspace, 'createFileSystemWatcher')
        .named('vscode.createFileSystemWatcher');
    fsStatStub = <any>sinonSandbox.stub(fs, 'stat').named('fsStat');
    fsReadFileSyncStub = <any>sinonSandbox.stub(fs, 'readFileSync').named('fsReadFileSync');
    vsFindFilesStub =
      <sinon.SinonStub<[vscode.GlobPattern], Thenable<vscode.Uri[]>>>
      sinonSandbox.stub(vscode.workspace, 'findFiles')
        .named('vsFindFilesStub');

    fse.removeSync(dotVscodePath);
  })

  after(function () {
    sinonSandbox.restore();
  })

  beforeEach(async function () {
    this.timeout(8000);
    adapter = undefined;

    sinonSandbox.reset();
    spawnStub.callThrough();
    vsfsWatchStub.callThrough();
    fsStatStub.callThrough();
    fsReadFileSyncStub.callThrough();
    vsFindFilesStub.callThrough();

    // reset config can cause problem with fse.removeSync(dotVscodePath);
    await resetConfig();
    return promisify(setTimeout)(1000);
  })

  afterEach(async function () {
    this.timeout(8000);
    await disposeAdapterAndSubscribers(this);
    return promisify(setTimeout)(1000);
  })

  function matchPattern(p: string) {
    return sinon.match((actual: vscode.RelativePattern) => {
      const required = new vscode.RelativePattern(
        workspaceFolder, p);
      return required.base == actual.base &&
        required.pattern == actual.pattern;
    });
  }

  describe('detect config change', function () {
    this.timeout(5000);
    this.slow(300);

    let adapter: TestAdapter;

    beforeEach(function () {
      this.timeout(8000);
      adapter = createAdapterAndSubscribe();
      assert.deepStrictEqual(testsEvents, []);
    })

    it('defaultEnv', function () {
      return doAndWaitForReloadEvent(this, () => {
        return updateConfig('defaultEnv', { 'APPLE': 'apple' });
      });
    })

    it('defaultCwd', function () {
      return doAndWaitForReloadEvent(this, () => {
        return updateConfig('defaultCwd', 'apple/peach');
      });
    })

    it('enableSourceDecoration', function () {
      return updateConfig('enableSourceDecoration', false).then(function () {
        assert.ok(!(<any>adapter)._shared.isEnabledSourceDecoration);
      });
    })

    it('defaultRngSeed', function () {
      return updateConfig('defaultRngSeed', 987).then(function () {
        assert.equal((<any>adapter)._shared.rngSeed, 987);
      });
    })

    it('defaultWatchTimeoutSec', function () {
      return updateConfig('defaultWatchTimeoutSec', 9876).then(function () {
        assert.equal((<any>adapter)._shared.execWatchTimeout, 9876000);
      });
    })

    it('defaultRunningTimeoutSec', function () {
      return updateConfig('defaultRunningTimeoutSec', 8765).then(function () {
        assert.equal((<any>adapter)._shared.execRunningTimeout, 8765000);
      });
    })

    it('defaultNoThrow', function () {
      return updateConfig('defaultNoThrow', true).then(function () {
        assert.equal((<any>adapter)._shared.isNoThrow, true);
      });
    })
  })

  describe('load executables with value', function () {
    this.slow(500);

    let adapter: TestAdapter;

    beforeEach(function () {
      adapter = createAdapterAndSubscribe();
    })

    specify('empty config', async function () {
      await adapter.load();
      assert.equal(testsEvents.length, 2);
      assert.equal(testsEvents[0].type, 'started');
      assert.equal(testsEvents[1].type, 'finished');
      const suite = (<TestLoadFinishedEvent>testsEvents[1]).suite;
      assert.notStrictEqual(suite, undefined);
      assert.equal(suite!.children.length, 0);
    })

    specify('../<workspaceFolder>/first', async function () {
      await updateConfig('executables', '../' + path.basename(workspaceFolderUri.fsPath) + '/first');
      const withArgs = vsFindFilesStub.withArgs(matchPattern('first'));
      const count = withArgs.callCount;
      await adapter.load();
      assert.strictEqual(withArgs.callCount, count + 1);
    })

    specify('./first', async function () {
      await updateConfig('executables', './first');
      const withArgs = vsFindFilesStub.withArgs(matchPattern('first'));
      const count = withArgs.callCount;
      await adapter.load();
      assert.strictEqual(withArgs.callCount, count + 1);
    })

    specify('./a/b/../../first', async function () {
      await updateConfig('executables', './a/b/../../first');
      const withArgs = vsFindFilesStub.withArgs(matchPattern('first'));
      const count = withArgs.callCount;
      await adapter.load();
      assert.strictEqual(withArgs.callCount, count + 1);
    })

    specify('../a/first', async function () {
      await updateConfig('executables', '../a/first');
      const withArgs = vsFindFilesStub.withArgs(matchPattern('first'));
      const count = withArgs.callCount;
      await adapter.load();
      assert.strictEqual(withArgs.callCount, count);
    })
  })

  context('example1', function () {
    const watchers: Map<string, FileSystemWatcherStub> = new Map();

    function handleCreateWatcherCb(
      p: vscode.RelativePattern, ignoreCreateEvents: boolean,
      ignoreChangeEvents: boolean, ignoreDeleteEvents: boolean) {
      const pp = path.join(p.base, p.pattern);
      const e = new FileSystemWatcherStub(
        vscode.Uri.file(pp), ignoreCreateEvents, ignoreChangeEvents,
        ignoreDeleteEvents);
      watchers.set(pp, e);
      return e;
    }

    function handleStatExistsFile(
      path: string,
      cb: (err: NodeJS.ErrnoException | null, stats: fs.Stats | undefined) =>
        void) {
      cb(null, <fs.Stats>{
        isFile() {
          return true;
        },
        isDirectory() {
          return false;
        }
      });
    }

    function handleStatNotExists(
      path: string,
      cb: (err: NodeJS.ErrnoException | null | any, stats: fs.Stats | undefined) =>
        void) {
      cb({
        code: 'ENOENT',
        errno: -2,
        message: 'ENOENT',
        path: path,
        syscall: 'stat'
      },
        undefined);
    }

    function matchRelativePattern(p: string) {
      return sinon.match((actual: vscode.RelativePattern) => {
        const required = new vscode.RelativePattern(
          workspaceFolder, path.relative(workspaceFolderUri.fsPath, p));
        return required.base == actual.base &&
          required.pattern == actual.pattern;
      });
    }

    beforeEach(function () {
      this.timeout(8000);
      for (let suite of example1.outputs) {
        for (let scenario of suite[1]) {
          spawnStub.withArgs(suite[0], scenario[0]).callsFake(function () {
            return new ChildProcessStub(scenario[1]);
          });
        }

        fsStatStub.withArgs(suite[0]).callsFake(handleStatExistsFile);

        vsfsWatchStub.withArgs(matchRelativePattern(suite[0]))
          .callsFake(handleCreateWatcherCb);
      }

      const dirContent: Map<string, vscode.Uri[]> = new Map();
      for (let p of example1.outputs) {
        const parent = vscode.Uri.file(path.dirname(p[0])).fsPath;
        let children: vscode.Uri[] = [];
        if (dirContent.has(parent))
          children = dirContent.get(parent)!;
        else {
          dirContent.set(parent, children);
        }
        children.push(vscode.Uri.file(p[0]));
      }

      dirContent.forEach((v: vscode.Uri[], k: string) => {
        assert.equal(workspaceFolderUri.fsPath, k);
        vsFindFilesStub.withArgs(matchRelativePattern(k)).resolves(v);
        for (const p of v) {
          vsFindFilesStub.withArgs(matchRelativePattern(p.fsPath)).resolves([
            p
          ]);
        }
      });
    })

    afterEach(function () {
      watchers.clear();
    })

    describe('load', function () {
      this.slow(1000);

      const uniqueIdC = new Set<string>();
      let adapter: TestAdapter;

      let root: TestSuiteInfo;
      let suite1: TestSuiteInfo | any;
      let s1t1: TestInfo | any;
      let s1t2: TestInfo | any;
      let suite2: TestSuiteInfo | any;
      let s2t1: TestInfo | any;
      let s2t2: TestInfo | any;
      let s2t3: TestInfo | any;

      async function loadAdapter() {
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
      }

      beforeEach(async function () {
        this.timeout(8000);
        await updateConfig('workerMaxNumber', 3);
      })

      afterEach(function () {
        uniqueIdC.clear();
      });

      context('executables="execPath1"', function () {
        beforeEach(function () {
          this.timeout(8000);
          return updateConfig('executables', 'execPath1');
        })

        async function loadAdapterAndAssert() {
          await loadAdapter();
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
        }

        it('should run with not existing test id', async function () {
          await loadAdapterAndAssert();
          await adapter.run(['not existing id']);

          assert.deepStrictEqual(testStatesEvents, [
            { type: 'started', tests: ['not existing id'] }, { type: 'finished' }
          ]);
        })

        it('should run s1t1 with success', async function () {
          await loadAdapterAndAssert();
          assert.equal(getConfig().get<any>('executables'), 'execPath1');
          await adapter.run([s1t1.id]);
          const expected = [
            { type: 'started', tests: [s1t1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 },
            {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000112 second(s).\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' },
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([s1t1.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        })

        it('should run suite1', async function () {
          await loadAdapterAndAssert();
          await adapter.run([suite1.id]);
          const expected = [
            { type: 'started', tests: [suite1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 },
            {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000132 second(s).\n'
            },
            { type: 'test', state: 'running', test: s1t2 },
            {
              type: 'test',
              state: 'failed',
              test: s1t2,
              decorations: [{ line: 14, message: '-> false' }],
              message:
                'Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' },
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([suite1.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        })

        it('should run all', async function () {
          await loadAdapterAndAssert();
          await adapter.run([root.id]);
          const expected = [
            { type: 'started', tests: [root.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 },
            {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000132 second(s).\n'
            },
            { type: 'test', state: 'running', test: s1t2 },
            {
              type: 'test',
              state: 'failed',
              test: s1t2,
              decorations: [{ line: 14, message: '-> false' }],
              message:
                'Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' },
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([root.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        })

        it('cancels without any problem', async function () {
          await loadAdapterAndAssert();
          adapter.cancel();
          assert.deepStrictEqual(testsEvents, []);
          assert.deepStrictEqual(testStatesEvents, []);

          adapter.cancel();
          assert.deepStrictEqual(testsEvents, []);
          assert.deepStrictEqual(testStatesEvents, []);

          await adapter.run([s1t1.id]);
          const expected = [
            { type: 'started', tests: [s1t1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 }, {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000112 second(s).\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' }
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          adapter.cancel();
          assert.deepStrictEqual(testsEvents, []);
          assert.deepStrictEqual(testStatesEvents, expected);
        })

        context('with config: defaultRngSeed=2', function () {
          beforeEach(function () {
            this.timeout(8000);
            return updateConfig('defaultRngSeed', 2);
          })

          it('should run s1t1 with success', async function () {
            await loadAdapterAndAssert();
            await adapter.run([s1t1.id]);
            const expected = [
              { type: 'started', tests: [s1t1.id] },
              { type: 'suite', state: 'running', suite: suite1 },
              { type: 'test', state: 'running', test: s1t1 }, {
                type: 'test',
                state: 'passed',
                test: s1t1,
                decorations: undefined,
                message:
                  'Randomness seeded to: 2.\nDuration: 0.000327 second(s).\n'
              },
              { type: 'suite', state: 'completed', suite: suite1 },
              { type: 'finished' }
            ];
            assert.deepStrictEqual(testStatesEvents, expected);

            await adapter.run([s1t1.id]);
            assert.deepStrictEqual(
              testStatesEvents, [...expected, ...expected]);
          })
        })
      })

      context('executables=["execPath1", "execPath2"]', function () {
        let suite1Watcher: FileSystemWatcherStub;

        async function loadAdapterAndAssert() {
          await loadAdapter();
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

          example1.suite1.assert(
            'execPath1', ['s1t1', 's1t2'], suite1, uniqueIdC);

          example1.suite2.assert(
            'execPath2', ['s2t1', 's2t2 [.]', 's2t3'], suite2, uniqueIdC);
        }

        beforeEach(function () {
          this.timeout(10000);
          return updateConfig('executables', ['execPath1', 'execPath2']);
        })

        it('test variables are fine, suite1 and suite1 are loaded',
          async function () {
            await loadAdapterAndAssert();
            assert.equal(root.children.length, 2);
            assert.ok(suite1 != undefined);
            assert.ok(s1t1 != undefined);
            assert.ok(s1t2 != undefined);
            assert.ok(suite2 != undefined);
            assert.ok(s2t1 != undefined);
            assert.ok(s2t2 != undefined);
            assert.ok(s2t3 != undefined);
          })

        it('should run all', async function () {
          await loadAdapterAndAssert();
          assert.equal(root.children.length, 2);
          await adapter.run([root.id]);

          const running = { type: 'started', tests: [root.id] };

          const s1running = { type: 'suite', state: 'running', suite: suite1 };
          const s1finished = { type: 'suite', state: 'completed', suite: suite1 };
          assert.ok(testStatesEvI(running) < testStatesEvI(s1running));
          assert.ok(testStatesEvI(s1running) < testStatesEvI(s1finished));

          const s2running = { type: 'suite', state: 'running', suite: suite2 };
          const s2finished = { type: 'suite', state: 'completed', suite: suite2 };
          assert.ok(testStatesEvI(running) < testStatesEvI(s1running));
          assert.ok(testStatesEvI(s2running) < testStatesEvI(s2finished));

          const s1t1running = { type: 'test', state: 'running', test: s1t1 };
          assert.ok(testStatesEvI(s1running) < testStatesEvI(s1t1running));

          const s1t1finished = {
            type: 'test',
            state: 'passed',
            test: s1t1,
            decorations: undefined,
            message: 'Duration: 0.000132 second(s).\n'
          };
          assert.ok(testStatesEvI(s1t1running) < testStatesEvI(s1t1finished));
          assert.ok(testStatesEvI(s1t1finished) < testStatesEvI(s1finished));

          const s1t2running = { type: 'test', state: 'running', test: s1t2 };
          assert.ok(testStatesEvI(s1running) < testStatesEvI(s1t2running));

          const s1t2finished = {
            type: 'test',
            state: 'failed',
            test: s1t2,
            decorations: [{ line: 14, message: '-> false' }],
            message:
              'Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
          };
          assert.ok(testStatesEvI(s1t2running) < testStatesEvI(s1t2finished));
          assert.ok(testStatesEvI(s1t2finished) < testStatesEvI(s1finished));

          const s2t1running = { type: 'test', state: 'running', test: s2t1 };
          assert.ok(testStatesEvI(s2running) < testStatesEvI(s2t1running));

          const s2t1finished = {
            type: 'test',
            state: 'passed',
            test: s2t1,
            decorations: undefined,
            message: 'Duration: 0.00037 second(s).\n'
          };
          assert.ok(testStatesEvI(s2t1running) < testStatesEvI(s2t1finished));
          assert.ok(testStatesEvI(s2t1finished) < testStatesEvI(s2finished));

          const s2t2running = { type: 'test', state: 'running', test: s2t2 };
          assert.ok(testStatesEvI(s2running) < testStatesEvI(s2t2running));

          const s2t2finished = { type: 'test', state: 'skipped', test: s2t2 };
          assert.ok(testStatesEvI(s2t2running) < testStatesEvI(s2t2finished));
          assert.ok(testStatesEvI(s2t2finished) < testStatesEvI(s2finished));

          const s2t3running = { type: 'test', state: 'running', test: s2t3 };
          assert.ok(testStatesEvI(s2running) < testStatesEvI(s2t3running));

          const s2t3finished = {
            type: 'test',
            state: 'failed',
            test: s2t3,
            decorations: [{ line: 20, message: '-> false' }],
            message:
              'Duration: 0.000178 second(s).\n>>> "s2t3" at line 19 -> REQUIRE at line 21:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
          };
          assert.ok(testStatesEvI(s2t3running) < testStatesEvI(s2t3finished));
          assert.ok(testStatesEvI(s2t3finished) < testStatesEvI(s2finished));

          const finished = { type: 'finished' };
          assert.ok(testStatesEvI(s1finished) < testStatesEvI(finished));
          assert.ok(testStatesEvI(s2finished) < testStatesEvI(finished));

          assert.equal(testStatesEvents.length, 16, inspect(testStatesEvents));
        })

        it('should run with not existing test id', async function () {
          await loadAdapterAndAssert();
          await adapter.run(['not existing id']);

          assert.deepStrictEqual(testStatesEvents, [
            { type: 'started', tests: ['not existing id'] }, { type: 'finished' }
          ]);
        })

        it('should run s1t1', async function () {
          await loadAdapterAndAssert();
          await adapter.run([s1t1.id]);
          const expected = [
            { type: 'started', tests: [s1t1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 }, {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000112 second(s).\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' }
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([s1t1.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        })

        it('should run skipped s2t2', async function () {
          await loadAdapterAndAssert();
          await adapter.run([s2t2.id]);
          const expected = [
            { type: 'started', tests: [s2t2.id] },
            { type: 'suite', state: 'running', suite: suite2 },
            { type: 'test', state: 'running', test: s2t2 }, {
              type: 'test',
              state: 'passed',
              test: s2t2,
              decorations: undefined,
              message: 'Duration: 0.001294 second(s).\n'
            },
            { type: 'suite', state: 'completed', suite: suite2 },
            { type: 'finished' }
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([s2t2.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        })

        it('should run failing test s2t3', async function () {
          await loadAdapterAndAssert();
          await adapter.run([s2t3.id]);
          const expected = [
            { type: 'started', tests: [s2t3.id] },
            { type: 'suite', state: 'running', suite: suite2 },
            { type: 'test', state: 'running', test: s2t3 }, {
              type: 'test',
              state: 'failed',
              test: s2t3,
              decorations: [{ line: 20, message: '-> false' }],
              message:
                'Duration: 0.000596 second(s).\n>>> "s2t3" at line 19 -> REQUIRE at line 21:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
            },
            { type: 'suite', state: 'completed', suite: suite2 },
            { type: 'finished' }
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([s2t3.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        })

        it('should run failing test s2t3 with chunks', async function () {
          await loadAdapterAndAssert();
          const withArgs = spawnStub.withArgs(
            example1.suite2.execPath, example1.suite2.t3.outputs[0][0]);
          withArgs.onCall(withArgs.callCount)
            .returns(new ChildProcessStub(example1.suite2.t3.outputs[0][1]));

          await adapter.run([s2t3.id]);
          const expected = [
            { type: 'started', tests: [s2t3.id] },
            { type: 'suite', state: 'running', suite: suite2 },
            { type: 'test', state: 'running', test: s2t3 }, {
              type: 'test',
              state: 'failed',
              test: s2t3,
              decorations: [{ line: 20, message: '-> false' }],
              message:
                'Duration: 0.000596 second(s).\n>>> "s2t3" at line 19 -> REQUIRE at line 21:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
            },
            { type: 'suite', state: 'completed', suite: suite2 },
            { type: 'finished' }
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([s2t3.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        })

        it('should run suite1', async function () {
          await loadAdapterAndAssert();
          await adapter.run([suite1.id]);
          const expected = [
            { type: 'started', tests: [suite1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 }, {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000132 second(s).\n'
            },
            { type: 'test', state: 'running', test: s1t2 }, {
              type: 'test',
              state: 'failed',
              test: s1t2,
              decorations: [{ line: 14, message: '-> false' }],
              message:
                'Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' }
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await adapter.run([suite1.id]);
          assert.deepStrictEqual(testStatesEvents, [...expected, ...expected]);
        })

        it('should run with wrong xml with exit code', async function () {
          await loadAdapterAndAssert();
          const m = example1.suite1.t1.outputs[0][1].match('<TestCase[^>]+>');
          assert.notStrictEqual(m, undefined);
          assert.notStrictEqual(m!.input, undefined);
          assert.notStrictEqual(m!.index, undefined);
          const part = m!.input!.substr(0, m!.index! + m![0].length);
          const withArgs = spawnStub.withArgs(
            example1.suite1.execPath, example1.suite1.t1.outputs[0][0]);
          withArgs.onCall(withArgs.callCount)
            .returns(new ChildProcessStub(part));

          await adapter.run([s1t1.id]);

          const expected = [
            { type: 'started', tests: [s1t1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 }, {
              type: 'test',
              state: 'failed',
              test: s1t1,
              message: 'Fatal error: (Wrong Catch2 xml output.)\nError: 1\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' }
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          // this tests the sinon stubs too
          await adapter.run([s1t1.id]);
          assert.deepStrictEqual(testStatesEvents, [
            ...expected, { type: 'started', tests: [s1t1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 }, {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000112 second(s).\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' }
          ]);
        })

        it('should run with wrong xml with signal', async function () {
          await loadAdapterAndAssert();
          const m = example1.suite1.t1.outputs[0][1].match('<TestCase[^>]+>');
          assert.notStrictEqual(m, undefined);
          assert.notStrictEqual(m!.input, undefined);
          assert.notStrictEqual(m!.index, undefined);
          const part = m!.input!.substr(0, m!.index! + m![0].length);
          const withArgs = spawnStub.withArgs(
            example1.suite1.execPath, example1.suite1.t1.outputs[0][0]);
          withArgs.onCall(withArgs.callCount)
            .returns(new ChildProcessStub(part, 'SIGTERM'));

          await adapter.run([s1t1.id]);

          const expected = [
            { type: 'started', tests: [s1t1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 }, {
              type: 'test',
              state: 'failed',
              test: s1t1,
              message: 'Fatal error: (Wrong Catch2 xml output.)\nError: \'SIGTERM\'\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' }
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          // this tests the sinon stubs too
          await adapter.run([s1t1.id]);

          assert.deepStrictEqual(testStatesEvents, [
            ...expected, { type: 'started', tests: [s1t1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 }, {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000112 second(s).\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' }
          ]);
        })

        it('should timeout not inside a test case', async function () {
          this.timeout(8000);
          this.slow(4000);
          await updateConfig('defaultRunningTimeoutSec', 3);
          await loadAdapterAndAssert();
          const withArgs = spawnStub.withArgs(
            example1.suite1.execPath, example1.suite1.t1.outputs[0][0]);
          const cp = new ChildProcessStub(undefined, 'SIGTERM');
          const spyKill = <sinon.SinonSpy<never, void>>sinon.spy(cp, 'kill');
          cp.write('<?xml version="1.0" encoding="UTF-8"?><Catch name="suite1">'); // no close
          withArgs.onCall(withArgs.callCount).returns(cp);

          const start = Date.now();
          await adapter.run([s1t1.id]);
          const elapsed = Date.now() - start;
          assert.ok(3000 <= elapsed && elapsed <= 5000, elapsed.toString());
          assert.strictEqual(spyKill.callCount, 2);

          cp.close();

          await waitFor(this, () => {
            return testStatesEvents.length >= 4;
          });

          assert.deepStrictEqual(testStatesEvents, [
            { type: 'started', tests: [s1t1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' }
          ]);
        })

        it('should timeout inside a test case', async function () {
          this.timeout(8000);
          this.slow(4000);
          await updateConfig('defaultRunningTimeoutSec', 3);
          await loadAdapterAndAssert();
          const withArgs = spawnStub.withArgs(
            example1.suite1.execPath, example1.suite1.t1.outputs[0][0]);
          const cp = new ChildProcessStub(undefined, 'SIGTERM');
          const spyKill = <sinon.SinonSpy<never, void>>sinon.spy(cp, 'kill');
          cp.write(['<?xml version="1.0" encoding="UTF-8"?>',
            '<Catch name="suite1">',
            '  <Group name="suite1">',
            '    <TestCase name="s1t1" description="tag1" filename="suite1.cpp" line="7">',
          ].join(EOL)); // no close
          withArgs.onCall(withArgs.callCount).returns(cp);

          const start = Date.now();
          await adapter.run([s1t1.id]);
          const elapsed = Date.now() - start;
          assert.ok(3000 <= elapsed && elapsed <= 5000, elapsed.toString());
          assert.strictEqual(spyKill.callCount, 2);

          cp.close();

          await waitFor(this, () => {
            return testStatesEvents.length >= 6;
          });

          assert.deepStrictEqual(testStatesEvents, [
            { type: 'started', tests: [s1t1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 },
            {
              type: 'test',
              state: 'failed',
              test: s1t1,
              message: 'Timed out: "catch2TestExplorer.defaultRunningTimeoutSec": 3 second(s).\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' }
          ]);
        })

        it('should cancel without error', async function () {
          await loadAdapterAndAssert();
          adapter.cancel();
        })

        it('cancels', async function () {
          // since taskQueue/allTasks has benn added it works differently, so it
          // wont test anything really, but i dont want to delete it either
          await loadAdapterAndAssert();
          let spyKill1: sinon.SinonSpy<never, void>;
          let spyKill2: sinon.SinonSpy<never, void>;
          {
            const spawnEvent =
              new ChildProcessStub(example1.suite1.outputs[2][1]);
            spyKill1 =
              <sinon.SinonSpy<never, void>>sinon.spy(spawnEvent, 'kill');
            const withArgs = spawnStub.withArgs(
              example1.suite1.execPath, example1.suite1.outputs[2][0]);
            withArgs.onCall(withArgs.callCount).returns(spawnEvent);
          }
          {
            const spawnEvent =
              new ChildProcessStub(example1.suite2.outputs[2][1]);
            spyKill2 =
              <sinon.SinonSpy<never, void>>sinon.spy(spawnEvent, 'kill');
            const withArgs = spawnStub.withArgs(
              example1.suite2.execPath, example1.suite2.outputs[2][0]);
            withArgs.onCall(withArgs.callCount).returns(spawnEvent);
          }
          const run = adapter.run([root.id]);
          adapter.cancel();
          await run;

          assert.equal(spyKill1.callCount, 0);
          assert.equal(spyKill2.callCount, 0);

          const running = { type: 'started', tests: [root.id] };

          const s1running = { type: 'suite', state: 'running', suite: suite1 };
          const s1finished = { type: 'suite', state: 'completed', suite: suite1 };
          assert.ok(testStatesEvI(running) < testStatesEvI(s1running));
          assert.ok(testStatesEvI(s1running) < testStatesEvI(s1finished));

          const s2running = { type: 'suite', state: 'running', suite: suite2 };
          const s2finished = { type: 'suite', state: 'completed', suite: suite2 };
          assert.ok(testStatesEvI(running) < testStatesEvI(s1running));
          assert.ok(testStatesEvI(s2running) < testStatesEvI(s2finished));

          const s2t2running = { type: 'test', state: 'running', test: s2t2 };
          assert.ok(testStatesEvI(s2running) < testStatesEvI(s2t2running));

          const s2t2finished = { type: 'test', state: 'skipped', test: s2t2 };
          assert.ok(testStatesEvI(s2t2running) < testStatesEvI(s2t2finished));
          assert.ok(testStatesEvI(s2t2finished) < testStatesEvI(s2finished));

          const finished = { type: 'finished' };
          assert.ok(testStatesEvI(s1finished) < testStatesEvI(finished));
          assert.ok(testStatesEvI(s2finished) < testStatesEvI(finished));

          assert.equal(testStatesEvents.length, 16, inspect(testStatesEvents));
        })

        it('cancels after run finished', async function () {
          await loadAdapterAndAssert();
          let spyKill1: sinon.SinonSpy<never, void>;
          let spyKill2: sinon.SinonSpy<never, void>;
          {
            const spawnEvent =
              new ChildProcessStub(example1.suite1.outputs[2][1]);
            spyKill1 =
              <sinon.SinonSpy<never, void>>sinon.spy(spawnEvent, 'kill');
            const withArgs = spawnStub.withArgs(
              example1.suite1.execPath, example1.suite1.outputs[2][0]);
            withArgs.onCall(withArgs.callCount).returns(spawnEvent);
          }
          {
            const spawnEvent =
              new ChildProcessStub(example1.suite2.outputs[2][1]);
            spyKill2 =
              <sinon.SinonSpy<never, void>>sinon.spy(spawnEvent, 'kill');
            const withArgs = spawnStub.withArgs(
              example1.suite2.execPath, example1.suite2.outputs[2][0]);
            withArgs.onCall(withArgs.callCount).returns(spawnEvent);
          }
          await adapter.run([root.id]);
          adapter.cancel();
          assert.equal(spyKill1.callCount, 0);
          assert.equal(spyKill2.callCount, 0);
        })

        it('reloads because of fswatcher event: touch(changed)',
          async function () {
            await loadAdapterAndAssert();
            const newRoot = await doAndWaitForReloadEvent(this, async () => {
              suite1Watcher.sendChange();
            });
            assert.deepStrictEqual(newRoot, root);
            assert.deepStrictEqual(
              testsEvents,
              [{ type: 'started' }, { type: 'finished', suite: root }]);
          });

        it('reloads because of fswatcher event: double touch(changed)',
          async function () {
            await loadAdapterAndAssert();
            const oldRoot = root;
            suite1Watcher.sendChange();
            suite1Watcher.sendChange();
            await waitFor(this, async () => {
              return testsEvents.length >= 2;
            });
            await promisify(setTimeout)(100);
            assert.deepStrictEqual(
              testsEvents,
              [{ type: 'started' }, { type: 'finished', suite: oldRoot }]);
            testsEvents.pop();
            testsEvents.pop();
          });

        it('reloads because of fswatcher event: double touch(changed) with delay',
          async function () {
            await loadAdapterAndAssert();
            const oldRoot = root;
            suite1Watcher.sendChange();
            setTimeout(() => {
              suite1Watcher.sendChange();
            }, 20);
            await waitFor(this, async () => {
              return testsEvents.length >= 2;
            });
            await promisify(setTimeout)(100);
            assert.deepStrictEqual(
              testsEvents,
              [{ type: 'started' }, { type: 'finished', suite: oldRoot }]);
            testsEvents.pop();
            testsEvents.pop();
          });

        it('reloads because of fswatcher event: touch(delete,create)',
          async function () {
            await loadAdapterAndAssert();
            const newRoot = await doAndWaitForReloadEvent(this, async () => {
              suite1Watcher.sendDelete();
              suite1Watcher.sendCreate();
            });
            assert.deepStrictEqual(newRoot, root);
            assert.deepStrictEqual(
              testsEvents,
              [{ type: 'started' }, { type: 'finished', suite: root }]);
          });

        it('reloads because of fswatcher event: double touch(delete,create)',
          async function () {
            await loadAdapterAndAssert();
            const oldRoot = root;
            suite1Watcher.sendChange();
            suite1Watcher.sendChange();
            await waitFor(this, async () => {
              return testsEvents.length >= 2;
            });
            await promisify(setTimeout)(100);
            assert.deepStrictEqual(
              testsEvents,
              [{ type: 'started' }, { type: 'finished', suite: oldRoot }]);
            testsEvents.pop();
            testsEvents.pop();
          });

        it('reloads because of fswatcher event: double touch(delete,create) with delay',
          async function () {
            await loadAdapterAndAssert();
            const oldRoot = root;
            suite1Watcher.sendChange();
            setTimeout(() => {
              suite1Watcher.sendChange();
            }, 20);
            await waitFor(this, async () => {
              return testsEvents.length >= 2;
            });
            await promisify(setTimeout)(100);
            assert.deepStrictEqual(
              testsEvents,
              [{ type: 'started' }, { type: 'finished', suite: oldRoot }]);
            testsEvents.pop();
            testsEvents.pop();
          });

        it('reloads because of fswatcher event: test added', async function () {
          await loadAdapterAndAssert();
          const testListOutput = example1.suite1.outputs[1][1].split('\n');
          assert.equal(testListOutput.length, 10);
          testListOutput.splice(1, 0, '  s1t0', '    suite1.cpp:6', '    tag1');
          const withArgs = spawnStub.withArgs(
            example1.suite1.execPath, example1.suite1.outputs[1][0]);
          withArgs.onCall(withArgs.callCount)
            .returns(new ChildProcessStub(testListOutput.join(EOL)));

          const oldRootChildren = [...root.children];
          const oldSuite1Children = [...suite1.children];
          const oldSuite2Children = [...suite2.children];

          const newRoot = await doAndWaitForReloadEvent(this, async () => {
            suite1Watcher.sendDelete();
            suite1Watcher.sendCreate();
          });

          assert.equal(newRoot, root);
          assert.equal(root.children.length, oldRootChildren.length);
          for (let i = 0; i < oldRootChildren.length; i++) {
            assert.equal(root.children[i], oldRootChildren[i]);
          }

          assert.equal(suite1.children.length, oldSuite1Children.length + 1);
          for (let i = 0; i < oldSuite1Children.length; i++) {
            const c1: TestInfo = suite1.children[i + 1];
            const c2: TestInfo = oldSuite1Children[i];
            assert.deepStrictEqual(
              [c1.file, c1.id, c1.label, c1.line, c1.skipped, c1.type],
              [c2.file, c2.id, c2.label, c2.line, c2.skipped, c2.type],
              inspect(i));
          }
          const newTest = suite1.children[0];
          assert.ok(!uniqueIdC.has(newTest.id));
          assert.equal(newTest.label, 's1t0');

          assert.equal(suite2.children.length, oldSuite2Children.length);
          for (let i = 0; i < suite2.children.length; i++) {
            assert.equal(suite2.children[i], oldSuite2Children[i]);
          }
        })

        it('reloads because new test found under run', async function () {
          await loadAdapterAndAssert();
          const testListOutput = example1.suite1.outputs[1][1].split('\n');
          assert.equal(testListOutput.length, 10);
          testListOutput.splice(1, 6);
          spawnStub
            .withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0])
            .returns(new ChildProcessStub(testListOutput.join(EOL)));

          assert.strictEqual(suite1.children.length, 2);

          await adapter.load();

          assert.equal(testsEvents.length, 2);
          root = (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1])
            .suite!;
          assert.equal(root.children.length, 2);
          suite1 = <TestSuiteInfo>root.children[0];

          assert.strictEqual(suite1.children.length, 0);

          spawnStub
            .withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0])
            .returns(new ChildProcessStub(example1.suite1.outputs[1][1]));

          const testLoadEventCount = testsEvents.length;
          await adapter.run([suite1.id]);

          const expected = [
            { type: 'started', tests: [suite1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' }
          ];
          assert.deepStrictEqual(testStatesEvents, expected);

          await waitFor(this, function () {
            return suite1.children.length == 2 &&
              testStatesEvents.length >= 4 + 8;
          }, 2000);

          assert.strictEqual(testsEvents.length, testLoadEventCount + 2);
          assert.strictEqual(suite1.children.length, 2);
          s1t1 = suite1.children[0];
          assert.strictEqual(s1t1.label, 's1t1');
          s1t2 = suite1.children[1];
          assert.strictEqual(s1t2.label, 's1t2');

          assert.deepStrictEqual(testStatesEvents, [
            ...expected,
            { type: 'started', tests: [s1t1.id, s1t2.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 },
            {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000132 second(s).\n'
            },
            { type: 'test', state: 'running', test: s1t2 },
            {
              type: 'test',
              state: 'failed',
              test: s1t2,
              decorations: [{ line: 14, message: '-> false' }],
              message:
                'Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' },
          ]);
        })

        it('reloads because removed test found under running suite',
          async function () {
            await loadAdapterAndAssert();
            const testListOutput = example1.suite1.outputs[1][1].split('\n');
            assert.equal(testListOutput.length, 10);
            testListOutput.splice(1, 3);
            spawnStub
              .withArgs(
                example1.suite1.execPath, example1.suite1.outputs[1][0])
              .returns(new ChildProcessStub(testListOutput.join(EOL)));
            const testOutput = example1.suite1.outputs[2][1].split('\n');
            assert.equal(testOutput.length, 21);
            testOutput.splice(3, 3);
            spawnStub
              .withArgs(
                example1.suite1.execPath, example1.suite1.outputs[2][0])
              .returns(new ChildProcessStub(testOutput.join(EOL)));

            assert.strictEqual(suite1.children.length, 2);

            const testLoadEventCount = testsEvents.length;
            await adapter.run([suite1.id]);

            suite1.children.shift();
            const expected = [
              { type: 'started', tests: [suite1.id] },
              { type: 'suite', state: 'running', suite: suite1 },
              { type: 'test', state: 'running', test: s1t2 },
              {
                type: 'test',
                state: 'failed',
                test: s1t2,
                decorations: [{ line: 14, message: '-> false' }],
                message:
                  'Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
              },
              { type: 'suite', state: 'completed', suite: suite1 },
              { type: 'finished' },
            ];
            assert.deepStrictEqual(testStatesEvents, expected);

            await waitFor(this, function () {
              return suite1.children.length == 1 &&
                testsEvents.length == testLoadEventCount + 2;
            }, 2000);

            assert.strictEqual(testsEvents.length, testLoadEventCount + 2);
            assert.strictEqual(suite1.children.length, 1);
          })

        it('reloads because removed test found under running the removed one',
          async function () {
            await loadAdapterAndAssert();
            const testListOutput = example1.suite1.outputs[1][1].split('\n');
            assert.equal(testListOutput.length, 10);
            testListOutput.splice(1, 3);
            spawnStub
              .withArgs(
                example1.suite1.execPath, example1.suite1.outputs[1][0])
              .returns(new ChildProcessStub(testListOutput.join(EOL)));
            const testOutput = example1.suite1.t1.outputs[0][1].split('\n');
            assert.equal(testOutput.length, 10);
            testOutput.splice(3, 3);
            spawnStub
              .withArgs(
                example1.suite1.execPath, example1.suite1.t1.outputs[0][0])
              .returns(new ChildProcessStub(testOutput.join(EOL)));

            assert.strictEqual(suite1.children.length, 2);

            const testLoadEventCount = testsEvents.length;
            await adapter.run([s1t1.id]);

            suite1.children.shift();
            const expected = [
              { type: 'started', tests: [s1t1.id] },
              { type: 'suite', state: 'running', suite: suite1 },
              { type: 'suite', state: 'completed', suite: suite1 },
              { type: 'finished' },
            ];
            assert.deepStrictEqual(testStatesEvents, expected);

            await waitFor(this, function () {
              return suite1.children.length == 1 &&
                testsEvents.length == testLoadEventCount + 2;
            }, 2000);

            assert.strictEqual(testsEvents.length, testLoadEventCount + 2);
            assert.strictEqual(suite1.children.length, 1);
          })

        it('reloads because of fswatcher event: test deleted',
          async function () {
            await loadAdapterAndAssert();
            const testListOutput = example1.suite1.outputs[1][1].split('\n');
            assert.equal(testListOutput.length, 10);
            testListOutput.splice(1, 3);
            const withArgs = spawnStub.withArgs(
              example1.suite1.execPath, example1.suite1.outputs[1][0]);
            withArgs.onCall(withArgs.callCount)
              .returns(new ChildProcessStub(testListOutput.join(EOL)));

            const oldRootChildren = [...root.children];
            const oldSuite1Children = [...suite1.children];
            const oldSuite2Children = [...suite2.children];

            const newRoot = await doAndWaitForReloadEvent(this, async () => {
              suite1Watcher.sendDelete();
              suite1Watcher.sendCreate();
            });

            assert.equal(newRoot, root);
            assert.equal(root.children.length, oldRootChildren.length);
            for (let i = 0; i < oldRootChildren.length; i++) {
              assert.equal(root.children[i], oldRootChildren[i]);
            }

            assert.equal(suite1.children.length + 1, oldSuite1Children.length);
            for (let i = 0; i < suite1.children.length; i++) {
              const c1: TestInfo = suite1.children[i];
              const c2: TestInfo = oldSuite1Children[i + 1];
              assert.deepStrictEqual(
                [c1.file, c1.id, c1.label, c1.line, c1.skipped, c1.type],
                [c2.file, c2.id, c2.label, c2.line, c2.skipped, c2.type]);
            }

            assert.equal(suite2.children.length, oldSuite2Children.length);
            for (let i = 0; i < suite2.children.length; i++) {
              assert.equal(suite2.children[i], oldSuite2Children[i]);
            }
          })

        it('reloads because test was renamed', async function () {
          await loadAdapterAndAssert();
          assert.ok(example1.suite1.outputs[1][1].indexOf('s1t1') != -1);
          const testListOutput =
            example1.suite1.outputs[1][1].replace('s1t1', 's1-t1');
          spawnStub
            .withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0])
            .returns(new ChildProcessStub(testListOutput));
          assert.ok(example1.suite1.outputs[2][1].indexOf('s1t1') != -1);
          const testOutput =
            example1.suite1.outputs[2][1].replace('s1t1', 's1-t1');
          spawnStub
            .withArgs(example1.suite1.execPath, example1.suite1.outputs[2][0])
            .returns(new ChildProcessStub(testOutput));

          assert.strictEqual(suite1.children.length, 2);

          await adapter.run([suite1.id]);

          await waitFor(this, function () {
            return testStatesEvents.length >= 6 + 6 && testsEvents.length == 2;
          }, 2000);

          assert.strictEqual(suite1.children.length, 2);
          assert.strictEqual(suite1.children[0].label, 's1-t1');
          s1t1 = suite1.children[0];

          const expected = [
            { type: 'started', tests: [suite1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t2 },
            {
              type: 'test',
              state: 'failed',
              test: s1t2,
              decorations: [{ line: 14, message: '-> false' }],
              message:
                'Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' },
            { type: 'started', tests: [s1t1.id] },
            { type: 'suite', state: 'running', suite: suite1 },
            { type: 'test', state: 'running', test: s1t1 },
            {
              type: 'test',
              state: 'passed',
              test: s1t1,
              decorations: undefined,
              message: 'Duration: 0.000132 second(s).\n'
            },
            { type: 'suite', state: 'completed', suite: suite1 },
            { type: 'finished' },
          ];
          assert.deepStrictEqual(testStatesEvents, expected);
        })

        it('data arrives in pieces', async function () {
          await loadAdapterAndAssert();
          const testListOutput = example1.suite1.outputs[2][1].split('\n');
          assert.equal(testListOutput.length, 21);
          const newOutput: string[] = [
            testListOutput[0] + EOL + testListOutput[1].substr(10) + EOL,
            testListOutput[2].substr(10) + EOL,
            testListOutput[3].substr(10) + EOL,
            testListOutput
              .filter((v: string, i: number) => {
                return i > 3;
              })
              .map((v: string) => {
                return v.substr(10);
              })
              .join(EOL) +
            EOL + EOL,
          ];
          const withArgs = spawnStub.withArgs(
            example1.suite1.execPath, example1.suite1.outputs[2][0]);
          withArgs.onCall(withArgs.callCount)
            .returns(new ChildProcessStub(newOutput));

          await adapter.run([suite1.id]);
        })
      })

      context('executables=[{<regex>}] and env={...}', function () {
        beforeEach(async function () {
          this.timeout(8000);
          await updateConfig(
            'executables', [{
              name: '${relDirpath}/${filename} (${absDirpath})',
              path: 'execPath{1,2}',
              cwd: '${workspaceFolder}/cwd',
              env: {
                C2LOCALTESTENV: 'c2localtestenv',
                C2OVERRIDETESTENV: 'c2overridetestenv-l'
              }
            }]);
          await updateConfig('defaultEnv', {
            'C2GLOBALTESTENV': 'c2globaltestenv',
            'C2OVERRIDETESTENV': 'c2overridetestenv-g',
          });

          vsfsWatchStub
            .withArgs(matchRelativePattern(
              path.join(workspaceFolderUri.fsPath, 'execPath{1,2}')))
            .callsFake(handleCreateWatcherCb);

          vsFindFilesStub
            .withArgs(matchRelativePattern(
              path.join(workspaceFolderUri.fsPath, 'execPath{1,2}')))
            .resolves([
              vscode.Uri.file(example1.suite1.execPath),
              vscode.Uri.file(example1.suite2.execPath),
            ]);
        })

        it('should get execution options', async function () {
          {
            await loadAdapter();
            const withArgs = spawnStub.withArgs(
              example1.suite1.execPath, example1.suite1.outputs[2][0]);
            withArgs.onCall(withArgs.callCount)
              .callsFake((p: string, args: string[], ops: any) => {
                assert.equal(
                  ops.cwd, path.join(workspaceFolderUri.fsPath, 'cwd'));
                assert.equal(ops.env.C2LOCALTESTENV, 'c2localtestenv');
                assert.ok(!ops.env.hasOwnProperty('C2GLOBALTESTENV'));
                assert.equal(
                  ops.env.C2OVERRIDETESTENV, 'c2overridetestenv-l');
                return new ChildProcessStub(example1.suite1.outputs[2][1]);
              });

            const cc = withArgs.callCount;
            await adapter.run([root.id]);
            assert.equal(withArgs.callCount, cc + 1);
          }
          {
            const withArgs = spawnStub.withArgs(
              example1.suite2.execPath, example1.suite2.outputs[2][0]);
            withArgs.onCall(withArgs.callCount)
              .callsFake((p: string, args: string[], ops: any) => {
                assert.equal(
                  ops.cwd, path.join(workspaceFolderUri.fsPath, 'cwd'));
                assert.equal(ops.env.C2LOCALTESTENV, 'c2localtestenv');
                assert.ok(!ops.env.hasOwnProperty('C2GLOBALTESTENV'));
                assert.equal(
                  ops.env.C2OVERRIDETESTENV, 'c2overridetestenv-l');
                return new ChildProcessStub(example1.suite2.outputs[2][1]);
              });
            const cc = withArgs.callCount;
            await adapter.run([root.id]);
            assert.equal(withArgs.callCount, cc + 1);
          }
        })
      })

      context(
        'executables=["execPath1", "execPath2", "execPath3"]',
        async function () {
          beforeEach(function () {
            this.timeout(8000);
            return updateConfig(
              'executables', ['execPath1', 'execPath2', 'execPath3']);
          })

          it('run suite3 one-by-one', async function () {
            await loadAdapter();
            assert.equal(root.children.length, 3);
            assert.equal(root.children[0].type, 'suite');
            const suite3 = <TestSuiteInfo>root.children[2];
            assert.equal(suite3.children.length, 33);

            spawnStub.withArgs(example1.suite3.execPath).throwsArg(1);

            const runAndCheckEvents = async (test: TestInfo) => {
              assert.equal(testStatesEvents.length, 0);

              await adapter.run([test.id]);

              assert.equal(testStatesEvents.length, 6, inspect(test));

              assert.deepStrictEqual(
                { type: 'started', tests: [test.id] }, testStatesEvents[0]);
              assert.deepStrictEqual(
                { type: 'suite', state: 'running', suite: suite3 },
                testStatesEvents[1]);

              assert.equal(testStatesEvents[2].type, 'test');
              assert.equal((<TestEvent>testStatesEvents[2]).state, 'running');
              assert.equal((<TestEvent>testStatesEvents[2]).test, test);

              assert.equal(testStatesEvents[3].type, 'test');
              assert.ok(
                (<TestEvent>testStatesEvents[3]).state == 'passed' ||
                (<TestEvent>testStatesEvents[3]).state == 'skipped' ||
                (<TestEvent>testStatesEvents[3]).state == 'failed');
              assert.equal((<TestEvent>testStatesEvents[3]).test, test);

              assert.deepStrictEqual(
                { type: 'suite', state: 'completed', suite: suite3 },
                testStatesEvents[4]);
              assert.deepStrictEqual({ type: 'finished' }, testStatesEvents[5]);

              while (testStatesEvents.length) testStatesEvents.pop();
            };

            for (let test of suite3.children) {
              assert.equal(test.type, 'test');
              await runAndCheckEvents(<TestInfo>test);
            }
          })
        })
    })

    specify('resolving relative defaultCwd', async function () {
      this.slow(500);
      await updateConfig('executables', example1.suite1.execPath);
      await updateConfig('defaultCwd', 'defaultCwdStr');
      const adapter = createAdapterAndSubscribe();

      let assertNoError = false;
      const spawnWithArgs = spawnStub.withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0]);
      spawnWithArgs.callsFake(function (p: string, args: string[], ops: any) {
        assert.strictEqual(ops.cwd, path.join(workspaceFolderUri.fsPath, 'defaultCwdStr'));
        assertNoError = true;
        return new ChildProcessStub(example1.suite1.outputs[1][1]);
      });

      const callCount = spawnWithArgs.callCount;
      await adapter.load();
      assert.strictEqual(spawnWithArgs.callCount, callCount + 1);
      assert.ok(assertNoError);
    })

    specify('resolving absolute defaultCwd', async function () {
      this.slow(500);
      const isWin = process.platform === 'win32';
      await updateConfig('executables', example1.suite1.execPath);

      if (isWin)
        await updateConfig('defaultCwd', 'C:\\defaultCwdStr');
      else
        await updateConfig('defaultCwd', '/defaultCwdStr');

      const adapter = createAdapterAndSubscribe();

      let assertNoError = false;
      let cwd = '';
      const spawnWithArgs = spawnStub.withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0]);
      spawnWithArgs.callsFake(function (p: string, args: string[], ops: any) {
        cwd = ops.cwd;
        if (isWin)
          assert.strictEqual(ops.cwd, 'c:\\defaultCwdStr');
        else
          assert.strictEqual(ops.cwd, '/defaultCwdStr');
        assertNoError = true; // this is necessary because it handles errors
        return new ChildProcessStub(example1.suite1.outputs[1][1]);
      });

      const callCount = spawnWithArgs.callCount;
      await adapter.load();
      assert.strictEqual(spawnWithArgs.callCount, callCount + 1);
      assert.ok(assertNoError, cwd);
    })

    specify('using defaultEnv', async function () {
      this.slow(500);
      await updateConfig('executables', example1.suite1.execPath);
      await updateConfig('defaultEnv', { 'ENVTEST': 'envtest' });

      const adapter = createAdapterAndSubscribe();

      let assertNoError = false;
      const spawnWithArgs = spawnStub.withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0]);
      spawnWithArgs.callsFake(function (p: string, args: string[], ops: any) {
        assert.ok(ops.env.hasOwnProperty('ENVTEST'));
        assert.equal(ops.env.ENVTEST, 'envtest');
        assertNoError = true; // this is necessary because it handles errors
        return new ChildProcessStub(example1.suite1.outputs[1][1]);
      });

      const callCount = spawnWithArgs.callCount;
      await adapter.load();
      assert.strictEqual(spawnWithArgs.callCount, callCount + 1);
      assert.ok(assertNoError);
    })

    specify.only('arriving <TestCase> for missing TestInfo', async function () {
      this.slow(500);
      await updateConfig('executables', example1.suite1.execPath);

      const adapter = createAdapterAndSubscribe();

      const testListOutput = example1.suite1.outputs[1][1].split('\n');
      assert.equal(testListOutput.length, 10);
      testListOutput.splice(1, 3);
      const withArgs = spawnStub.withArgs(
        example1.suite1.execPath, example1.suite1.outputs[1][0]);
      withArgs.onCall(withArgs.callCount)
        .returns(new ChildProcessStub(testListOutput.join(EOL)));


      await adapter.load();

      assert.equal(testsEvents.length, 2);
      const root =
        (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1]).suite!;

      assert.equal(root.children.length, 1);
      const suite1 = <TestSuiteInfo>root.children[0];
      assert.equal(
        suite1.children.length, 1, inspect([testListOutput, testsEvents]));
      const s1t2 = suite1.children[0];

      const stateEvents = testStatesEvents.length;
      await adapter.run([root.id]);

      await waitFor(this, () => {
        return suite1.children.length == 2;
      });
      const s1t1 = suite1.children[0];

      await waitFor(this, () => {
        return testStatesEvents.length == stateEvents + 6 + 6;
      });

      assert.deepStrictEqual(testStatesEvents, [
        { type: 'started', tests: [root.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t2 },
        {
          type: 'test',
          state: 'failed',
          test: s1t2,
          decorations: [{ line: 14, message: '-> false' }],
          message:
            'Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
        },
        { type: 'suite', state: 'completed', suite: suite1 },
        { type: 'finished' },
        { type: 'started', tests: [s1t1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'passed',
          test: s1t1,
          message: "Duration: 0.000132 second(s).\n",
          decorations: undefined,
        },
        { type: 'suite', state: 'completed', suite: suite1 },
        { type: 'finished' },
      ]);
    })

    specify('test list error: duplicated test name', async function () {
      this.slow(500);
      await updateConfig('executables', example1.suite1.execPath);

      const adapter = createAdapterAndSubscribe();

      const testListOutput = [
        'error: TEST_CASE( "biggest rectangle" ) already defined.',
        '  First seen at ../Task/biggest_rectangle.cpp:46',
        '  Redefined at ../Task/biggest_rectangle.cpp:102',
        ''];
      const withArgs = spawnStub.withArgs(
        example1.suite1.execPath, example1.suite1.outputs[1][0]);
      withArgs.onCall(withArgs.callCount)
        .returns(new ChildProcessStub('Matching test cases:' + EOL, undefined, testListOutput.join(EOL)));


      await adapter.load();
      assert.equal(testsEvents.length, 2);
      const root =
        (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1]).suite!;
      assert.equal(root.children.length, 1);

      const suite1 = <TestSuiteInfo>root.children[0];
      assert.equal(
        suite1.children.length, 1, inspect([testListOutput, testsEvents]));

      assert.strictEqual(suite1.children[0].label, '!! error: TEST_CASE( "biggest rectangle" ) already defined.');
    })

    specify('load executables=<full path of execPath1>', async function () {
      this.slow(500);
      await updateConfig('executables', example1.suite1.execPath);
      adapter = createAdapterAndSubscribe();

      await adapter.load();
      assert.equal(testsEvents.length, 2);
      assert.equal(
        (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1])
          .suite!.children.length,
        1);
      testsEvents.pop();
      testsEvents.pop();
    })

    specify(
      'load executables=["execPath1", "./execPath2"] with error',
      async function () {
        this.slow(500);
        await updateConfig('executables', ['execPath1', './execPath2']);
        adapter = createAdapterAndSubscribe();

        const withArgs = spawnStub.withArgs(
          example1.suite2.execPath, example1.suite2.outputs[1][0]);
        withArgs.onCall(withArgs.callCount).throws(
          'dummy error for testing (should be handled)');

        await adapter.load();
        assert.equal(testsEvents.length, 2);
        assert.equal(
          (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1])
            .suite!.children.length,
          1);
        testsEvents.pop();
        testsEvents.pop();
      })

    specify(
      'load executables=["execPath1", "execPath2Copy"]; delete; sleep 3; create',
      async function () {
        const watchTimeout = 6;
        await updateConfig('defaultWatchTimeoutSec', watchTimeout);
        this.timeout(watchTimeout * 1000 + 2500 /* because of 'delay' */);
        this.slow(watchTimeout * 1000 + 2500 /* because of 'delay' */);
        const execPath2CopyPath =
          path.join(workspaceFolderUri.fsPath, 'execPath2Copy');

        for (let scenario of example1.suite2.outputs) {
          spawnStub.withArgs(execPath2CopyPath, scenario[0])
            .callsFake(function () {
              return new ChildProcessStub(scenario[1]);
            });
        }

        fsStatStub.withArgs(execPath2CopyPath)
          .callsFake(handleStatExistsFile);

        vsfsWatchStub.withArgs(matchRelativePattern(execPath2CopyPath))
          .callsFake(handleCreateWatcherCb);

        vsFindFilesStub.withArgs(matchRelativePattern(execPath2CopyPath))
          .resolves([vscode.Uri.file(execPath2CopyPath)]);

        await updateConfig('executables', ['execPath1', 'execPath2Copy']);
        adapter = createAdapterAndSubscribe();

        await adapter.load();

        assert.equal(
          (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1])
            .suite!.children.length,
          2);
        testsEvents.pop();
        testsEvents.pop();

        assert.ok(watchers.has(execPath2CopyPath));
        const watcher = watchers.get(execPath2CopyPath)!;

        let start: number = 0;
        const newRoot = await doAndWaitForReloadEvent(this, async () => {
          fsStatStub.withArgs(execPath2CopyPath)
            .callsFake(handleStatNotExists);
          start = Date.now();
          watcher.sendDelete();
          setTimeout(() => {
            assert.equal(testsEvents.length, 0);
          }, 1500);
          setTimeout(() => {
            fsStatStub.withArgs(execPath2CopyPath)
              .callsFake(handleStatExistsFile);
            watcher.sendCreate();
          }, 3000);
        });
        const elapsed = Date.now() - start;

        assert.equal(testsEvents.length, 2);
        testsEvents.pop();
        testsEvents.pop();

        assert.equal(newRoot.children.length, 2);
        assert.ok(3000 < elapsed, inspect(elapsed));
        assert.ok(elapsed < watchTimeout * 1000 + 2400, inspect(elapsed));
      });

    specify(
      'load executables=["execPath1", "execPath2Copy"]; delete second',
      async function () {
        const watchTimeout = 5;
        await updateConfig('defaultWatchTimeoutSec', watchTimeout);
        this.timeout(watchTimeout * 1000 + 6500 /* because of 'delay' */);
        this.slow(watchTimeout * 1000 + 3500 /* because of 'delay' */);
        const execPath2CopyPath =
          path.join(workspaceFolderUri.fsPath, 'execPath2Copy');

        for (let scenario of example1.suite2.outputs) {
          spawnStub.withArgs(execPath2CopyPath, scenario[0])
            .callsFake(function () {
              return new ChildProcessStub(scenario[1]);
            });
        }

        fsStatStub.withArgs(execPath2CopyPath)
          .callsFake(handleStatExistsFile);

        vsfsWatchStub.withArgs(matchRelativePattern(execPath2CopyPath))
          .callsFake(handleCreateWatcherCb);

        vsFindFilesStub.withArgs(matchRelativePattern(execPath2CopyPath))
          .resolves([vscode.Uri.file(execPath2CopyPath)]);

        await updateConfig('executables', ['execPath1', 'execPath2Copy']);
        adapter = createAdapterAndSubscribe();

        await adapter.load();

        assert.equal(
          (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1])
            .suite!.children.length,
          2);
        testsEvents.pop();
        testsEvents.pop();

        assert.ok(watchers.has(execPath2CopyPath));
        const watcher = watchers.get(execPath2CopyPath)!;

        let start: number = 0;
        const newRoot = await doAndWaitForReloadEvent(this, async () => {
          fsStatStub.withArgs(execPath2CopyPath)
            .callsFake(handleStatNotExists);
          start = Date.now();
          watcher.sendDelete();
        });
        const elapsed = Date.now() - start;
        testsEvents.pop();
        testsEvents.pop();

        assert.equal(newRoot.children.length, 1);
        assert.ok(watchTimeout * 1000 < elapsed, inspect(elapsed));
        assert.ok(elapsed < watchTimeout * 1000 + 2400, inspect(elapsed));
      })

    specify('wrong executables format', async function () {
      this.slow(5000);
      await updateConfig('executables', { name: '' });

      adapter = createAdapterAndSubscribe();

      await adapter.load();

      const root =
        (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1]).suite!;
      assert.equal(root.children.length, 0);
      testsEvents.pop();
      testsEvents.pop();
    })

    specify('variable substitution with executables={...}', async function () {
      this.timeout(8000);
      this.slow(500);
      const wsPath = workspaceFolderUri.fsPath;
      const execPath2CopyRelPath = path.normalize('foo/bar/base.second.first');
      const execPath2CopyPath =
        vscode.Uri.file(path.join(wsPath, execPath2CopyRelPath)).fsPath;

      const envArray: [string, string][] = [
        ['${absPath}', execPath2CopyPath],
        ['${relPath}', execPath2CopyRelPath],
        ['${absDirpath}', path.join(wsPath, path.normalize('foo/bar'))],
        ['${relDirpath}', path.normalize('foo/bar')],
        ['${filename}', 'base.second.first'],
        ['${baseFilename}', 'base.second'],
        ['${extFilename}', '.first'],
        ['${base2Filename}', 'base'],
        ['${ext2Filename}', '.second'],
        ['${base3Filename}', 'base'],
        ['${ext3Filename}', ''],
        ['${workspaceDirectory}', wsPath],
        ['${workspaceFolder}', wsPath],
      ];
      const envsStr = envArray.map(v => { return v[0] }).join(' , ');
      const expectStr = envArray.map(v => { return v[1] }).join(' , ');

      await updateConfig('executables', {
        name: envsStr,
        pattern: execPath2CopyRelPath,
        cwd: envsStr,
        env: { C2TESTVARS: envsStr }
      });

      for (let scenario of example1.suite2.outputs) {
        spawnStub.withArgs(execPath2CopyPath, scenario[0])
          .callsFake(function () {
            return new ChildProcessStub(scenario[1]);
          });
      }
      const spawnWithArgs = spawnStub.withArgs(execPath2CopyPath, example1.suite2.t1.outputs[0][0]);
      spawnWithArgs.callsFake(function (p: string, args: string[], ops: any) {
        assert.equal(ops.cwd, expectStr);
        assert.ok(ops.env.hasOwnProperty('C2TESTVARS'));
        assert.equal(ops.env.C2TESTVARS, expectStr);
        return new ChildProcessStub(example1.suite2.t1.outputs[0][1]);
      });

      fsStatStub.withArgs(execPath2CopyPath).callsFake(handleStatExistsFile);

      vsfsWatchStub.withArgs(matchRelativePattern(execPath2CopyPath))
        .callsFake(handleCreateWatcherCb);

      vsFindFilesStub.withArgs(matchRelativePattern(execPath2CopyPath))
        .resolves([vscode.Uri.file(execPath2CopyPath)]);

      adapter = createAdapterAndSubscribe();

      await adapter.load();

      const root =
        (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1]).suite!;
      testsEvents.pop();
      testsEvents.pop();

      assert.equal(root.children.length, 1);
      assert.equal(root.children[0].type, 'suite');
      const suite = <TestSuiteInfo>root.children[0];
      assert.equal(suite.label, expectStr);

      assert.equal(suite.children.length, 3);

      const callCount = spawnWithArgs.callCount;
      await adapter.run([suite.children[0].id]);
      assert.strictEqual(spawnWithArgs.callCount, callCount + 1);
    })

    describe('gtest1.exe', function () {
      let adapter: TestAdapter;
      let root: TestSuiteInfo;
      let gtest: TestSuiteInfo;

      beforeEach(async function () {
        await updateConfig('executables', example1.gtest1.execPath);

        spawnStub.withArgs(example1.gtest1.execPath,
          sinon.match((args: string[]) => { return args[0] === '--gtest_list_tests' }))
          .callsFake(function () {
            return new ChildProcessStub(example1.gtest1.gtest_list_tests_output);
          });

        fsReadFileSyncStub
          .withArgs(sinon.match(/.*tmp_gtest_output_.+_\.xml\.tmp/), 'utf8')
          .returns(example1.gtest1.gtest_list_tests_output_xml);

        adapter = createAdapterAndSubscribe();

        await adapter.load();

        assert.equal(testsEvents.length, 2);

        root =
          (<TestLoadFinishedEvent>testsEvents[testsEvents.length - 1]).suite!;
        testsEvents.pop();
        testsEvents.pop();

        assert.equal(root.children.length, 1);
        gtest = <TestSuiteInfo>root.children[0];

        assert.equal(gtest.children.length, 12);
      })

      specify('run all', async function () {
        this.slow(500);

        await adapter.run([root.id]);

        assert.deepStrictEqual(testStatesEvents, [
          { type: 'started', tests: [root.id] },
          { type: 'suite', state: 'running', suite: gtest },
          { type: 'test', state: 'running', test: gtest.children[0] },
          {
            type: 'test',
            state: 'passed',
            test: gtest.children[0],
            message: [
              '[ RUN      ] TestCas1.test1',
              '[       OK ] TestCas1.test1 (0 ms)',
            ].join(EOL)
          },
          { type: 'test', state: 'running', test: gtest.children[1] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[1],
            decorations: [{ line: 18, message: "Actual: false;  Expected: true;" }],
            message: [
              "[ RUN      ] TestCas1.test2",
              "gtest.cpp:19: Failure",
              "Value of: 1 == 2",
              "  Actual: false",
              "Expected: true",
              "[  FAILED  ] TestCas1.test2 (0 ms)",
            ].join(EOL),
          },
          { type: 'test', state: 'running', test: gtest.children[2] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[2],
            decorations: [
              { line: 23, message: "Actual: false;  Expected: true;" },
              { line: 24, message: "Actual: true;  Expected: false;" },
              { line: 25, message: "<-- failure" },
              { line: 26, message: "Expected: (1) != (1), actual: 1 vs 1" },
              { line: 27, message: "Expected: (1) < (1), actual: 1 vs 1" },
              { line: 28, message: "Expected: (1) > (1), actual: 1 vs 1" },
            ],
            message: [
              '[ RUN      ] TestCas2.test1',
              'gtest.cpp:24: Failure',
              'Value of: 1 != 1',
              '  Actual: false',
              'Expected: true',
              'gtest.cpp:25: Failure',
              'Value of: 1 == 1',
              '  Actual: true',
              'Expected: false',
              'gtest.cpp:26: Failure',
              'Expected equality of these values:',
              '  1',
              '  2',
              'gtest.cpp:27: Failure',
              'Expected: (1) != (1), actual: 1 vs 1',
              'gtest.cpp:28: Failure',
              'Expected: (1) < (1), actual: 1 vs 1',
              'gtest.cpp:29: Failure',
              'Expected: (1) > (1), actual: 1 vs 1',
              '[  FAILED  ] TestCas2.test1 (1 ms)',
            ].join(EOL),
          },
          { type: 'test', state: 'running', test: gtest.children[3] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[3],
            decorations: [
              { line: 31, message: "Actual: false;  Expected: true;" },
              { line: 35, message: "Expected: magic_func() doesn't generate new fatal failures in the current thread.;    Actual: it does." },
            ],
            message: [
              '[ RUN      ] TestCas2.test2',
              'gtest.cpp:32: Failure',
              'Value of: false',
              '  Actual: false',
              'Expected: true',
              'gtest.cpp:36: Failure',
              'Expected: magic_func() doesn\'t generate new fatal failures in the current thread.',
              '  Actual: it does.',
              '[  FAILED  ] TestCas2.test2 (0 ms)',
            ].join(EOL),
          },
          { type: 'test', state: 'running', test: gtest.children[10] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[10],
            decorations: [
              { line: 69, message: "<-- failure" },
            ],
            message: [
              '[ RUN      ] MockTestCase.expect1',
              'gtest.cpp:70: Failure',
              'Actual function call count doesn\'t match EXPECT_CALL(foo, GetSize())...',
              '         Expected: to be called once',
              '           Actual: never called - unsatisfied and active',
              '[  FAILED  ] MockTestCase.expect1 (0 ms)',
            ].join(EOL),
          },
          { type: 'test', state: 'running', test: gtest.children[11] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[11],
            decorations: [
              { line: 77, message: "<-- failure" },
            ],
            message: [
              '[ RUN      ] MockTestCase.expect2',
              'unknown file: Failure',
              '',
              'Unexpected mock function call - returning directly.',
              '    Function call: Describe(3)',
              'Google Mock tried the following 1 expectation, but it didn\'t match: ',
              '',
              'gtest.cpp:78: EXPECT_CALL(foo, Describe(4))...',
              '  Expected arg #0: is equal to 4',
              '           Actual: 3',
              '         Expected: to be called once',
              '           Actual: never called - unsatisfied and active',
              'gtest.cpp:78: Failure',
              'Actual function call count doesn\'t match EXPECT_CALL(foo, Describe(4))...',
              '         Expected: to be called once',
              '           Actual: never called - unsatisfied and active',
              '[  FAILED  ] MockTestCase.expect2 (0 ms)',
            ].join(EOL),
          },
          { type: 'test', state: 'running', test: gtest.children[4] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[4],
            decorations: [
              { line: 40, message: "<-- failure" },
            ],
            message: [
              '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails1/0',
              'gtest.cpp:41: Failure',
              'Expected equality of these values:',
              '  1',
              '  GetParam()',
              '    Which is: 2',
              '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/0, where GetParam() = 2 (0 ms)',
            ].join(EOL),
          },
          { type: 'test', state: 'running', test: gtest.children[5] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[5],
            decorations: [
              { line: 40, message: "<-- failure" },
            ],
            message: [
              '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails1/1',
              'gtest.cpp:41: Failure',
              'Expected equality of these values:',
              '  1',
              '  GetParam()',
              '    Which is: 3',
              '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/1, where GetParam() = 3 (0 ms)',
            ].join(EOL),
          },
          { type: 'test', state: 'running', test: gtest.children[6] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[6],
            decorations: [
              { line: 41, message: "<-- failure" },
            ],
            message: [
              '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails2/0',
              'gtest.cpp:42: Failure',
              'Expected equality of these values:',
              '  1',
              '  GetParam()',
              '    Which is: 2',
              '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails2/0, where GetParam() = 2 (1 ms)',
            ].join(EOL),
          },
          { type: 'test', state: 'running', test: gtest.children[7] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[7],
            decorations: [
              { line: 41, message: "<-- failure" },
            ],
            message: [
              '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails2/1',
              'gtest.cpp:42: Failure',
              'Expected equality of these values:',
              '  1',
              '  GetParam()',
              '    Which is: 3',
              '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails2/1, where GetParam() = 3 (0 ms)',
            ].join(EOL),
          },
          { type: 'test', state: 'running', test: gtest.children[8] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[8],
            decorations: [
              { line: 40, message: "<-- failure" },
            ],
            message: [
              '[ RUN      ] PrintingFailingParams2/FailingParamTest.Fails1/0',
              'gtest.cpp:41: Failure',
              'Expected equality of these values:',
              '  1',
              '  GetParam()',
              '    Which is: 3',
              '[  FAILED  ] PrintingFailingParams2/FailingParamTest.Fails1/0, where GetParam() = 3 (0 ms)',
            ].join(EOL),
          },
          { type: 'test', state: 'running', test: gtest.children[9] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[9],
            decorations: [
              { line: 41, message: "<-- failure" },
            ],
            message: [
              '[ RUN      ] PrintingFailingParams2/FailingParamTest.Fails2/0',
              'gtest.cpp:42: Failure',
              'Expected equality of these values:',
              '  1',
              '  GetParam()',
              '    Which is: 3',
              '[  FAILED  ] PrintingFailingParams2/FailingParamTest.Fails2/0, where GetParam() = 3 (0 ms)',
            ].join(EOL),
          },
          { type: 'suite', state: 'completed', suite: gtest },
          { type: 'finished' },
        ]);
      })

      specify('run first', async function () {
        this.slow(500);

        await adapter.run([gtest.children[0].id]);

        assert.deepStrictEqual(testStatesEvents, [
          { type: 'started', tests: [gtest.children[0].id] },
          { type: 'suite', state: 'running', suite: gtest },
          { type: 'test', state: 'running', test: gtest.children[0] },
          {
            type: 'test',
            state: 'passed',
            test: gtest.children[0],
            message: [
              '[ RUN      ] TestCas1.test1',
              '[       OK ] TestCas1.test1 (0 ms)',
            ].join(EOL)
          },
          { type: 'suite', state: 'completed', suite: gtest },
          { type: 'finished' },
        ]);
      })

      specify('run param', async function () {
        this.slow(500);

        await adapter.run([gtest.children[4].id]);

        assert.deepStrictEqual(testStatesEvents, [
          { type: 'started', tests: [gtest.children[4].id] },
          { type: 'suite', state: 'running', suite: gtest },
          { type: 'test', state: 'running', test: gtest.children[4] },
          {
            type: 'test',
            state: 'failed',
            test: gtest.children[4],
            decorations: [
              { line: 40, message: "<-- failure" },
            ],
            message: [
              '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails1/0',
              'gtest.cpp:41: Failure',
              'Expected equality of these values:',
              '  1',
              '  GetParam()',
              '    Which is: 2',
              '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/0, where GetParam() = 2 (0 ms)',
            ].join(EOL),
          },
          { type: 'suite', state: 'completed', suite: gtest },
          { type: 'finished' },
        ]);
      })
    })
  })
})
