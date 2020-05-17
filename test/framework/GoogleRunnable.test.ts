import * as assert from 'assert';
import * as pathlib from 'path';
import { Imitation, SharedVariables } from '../Common';
import { GoogleRunnable } from '../../src/framework/GoogleRunnable';
import { RootSuite } from '../../src/RootSuite';
import { RunnableProperties } from '../../src/RunnableProperties';
import { RunnableReloadResult } from '../../src/AbstractRunnable';
import { EOL } from 'os';

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
    {},
  );

  const createGoogleRunnable = (): { runnable: GoogleRunnable; root: RootSuite } => {
    const root = new RootSuite(undefined, sharedVariables);
    return {
      root,
      runnable: new GoogleRunnable(sharedVariables, root, runnableProperties, 'gtest_', Promise.resolve(undefined)),
    };
  };

  type GoogleRunnablePriv = {
    _reloadChildren(): Promise<RunnableReloadResult>;
    _reloadFromString(testListOutput: string): RunnableReloadResult;
    _reloadFromXml(testListOutput: string): RunnableReloadResult;
  };

  const getPriv = (c: GoogleRunnable): GoogleRunnablePriv => (c as unknown) as GoogleRunnablePriv;

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

  context('_reloadFromString', function () {
    it('should reload ex.1', async function () {
      const { root, runnable } = createGoogleRunnable();
      assert.strictEqual(runnable.tests.size, 0);

      const testOutput: string[] = [
        'Running main() from ...',
        'TestCas1.',
        '  test1',
        '  test2',
        'TestCas2.',
        '  test1',
        '  test2',
        'MockTestCase.',
        '  expect1',
        '  expect2',
        'PrintingFailingParams1/FailingParamTest.',
        '  Fails1/0  # GetParam() = 2',
        '  Fails1/1  # GetParam() = 3',
        '  Fails2/0  # GetParam() = 2',
        '  Fails2/1  # GetParam() = 3',
        'PrintingFailingParams2/FailingParamTest.',
        '  Fails1/0  # GetParam() = 3',
        '  Fails2/0  # GetParam() = 3',
        'TestThreeParams/0.  # TypeParam = std::tuple<float, double, short>',
        '  MaximumTest',
        'TestThreeParams/1.  # TypeParam = std::tuple<long long, signed char, float>',
        '  MaximumTest',
        '',
      ];
      const res = getPriv(runnable)._reloadFromString(testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.testNameAsId.localeCompare(b.testNameAsId));

      assert.strictEqual(tests.length, 14);

      assert.strictEqual(tests[0].testNameAsId, 'MockTestCase.expect1');
      assert.strictEqual(tests[0].label, 'expect1');
      assert.strictEqual(tests[0].testNameAsId, 'MockTestCase.expect1');
      assert.strictEqual(tests[0].file, undefined);
      assert.strictEqual(tests[0].line, undefined);
      assert.strictEqual(tests[0].skipped, false);
      assert.strictEqual(tests[0].staticEvent, undefined);
      assert.strictEqual(tests[1].testNameAsId, 'MockTestCase.expect2');
      assert.strictEqual(tests[1].label, 'expect2');
      assert.strictEqual(tests[1].testNameAsId, 'MockTestCase.expect2');
      assert.strictEqual(tests[1].file, undefined);
      assert.strictEqual(tests[1].line, undefined);
      assert.strictEqual(tests[1].skipped, false);
      assert.strictEqual(tests[1].staticEvent, undefined);
      assert.strictEqual(tests[2].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails1/0');
      assert.strictEqual(tests[2].label, 'Fails1/0');
      assert.strictEqual(tests[2].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails1/0');
      assert.strictEqual(tests[2].file, undefined);
      assert.strictEqual(tests[2].line, undefined);
      assert.strictEqual(tests[2].skipped, false);
      assert.strictEqual(tests[2].staticEvent, undefined);
      assert.strictEqual(tests[3].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails1/1');
      assert.strictEqual(tests[3].label, 'Fails1/1');
      assert.strictEqual(tests[3].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails1/1');
      assert.strictEqual(tests[3].file, undefined);
      assert.strictEqual(tests[3].line, undefined);
      assert.strictEqual(tests[3].skipped, false);
      assert.strictEqual(tests[3].staticEvent, undefined);
      assert.strictEqual(tests[4].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails2/0');
      assert.strictEqual(tests[4].label, 'Fails2/0');
      assert.strictEqual(tests[4].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails2/0');
      assert.strictEqual(tests[4].file, undefined);
      assert.strictEqual(tests[4].line, undefined);
      assert.strictEqual(tests[4].skipped, false);
      assert.strictEqual(tests[4].staticEvent, undefined);
      assert.strictEqual(tests[5].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails2/1');
      assert.strictEqual(tests[5].label, 'Fails2/1');
      assert.strictEqual(tests[5].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails2/1');
      assert.strictEqual(tests[5].file, undefined);
      assert.strictEqual(tests[5].line, undefined);
      assert.strictEqual(tests[5].skipped, false);
      assert.strictEqual(tests[5].staticEvent, undefined);
      assert.strictEqual(tests[6].testNameAsId, 'PrintingFailingParams2/FailingParamTest.Fails1/0');
      assert.strictEqual(tests[6].label, 'Fails1/0');
      assert.strictEqual(tests[6].testNameAsId, 'PrintingFailingParams2/FailingParamTest.Fails1/0');
      assert.strictEqual(tests[6].file, undefined);
      assert.strictEqual(tests[6].line, undefined);
      assert.strictEqual(tests[6].skipped, false);
      assert.strictEqual(tests[6].staticEvent, undefined);
      assert.strictEqual(tests[7].testNameAsId, 'PrintingFailingParams2/FailingParamTest.Fails2/0');
      assert.strictEqual(tests[7].label, 'Fails2/0');
      assert.strictEqual(tests[7].testNameAsId, 'PrintingFailingParams2/FailingParamTest.Fails2/0');
      assert.strictEqual(tests[7].file, undefined);
      assert.strictEqual(tests[7].line, undefined);
      assert.strictEqual(tests[7].skipped, false);
      assert.strictEqual(tests[7].staticEvent, undefined);
      assert.strictEqual(tests[8].testNameAsId, 'TestCas1.test1');
      assert.strictEqual(tests[8].label, 'test1');
      assert.strictEqual(tests[8].testNameAsId, 'TestCas1.test1');
      assert.strictEqual(tests[8].file, undefined);
      assert.strictEqual(tests[8].line, undefined);
      assert.strictEqual(tests[8].skipped, false);
      assert.strictEqual(tests[8].staticEvent, undefined);
      assert.strictEqual(tests[9].testNameAsId, 'TestCas1.test2');
      assert.strictEqual(tests[9].label, 'test2');
      assert.strictEqual(tests[9].testNameAsId, 'TestCas1.test2');
      assert.strictEqual(tests[9].file, undefined);
      assert.strictEqual(tests[9].line, undefined);
      assert.strictEqual(tests[9].skipped, false);
      assert.strictEqual(tests[9].staticEvent, undefined);
      assert.strictEqual(tests[10].testNameAsId, 'TestCas2.test1');
      assert.strictEqual(tests[10].label, 'test1');
      assert.strictEqual(tests[10].testNameAsId, 'TestCas2.test1');
      assert.strictEqual(tests[10].file, undefined);
      assert.strictEqual(tests[10].line, undefined);
      assert.strictEqual(tests[10].skipped, false);
      assert.strictEqual(tests[10].staticEvent, undefined);
      assert.strictEqual(tests[11].testNameAsId, 'TestCas2.test2');
      assert.strictEqual(tests[11].label, 'test2');
      assert.strictEqual(tests[11].testNameAsId, 'TestCas2.test2');
      assert.strictEqual(tests[11].file, undefined);
      assert.strictEqual(tests[11].line, undefined);
      assert.strictEqual(tests[11].skipped, false);
      assert.strictEqual(tests[11].staticEvent, undefined);
      assert.strictEqual(tests[12].testNameAsId, 'TestThreeParams/0.MaximumTest');
      assert.strictEqual(tests[12].label, 'MaximumTest');
      assert.strictEqual(tests[12].testNameAsId, 'TestThreeParams/0.MaximumTest');
      assert.strictEqual(tests[12].file, undefined);
      assert.strictEqual(tests[12].line, undefined);
      assert.strictEqual(tests[12].skipped, false);
      assert.strictEqual(tests[12].staticEvent, undefined);
      assert.strictEqual(tests[13].testNameAsId, 'TestThreeParams/1.MaximumTest');
      assert.strictEqual(tests[13].label, 'MaximumTest');
      assert.strictEqual(tests[13].testNameAsId, 'TestThreeParams/1.MaximumTest');
      assert.strictEqual(tests[13].file, undefined);
      assert.strictEqual(tests[13].line, undefined);
      assert.strictEqual(tests[13].skipped, false);
      assert.strictEqual(tests[13].staticEvent, undefined);

      assert.strictEqual(root.children.length, 1);
      const suite1 = root.children[0];
      assert.strictEqual(suite1.label, 'name');
      if (suite1.type === 'suite') {
        assert.strictEqual(suite1.children.length, 7);
      } else {
        assert.strictEqual(suite1.type, 'suite');
      }
    });
  });

  context('_reloadFromXml', function () {
    it('should reload ex.1', async function () {
      const { root, runnable } = createGoogleRunnable();

      const testOutput: string[] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<testsuites tests="12" name="AllTests">',
        '  <testsuite name="TestCas1" tests="2">',
        '    <testcase name="test1" file="gtest.cpp" line="11" />',
        '    <testcase name="test2" file="gtest.cpp" line="16" />',
        '  </testsuite>',
        '  <testsuite name="TestCas2" tests="2">',
        '    <testcase name="test1" file="gtest.cpp" line="22" />',
        '    <testcase name="test2" file="gtest.cpp" line="34" />',
        '  </testsuite>',
        '  <testsuite name="MockTestCase" tests="2">',
        '    <testcase name="expect1" file="gtest.cpp" line="67" />',
        '    <testcase name="expect2" file="gtest.cpp" line="75" />',
        '  </testsuite>',
        '  <testsuite name="PrintingFailingParams1/FailingParamTest" tests="4">',
        '    <testcase name="Fails1/0" value_param="2" file="gtest.cpp" line="41" />',
        '    <testcase name="Fails1/1" value_param="3" file="gtest.cpp" line="41" />',
        '    <testcase name="Fails2/0" value_param="2" file="gtest.cpp" line="41" />',
        '    <testcase name="Fails2/1" value_param="3" file="gtest.cpp" line="41" />',
        '  </testsuite>',
        '  <testsuite name="PrintingFailingParams2/FailingParamTest" tests="2">',
        '    <testcase name="Fails1/0" value_param="3" file="gtest.cpp" line="41" />',
        '    <testcase name="Fails2/0" value_param="3" file="gtest.cpp" line="41" />',
        '  </testsuite>',
        '  <testsuite name="TestThreeParams/0" tests="1">',
        '    <testcase name="MaximumTest" type_param="std::tuple&lt;float, double, short&gt;" file="gtest.cpp" line="106" />',
        '  </testsuite>',
        '  <testsuite name="TestThreeParams/1" tests="1">',
        '    <testcase name="MaximumTest" type_param="std::tuple&lt;long long, signed char, float&gt;" file="gtest.cpp" line="106" />',
        '  </testsuite>',
        '</testsuites>',
      ];
      const res = getPriv(runnable)._reloadFromXml(testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.testNameAsId.localeCompare(b.testNameAsId));

      assert.strictEqual(tests.length, 14);

      assert.strictEqual(tests[0].testNameAsId, 'MockTestCase.expect1');
      assert.strictEqual(tests[0].label, 'expect1');
      assert.strictEqual(tests[0].testNameAsId, 'MockTestCase.expect1');
      assert.strictEqual(tests[0].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[0].line, 66);
      assert.strictEqual(tests[0].skipped, false);
      assert.strictEqual(tests[0].staticEvent, undefined);
      assert.strictEqual(tests[1].testNameAsId, 'MockTestCase.expect2');
      assert.strictEqual(tests[1].label, 'expect2');
      assert.strictEqual(tests[1].testNameAsId, 'MockTestCase.expect2');
      assert.strictEqual(tests[1].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[1].line, 74);
      assert.strictEqual(tests[1].skipped, false);
      assert.strictEqual(tests[1].staticEvent, undefined);
      assert.strictEqual(tests[2].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails1/0');
      assert.strictEqual(tests[2].label, 'Fails1/0');
      assert.strictEqual(tests[2].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails1/0');
      assert.strictEqual(tests[2].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[2].line, 40);
      assert.strictEqual(tests[2].skipped, false);
      assert.strictEqual(tests[2].staticEvent, undefined);
      assert.strictEqual(tests[3].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails1/1');
      assert.strictEqual(tests[3].label, 'Fails1/1');
      assert.strictEqual(tests[3].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails1/1');
      assert.strictEqual(tests[3].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[3].line, 40);
      assert.strictEqual(tests[3].skipped, false);
      assert.strictEqual(tests[3].staticEvent, undefined);
      assert.strictEqual(tests[4].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails2/0');
      assert.strictEqual(tests[4].label, 'Fails2/0');
      assert.strictEqual(tests[4].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails2/0');
      assert.strictEqual(tests[4].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[4].line, 40);
      assert.strictEqual(tests[4].skipped, false);
      assert.strictEqual(tests[4].staticEvent, undefined);
      assert.strictEqual(tests[5].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails2/1');
      assert.strictEqual(tests[5].label, 'Fails2/1');
      assert.strictEqual(tests[5].testNameAsId, 'PrintingFailingParams1/FailingParamTest.Fails2/1');
      assert.strictEqual(tests[5].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[5].line, 40);
      assert.strictEqual(tests[5].skipped, false);
      assert.strictEqual(tests[5].staticEvent, undefined);
      assert.strictEqual(tests[6].testNameAsId, 'PrintingFailingParams2/FailingParamTest.Fails1/0');
      assert.strictEqual(tests[6].label, 'Fails1/0');
      assert.strictEqual(tests[6].testNameAsId, 'PrintingFailingParams2/FailingParamTest.Fails1/0');
      assert.strictEqual(tests[6].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[6].line, 40);
      assert.strictEqual(tests[6].skipped, false);
      assert.strictEqual(tests[6].staticEvent, undefined);
      assert.strictEqual(tests[7].testNameAsId, 'PrintingFailingParams2/FailingParamTest.Fails2/0');
      assert.strictEqual(tests[7].label, 'Fails2/0');
      assert.strictEqual(tests[7].testNameAsId, 'PrintingFailingParams2/FailingParamTest.Fails2/0');
      assert.strictEqual(tests[7].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[7].line, 40);
      assert.strictEqual(tests[7].skipped, false);
      assert.strictEqual(tests[7].staticEvent, undefined);
      assert.strictEqual(tests[8].testNameAsId, 'TestCas1.test1');
      assert.strictEqual(tests[8].label, 'test1');
      assert.strictEqual(tests[8].testNameAsId, 'TestCas1.test1');
      assert.strictEqual(tests[8].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[8].line, 10);
      assert.strictEqual(tests[8].skipped, false);
      assert.strictEqual(tests[8].staticEvent, undefined);
      assert.strictEqual(tests[9].testNameAsId, 'TestCas1.test2');
      assert.strictEqual(tests[9].label, 'test2');
      assert.strictEqual(tests[9].testNameAsId, 'TestCas1.test2');
      assert.strictEqual(tests[9].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[9].line, 15);
      assert.strictEqual(tests[9].skipped, false);
      assert.strictEqual(tests[9].staticEvent, undefined);
      assert.strictEqual(tests[10].testNameAsId, 'TestCas2.test1');
      assert.strictEqual(tests[10].label, 'test1');
      assert.strictEqual(tests[10].testNameAsId, 'TestCas2.test1');
      assert.strictEqual(tests[10].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[10].line, 21);
      assert.strictEqual(tests[10].skipped, false);
      assert.strictEqual(tests[10].staticEvent, undefined);
      assert.strictEqual(tests[11].testNameAsId, 'TestCas2.test2');
      assert.strictEqual(tests[11].label, 'test2');
      assert.strictEqual(tests[11].testNameAsId, 'TestCas2.test2');
      assert.strictEqual(tests[11].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[11].line, 33);
      assert.strictEqual(tests[11].skipped, false);
      assert.strictEqual(tests[11].staticEvent, undefined);
      assert.strictEqual(tests[12].testNameAsId, 'TestThreeParams/0.MaximumTest');
      assert.strictEqual(tests[12].label, 'MaximumTest');
      assert.strictEqual(tests[12].testNameAsId, 'TestThreeParams/0.MaximumTest');
      assert.strictEqual(tests[12].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[12].line, 105);
      assert.strictEqual(tests[12].skipped, false);
      assert.strictEqual(tests[12].staticEvent, undefined);
      assert.strictEqual(tests[13].testNameAsId, 'TestThreeParams/1.MaximumTest');
      assert.strictEqual(tests[13].label, 'MaximumTest');
      assert.strictEqual(tests[13].testNameAsId, 'TestThreeParams/1.MaximumTest');
      assert.strictEqual(tests[13].file, pathlib.normalize('gtest.cpp'));
      assert.strictEqual(tests[13].line, 105);
      assert.strictEqual(tests[13].skipped, false);
      assert.strictEqual(tests[13].staticEvent, undefined);

      assert.strictEqual(root.children.length, 1);
      const suite1 = root.children[0];
      assert.strictEqual(suite1.label, 'name');
      if (suite1.type === 'suite') {
        assert.strictEqual(suite1.children.length, 7);
      } else {
        assert.strictEqual(suite1.type, 'suite');
      }
    });
  });
});
