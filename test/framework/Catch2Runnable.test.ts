import * as assert from 'assert';
import * as path from 'path';
import { settings, Imitation, ChildProcessStub } from '../Common';
import * as sinon from 'sinon';
import { Version } from '../../src/Util';
import { SharedVariables } from '../../src/SharedVariables';
import { Catch2Runnable } from '../../src/framework/Catch2Runnable';
import { RootSuite } from '../../src/RootSuite';
import { RunnableSuiteProperties } from '../../src/RunnableSuiteProperties';
import { logger, expectedLoggedWarning } from '../LogOutputContent.test';
import { RunnableReloadResult } from '../../src/AbstractRunnable';
import { EOL } from 'os';

///

describe(path.basename(__filename), function () {
  const sharedVariables = new SharedVariables(
    logger,
    settings.workspaceFolder,
    async () => undefined,
    () => undefined,
    () => undefined,
    () => undefined,
    async () => undefined,
    [],
    null,
    1000,
    1000,
    null,
    1000,
    false,
    1,
    false,
    false,
    'nothing',
    'default',
  );

  const rootSuite = new RootSuite(undefined, sharedVariables);

  const runnableProperties = new RunnableSuiteProperties(
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

  const createCatch2Runnable = (): Catch2Runnable =>
    new Catch2Runnable(sharedVariables, rootSuite, runnableProperties, new Version(2, 11, 0));

  type Catch2RunnablePriv = {
    _reloadChildren(): Promise<RunnableReloadResult>;
    _reloadFromString(testListOutput: string): RunnableReloadResult;
    _reloadFromXml(testListOutput: string): RunnableReloadResult;
  };

  const getPriv = (c: Catch2Runnable): Catch2RunnablePriv => (c as unknown) as Catch2RunnablePriv;

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
      const catch2Runnable = createCatch2Runnable();
      assert.strictEqual(catch2Runnable.tests.size, 0);

      const testOutput: string[] = [
        'Matching test cases:',
        '  first',
        '    /mnt/c/Users/a.cpp:12',
        '    (NO DESCRIPTION)',
        '      [a]',
        '1 matching test case',
      ];
      const res = await getPriv(catch2Runnable)._reloadFromString(testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.label.localeCompare(b.label));

      assert.strictEqual(tests.length, 1);

      assert.strictEqual(tests[0].testNameAsId, 'first');
      assert.strictEqual(tests[0].label, 'first');
      assert.strictEqual(tests[0].description, '[a]');
      assert.strictEqual(tests[0].file, '/mnt/c/Users/a.cpp');
      assert.strictEqual(tests[0].line, 12 - 1);
      assert.strictEqual(tests[0].skipped, false);
      assert.strictEqual(tests[0].staticEvent, undefined);
    });

    it('should reload ex.2', async function () {
      const catch2Runnable = createCatch2Runnable();

      const testOutput: string[] = [
        'Matching test cases:',
        '  first',
        '    /mnt/c/Users/a.cpp:12',
        '    (NO DESCRIPTION)',
        '      [a]',
        '  second',
        '    /mnt/c/Users/b.cpp:42',
        '    (NO DESCRIPTION)',
        '      [b]',
        '2 matching test cases',
      ];
      const res = await getPriv(catch2Runnable)._reloadFromString(testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.label.localeCompare(b.label));

      assert.strictEqual(tests.length, 2);

      assert.strictEqual(tests[0].testNameAsId, 'first');
      assert.strictEqual(tests[0].label, 'first');
      assert.strictEqual(tests[0].description, '[a]');
      assert.strictEqual(tests[0].file, '/mnt/c/Users/a.cpp');
      assert.strictEqual(tests[0].line, 12 - 1);
      assert.strictEqual(tests[0].skipped, false);
      assert.strictEqual(tests[0].staticEvent, undefined);

      assert.strictEqual(tests[1].testNameAsId, 'second');
      assert.strictEqual(tests[1].label, 'second');
      assert.strictEqual(tests[1].description, '[b]');
      assert.strictEqual(tests[1].file, '/mnt/c/Users/b.cpp');
      assert.strictEqual(tests[1].line, 42 - 1);
      assert.strictEqual(tests[1].skipped, false);
      assert.strictEqual(tests[1].staticEvent, undefined);
    });

    it('should reload with extra lines before and after', async function () {
      const catch2Runnable = createCatch2Runnable();

      const testOutput: string[] = [
        'some random unrelated text....',
        'Matching test cases:',
        '  first',
        '    /mnt/c/Users/a.cpp:12',
        '    (NO DESCRIPTION)',
        '      [a]',
        '1 matching test case',
        'bla bla bla',
      ];
      const res = await getPriv(catch2Runnable)._reloadFromString(testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.label.localeCompare(b.label));

      assert.strictEqual(tests.length, 1);

      assert.strictEqual(tests[0].testNameAsId, 'first');
      assert.strictEqual(tests[0].label, 'first');
      assert.strictEqual(tests[0].description, '[a]');
      assert.strictEqual(tests[0].file, '/mnt/c/Users/a.cpp');
      assert.strictEqual(tests[0].line, 12 - 1);
      assert.strictEqual(tests[0].skipped, false);
      assert.strictEqual(tests[0].staticEvent, undefined);
    });

    it('should reload with too long filename', async function () {
      const catch2Runnable = createCatch2Runnable();

      const testOutput: string[] = [
        'Matching test cases:',
        '  nnnnnnnnnnnnnnnnnnnnn1',
        '    ../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/',
        '    fffffffffffffffffffffffffffffffffffffffff.cpp:11',
        '    (NO DESCRIPTION)',
        '  nnnnnnnnnnnnnnnnnnnnn2',
        '    ../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/fffffffffffffffffff.cpp:14',
        '    (NO DESCRIPTION)',
        '  nnnnnnnnnnnnnnnnnnnnn3',
        '    ../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.cpp:',
        '    19',
        '    (NO DESCRIPTION)',
        '  nnnnnnnnnnnnnnnnnnnnn4',
        '    ../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.',
        '    cpp:14',
        '    (NO DESCRIPTION)',
        '  nnnnnnnnnnnnnnnnnnnnn5',
        '    ../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff/',
        '    ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.',
        '    cpp:14',
        '    (NO DESCRIPTION)',
        '5 matching test cases',
      ];
      const res = await getPriv(catch2Runnable)._reloadFromString(testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.label.localeCompare(b.label));

      assert.strictEqual(tests.length, 5);

      assert.strictEqual(tests[0].label, 'nnnnnnnnnnnnnnnnnnnnn1');
      assert.strictEqual(
        tests[0].file,
        '../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/fffffffffffffffffffffffffffffffffffffffff.cpp',
      );
      assert.strictEqual(tests[0].line, 11 - 1);

      assert.strictEqual(tests[1].label, 'nnnnnnnnnnnnnnnnnnnnn2');
      assert.strictEqual(tests[1].file, '../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/fffffffffffffffffff.cpp');
      assert.strictEqual(tests[1].line, 14 - 1);

      assert.strictEqual(tests[2].label, 'nnnnnnnnnnnnnnnnnnnnn3');
      assert.strictEqual(
        tests[2].file,
        '../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.cpp',
      );
      assert.strictEqual(tests[2].line, 19 - 1);

      assert.strictEqual(tests[3].label, 'nnnnnnnnnnnnnnnnnnnnn4');
      assert.strictEqual(
        tests[3].file,
        '../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.cpp',
      );
      assert.strictEqual(tests[3].line, 14 - 1);

      assert.strictEqual(tests[4].label, 'nnnnnnnnnnnnnnnnnnnnn5');
      assert.strictEqual(
        tests[4].file,
        '../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff/ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.cpp',
      );
      assert.strictEqual(tests[4].line, 14 - 1);
    });
  });

  context('reloadText', function () {
    it('should handle duplicated test name', async function () {
      expectedLoggedWarning('reloadChildren -> catch2TestListOutput.stderr');
      const catch2Runnable = createCatch2Runnable();

      const testListErrOutput = [
        'error: TEST_CASE( "biggest rectangle" ) already defined.',
        '  First seen at ../Task/biggest_rectangle.cpp:46',
        '  Redefined at ../Task/biggest_rectangle.cpp:102',
        '',
      ];

      imitation.spawnStub
        .withArgs(runnableProperties.path, sinon.match.any, sinon.match.any)
        .returns(new ChildProcessStub('Matching test cases:' + EOL, undefined, testListErrOutput.join(EOL)));

      const res = await getPriv(catch2Runnable)._reloadChildren();

      const tests = [...res.tests].sort((a, b) => a.label.localeCompare(b.label));

      assert.strictEqual(tests.length, 1);

      assert.strictEqual(tests[0].label, '⚡️ Unexpected ERROR while parsing');
      // TODO: assert.strictEqual(tests[0].description, '⚡️ Run me for details ⚡️');
      assert.strictEqual(tests[0].file, undefined);
      assert.strictEqual(tests[0].line, undefined);
      assert.strictEqual(tests[0].skipped, true);
      assert.strictEqual(tests[0].staticEvent?.state, 'errored');
      assert.strictEqual(
        tests[0].staticEvent?.message,
        [
          `❗️Unexpected stderr!`,
          `(One might can use ignoreTestEnumerationStdErr as the LAST RESORT. Check README for details.)`,
          `spawn`,
          `stout:`,
          `Matching test cases:`,
          '',
          `stderr:`,
          ...testListErrOutput,
        ].join('\n'),
      );
    });
  });
});
