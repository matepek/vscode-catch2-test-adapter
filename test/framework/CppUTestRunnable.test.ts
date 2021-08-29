import * as assert from 'assert';
import * as pathlib from 'path';
import { Imitation, SharedVariables } from '../Common';
import { CppUTestRunnable } from '../../src/framework/CppUTestRunnable';
import { RootSuite } from '../../src/RootSuite';
import { RunnableProperties } from '../../src/RunnableProperties';
import { DefaultSpawner } from '../../src/Spawner';

///

describe(pathlib.basename(__filename), function () {
  const sharedVariables = new SharedVariables();

  const runnableProperties = new RunnableProperties(
    'name',
    undefined,
    [
      { resolve: '${relDirpath}', rule: 'relDirpath' },
      { resolve: '${osPathSep}', rule: 'osPathSep' },
    ],
    'path',
    {},
    {},
    1,
    false,
    {},
    new DefaultSpawner(),
    {},
  );

  const createCppUTestRunnable = (): { runnable: CppUTestRunnable; root: RootSuite } => {
    const root = new RootSuite(undefined, sharedVariables);
    return {
      root,
      runnable: new CppUTestRunnable(
        sharedVariables,
        root,
        runnableProperties,
        // 'cpputest_',
        Promise.resolve(undefined),
      ),
    };
  };

  let imitation: Imitation;

  before(function () {
    imitation = new Imitation();
  });

  afterEach(function () {
    imitation.resetToCallThrough();
  });

  after(function () {
    imitation.restore();
  });

  context('Testing _reloadFromString', function () {
    it('should reload ex.1', async function () {
      const { root, runnable } = createCppUTestRunnable();
      assert.strictEqual(runnable.tests.size, 0);

      const testListOutput: string[] = [
        'TeamCityOutputTest.TestNameEscaped_Fail',
        'TeamCityOutputTest.TestNameEscaped_Ignore',
        'TeamCityOutputTest.TestNameEscaped_End',
        'TeamCityOutputTest.TestNameEscaped_Start',
        'TeamCityOutputTest.TestGroupEscaped_End',
        'UTestPlatformsTest_PlatformSpecificRunTestInASeperateProcess.MultipleTestsInSeparateProcessAreCountedProperly',
        'UTestPlatformsTest_PlatformSpecificRunTestInASeperateProcess.CallToWaitPidFailedInSeparateProcessWorks',
        'UTestPlatformsTest_PlatformSpecificRunTestInASeperateProcess.CallToWaitPidStopsAndReportsAnErrorAfter20TimesRetry',
        'SimpleMutexTest.LockUnlockTest',
        'SimpleMutexTest.CreateAndDestroy',
        'UtestShellPointerArrayTest.reverse',
      ];
      const res = await runnable['_reloadFromString'](testListOutput.join(' '), { isCancellationRequested: false });

      const tests = [...res.tests].sort((a, b) => a.testNameAsId.localeCompare(b.testNameAsId));

      assert.strictEqual(tests.length, 11);
      assert.strictEqual(tests[0].testNameAsId, 'SimpleMutexTest.CreateAndDestroy');
      assert.strictEqual(tests[0].label, 'CreateAndDestroy');
      assert.strictEqual(tests[0].file, undefined);
      assert.strictEqual(tests[0].line, undefined);
      assert.strictEqual(tests[0].skipped, false);
      assert.strictEqual(tests[0].getStaticEvent('1'), undefined);
      assert.strictEqual(tests[1].testNameAsId, 'SimpleMutexTest.LockUnlockTest');
      assert.strictEqual(tests[1].label, 'LockUnlockTest');
      assert.strictEqual(tests[1].file, undefined);
      assert.strictEqual(tests[1].line, undefined);
      assert.strictEqual(tests[1].skipped, false);
      assert.strictEqual(tests[1].getStaticEvent('1'), undefined);
      assert.strictEqual(tests[2].testNameAsId, 'TeamCityOutputTest.TestGroupEscaped_End');
      assert.strictEqual(tests[2].label, 'TestGroupEscaped_End');
      assert.strictEqual(tests[2].file, undefined);
      assert.strictEqual(tests[2].line, undefined);
      assert.strictEqual(tests[2].skipped, false);
      assert.strictEqual(tests[2].getStaticEvent('1'), undefined);
      assert.strictEqual(tests[3].testNameAsId, 'TeamCityOutputTest.TestNameEscaped_End');
      assert.strictEqual(tests[3].label, 'TestNameEscaped_End');
      assert.strictEqual(tests[3].file, undefined);
      assert.strictEqual(tests[3].line, undefined);
      assert.strictEqual(tests[3].skipped, false);
      assert.strictEqual(tests[3].getStaticEvent('1'), undefined);
      assert.strictEqual(tests[4].testNameAsId, 'TeamCityOutputTest.TestNameEscaped_Fail');
      assert.strictEqual(tests[4].label, 'TestNameEscaped_Fail');
      assert.strictEqual(tests[4].file, undefined);
      assert.strictEqual(tests[4].line, undefined);
      assert.strictEqual(tests[4].skipped, false);
      assert.strictEqual(tests[4].getStaticEvent('1'), undefined);
      assert.strictEqual(tests[5].testNameAsId, 'TeamCityOutputTest.TestNameEscaped_Ignore');
      assert.strictEqual(tests[5].label, 'TestNameEscaped_Ignore');
      assert.strictEqual(tests[5].file, undefined);
      assert.strictEqual(tests[5].line, undefined);
      assert.strictEqual(tests[5].skipped, false);
      assert.strictEqual(tests[5].getStaticEvent('1'), undefined);
      assert.strictEqual(tests[6].testNameAsId, 'TeamCityOutputTest.TestNameEscaped_Start');
      assert.strictEqual(tests[6].label, 'TestNameEscaped_Start');
      assert.strictEqual(tests[6].file, undefined);
      assert.strictEqual(tests[6].line, undefined);
      assert.strictEqual(tests[6].skipped, false);
      assert.strictEqual(tests[6].getStaticEvent('1'), undefined);
      assert.strictEqual(
        tests[7].testNameAsId,
        'UTestPlatformsTest_PlatformSpecificRunTestInASeperateProcess.CallToWaitPidFailedInSeparateProcessWorks',
      );
      assert.strictEqual(tests[7].label, 'CallToWaitPidFailedInSeparateProcessWorks');
      assert.strictEqual(tests[7].file, undefined);
      assert.strictEqual(tests[7].line, undefined);
      assert.strictEqual(tests[7].skipped, false);
      assert.strictEqual(tests[7].getStaticEvent('1'), undefined);
      assert.strictEqual(
        tests[8].testNameAsId,
        'UTestPlatformsTest_PlatformSpecificRunTestInASeperateProcess.CallToWaitPidStopsAndReportsAnErrorAfter20TimesRetry',
      );
      assert.strictEqual(tests[8].label, 'CallToWaitPidStopsAndReportsAnErrorAfter20TimesRetry');
      assert.strictEqual(tests[8].file, undefined);
      assert.strictEqual(tests[8].line, undefined);
      assert.strictEqual(tests[8].skipped, false);
      assert.strictEqual(tests[8].getStaticEvent('1'), undefined);
      assert.strictEqual(
        tests[9].testNameAsId,
        'UTestPlatformsTest_PlatformSpecificRunTestInASeperateProcess.MultipleTestsInSeparateProcessAreCountedProperly',
      );
      assert.strictEqual(tests[9].label, 'MultipleTestsInSeparateProcessAreCountedProperly');
      assert.strictEqual(tests[9].file, undefined);
      assert.strictEqual(tests[9].line, undefined);
      assert.strictEqual(tests[9].skipped, false);
      assert.strictEqual(tests[9].getStaticEvent('1'), undefined);
      assert.strictEqual(tests[10].testNameAsId, 'UtestShellPointerArrayTest.reverse');
      assert.strictEqual(tests[10].label, 'reverse');
      assert.strictEqual(tests[10].file, undefined);
      assert.strictEqual(tests[10].line, undefined);
      assert.strictEqual(tests[10].skipped, false);
      assert.strictEqual(tests[10].getStaticEvent('1'), undefined);

      assert.strictEqual(root.children.length, 1);
      const suite1 = root.children[0];
      assert.strictEqual(suite1.label, 'name');
      if (suite1.type === 'suite') {
        assert.strictEqual(suite1.children.length, 4);
      } else {
        assert.strictEqual(suite1.type, 'suite');
      }
    });
  });
});
