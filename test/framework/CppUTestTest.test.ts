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
      'expected <10 (0xa)>',
      'but was  < 1 (0x1)>',
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
          hover: 'expected <10 (0xa)>\nbut was  < 1 (0x1)>',
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

  it('parses passed test', function () {
    const output = [
      'TEST(UtestShell, compareDoubles) - 30 ms',
    ].join(EOL);

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

  it('parses ignored test', function () {
    const output = [
      'IGNORE_TEST(UtestShell, IgnoreTestAccessingFixture) - 0 ms',
    ].join(EOL);

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
