import * as assert from 'assert';
import * as path from 'path';
import { CppUTestTest } from '../../src/framework/CppUTestTest';
import { AbstractRunnable } from '../../src/AbstractRunnable';
import { Suite } from '../../src/Suite';
import { EOL } from 'os';
import { TestRunEvent } from '../../src/SharedVariables';
import { logger } from '../LogOutputContent.test';

describe(path.basename(__filename), function () {
  const cpputest: CppUTestTest = new CppUTestTest(
    {
      log: logger,
    },
    null as unknown as AbstractRunnable,
    null as unknown as Suite,
    'TestCase.TestName',
    'TestName',
    'gtest.cpp',
    11,
  );

  it('parses failed test', function () {
    const output = [
      'TEST(UtestShell, PassedCheckEqualWillIncreaseTheAmountOfChecks)',
      '/workspaces/cpputest-4.0/tests/CppUTest/UtestTest.cpp:90: error: Failure in TEST(UtestShell, PassedCheckEqualWillIncreaseTheAmountOfChecks)',
      'LONGS_EQUAL(10, fixture.getCheckCount()) failed',
      '\texpected <10 (0xa)>',
      '\tbut was  < 1 (0x1)>',
      ' - 47 ms',
    ].join(EOL);

    const ev = cpputest.parseAndProcessTestCase('runid', output, 42, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      test: cpputest.id,
      message: output,
      state: 'failed',
      description: '(47ms)',
      tooltip: 'Name: TestCase.TestName\n⏱Duration: 47ms',
      decorations: [
        {
          file: 'UtestTest.cpp',
          hover: '\texpected <10 (0xa)>\n\tbut was  < 1 (0x1)>',
          line: 89,
          message: '⬅ expected <10 (0xa)>; but was  < 1 (0x1)>',
        },
      ],
    };

    assert.strictEqual(cpputest.description, ev.description);
    assert.strictEqual(cpputest.tooltip, ev.tooltip);
    assert.strictEqual(cpputest.lastRunMilisec, 47);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(cpputest.lastRunEvent, expected);
  });

  it('parses another failed test', function () {
    const output = [
      'TEST(read_rssi, min_rssi_with_min_gain)',
      '/workspaces/cpputest-4.0/tests/CppUTest/test_read_rssi.cpp:176: error: Failure in TEST(read_rssi, min_rssi_with_min_gain)',
      '\texpected <-1984>',
      '\tbut was  <-1987>',
      'difference starts at position 4 at: <      -1987         >',
      '                                           ^',
      '',
      '- 47 ms',
    ].join(EOL);

    const ev = cpputest.parseAndProcessTestCase('runid', output, 42, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      test: cpputest.id,
      message: output,
      state: 'failed',
      description: '(47ms)',
      tooltip: 'Name: TestCase.TestName\n⏱Duration: 47ms',
      decorations: [
        {
          file: 'test_read_rssi.cpp',
          hover: '\texpected <-1984>\n\tbut was  <-1987>',
          line: 175,
          message: '⬅ expected <-1984>; but was  <-1987>',
        },
      ],
    };

    assert.strictEqual(cpputest.description, ev.description);
    assert.strictEqual(cpputest.tooltip, ev.tooltip);
    assert.strictEqual(cpputest.lastRunMilisec, 47);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(cpputest.lastRunEvent, expected);
  });

  it('parses passed test', function () {
    const output = ['TEST(UtestShell, compareDoubles) - 30 ms'].join(EOL);

    const ev = cpputest.parseAndProcessTestCase('runid', output, 42, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      test: cpputest.id,
      message: output,
      state: 'passed',
      description: '(30ms)',
      tooltip: 'Name: TestCase.TestName\n⏱Duration: 30ms',
      decorations: [],
    };

    assert.strictEqual(cpputest.description, ev.description);
    assert.strictEqual(cpputest.tooltip, ev.tooltip);
    assert.strictEqual(cpputest.lastRunMilisec, 30);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(cpputest.lastRunEvent, expected);
  });

  it('parses passed test with multilines', function () {
    const output = ['TEST(UtestShell, compareDoubles)', ' - 30 ms'].join(EOL);

    const ev = cpputest.parseAndProcessTestCase('runid', output, 42, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      test: cpputest.id,
      message: output,
      state: 'passed',
      description: '(30ms)',
      tooltip: 'Name: TestCase.TestName\n⏱Duration: 30ms',
      decorations: [],
    };

    assert.strictEqual(cpputest.description, ev.description);
    assert.strictEqual(cpputest.tooltip, ev.tooltip);
    assert.strictEqual(cpputest.lastRunMilisec, 30);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(cpputest.lastRunEvent, expected);
  });

  it('parses passed multilines test with extra texts', function () {
    const output = [
      'TEST(UtestShell, compareDoubles) Assertion fail /workspaces/user/app/base/system/workqueue.c:34',
      ' - 10 ms',
    ].join(EOL);

    const ev = cpputest.parseAndProcessTestCase('runid', output, 42, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      test: cpputest.id,
      message: output,
      state: 'passed',
      description: '(10ms)',
      tooltip: 'Name: TestCase.TestName\n⏱Duration: 10ms',
      decorations: [],
    };

    assert.strictEqual(cpputest.description, ev.description);
    assert.strictEqual(cpputest.tooltip, ev.tooltip);
    assert.strictEqual(cpputest.lastRunMilisec, 10);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(cpputest.lastRunEvent, expected);
  });

  it('parses ignored test', function () {
    const output = ['IGNORE_TEST(UtestShell, IgnoreTestAccessingFixture) - 0 ms'].join(EOL);

    const ev = cpputest.parseAndProcessTestCase('runid', output, 0, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      test: cpputest.id,
      message: output,
      state: 'skipped',
      description: '(0ms)',
      tooltip: 'Name: TestCase.TestName\n⏱Duration: 0ms',
      decorations: [],
    };

    assert.strictEqual(cpputest.description, ev.description);
    assert.strictEqual(cpputest.tooltip, ev.tooltip);
    assert.strictEqual(cpputest.lastRunMilisec, 0);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(cpputest.lastRunEvent, expected);
  });
});
