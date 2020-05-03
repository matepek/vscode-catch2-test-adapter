import * as fse from 'fs-extra';
import * as assert from 'assert';
import * as pathlib from 'path';
import * as sinon from 'sinon';
import { EOL } from 'os';
import { example1 } from './example1';
import { TestAdapter, Imitation, settings, ChildProcessStub, expectedLoggedErrorLine, TestRunEvent } from './Common';

///

describe(pathlib.basename(__filename), function () {
  this.timeout(10000);

  let imitation: Imitation;
  let adapter: TestAdapter | undefined = undefined;

  before(function () {
    imitation = new Imitation();
    fse.removeSync(settings.dotVscodePath);
  });

  after(function () {
    imitation.restore();
  });

  beforeEach(function () {
    adapter = undefined;

    imitation.resetToCallThrough();
    example1.initImitation(imitation);

    return settings.resetConfig();
  });

  afterEach(async function () {
    if (adapter) await adapter.waitAndDispose(this);
  });

  it('loads gtest1 from output because there is xml parsing error', async function () {
    expectedLoggedErrorLine('[ERROR] Error: Google Test version not found');

    this.slow(500);
    await settings.updateConfig('test.executables', example1.gtest1.execPath);

    adapter = new TestAdapter();

    imitation.spawnStub
      .withArgs(example1.gtest1.execPath, sinon.match.some(sinon.match('--gtest_list_tests')), sinon.match.any)
      .callsFake(() => new ChildProcessStub(example1.gtest1.gtest_list_tests_output));

    imitation.fsReadFileSyncStub.withArgs(sinon.match(/.*tmp_gtest_output_.+\.xml\.tmp/), 'utf8').returns('not an xml');

    await adapter.load();

    assert.equal(adapter.testLoadsEvents.length, 2);
    assert.equal(adapter.root.children.length, 1);
    assert.equal(adapter.suite1.children.length, 7);
  });

  describe('load gtest1', function () {
    let adapter: TestAdapter;

    beforeEach(async function () {
      await settings.updateConfig('test.executables', example1.gtest1.execPath);

      imitation.spawnStub
        .withArgs(example1.gtest1.execPath, sinon.match.some(sinon.match('--gtest_list_tests')), sinon.match.any)
        .callsFake(function () {
          return new ChildProcessStub(example1.gtest1.gtest_list_tests_output);
        });

      imitation.fsReadFileSyncStub
        .withArgs(sinon.match(/.*tmp_gtest_output_.+\.xml\.tmp/), 'utf8')
        .returns(example1.gtest1.gtest_list_tests_output_xml);

      adapter = new TestAdapter();

      await adapter.load();

      assert.equal(adapter.testLoadsEvents.length, 2);
      assert.equal(adapter.root.children.length, 1);
      assert.equal(adapter.suite1.children.length, 7);
    });

    afterEach(function () {
      return adapter.waitAndDispose(this);
    });

    specify('run all', async function () {
      this.slow(500);

      const expected: TestRunEvent[] = [
        { type: 'started', tests: [adapter.root.id] },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0) },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0, 0) },
        { type: 'test', state: 'running', test: adapter.getTest(0, 0, 0) },
        {
          type: 'test',
          state: 'passed',
          test: adapter.getTest(0, 0, 0),
          description: '(0ms)',
          tooltip: 'Name: TestCas1.test1\n⏱Duration: 0ms',
          decorations: [],
          message: ['[ RUN      ] TestCas1.test1', '[       OK ] TestCas1.test1 (0 ms)'].join(EOL),
        },
        { type: 'test', state: 'running', test: adapter.getTest(0, 0, 1) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 0, 1),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0, 0),
        },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0, 1) },
        { type: 'test', state: 'running', test: adapter.getTest(0, 1, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 1, 0),
        },
        { type: 'test', state: 'running', test: adapter.getTest(0, 1, 1) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 1, 1),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0, 1),
        },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0, 2) },
        { type: 'test', state: 'running', test: adapter.getTest(0, 2, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 2, 0),
        },
        { type: 'test', state: 'running', test: adapter.getTest(0, 2, 1) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 2, 1),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0, 2),
        },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0, 3) },
        { type: 'test', state: 'running', test: adapter.getTest(0, 3, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 3, 0),
        },
        { type: 'test', state: 'running', test: adapter.getTest(0, 3, 1) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 3, 1),
        },
        { type: 'test', state: 'running', test: adapter.getTest(0, 3, 2) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 3, 2),
        },
        { type: 'test', state: 'running', test: adapter.getTest(0, 3, 3) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 3, 3),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0, 3),
        },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0, 4) },
        { type: 'test', state: 'running', test: adapter.getTest(0, 4, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 4, 0),
        },
        { type: 'test', state: 'running', test: adapter.getTest(0, 4, 1) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 4, 1),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0, 4),
        },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0, 5) },
        { type: 'test', state: 'running', test: adapter.getTest(0, 5, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 5, 0),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0, 5),
        },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0, 6) },
        { type: 'test', state: 'running', test: adapter.getTest(0, 6, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 6, 0),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0, 6),
          description: '(0ms)',
          tooltip: 'Name: TestThreeParams/1\n\nTests: 1\n  - failed: 1\n⏱Duration: 0ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0),
        },
        { type: 'finished' },
      ];

      await adapter.run([adapter.root.id]);

      adapter.testStatesEventsSimplifiedAssertEqual(expected);
    });

    specify('run first', async function () {
      this.slow(500);

      const expected: TestRunEvent[] = [
        { type: 'started', tests: [adapter.getTest(0, 0, 0).id] },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0) },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0, 0) },
        { type: 'test', state: 'running', test: adapter.getTest(0, 0, 0) },
        {
          type: 'test',
          state: 'passed',
          test: adapter.getTest(0, 0, 0),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0, 0),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0),
        },
        { type: 'finished' },
      ];

      await adapter.run([adapter.getTest(0, 0, 0).id]);

      adapter.testStatesEventsSimplifiedAssertEqual(expected);
    });

    specify('run param', async function () {
      this.slow(500);

      const expected: TestRunEvent[] = [
        { type: 'started', tests: [adapter.getTest(0, 3, 0).id] },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0) },
        { type: 'suite', state: 'running', suite: adapter.getGroup(0, 3) },
        { type: 'test', state: 'running', test: adapter.getTest(0, 3, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.getTest(0, 3, 0),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0, 3),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.getGroup(0),
        },
        { type: 'finished' },
      ];

      await adapter.run([adapter.getTest(0, 3, 0).id]);

      adapter.testStatesEventsSimplifiedAssertEqual(expected);
    });
  });

  specify.skip('custom1 test case list', async function () {
    this.slow(500);
    await settings.updateConfig('test.executables', example1.gtest1.execPath);

    adapter = new TestAdapter();

    const testListOutput = ['NOTHING TO TEST now, thi is just a template'];

    const withArgs = imitation.spawnStub.withArgs(
      example1.suite1.execPath,
      example1.suite1.outputs[1][0],
      sinon.match.any,
    );
    withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(testListOutput.join(EOL)));

    await adapter.load();

    assert.equal(adapter.root.children.length, 1);

    const suite1 = adapter.suite1;
    assert.equal(suite1.children.length, 1);

    assert.strictEqual(suite1.label, 'execPath1.exe');
    assert.strictEqual(suite1.children[0].label, 'first');
  });
});
