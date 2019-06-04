//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as fse from 'fs-extra';
import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import { EOL } from 'os';
import { example1 } from './example1';
import { TestAdapter, Imitation, settings, ChildProcessStub } from './Common';

///

describe(path.basename(__filename), function() {
  let imitation: Imitation;
  let adapter: TestAdapter | undefined = undefined;

  before(function() {
    imitation = new Imitation();
    fse.removeSync(settings.dotVscodePath);
  });

  after(function() {
    imitation.restore();
  });

  beforeEach(function() {
    this.timeout(8000);
    adapter = undefined;

    imitation.resetToCallThrough();
    example1.initImitation(imitation);

    return settings.resetConfig();
  });

  afterEach(async function() {
    this.timeout(8000);
    if (adapter) await adapter.waitAndDispose(this);
  });

  it('loads gtest1 from output because there is xml parsing error', async function() {
    this.slow(500);
    await settings.updateConfig('executables', example1.gtest1.execPath);

    adapter = new TestAdapter();

    imitation.spawnStub
      .withArgs(
        example1.gtest1.execPath,
        sinon.match((args: string[]) => {
          return args[0] === '--gtest_list_tests';
        }),
      )
      .callsFake(function() {
        return new ChildProcessStub(example1.gtest1.gtest_list_tests_output);
      });

    imitation.fsReadFileSyncStub.withArgs(sinon.match(/.*tmp_gtest_output_.+\.xml\.tmp/), 'utf8').returns('not an xml');

    await adapter.load();

    assert.equal(adapter.testLoadsEvents.length, 2);
    assert.equal(adapter.root.children.length, 1);
    assert.equal(adapter.suite1.children.length, 7);
  });

  describe('load gtest1', function() {
    let adapter: TestAdapter;

    beforeEach(async function() {
      await settings.updateConfig('executables', example1.gtest1.execPath);

      imitation.spawnStub
        .withArgs(
          example1.gtest1.execPath,
          sinon.match((args: string[]) => {
            return args[0] === '--gtest_list_tests';
          }),
        )
        .callsFake(function() {
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

    afterEach(function() {
      return adapter.waitAndDispose(this);
    });

    specify('run all', async function() {
      this.slow(500);

      const expected = [
        { type: 'started', tests: [adapter.root.id] },
        { type: 'suite', state: 'running', suite: adapter.get(0) },
        { type: 'suite', state: 'running', suite: adapter.get(0, 0) },
        { type: 'test', state: 'running', test: adapter.get(0, 0, 0) },
        {
          type: 'test',
          state: 'passed',
          test: adapter.get(0, 0, 0),
          description: '(0ms)',
          tooltip: 'Name: TestCas1.test1\n\n⏱ 0ms',
          decorations: [],
          message: ['[ RUN      ] TestCas1.test1', '[       OK ] TestCas1.test1 (0 ms)'].join(EOL),
        },
        { type: 'test', state: 'running', test: adapter.get(0, 0, 1) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 0, 1),
          decorations: [
            {
              line: 18,
              message: '⬅️ Actual: false;  Expected: true;',
              hover: 'Value of: 1 == 2\n  Actual: false\nExpected: true',
            },
          ],
          description: '(0ms)',
          tooltip: 'Name: TestCas1.test2\n\n⏱ 0ms',
          message: [
            '[ RUN      ] TestCas1.test2',
            'gtest.cpp:19: Failure',
            'Value of: 1 == 2',
            '  Actual: false',
            'Expected: true',
            '[  FAILED  ] TestCas1.test2 (0 ms)',
          ].join(EOL),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0, 0),
          description: '(0ms)',
          tooltip: 'Name: TestCas1\n\nTests: 2\n  - passed: 1\n  - failed: 1\n\n⏱ 0ms',
        },
        { type: 'suite', state: 'running', suite: adapter.get(0, 1) },
        { type: 'test', state: 'running', test: adapter.get(0, 1, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 1, 0),
          decorations: [
            {
              line: 23,
              message: '⬅️ Actual: false;  Expected: true;',
              hover: 'Value of: 1 != 1\n  Actual: false\nExpected: true',
            },
            {
              line: 24,
              message: '⬅️ Actual: true;  Expected: false;',
              hover: 'Value of: 1 == 1\n  Actual: true\nExpected: false',
            },
            { line: 25, message: '⬅️ Expected equality', hover: 'Expected equality of these values:\n  1\n  2' },
            {
              line: 26,
              message: '⬅️ Expected: (1) != (1), actual: 1 vs 1',
              hover: 'Expected: (1) != (1), actual: 1 vs 1',
            },
            {
              line: 27,
              message: '⬅️ Expected: (1) < (1), actual: 1 vs 1',
              hover: 'Expected: (1) < (1), actual: 1 vs 1',
            },
            {
              line: 28,
              message: '⬅️ Expected: (1) > (1), actual: 1 vs 1',
              hover: 'Expected: (1) > (1), actual: 1 vs 1',
            },
          ],
          description: '(1ms)',
          tooltip: 'Name: TestCas2.test1\n\n⏱ 1ms',
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
        { type: 'test', state: 'running', test: adapter.get(0, 1, 1) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 1, 1),
          decorations: [
            {
              line: 31,
              message: '⬅️ Actual: false;  Expected: true;',
              hover: 'Value of: false\n  Actual: false\nExpected: true',
            },
            {
              line: 35,
              message:
                "⬅️ Expected: magic_func() doesn't generate new fatal failures in the current thread.;    Actual: it does.",
              hover:
                "Expected: magic_func() doesn't generate new fatal failures in the current thread.\n  Actual: it does.",
            },
          ],
          description: '(0ms)',
          tooltip: 'Name: TestCas2.test2\n\n⏱ 0ms',
          message: [
            '[ RUN      ] TestCas2.test2',
            'gtest.cpp:32: Failure',
            'Value of: false',
            '  Actual: false',
            'Expected: true',
            'gtest.cpp:36: Failure',
            "Expected: magic_func() doesn't generate new fatal failures in the current thread.",
            '  Actual: it does.',
            '[  FAILED  ] TestCas2.test2 (0 ms)',
          ].join(EOL),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0, 1),
          description: '(1ms)',
          tooltip: 'Name: TestCas2\n\nTests: 2\n  - failed: 2\n\n⏱ 1ms',
        },
        { type: 'suite', state: 'running', suite: adapter.get(0, 2) },
        { type: 'test', state: 'running', test: adapter.get(0, 2, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 2, 0),
          decorations: [
            {
              line: 69,
              message: '⬅️ Expected: to be called once;  Actual: never called - unsatisfied and active;',
              hover:
                "Actual function call count doesn't match EXPECT_CALL(foo, GetSize())...\n         Expected: to be called once\n           Actual: never called - unsatisfied and active",
            },
          ],
          description: '(0ms)',
          tooltip: 'Name: MockTestCase.expect1\n\n⏱ 0ms',
          message: [
            '[ RUN      ] MockTestCase.expect1',
            'gtest.cpp:70: Failure',
            "Actual function call count doesn't match EXPECT_CALL(foo, GetSize())...",
            '         Expected: to be called once',
            '           Actual: never called - unsatisfied and active',
            '[  FAILED  ] MockTestCase.expect1 (0 ms)',
          ].join(EOL),
        },
        { type: 'test', state: 'running', test: adapter.get(0, 2, 1) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 2, 1),
          decorations: [
            {
              line: 77,
              message: '⬅️ Expected: to be called once;  Actual: never called - unsatisfied and active;',
              hover:
                "Actual function call count doesn't match EXPECT_CALL(foo, Describe(4))...\n         Expected: to be called once\n           Actual: never called - unsatisfied and active",
            },
          ],
          description: '(0ms)',
          tooltip: 'Name: MockTestCase.expect2\n\n⏱ 0ms',
          message: [
            '[ RUN      ] MockTestCase.expect2',
            'unknown file: Failure',
            '',
            'Unexpected mock function call - returning directly.',
            '    Function call: Describe(3)',
            "Google Mock tried the following 1 expectation, but it didn't match: ",
            '',
            'gtest.cpp:78: EXPECT_CALL(foo, Describe(4))...',
            '  Expected arg #0: is equal to 4',
            '           Actual: 3',
            '         Expected: to be called once',
            '           Actual: never called - unsatisfied and active',
            'gtest.cpp:78: Failure',
            "Actual function call count doesn't match EXPECT_CALL(foo, Describe(4))...",
            '         Expected: to be called once',
            '           Actual: never called - unsatisfied and active',
            '[  FAILED  ] MockTestCase.expect2 (0 ms)',
          ].join(EOL),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0, 2),
          description: '(0ms)',
          tooltip: 'Name: MockTestCase\n\nTests: 2\n  - failed: 2\n\n⏱ 0ms',
        },
        { type: 'suite', state: 'running', suite: adapter.get(0, 3) },
        { type: 'test', state: 'running', test: adapter.get(0, 3, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 3, 0),
          decorations: [
            {
              line: 40,
              message: '⬅️ Expected equality',
              hover: 'Expected equality of these values:\n  1\n  GetParam()\n    Which is: 2',
            },
          ],
          description: '#️⃣Value: 2 (0ms)',
          message: [
            '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails1/0',
            'gtest.cpp:41: Failure',
            'Expected equality of these values:',
            '  1',
            '  GetParam()',
            '    Which is: 2',
            '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/0, where GetParam() = 2 (0 ms)',
          ].join(EOL),
          tooltip: 'Name: PrintingFailingParams1/FailingParamTest.Fails1/0\n\n#️⃣GetParam() = 2\n\n⏱ 0ms',
        },
        { type: 'test', state: 'running', test: adapter.get(0, 3, 1) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 3, 1),
          decorations: [
            {
              line: 40,
              message: '⬅️ Expected equality',
              hover: 'Expected equality of these values:\n  1\n  GetParam()\n    Which is: 3',
            },
          ],
          description: '#️⃣Value: 3 (0ms)',
          message: [
            '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails1/1',
            'gtest.cpp:41: Failure',
            'Expected equality of these values:',
            '  1',
            '  GetParam()',
            '    Which is: 3',
            '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/1, where GetParam() = 3 (0 ms)',
          ].join(EOL),
          tooltip: 'Name: PrintingFailingParams1/FailingParamTest.Fails1/1\n\n#️⃣GetParam() = 3\n\n⏱ 0ms',
        },
        { type: 'test', state: 'running', test: adapter.get(0, 3, 2) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 3, 2),
          decorations: [
            {
              line: 41,
              message: '⬅️ Expected equality',
              hover: 'Expected equality of these values:\n  1\n  GetParam()\n    Which is: 2',
            },
          ],
          description: '#️⃣Value: 2 (1ms)',
          message: [
            '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails2/0',
            'gtest.cpp:42: Failure',
            'Expected equality of these values:',
            '  1',
            '  GetParam()',
            '    Which is: 2',
            '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails2/0, where GetParam() = 2 (1 ms)',
          ].join(EOL),
          tooltip: 'Name: PrintingFailingParams1/FailingParamTest.Fails2/0\n\n#️⃣GetParam() = 2\n\n⏱ 1ms',
        },
        { type: 'test', state: 'running', test: adapter.get(0, 3, 3) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 3, 3),
          decorations: [
            {
              line: 41,
              message: '⬅️ Expected equality',
              hover: 'Expected equality of these values:\n  1\n  GetParam()\n    Which is: 3',
            },
          ],
          description: '#️⃣Value: 3 (0ms)',
          message: [
            '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails2/1',
            'gtest.cpp:42: Failure',
            'Expected equality of these values:',
            '  1',
            '  GetParam()',
            '    Which is: 3',
            '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails2/1, where GetParam() = 3 (0 ms)',
          ].join(EOL),
          tooltip: 'Name: PrintingFailingParams1/FailingParamTest.Fails2/1\n\n#️⃣GetParam() = 3\n\n⏱ 0ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0, 3),
          description: '(1ms)',
          tooltip: 'Name: PrintingFailingParams1/FailingParamTest\n\nTests: 4\n  - failed: 4\n\n⏱ 1ms',
        },
        { type: 'suite', state: 'running', suite: adapter.get(0, 4) },
        { type: 'test', state: 'running', test: adapter.get(0, 4, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 4, 0),
          decorations: [
            {
              line: 40,
              message: '⬅️ Expected equality',
              hover: 'Expected equality of these values:\n  1\n  GetParam()\n    Which is: 3',
            },
          ],
          description: '#️⃣Value: 3 (0ms)',
          message: [
            '[ RUN      ] PrintingFailingParams2/FailingParamTest.Fails1/0',
            'gtest.cpp:41: Failure',
            'Expected equality of these values:',
            '  1',
            '  GetParam()',
            '    Which is: 3',
            '[  FAILED  ] PrintingFailingParams2/FailingParamTest.Fails1/0, where GetParam() = 3 (0 ms)',
          ].join(EOL),
          tooltip: 'Name: PrintingFailingParams2/FailingParamTest.Fails1/0\n\n#️⃣GetParam() = 3\n\n⏱ 0ms',
        },
        { type: 'test', state: 'running', test: adapter.get(0, 4, 1) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 4, 1),
          decorations: [
            {
              line: 41,
              message: '⬅️ Expected equality',
              hover: 'Expected equality of these values:\n  1\n  GetParam()\n    Which is: 3',
            },
          ],
          description: '#️⃣Value: 3 (0ms)',
          message: [
            '[ RUN      ] PrintingFailingParams2/FailingParamTest.Fails2/0',
            'gtest.cpp:42: Failure',
            'Expected equality of these values:',
            '  1',
            '  GetParam()',
            '    Which is: 3',
            '[  FAILED  ] PrintingFailingParams2/FailingParamTest.Fails2/0, where GetParam() = 3 (0 ms)',
          ].join(EOL),
          tooltip: 'Name: PrintingFailingParams2/FailingParamTest.Fails2/0\n\n#️⃣GetParam() = 3\n\n⏱ 0ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0, 4),
          description: '#️⃣Value: 3 (0ms)',
          tooltip: 'Name: PrintingFailingParams2/FailingParamTest\n\nTests: 2\n  - failed: 2\n\n⏱ 0ms',
        },
        { type: 'suite', state: 'running', suite: adapter.get(0, 5) },
        { type: 'test', state: 'running', test: adapter.get(0, 5, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 5, 0),
          decorations: [
            {
              line: 110,
              message: '⬅️ Actual: false;  Expected: true;',
              hover: 'Value of: std::max<A>(A(-5), B(2)) == 5\n  Actual: false\nExpected: true',
            },
          ],
          description: '#️⃣Type: std::tuple<float, double, short> (1ms)',
          message: [
            '[ RUN      ] TestThreeParams/0.MaximumTest',
            'gtest.cpp:111: Failure',
            'Value of: std::max<A>(A(-5), B(2)) == 5',
            '  Actual: false',
            'Expected: true',
            '[  FAILED  ] TestThreeParams/0.MaximumTest, where TypeParam = std::tuple<float, double, short> (1 ms)',
          ].join(EOL),
          tooltip: 'Name: TestThreeParams/0.MaximumTest\n\n#️⃣TypeParam() = std::tuple<float, double, short>\n\n⏱ 1ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0, 5),
          description: '#️⃣Type: std::tuple<float, double, short> (1ms)',
          tooltip: 'Name: TestThreeParams/0\n\nTests: 1\n  - failed: 1\n\n⏱ 1ms',
        },
        { type: 'suite', state: 'running', suite: adapter.get(0, 6) },
        { type: 'test', state: 'running', test: adapter.get(0, 6, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 6, 0),
          decorations: [
            {
              line: 110,
              message: '⬅️ Actual: false;  Expected: true;',
              hover: 'Value of: std::max<A>(A(-5), B(2)) == 5\n  Actual: false\nExpected: true',
            },
          ],
          description: '#️⃣Type: std::tuple<long long, signed char, float> (0ms)',
          message: [
            '[ RUN      ] TestThreeParams/1.MaximumTest',
            'gtest.cpp:111: Failure',
            'Value of: std::max<A>(A(-5), B(2)) == 5',
            '  Actual: false',
            'Expected: true',
            '[  FAILED  ] TestThreeParams/1.MaximumTest, where TypeParam = std::tuple<long long, signed char, float> (0 ms)',
          ].join(EOL),
          tooltip:
            'Name: TestThreeParams/1.MaximumTest\n\n#️⃣TypeParam() = std::tuple<long long, signed char, float>\n\n⏱ 0ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0, 6),
          description: '#️⃣Type: std::tuple<long long, signed char, float> (0ms)',
          tooltip: 'Name: TestThreeParams/1\n\nTests: 1\n  - failed: 1\n\n⏱ 0ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0),
          description: './ (3ms)',
          tooltip:
            'Name: gtest1.exe\nDescription: ./\n\nPath: <masked>\nCwd: <masked>\n\nTests: 14\n  - passed: 1\n  - failed: 13\n\n⏱ 3ms',
        },
        { type: 'finished' },
      ];

      await adapter.run([adapter.root.id]);

      assert.deepStrictEqual(adapter.testStatesEvents, expected);
    });

    specify('run first', async function() {
      this.slow(500);

      const expected = [
        { type: 'started', tests: [adapter.get(0, 0, 0).id] },
        { type: 'suite', state: 'running', suite: adapter.get(0) },
        { type: 'suite', state: 'running', suite: adapter.get(0, 0) },
        { type: 'test', state: 'running', test: adapter.get(0, 0, 0) },
        {
          type: 'test',
          state: 'passed',
          test: adapter.get(0, 0, 0),
          decorations: [],
          description: '(0ms)',
          tooltip: 'Name: TestCas1.test1\n\n⏱ 0ms',
          message: ['[ RUN      ] TestCas1.test1', '[       OK ] TestCas1.test1 (0 ms)'].join(EOL),
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0, 0),
          description: '(0ms)',
          tooltip: 'Name: TestCas1\n\nTests: 2\n  - passed: 1\n\n⏱ 0ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0),
          description: './ (0ms)',
          tooltip:
            'Name: gtest1.exe\nDescription: ./\n\nPath: <masked>\nCwd: <masked>\n\nTests: 14\n  - passed: 1\n\n⏱ 0ms',
        },
        { type: 'finished' },
      ];

      await adapter.run([adapter.get(0, 0, 0).id]);

      assert.deepStrictEqual(adapter.testStatesEvents, expected);
    });

    specify('run param', async function() {
      this.slow(500);

      const expected = [
        { type: 'started', tests: [adapter.get(0, 3, 0).id] },
        { type: 'suite', state: 'running', suite: adapter.get(0) },
        { type: 'suite', state: 'running', suite: adapter.get(0, 3) },
        { type: 'test', state: 'running', test: adapter.get(0, 3, 0) },
        {
          type: 'test',
          state: 'failed',
          test: adapter.get(0, 3, 0),
          decorations: [
            {
              line: 40,
              message: '⬅️ Expected equality',
              hover: 'Expected equality of these values:\n  1\n  GetParam()\n    Which is: 2',
            },
          ],
          description: '#️⃣Value: 2 (0ms)',
          tooltip: 'Name: PrintingFailingParams1/FailingParamTest.Fails1/0\n\n#️⃣GetParam() = 2\n\n⏱ 0ms',
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
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0, 3),
          description: '(0ms)',
          tooltip: 'Name: PrintingFailingParams1/FailingParamTest\n\nTests: 4\n  - failed: 1\n\n⏱ 0ms',
        },
        {
          type: 'suite',
          state: 'completed',
          suite: adapter.get(0),
          description: './ (0ms)',
          tooltip:
            'Name: gtest1.exe\nDescription: ./\n\nPath: <masked>\nCwd: <masked>\n\nTests: 14\n  - failed: 1\n\n⏱ 0ms',
        },
        { type: 'finished' },
      ];

      await adapter.run([adapter.get(0, 3, 0).id]);

      assert.deepStrictEqual(adapter.testStatesEvents, expected);
    });
  });
});
