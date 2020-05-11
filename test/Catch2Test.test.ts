import * as assert from 'assert';
import * as path from 'path';
import { settings, TestRunEvent } from './Common';
import { Catch2Test } from '../src/framework/Catch2Test';
import { LoggerWrapper } from '../src/LoggerWrapper';
import { AbstractRunnable } from '../src/AbstractRunnable';
import { Suite } from '../src/Suite';
import { Version } from '../src/Util';

///

describe(path.basename(__filename), function () {
  const catch2: Catch2Test = new Catch2Test(
    {
      log: new LoggerWrapper('config', settings.workspaceFolder, 'outputChannel'),
    },
    (null as unknown) as AbstractRunnable,
    (null as unknown) as Suite,
    new Version(1, 2, 3),
    'TestName',
    ['tag1'],
    'gtest.cpp',
    11,
    undefined,
  );

  it('should parse s1t', function () {
    const output = `
          <TestCase name="s1t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="7">
            <OverallResult success="true" durationInSeconds="0.000112"/>
          </TestCase>`;

    const ev = catch2.parseAndProcessTestCase(output, 42, null, '');

    const expected: TestRunEvent = {
      type: 'test',
      state: 'passed',
      test: catch2,
      decorations: [],
      description: '[tag1] (0ms)',
      tooltip: 'Name: TestName\nTags: [tag1]\n⏱Duration: 0ms',
      message: '⏱Duration: 0.000112 second(s).\n🔀 Randomness seeded to: 42',
    };

    assert.deepStrictEqual(ev.type, expected.type);
    assert.deepStrictEqual(ev.state, expected.state);
    assert.deepStrictEqual(ev.test, expected.test);
    assert.deepStrictEqual(ev.description, expected.description);
    assert.deepStrictEqual(ev.tooltip, expected.tooltip);
    assert.deepStrictEqual(ev.message, expected.message);
    assert.deepStrictEqual(ev.decorations, expected.decorations);

    assert.strictEqual(catch2.lastRunMilisec, 0.112);
    assert.strictEqual(catch2.description, ev.description);
    assert.strictEqual(catch2.tooltip, ev.tooltip);

    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(catch2.lastRunEvent, expected);
  });
});
