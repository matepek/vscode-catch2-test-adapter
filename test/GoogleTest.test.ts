import * as assert from 'assert';
import * as path from 'path';
import { settings, TestRunEvent } from './Common';
import { GoogleTest } from '../src/framework/GoogleTest';
import { LoggerWrapper } from '../src/LoggerWrapper';
import { AbstractRunnable } from '../src/AbstractRunnable';
import { Suite } from '../src/Suite';
import { EOL } from 'os';

///

describe(path.basename(__filename), function () {
  const gtest: GoogleTest = new GoogleTest(
    {
      log: new LoggerWrapper('config', settings.workspaceFolder, 'outputChannel'),
    },
    (null as unknown) as AbstractRunnable,
    (null as unknown) as Suite,
    'TestCase.TestName',
    'TestName',
    undefined,
    undefined,
    'gtest.cpp',
    11,
  );

  it('parses EXPECT_CALL', function () {
    const output = [
      '[ RUN      ] TestCase.TestName',
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
      '[  FAILED  ] TestCase.TestName (66 ms)',
    ].join(EOL);

    const ev = gtest.parseAndProcessTestCase(output, 42, null, '');

    const expected: TestRunEvent = {
      type: 'test',
      test: gtest,
      message: output,
      state: 'failed',
      description: '(66ms)',
      tooltip: 'Name: TestCase.TestName\n⏱Duration: 66ms',
      decorations: [
        {
          file: 'gtest.cpp',
          line: 77,
          message: '⬅ multiple failures',
          hover: [
            'EXPECT_CALL(foo, Describe(4))...',
            '  Expected arg #0: is equal to 4',
            '           Actual: 3',
            '         Expected: to be called once',
            '           Actual: never called - unsatisfied and active',
            '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯',
            "Actual function call count doesn't match EXPECT_CALL(foo, Describe(4))...",
            '         Expected: to be called once',
            '           Actual: never called - unsatisfied and active',
          ].join('\n'),
        },
      ],
    };

    assert.strictEqual(gtest.description, ev.description);
    assert.strictEqual(gtest.tooltip, ev.tooltip);
    assert.strictEqual(gtest.lastRunMilisec, 66);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(gtest.lastRunEvent, expected);
  });

  it('parses Failure/error on unix', function () {
    const output = [
      '[ RUN      ] TestCase.TestName',
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
      '[  FAILED  ] TestCase.TestName (66 ms)',
    ].join(EOL);

    const ev = gtest.parseAndProcessTestCase(output, 42, null, '');

    const expected: TestRunEvent = {
      type: 'test',
      test: gtest,
      message: output,
      state: 'failed',
      description: '(66ms)',
      tooltip: 'Name: TestCase.TestName\n⏱Duration: 66ms',
      decorations: [
        {
          file: 'gtest.cpp',
          line: 23,
          message: '⬅ Actual: false; Expected: true',
          hover: 'Value of: 1 != 1\n  Actual: false\nExpected: true',
        },
        {
          file: 'gtest.cpp',
          line: 24,
          message: '⬅ Actual: true; Expected: false',
          hover: 'Value of: 1 == 1\n  Actual: true\nExpected: false',
        },
        {
          file: 'gtest.cpp',
          line: 25,
          message: '⬅ Expected: equality',
          hover: 'Expected equality of these values:\n  1\n  2',
        },
        {
          file: 'gtest.cpp',
          line: 26,
          message: '⬅ Expected: (1) != (1), actual: 1 vs 1',
          hover: 'Expected: (1) != (1), actual: 1 vs 1',
        },
        {
          file: 'gtest.cpp',
          line: 27,
          message: '⬅ Expected: (1) < (1), actual: 1 vs 1',
          hover: 'Expected: (1) < (1), actual: 1 vs 1',
        },
        {
          file: 'gtest.cpp',
          line: 28,
          message: '⬅ Expected: (1) > (1), actual: 1 vs 1',
          hover: 'Expected: (1) > (1), actual: 1 vs 1',
        },
      ],
    };

    assert.strictEqual(gtest.description, ev.description);
    assert.strictEqual(gtest.tooltip, ev.tooltip);
    assert.strictEqual(gtest.lastRunMilisec, 66);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(gtest.lastRunEvent, expected);
  });

  it('parses Failure/error on windows', function () {
    const output = [
      '[ RUN      ] TestCase.TestName',
      'gtest.cpp(24): error: Value of: 1 != 1',
      '  Actual: false',
      'Expected: true',
      'gtest.cpp(25): error: Value of: 1 == 1',
      '  Actual: true',
      'Expected: false',
      'gtest.cpp(26): error: Expected equality of these values:',
      '  1',
      '  2',
      'gtest.cpp(27): error: Expected: (1) != (1), actual: 1 vs 1',
      'gtest.cpp(28): error: Expected: (1) < (1), actual: 1 vs 1',
      'gtest.cpp(29): error: Expected: (1) > (1), actual: 1 vs 1',
      '[  FAILED  ] TestCase.TestName (66 ms)',
    ].join(EOL);

    const ev = gtest.parseAndProcessTestCase(output, 42, null, '');

    const expected: TestRunEvent = {
      type: 'test',
      test: gtest,
      message: output.replace(/\): error: /g, '): error: \n'),
      state: 'failed',
      description: '(66ms)',
      tooltip: 'Name: TestCase.TestName\n⏱Duration: 66ms',
      decorations: [
        {
          file: 'gtest.cpp',
          line: 23,
          message: '⬅ Actual: false; Expected: true',
          hover: 'Value of: 1 != 1\n  Actual: false\nExpected: true',
        },
        {
          file: 'gtest.cpp',
          line: 24,
          message: '⬅ Actual: true; Expected: false',
          hover: 'Value of: 1 == 1\n  Actual: true\nExpected: false',
        },
        {
          file: 'gtest.cpp',
          line: 25,
          message: '⬅ Expected: equality',
          hover: 'Expected equality of these values:\n  1\n  2',
        },
        {
          file: 'gtest.cpp',
          line: 26,
          message: '⬅ Expected: (1) != (1), actual: 1 vs 1',
          hover: 'Expected: (1) != (1), actual: 1 vs 1',
        },
        {
          file: 'gtest.cpp',
          line: 27,
          message: '⬅ Expected: (1) < (1), actual: 1 vs 1',
          hover: 'Expected: (1) < (1), actual: 1 vs 1',
        },
        {
          file: 'gtest.cpp',
          line: 28,
          message: '⬅ Expected: (1) > (1), actual: 1 vs 1',
          hover: 'Expected: (1) > (1), actual: 1 vs 1',
        },
      ],
    };

    assert.strictEqual(gtest.description, ev.description);
    assert.strictEqual(gtest.tooltip, ev.tooltip);
    assert.strictEqual(gtest.lastRunMilisec, 66);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(gtest.lastRunEvent, expected);
  });
});
