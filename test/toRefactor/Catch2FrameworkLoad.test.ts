import * as path from 'path';
import * as fse from 'fs-extra';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as pathlib from 'path';
import {
  TestEvent,
  TestRunFinishedEvent,
  TestRunStartedEvent,
  TestSuiteEvent,
  TestSuiteInfo,
  TestInfo,
} from 'vscode-test-adapter-api';
import { inspect } from 'util';
import { EOL } from 'os';
import { example1 } from '../example1';
import {
  TestAdapter,
  Imitation,
  waitFor,
  settings,
  ChildProcessStub,
  FileSystemWatcherStub,
  isWin,
  waitForMilisec,
} from '../Common';
import { TestRunEvent } from '../../src/SharedVariables';
import { expectedLoggedWarning } from '../LogOutputContent.test';

///

describe(path.basename(__filename), function () {
  this.timeout(20000);
  this.slow(3000);

  let imitation: Imitation;
  let adapter: TestAdapter;
  let watchers: Map<string, FileSystemWatcherStub>;
  const uniqueIdC = new Set<string>();

  before(function () {
    imitation = new Imitation();
    fse.removeSync(settings.dotVscodePath);
  });

  after(function () {
    imitation.restore();
    return settings.resetConfig();
  });

  beforeEach(async function () {
    imitation.resetToCallThrough();
    watchers = example1.initImitation(imitation);

    await settings.resetConfig(); // reset config can cause problem with fse.removeSync(dotVscodePath);
    await settings.updateConfig('test.parallelExecutionLimit', 3);
  });

  afterEach(async function () {
    await adapter.waitAndDispose(this);
    uniqueIdC.clear();
  });

  let suite1: TestSuiteInfo;
  let s1t1: TestInfo;
  let s1t2: TestInfo;
  let suite2: TestSuiteInfo;
  let s2t1: TestInfo;
  let s2t2: TestInfo;
  let s2t3: TestInfo;

  async function loadAdapter(): Promise<void> {
    adapter = new TestAdapter();

    await adapter.load();
    adapter.loadEvents.pop();
    adapter.loadEvents.pop();

    suite1 = (undefined as unknown) as TestSuiteInfo;
    s1t1 = (undefined as unknown) as TestInfo;
    s1t2 = (undefined as unknown) as TestInfo;
    suite2 = (undefined as unknown) as TestSuiteInfo;
    s2t1 = (undefined as unknown) as TestInfo;
    s2t2 = (undefined as unknown) as TestInfo;
    s2t3 = (undefined as unknown) as TestInfo;

    example1.assertWithoutChildren(adapter.root, uniqueIdC);
  }

  context('executables="execPath1.exe"', function () {
    beforeEach(function () {
      return settings.updateConfig('test.executables', 'execPath1.exe');
    });

    async function loadAdapterAndAssert(): Promise<void> {
      await loadAdapter();
      assert.deepStrictEqual(settings.getConfig().get<string>('test.executables'), 'execPath1.exe');
      assert.equal(adapter.root.children.length, 1);

      suite1 = adapter.group;
      example1.suite1.assert('execPath1.exe', ['s1t1', 's1t2'], suite1, uniqueIdC);

      assert.equal(suite1.children.length, 2);
      assert.equal(suite1.children[0].type, 'test');
      s1t1 = suite1.children[0] as TestInfo;
      assert.equal(suite1.children[1].type, 'test');
      s1t2 = suite1.children[1] as TestInfo;
    }

    it('should run with not existing test id', async function () {
      await loadAdapterAndAssert();
      await adapter.run(['not existing id']);

      adapter.simplifiedAssertEqualStateEvents([{ type: 'started', tests: ['not existing id'] }, { type: 'finished' }]);
    });

    it('should run s1t1 with success', async function () {
      await loadAdapterAndAssert();
      assert.deepStrictEqual(settings.getConfig().get<string>('test.executables'), 'execPath1.exe');
      await adapter.run([s1t1.id]);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [s1t1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },

        {
          type: 'test',
          state: 'passed',
          test: s1t1,
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      await adapter.run([s1t1.id]);
      adapter.simplifiedAssertEqualStateEvents([...expected, ...expected]);
    });

    it('should run suite1', async function () {
      await loadAdapterAndAssert();
      await adapter.run([suite1.id]);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [suite1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'passed',
          test: s1t1,
        },
        { type: 'test', state: 'running', test: s1t2 },
        {
          type: 'test',
          state: 'failed',
          test: s1t2,
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      await adapter.run([suite1.id]);
      adapter.simplifiedAssertEqualStateEvents([...expected, ...expected]);
    });

    it('should run all', async function () {
      await loadAdapterAndAssert();
      await adapter.run([adapter.root.id]);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [adapter.root.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'passed',
          test: s1t1,
        },
        { type: 'test', state: 'running', test: s1t2 },
        {
          type: 'test',
          state: 'failed',
          test: s1t2,
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      await adapter.run([adapter.root.id]);
      adapter.simplifiedAssertEqualStateEvents([...expected, ...expected]);
    });

    it('cancels without any problem', async function () {
      await loadAdapterAndAssert();
      adapter.cancel();
      assert.deepStrictEqual(adapter.loadEvents, []);
      adapter.simplifiedAssertEqualStateEvents([]);

      adapter.cancel();
      assert.deepStrictEqual(adapter.loadEvents, []);
      adapter.simplifiedAssertEqualStateEvents([]);

      await adapter.run([s1t1.id]);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [s1t1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'passed',
          test: s1t1,
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      adapter.cancel();
      assert.deepStrictEqual(adapter.loadEvents, []);
      adapter.simplifiedAssertEqualStateEvents(expected);
    });

    context('with config: defaultRngSeed=2', function () {
      beforeEach(function () {
        return settings.updateConfig('test.randomGeneratorSeed', 2);
      });

      it('should run s1t1 with success', async function () {
        await loadAdapterAndAssert();
        await adapter.run([s1t1.id]);
        const expected: TestRunEvent[] = [
          { type: 'started', tests: [s1t1.id] },
          { type: 'suite', state: 'running', suite: suite1 },
          { type: 'test', state: 'running', test: s1t1 },
          {
            type: 'test',
            state: 'passed',
            test: s1t1,
          },
          {
            type: 'suite',
            state: 'completed',
            suite: suite1,
          },
          { type: 'finished' },
        ];
        adapter.simplifiedAssertEqualStateEvents(expected);

        await adapter.run([s1t1.id]);
        adapter.simplifiedAssertEqualStateEvents([...expected, ...expected]);
      });
    });
  });

  context('executables=["execPath1.exe", "execPath2.exe"]', function () {
    let suite1Watcher: FileSystemWatcherStub;

    async function loadAdapterAndAssert(): Promise<void> {
      await loadAdapter();
      assert.equal(adapter.root.children.length, 2);

      assert.equal(adapter.root.children[0].type, 'suite');
      assert.equal(adapter.root.children[1].type, 'suite');
      assert.equal(example1.suite1.outputs.length, 4 + 2 * 2 + 1 /* plus one extra because "s1t2,s1t1" */);
      assert.equal(example1.suite2.outputs.length, 4 + 2 * 3);
      suite1 = adapter.root.children[0] as TestSuiteInfo;
      suite2 = adapter.root.children[1] as TestSuiteInfo;
      if (suite2.children.length == 2) {
        suite1 = adapter.root.children[1] as TestSuiteInfo;
        suite2 = adapter.root.children[0] as TestSuiteInfo;
      }

      assert.equal(suite1.children.length, 2);
      assert.equal(suite1.children[0].type, 'test');
      s1t1 = suite1.children[0] as TestInfo;
      assert.equal(suite1.children[1].type, 'test');
      s1t2 = suite1.children[1] as TestInfo;

      assert.equal(suite2.children.length, 3);
      assert.equal(suite2.children[0].type, 'test');
      s2t1 = suite2.children[0] as TestInfo;
      assert.equal(suite2.children[1].type, 'test');
      s2t2 = suite2.children[1] as TestInfo;
      assert.equal(suite2.children[2].type, 'test');
      s2t3 = suite2.children[2] as TestInfo;

      assert.equal(watchers.size, 2);
      assert.ok(watchers.has(example1.suite1.execPath));
      suite1Watcher = watchers.get(example1.suite1.execPath)!;

      example1.suite1.assert('execPath1.exe', ['s1t1', 's1t2'], suite1, uniqueIdC);

      example1.suite2.assert('execPath2.exe', ['s2t1', 's2t2', 's2t3'], ['', '[.]', ''], suite2, uniqueIdC);
    }

    beforeEach(function () {
      return settings.updateConfig('test.advancedExecutables', ['execPath1.exe', 'execPath2.exe']);
    });

    it('test variables are fine, suite1 and suite1 are loaded', async function () {
      await loadAdapterAndAssert();
      assert.equal(adapter.root.children.length, 2);
      assert.ok(suite1 != undefined);
      assert.ok(s1t1 != undefined);
      assert.ok(s1t2 != undefined);
      assert.ok(suite2 != undefined);
      assert.ok(s2t1 != undefined);
      assert.ok(s2t2 != undefined);
      assert.ok(s2t3 != undefined);
    });

    it('should run all', async function () {
      await loadAdapterAndAssert();
      assert.equal(adapter.root.children.length, 2);
      await adapter.run([adapter.root.id]);

      const running: TestRunStartedEvent = { type: 'started', tests: [adapter.root.id] };

      const s1running: TestSuiteEvent = { type: 'suite', state: 'running', suite: suite1 };
      const s1finished: TestSuiteEvent = {
        type: 'suite',
        state: 'completed',
        suite: suite1,
        description: `.${pathlib.sep} (0ms)`,
        tooltip:
          'Name: execPath1.exe\nDescription: .' +
          pathlib.sep +
          '\n\nPath: <masked>\nCwd: <masked>\n\nTests: 2\n  - passed: 1\n  - failed: 1\n⏱Duration: 0ms',
      };
      adapter.stateEventSequence(running, s1running);
      adapter.stateEventSequence(s1running, s1finished);

      const s2running: TestSuiteEvent = { type: 'suite', state: 'running', suite: suite2 };
      const s2finished: TestSuiteEvent = {
        type: 'suite',
        state: 'completed',
        suite: suite2,
        description: `.${pathlib.sep} (1ms)`,
        tooltip:
          'Name: execPath2.exe\nDescription: .' +
          pathlib.sep +
          '\n\nPath: <masked>\nCwd: <masked>\n\nTests: 3\n  - passed: 1\n  - failed: 1\n⏱Duration: 1ms',
      };
      adapter.stateEventSequence(running, s1running);
      adapter.stateEventSequence(s2running, s2finished);

      const s1t1running: TestEvent = { type: 'test', state: 'running', test: s1t1 };
      adapter.stateEventSequence(s1running, s1t1running);

      const s1t1finished: TestEvent = {
        type: 'test',
        state: 'passed',
        test: s1t1,
        decorations: [],
        description: '(0ms)',
        message: '⏱Duration: 0.000132 second(s).',
        tooltip: 'Name: s1t1\nDescription: tag1\n⏱Duration: 0ms',
      };
      adapter.stateEventSequence(s1t1running, s1t1finished);
      adapter.stateEventSequence(s1t1finished, s1finished);

      const s1t2running: TestEvent = { type: 'test', state: 'running', test: s1t2 };
      adapter.stateEventSequence(s1running, s1t2running);

      const s1t2finished: TestEvent = {
        type: 'test',
        state: 'failed',
        test: s1t2,
        decorations: [
          {
            file: path.normalize('../vscode-catch2-test-adapter/src/test/suite1.cpp'),
            line: 14,
            message: '⬅ false',
            hover: '❕Original:  std::false_type::value\n❗️Expanded:  false',
          },
        ],
        description: '(0ms)',
        tooltip: 'Name: s1t2\nDescription: tag1\n⏱Duration: 0ms',
        message:
          '⏱Duration: 0.000204 second(s).\n  Expression failed (at ../vscode-catch2-test-adapter/src/test/suite1.cpp:15):\n    ❕Original:  std::false_type::value\n    ❗️Expanded:  false',
      };
      adapter.stateEventSequence(s1t2running, s1t2finished);
      adapter.stateEventSequence(s1t2finished, s1finished);

      const s2t1running: TestEvent = { type: 'test', state: 'running', test: s2t1 };
      adapter.stateEventSequence(s2running, s2t1running);

      const s2t1finished: TestEvent = {
        type: 'test',
        state: 'passed',
        test: s2t1,
        decorations: [],
        message: '⏱Duration: 0.00037 second(s).',
        description: '(0ms)',
        tooltip: 'Name: s2t1\nDescription: tag1\n⏱Duration: 0ms',
      };
      adapter.stateEventSequence(s2t1running, s2t1finished);
      adapter.stateEventSequence(s2t1finished, s2finished);

      const s2t3running: TestEvent = { type: 'test', state: 'running', test: s2t3 };
      adapter.stateEventSequence(s2running, s2t3running);

      const s2t3finished: TestEvent = {
        type: 'test',
        state: 'failed',
        test: s2t3,
        decorations: [
          {
            file: path.normalize('../vscode-catch2-test-adapter/src/test/suite2.cpp'),
            line: 20,
            message: '⬅ false',
            hover: '❕Original:  std::false_type::value\n❗️Expanded:  false',
          },
        ],
        description: '(0ms)',
        tooltip: 'Name: s2t3\nDescription: tag1\n⏱Duration: 0ms',
        message:
          '⏱Duration: 0.000178 second(s).\n  Expression failed (at ../vscode-catch2-test-adapter/src/test/suite2.cpp:21):\n    ❕Original:  std::false_type::value\n    ❗️Expanded:  false',
      };
      adapter.stateEventSequence(s2t3running, s2t3finished);
      adapter.stateEventSequence(s2t3finished, s2finished);

      const finished: TestRunFinishedEvent = { type: 'finished' };
      adapter.stateEventSequence(s1finished, finished);
      adapter.stateEventSequence(s2finished, finished);

      assert.equal(adapter.stateEvents.length, 14);
    });

    it('should run s1t1', async function () {
      await loadAdapterAndAssert();
      await adapter.run([s1t1.id]);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [s1t1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'passed',
          test: s1t1,
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      await adapter.run([s1t1.id]);
      adapter.simplifiedAssertEqualStateEvents([...expected, ...expected]);
    });

    it('should run skipped s2t2', async function () {
      await loadAdapterAndAssert();
      await adapter.run([s2t2.id]);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [s2t2.id] },
        { type: 'suite', state: 'running', suite: suite2 },
        { type: 'test', state: 'running', test: s2t2 },
        {
          type: 'test',
          state: 'passed',
          test: s2t2,
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite2,
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      await adapter.run([s2t2.id]);
      adapter.simplifiedAssertEqualStateEvents([...expected, ...expected]);
    });

    it('should run failing test s2t3', async function () {
      await loadAdapterAndAssert();
      await adapter.run([s2t3.id]);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [s2t3.id] },
        { type: 'suite', state: 'running', suite: suite2 },
        { type: 'test', state: 'running', test: s2t3 },
        {
          type: 'test',
          state: 'failed',
          test: s2t3,
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite2,
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      await adapter.run([s2t3.id]);
      adapter.simplifiedAssertEqualStateEvents([...expected, ...expected]);
    });

    it('should run failing test s2t3 with chunks', async function () {
      await loadAdapterAndAssert();
      const withArgs = imitation.spawnStub.withArgs(
        example1.suite2.execPath,
        example1.suite2.t3.outputs[0][0],
        sinon.match.any,
      );
      withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(example1.suite2.t3.outputs[0][1]));

      await adapter.run([s2t3.id]);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [s2t3.id] },
        { type: 'suite', state: 'running', suite: suite2 },
        { type: 'test', state: 'running', test: s2t3 },
        {
          type: 'test',
          state: 'failed',
          test: s2t3,
          decorations: [
            {
              file: path.normalize('../vscode-catch2-test-adapter/src/test/suite2.cpp'),
              line: 20,
              message: '⬅ false',
              hover: '❕Original:  std::false_type::value\n❗️Expanded:  false',
            },
          ],
          description: '(1ms)',
          message:
            '⏱Duration: 0.000596 second(s).\n  Expression failed (at ../vscode-catch2-test-adapter/src/test/suite2.cpp:21):\n    ❕Original:  std::false_type::value\n    ❗️Expanded:  false',
          tooltip: 'Name: s2t3\nDescription: tag1\n⏱Duration: 1ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite2,
          description: `.${pathlib.sep} (>1ms)`,
          tooltip:
            'Name: execPath2.exe\nDescription: .' +
            pathlib.sep +
            '\n\nPath: <masked>\nCwd: <masked>\n\nTests: 3\n  - failed: 1\n⏱Duration: >1ms',
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      await adapter.run([s2t3.id]);
      adapter.simplifiedAssertEqualStateEvents([...expected, ...expected]);
    });

    it('should run suite1', async function () {
      await loadAdapterAndAssert();
      await adapter.run([suite1.id]);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [suite1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'passed',
          test: s1t1,
          decorations: [],
          description: '(0ms)',
          message: '⏱Duration: 0.000132 second(s).',
          tooltip: 'Name: s1t1\nDescription: tag1\n⏱Duration: 0ms',
        },
        { type: 'test', state: 'running', test: s1t2 },
        {
          type: 'test',
          state: 'failed',
          test: s1t2,
          decorations: [
            {
              file: path.normalize('../vscode-catch2-test-adapter/src/test/suite1.cpp'),
              line: 14,
              message: '⬅ false',
              hover: '❕Original:  std::false_type::value\n❗️Expanded:  false',
            },
          ],
          description: '(0ms)',
          tooltip: 'Name: s1t2\nDescription: tag1\n⏱Duration: 0ms',
          message:
            '⏱Duration: 0.000204 second(s).\n  Expression failed (at ../vscode-catch2-test-adapter/src/test/suite1.cpp:15):\n    ❕Original:  std::false_type::value\n    ❗️Expanded:  false',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
          description: `.${pathlib.sep} (0ms)`,
          tooltip:
            'Name: execPath1.exe\nDescription: .' +
            pathlib.sep +
            '\n\nPath: <masked>\nCwd: <masked>\n\nTests: 2\n  - passed: 1\n  - failed: 1\n⏱Duration: 0ms',
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      await adapter.run([suite1.id]);
      adapter.simplifiedAssertEqualStateEvents([...expected, ...expected]);
    });

    it('should run with [suite1.id,s2t2.id]', async function () {
      await settings.updateConfig('test.parallelExecutionLimit', 1);
      await loadAdapterAndAssert();
      await adapter.run([suite1.id, s2t2.id]);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [suite1.id, s2t2.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'passed',
          test: s1t1,
          decorations: [],
          description: '(0ms)',
          tooltip: 'Name: s1t1\nDescription: tag1\n⏱Duration: 0ms',
          message: '⏱Duration: 0.000132 second(s).',
        },
        { type: 'test', state: 'running', test: s1t2 },
        {
          type: 'test',
          state: 'failed',
          test: s1t2,
          decorations: [
            {
              file: path.normalize('../vscode-catch2-test-adapter/src/test/suite1.cpp'),
              line: 14,
              message: '⬅ false',
              hover: '❕Original:  std::false_type::value\n❗️Expanded:  false',
            },
          ],
          description: '(0ms)',
          tooltip: 'Name: s1t2\nDescription: tag1\n⏱Duration: 0ms',
          message:
            '⏱Duration: 0.000204 second(s).\n  Expression failed (at ../vscode-catch2-test-adapter/src/test/suite1.cpp:15):\n    ❕Original:  std::false_type::value\n    ❗️Expanded:  false',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
          description: `.${pathlib.sep} (0ms)`,
          tooltip:
            'Name: execPath1.exe\nDescription: .' +
            pathlib.sep +
            '\n\nPath: <masked>\nCwd: <masked>\n\nTests: 2\n  - passed: 1\n  - failed: 1\n⏱Duration: 0ms',
        },
        { type: 'suite', state: 'running', suite: suite2 },
        { type: 'test', state: 'running', test: s2t2 },
        {
          type: 'test',
          state: 'passed',
          test: s2t2,
          decorations: [],
          description: '[.] (1ms)',
          message: '⏱Duration: 0.001294 second(s).',
          tooltip: 'Name: s2t2\nTags: [.]\nDescription: tag1\n⏱Duration: 1ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite2,
          description: `.${pathlib.sep} (>1ms)`,
          tooltip:
            'Name: execPath2.exe\nDescription: .' +
            pathlib.sep +
            '\n\nPath: <masked>\nCwd: <masked>\n\nTests: 3\n  - passed: 1\n⏱Duration: >1ms',
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);
    });

    it('should run with wrong xml with exit code', async function () {
      await loadAdapterAndAssert();
      const m = example1.suite1.t1.outputs[0][1].match('<TestCase[^>]+>');
      assert.notStrictEqual(m, undefined);
      assert.notStrictEqual(m!.input, undefined);
      assert.notStrictEqual(m!.index, undefined);
      const part = m!.input!.substr(0, m!.index! + m![0].length);
      const withArgs = imitation.spawnStub.withArgs(
        example1.suite1.execPath,
        example1.suite1.t1.outputs[0][0],
        sinon.match.any,
      );
      withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(part));

      await adapter.run([s1t1.id]);

      const expected: TestRunEvent[] = [
        { type: 'started', tests: [s1t1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'failed',
          test: s1t1,
          decorations: [],
          message:
            '😱 Unexpected error !!\n⬇ std::cout:\n<TestCase name="s1t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="7">\n⬆ std::cout\n⬇ std::cerr:\n\n⬆ std::cerr',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
          description: `.${pathlib.sep}`,
          tooltip: 'Name: execPath1.exe\nDescription: ./\n\nPath: <masked>\nCwd: <masked>\n\nTests: 2\n  - failed: 1',
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      // this tests the sinon stubs too
      await adapter.run([s1t1.id]);

      s1t1 = adapter.getTest(0, 0);

      adapter.simplifiedAssertEqualStateEvents([
        ...expected,
        { type: 'started', tests: [s1t1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'passed',
          test: s1t1,
          decorations: [],
          description: '(0ms)',
          message: '⏱Duration: 0.000112 second(s).',
          tooltip: 'Name: s1t1\nDescription: tag1\n⏱Duration: 0ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
          description: `.${pathlib.sep} (>0ms)`,
          tooltip:
            'Name: execPath1.exe\nDescription: .' +
            pathlib.sep +
            '\n\nPath: <masked>\nCwd: <masked>\n\nTests: 2\n  - passed: 1\n⏱Duration: >0ms',
        },
        { type: 'finished' },
      ]);
    });

    it('should run with wrong xml with signal', async function () {
      await loadAdapterAndAssert();
      const m = example1.suite1.t1.outputs[0][1].match('<TestCase[^>]+>');
      assert.notStrictEqual(m, undefined);
      assert.notStrictEqual(m!.input, undefined);
      assert.notStrictEqual(m!.index, undefined);
      const part = m!.input!.substr(0, m!.index! + m![0].length);
      const withArgs = imitation.spawnStub.withArgs(
        example1.suite1.execPath,
        example1.suite1.t1.outputs[0][0],
        sinon.match.any,
      );
      withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(part, 'SIGTERM'));

      await adapter.run([s1t1.id]);

      const expected: TestRunEvent[] = [
        { type: 'started', tests: [s1t1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'errored',
          test: s1t1,
          decorations: [],
          message:
            '😱 Unexpected error !!\nSignal received: SIGTERM\n⬇ std::cout:\n<TestCase name="s1t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="7">\n⬆ std::cout\n⬇ std::cerr:\n\n⬆ std::cerr',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
          description: undefined,
          tooltip: undefined,
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);

      // this tests the sinon stubs too
      await adapter.run([s1t1.id]);

      s1t1 = adapter.getTest(0, 0);

      adapter.simplifiedAssertEqualStateEvents([
        ...expected,
        { type: 'started', tests: [s1t1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'passed',
          test: s1t1,
          decorations: [],
          description: '(0ms)',
          message: '⏱Duration: 0.000112 second(s).',
          tooltip: 'Name: s1t1\nDescription: tag1\n⏱Duration: 0ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
          description: `.${pathlib.sep} (>0ms)`,
          tooltip:
            'Name: execPath1.exe\nDescription: .' +
            pathlib.sep +
            '\n\nPath: <masked>\nCwd: <masked>\n\nTests: 2\n  - passed: 1\n⏱Duration: >0ms',
        },
        { type: 'finished' },
      ]);
    });

    it('should timeout not inside a test case', async function () {
      this.slow(7000);
      await settings.updateConfig('test.runtimeLimit', 3);
      await loadAdapterAndAssert();
      const withArgs = imitation.spawnStub.withArgs(
        example1.suite1.execPath,
        example1.suite1.t1.outputs[0][0],
        sinon.match.any,
      );
      const cp = new ChildProcessStub();
      const spyKill = sinon.spy(cp, 'kill') as sinon.SinonSpy<[string?], boolean>;
      cp.write('<?xml version="1.0" encoding="UTF-8"?><Catch name="suite1">'); // no close
      withArgs.onCall(withArgs.callCount).returns(cp);

      const start = Date.now();
      await adapter.run([s1t1.id]);
      const elapsed = Date.now() - start;
      assert.ok(3000 <= elapsed && elapsed <= 5000, elapsed.toString());
      assert.deepStrictEqual(
        spyKill.getCalls().map(c => c.args),
        [[]],
      );

      cp.close();

      await waitFor(this, () => {
        return adapter.stateEvents.length >= 2;
      });

      adapter.simplifiedAssertEqualStateEvents([{ type: 'started', tests: [s1t1.id] }, { type: 'finished' }]);
    });

    it('should timeout inside a test case', async function () {
      this.slow(10000);
      const timeoutLimitSec = 2;
      await settings.updateConfig('test.runtimeLimit', timeoutLimitSec);
      await loadAdapterAndAssert();
      const withArgs = imitation.spawnStub.withArgs(
        example1.suite1.execPath,
        example1.suite1.t1.outputs[0][0],
        sinon.match.any,
      );
      const cp = new ChildProcessStub();
      const spyKill = sinon.spy(cp, 'kill');
      cp.write(
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<Catch name="suite1">',
          '  <Group name="suite1">',
          '    <TestCase name="s1t1" description="tag1" filename="suite1.cpp" line="7">',
        ].join(EOL),
      ); // no close
      withArgs.onCall(withArgs.callCount).returns(cp);

      const start = Date.now();
      await adapter.run([s1t1.id]);
      const elapsed = Date.now() - start;
      assert.ok(timeoutLimitSec * 1000 <= elapsed && elapsed <= 7000, elapsed.toString());
      assert.deepStrictEqual(
        spyKill.getCalls().map(c => c.args),
        [[]],
      );

      cp.close();

      await waitFor(this, () => {
        return adapter.stateEvents.length >= 6;
      });

      adapter.simplifiedAssertEqualStateEvents([
        { type: 'started', tests: [s1t1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'errored',
          test: s1t1,
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
        },
        { type: 'finished' },
      ]);
    });

    it('should cancel without error', async function () {
      await loadAdapterAndAssert();
      adapter.cancel();
    });

    it('cancels', async function () {
      await loadAdapterAndAssert();

      const run = adapter.run([adapter.root.id]);
      adapter.cancel();
      await run;

      const running: TestRunStartedEvent = { type: 'started', tests: [adapter.root.id] };
      const finished: TestRunFinishedEvent = { type: 'finished' };
      adapter.stateEventSequence(running, finished);

      assert.equal(adapter.stateEvents.length, 2, inspect(adapter.stateEvents));
    });

    it('cancels after run finished', async function () {
      await loadAdapterAndAssert();
      let spyKill1: sinon.SinonSpy<[(NodeJS.Signals | number)?], boolean>;
      let spyKill2: sinon.SinonSpy<[(NodeJS.Signals | number)?], boolean>;
      {
        const spawnEvent = new ChildProcessStub(example1.suite1.outputs[2][1]);
        spyKill1 = sinon.spy(spawnEvent, 'kill');
        const withArgs = imitation.spawnStub.withArgs(
          example1.suite1.execPath,
          example1.suite1.outputs[2][0],
          sinon.match.any,
        );
        withArgs.onCall(withArgs.callCount).returns(spawnEvent);
      }
      {
        const spawnEvent = new ChildProcessStub(example1.suite2.outputs[2][1]);
        spyKill2 = sinon.spy(spawnEvent, 'kill');
        const withArgs = imitation.spawnStub.withArgs(
          example1.suite2.execPath,
          example1.suite2.outputs[2][0],
          sinon.match.any,
        );
        withArgs.onCall(withArgs.callCount).returns(spawnEvent);
      }
      await adapter.run([adapter.root.id]);
      adapter.cancel();
      assert.equal(spyKill1.callCount, 0);
      assert.equal(spyKill2.callCount, 0);
    });

    it('reloads because of fswatcher event: touch(changed)', async function () {
      await loadAdapterAndAssert();
      const oldRoot = adapter.root;
      suite1Watcher.sendChange();
      await waitForMilisec(this, 300);
      assert.deepStrictEqual(oldRoot, adapter.root);
      assert.deepStrictEqual(adapter.loadEvents, []); // no change, no event
    });

    it('reloads because of fswatcher event: double touch(changed)', async function () {
      await loadAdapterAndAssert();
      const oldRoot = adapter.root;
      suite1Watcher.sendChange();
      suite1Watcher.sendChange();
      await waitForMilisec(this, 300);
      assert.deepStrictEqual(oldRoot, adapter.root);
      assert.deepStrictEqual(adapter.loadEvents, []); // no change, no event
    });

    it('reloads because of fswatcher event: double touch(changed) with delay', async function () {
      await loadAdapterAndAssert();
      const oldRoot = adapter.root;
      suite1Watcher.sendChange();
      setTimeout(() => {
        suite1Watcher.sendChange();
      }, 20);
      await waitForMilisec(this, 300);
      assert.deepStrictEqual(oldRoot, adapter.root);

      assert.deepStrictEqual(adapter.loadEvents, []); // no change, no event
    });

    it('reloads because of fswatcher event: touch(delete,create)', async function () {
      await loadAdapterAndAssert();
      const oldRoot = adapter.root;
      suite1Watcher.sendDelete();
      suite1Watcher.sendCreate();
      await waitForMilisec(this, 300);
      assert.deepStrictEqual(oldRoot, adapter.root);
      assert.deepStrictEqual(adapter.loadEvents, []); // no change, no event
    });

    it('reloads because of fswatcher event: double touch(delete,create)', async function () {
      await loadAdapterAndAssert();
      const oldRoot = adapter.root;
      suite1Watcher.sendChange();
      suite1Watcher.sendChange();
      await waitForMilisec(this, 300);
      assert.deepStrictEqual(oldRoot, adapter.root);
      assert.deepStrictEqual(adapter.loadEvents, []); // no change, no event
    });

    it('reloads because of fswatcher event: double touch(delete,create) with delay', async function () {
      await loadAdapterAndAssert();
      const oldRoot = adapter.root;
      suite1Watcher.sendChange();
      setTimeout(() => {
        suite1Watcher.sendChange();
      }, 20);
      await waitForMilisec(this, 300);
      assert.deepStrictEqual(oldRoot, adapter.root);
      assert.deepStrictEqual(adapter.loadEvents, []); // no change, no event
    });

    it('reloads because of fswatcher event: test added', async function () {
      await loadAdapterAndAssert();
      const testListOutput = example1.suite1.outputs[1][1].split('\n');
      assert.equal(testListOutput.length, 10);
      testListOutput.splice(1, 0, '  s1t0', '    suite1.cpp:6', '    tag1');
      const withArgs = imitation.spawnStub.withArgs(
        example1.suite1.execPath,
        example1.suite1.outputs[1][0],
        sinon.match.any,
      );
      withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(testListOutput.join(EOL)));

      const oldRootChildren = [...adapter.root.children];
      const oldSuite1Children = [...suite1.children];
      const oldSuite2Children = [...suite2.children];

      const newRoot = await adapter.doAndWaitForReloadEvent(this, () => {
        suite1Watcher.sendDelete();
        suite1Watcher.sendCreate();
      });

      assert.equal(newRoot, adapter.root);
      assert.equal(adapter.root.children.length, oldRootChildren.length);
      for (let i = 0; i < oldRootChildren.length; i++) {
        assert.equal(adapter.root.children[i], oldRootChildren[i]);
      }

      assert.equal(suite1.children.length, oldSuite1Children.length + 1);
      for (let i = 0; i < oldSuite1Children.length; i++) {
        const c1 = suite1.children[i] as TestInfo;
        const c2 = oldSuite1Children[i] as TestInfo;
        assert.deepStrictEqual(
          [c1.file, c1.id, c1.label, c1.line, c1.skipped, c1.type],
          [c2.file, c2.id, c2.label, c2.line, c2.skipped, c2.type],
          `at index: ${i}`,
        );
      }
      const newTest = suite1.children[2];
      assert.ok(!uniqueIdC.has(newTest.id));
      assert.equal(newTest.label, 's1t0');

      assert.equal(suite2.children.length, oldSuite2Children.length);
      for (let i = 0; i < suite2.children.length; i++) {
        assert.equal(suite2.children[i], oldSuite2Children[i]);
      }
    });

    it('reload if new tests found under run (multirun)', async function () {
      const testListOutput = example1.suite1.outputs[1][1].split('\n');
      assert.equal(testListOutput.length, 10);
      testListOutput.splice(1, 3);
      imitation.spawnStub
        .withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0], sinon.match.any)
        .callsFake(() => new ChildProcessStub(testListOutput.join(EOL)));

      adapter = new TestAdapter();

      await adapter.load();

      assert.equal(adapter.loadEvents.length, 2);
      assert.equal(adapter.root.children.length, 2);
      suite1 = adapter.group;

      assert.strictEqual(suite1.children.length, 1);

      imitation.spawnStub
        .withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0], sinon.match.any)
        .callsFake(() => new ChildProcessStub(example1.suite1.outputs[1][1]));

      const testLoadEventCount = adapter.loadEvents.length;
      await adapter.run([suite1.id]);

      assert.strictEqual(adapter.loadEvents.length, testLoadEventCount + 2);
      const expected: TestRunEvent[] = [
        { type: 'started', tests: [suite1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: adapter.getTest(0, 1) },
        { type: 'test', state: 'passed', test: adapter.getTest(0, 1) },
        { type: 'test', state: 'running', test: adapter.getTest(0, 0) },
        { type: 'test', state: 'failed', test: adapter.getTest(0, 0) },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);
    });

    it('reloads because of fswatcher event: test deleted', async function () {
      await loadAdapterAndAssert();
      const testListOutput = example1.suite1.outputs[1][1].split('\n');
      assert.equal(testListOutput.length, 10);
      testListOutput.splice(1, 3);
      const withArgs = imitation.spawnStub.withArgs(
        example1.suite1.execPath,
        example1.suite1.outputs[1][0],
        sinon.match.any,
      );
      withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(testListOutput.join(EOL)));

      const oldRootChildren = [...adapter.root.children];
      const oldSuite1Children = [...suite1.children];
      const oldSuite2Children = [...suite2.children];

      const newRoot = await adapter.doAndWaitForReloadEvent(this, () => {
        suite1Watcher.sendDelete();
        suite1Watcher.sendCreate();
      });

      assert.equal(newRoot, adapter.root);
      assert.equal(adapter.root.children.length, oldRootChildren.length);
      for (let i = 0; i < oldRootChildren.length; i++) {
        assert.equal(adapter.root.children[i], oldRootChildren[i]);
      }

      assert.equal(suite1.children.length + 1, oldSuite1Children.length);
      for (let i = 0; i < suite1.children.length; i++) {
        const c1 = suite1.children[i] as TestInfo;
        const c2 = oldSuite1Children[i + 1] as TestInfo;
        assert.deepStrictEqual(
          [c1.file, c1.id, c1.label, c1.line, c1.skipped, c1.type],
          [c2.file, c2.id, c2.label, c2.line, c2.skipped, c2.type],
          `at index: ${i}`,
        );
      }

      assert.equal(suite2.children.length, oldSuite2Children.length);
      for (let i = 0; i < suite2.children.length; i++) {
        assert.equal(suite2.children[i], oldSuite2Children[i]);
      }
    });

    it('reloads because test was renamed', async function () {
      await loadAdapterAndAssert();
      assert.ok(example1.suite1.outputs[1][1].indexOf('s1t1') != -1);
      const testListOutput = example1.suite1.outputs[1][1].replace('s1t1', 's1-t1');
      imitation.spawnStub
        .withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0], sinon.match.any)
        .returns(new ChildProcessStub(testListOutput));
      assert.ok(example1.suite1.outputs[2][1].indexOf('s1t1') != -1);
      const args = ['s1t1,s1t2', '--reporter', 'xml', '--durations', 'yes'];
      assert.deepStrictEqual(example1.suite1.outputs[2][0], args);
      const testOutput = example1.suite1.outputs[2][1].replace('s1t1', 's1-t1');
      args[0] = 's1t2,s1-t1';
      imitation.spawnStub
        .withArgs(example1.suite1.execPath, args, sinon.match.any)
        .returns(new ChildProcessStub(testOutput));

      assert.strictEqual(suite1.children.length, 2);

      await adapter.run([suite1.id]);

      await waitFor(
        this,
        function () {
          return adapter.stateEvents.length >= 8 && adapter.loadEvents.length == 2;
        },
        2000,
      );

      assert.strictEqual(suite1.children.length, 2);
      s1t1 = suite1.children[1] as TestInfo;
      assert.strictEqual(s1t1.label, 's1-t1');

      const expected: TestRunEvent[] = [
        { type: 'started', tests: [suite1.id] },
        { type: 'suite', state: 'running', suite: suite1 },
        { type: 'test', state: 'running', test: s1t1 },
        {
          type: 'test',
          state: 'passed',
          test: s1t1,
        },
        { type: 'test', state: 'running', test: s1t2 },
        {
          type: 'test',
          state: 'failed',
          test: s1t2,
        },
        {
          type: 'suite',
          state: 'completed',
          suite: suite1,
        },
        { type: 'finished' },
      ];
      adapter.simplifiedAssertEqualStateEvents(expected);
    });

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
          EOL +
          EOL,
      ];
      const withArgs = imitation.spawnStub.withArgs(
        example1.suite1.execPath,
        example1.suite1.outputs[2][0],
        sinon.match.any,
      );
      withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(newOutput));

      await adapter.run([suite1.id]);
    });
  });

  context('executables=[{<regex>}] and env={...}', function () {
    beforeEach(async function () {
      await settings.updateConfig('test.advancedExecutables', [
        {
          name: '${baseFilename}',
          pattern: 'execPath{1,2}',
          cwd: '${workspaceFolder}/cwd/${baseFilename}',
          env: {
            C2LOCALTESTENV: 'c2localtestenv',
            C2LOCALCWD: '${cwd}',
            C2ENVVARS1: 'X${os_env:PATH}X',
            C2ENVVARS2: 'X${os_env:pAtH}X',
            C2ENVVARS3: 'X${os_env_strict:NOT_EXISTING}X',
            C2WORKSPACENAME: '${workspaceName}',
          },
        },
      ]);

      imitation.vsfsWatchStub
        .withArgs(
          imitation.createAbsVscodeRelativePatternMatcher(
            path.join(settings.workspaceFolderUri.fsPath, 'execPath{1,2}'),
          ),
        )
        .callsFake(imitation.createCreateFSWatcherHandler(watchers));

      imitation.vsFindFilesStub
        .withArgs(
          imitation.createAbsVscodeRelativePatternMatcher(
            path.join(settings.workspaceFolderUri.fsPath, 'execPath{1,2}'),
          ),
        )
        .resolves([vscode.Uri.file(example1.suite1.execPath), vscode.Uri.file(example1.suite2.execPath)]);
    });

    it('should get execution options', async function () {
      await loadAdapter();
      {
        const withArgs = imitation.spawnStub.withArgs(
          example1.suite1.execPath,
          example1.suite1.outputs[2][0],
          sinon.match.any,
        );
        withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(example1.suite1.outputs[2][1]));

        await adapter.run([adapter.root.id]);

        assert.ok(withArgs.calledOnce, withArgs.args.toString());
        const cwd = path.join(settings.workspaceFolderUri.fsPath, 'cwd', 'execPath1');
        assert.equal(withArgs.firstCall.args[2].cwd, cwd);
        assert.equal(withArgs.firstCall.args[2].env!.C2LOCALCWD, cwd);
        assert.equal(withArgs.firstCall.args[2].env!.C2LOCALTESTENV, 'c2localtestenv');
        assert.equal(
          withArgs.firstCall.args[2].env!.C2WORKSPACENAME,
          path.basename(settings.workspaceFolderUri.fsPath),
        );
        assert.equal(withArgs.firstCall.args[2].env!.C2ENVVARS1, 'X' + process.env['PATH'] + 'X');

        if (isWin) assert.equal(withArgs.firstCall.args[2].env!.C2ENVVARS2, 'X' + process.env['PATH'] + 'X');
        else assert.equal(withArgs.firstCall.args[2].env!.C2ENVVARS2, 'XX');

        assert.strictEqual(withArgs.firstCall.args[2].env!.C2ENVVARS3, 'X${os_env_strict:NOT_EXISTING}X');
      }
      {
        const withArgs = imitation.spawnStub.withArgs(
          example1.suite2.execPath,
          example1.suite2.outputs[2][0],
          sinon.match.any,
        );
        withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(example1.suite2.outputs[2][1]));

        await adapter.run([adapter.root.id]);

        assert.ok(withArgs.calledTwice, withArgs.args.toString());
        const cwd = path.join(settings.workspaceFolderUri.fsPath, 'cwd', 'execPath2');
        assert.strictEqual(withArgs.secondCall.args[2]['cwd'], cwd);
        assert.strictEqual(withArgs.secondCall.args[2].env!.C2LOCALCWD, cwd);
        assert.strictEqual(withArgs.secondCall.args[2].env!.C2LOCALTESTENV, 'c2localtestenv');
        assert.strictEqual(
          withArgs.secondCall.args[2].env!.C2WORKSPACENAME,
          path.basename(settings.workspaceFolderUri.fsPath),
        );
      }
    });
  });

  context('vscode.debug', function () {
    let startDebuggingStub: sinon.SinonStub<
      [vscode.WorkspaceFolder | undefined, string | vscode.DebugConfiguration, (vscode.DebugSession | undefined)?],
      Thenable<boolean>
    >;

    beforeEach(function () {
      startDebuggingStub = imitation.sinonSandbox.stub(vscode.debug, 'startDebugging');
      startDebuggingStub.throws();
    });

    afterEach(function () {
      startDebuggingStub.restore();
    });

    it('should be debugged', async function () {
      expectedLoggedWarning(
        'Error: Failed starting the debug session. Maybe something wrong with "testMate.cpp.debug.configTemplate".',
      );
      await settings.updateConfig('test.advancedExecutables', [
        {
          name: 'X${baseFilename}',
          pattern: 'execPath1.exe',
          cwd: '${workspaceFolder}/cpp',
          env: { C2TESTVAR: 'c2testval' },
        },
      ]);

      await settings.updateConfig('debug.configTemplate', {
        label: '${label}',
        suiteLabel: '${suiteLabel}',
        exec: '${exec}',
        args: '${argsArray}',
        argsArray: '${argsArray}',
        argsStr: '${argsStr}',
        cwd: '${cwd}',
        envObj: '${envObj}',
      });

      adapter = new TestAdapter();

      await adapter.load();

      startDebuggingStub.onFirstCall().resolves(false);

      try {
        await adapter.debug([adapter.group.children[0].id]);
      } catch (e) {
        //skip
      }

      const debugConfig = startDebuggingStub.firstCall.args[1] as vscode.DebugConfiguration;

      const expectedArgs = ['s1t1', '--reporter', 'console', '--durations', 'yes', '--break'];

      assert.deepStrictEqual(debugConfig.args, expectedArgs);
      assert.deepStrictEqual(debugConfig.argsArray, expectedArgs);
      assert.deepStrictEqual(debugConfig.argsStr, '"' + expectedArgs.join('" "') + '"');
      assert.deepStrictEqual(debugConfig.cwd, path.join(settings.workspaceFolderUri.fsPath, 'cpp'));
      assert.deepStrictEqual(debugConfig.exec, example1.suite1.execPath);
      assert.deepStrictEqual(debugConfig.label, 's1t1');
      assert.deepStrictEqual(debugConfig.name, 's1t1 (XexecPath1)');
      assert.deepStrictEqual(debugConfig.request, 'launch');
      assert.deepStrictEqual(debugConfig.suiteLabel, 'XexecPath1');
      assert.deepStrictEqual(debugConfig.envObj.C2TESTVAR, 'c2testval');
    });
  });
});
