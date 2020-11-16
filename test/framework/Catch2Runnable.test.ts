import * as assert from 'assert';
import * as pathlib from 'path';
import { Imitation, ChildProcessStub, SharedVariables } from '../Common';
import * as sinon from 'sinon';
import { Version } from '../../src/Util';
import { Catch2Runnable } from '../../src/framework/Catch2Runnable';
import { RootSuite } from '../../src/RootSuite';
import { RunnableProperties } from '../../src/RunnableProperties';
import { expectedLoggedWarning } from '../LogOutputContent.test';
import { EOL } from 'os';
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

  const createCatch2Runnable = (): { runnable: Catch2Runnable; root: RootSuite } => {
    const root = new RootSuite(undefined, sharedVariables);
    return { root, runnable: new Catch2Runnable(sharedVariables, root, runnableProperties, new Version(2, 11, 0)) };
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

  context('_reloadFromString', function () {
    it('should reload ex.1', async function () {
      const { root, runnable } = createCatch2Runnable();
      assert.strictEqual(runnable.tests.size, 0);

      const testOutput: string[] = [
        'Matching test cases:',
        '  first',
        '    /mnt/c/Users/a.cpp:12',
        '    (NO DESCRIPTION)',
        '      [a]',
        '1 matching test case',
      ];
      const res = await runnable['_reloadFromString'](testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.label.localeCompare(b.label));

      assert.strictEqual(tests.length, 1);

      assert.strictEqual(tests[0].testNameAsId, 'first');
      assert.strictEqual(tests[0].label, 'first');
      assert.strictEqual(tests[0].description, '[a]');
      assert.strictEqual(tests[0].file, pathlib.normalize('/mnt/c/Users/a.cpp'));
      assert.strictEqual(tests[0].line, 12 - 1);
      assert.strictEqual(tests[0].skipped, false);
      assert.strictEqual(tests[0].getStaticEvent('1'), undefined);

      assert.strictEqual(root.children.length, 1);
      const suite1 = root.children[0];
      assert.strictEqual(suite1.label, 'name');
      if (suite1.type === 'suite') {
        assert.strictEqual(suite1.children.length, 1);
        assert.strictEqual(suite1.children[0], tests[0]);
      } else {
        assert.strictEqual(suite1.type, 'suite');
      }
    });

    it('should reload ex.2', async function () {
      const { runnable } = createCatch2Runnable();

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
      const res = await runnable['_reloadFromString'](testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.label.localeCompare(b.label));

      assert.strictEqual(tests.length, 2);

      assert.strictEqual(tests[0].testNameAsId, 'first');
      assert.strictEqual(tests[0].label, 'first');
      assert.strictEqual(tests[0].description, '[a]');
      assert.strictEqual(tests[0].file, pathlib.normalize('/mnt/c/Users/a.cpp'));
      assert.strictEqual(tests[0].line, 12 - 1);
      assert.strictEqual(tests[0].skipped, false);
      assert.strictEqual(tests[0].getStaticEvent('1'), undefined);

      assert.strictEqual(tests[1].testNameAsId, 'second');
      assert.strictEqual(tests[1].label, 'second');
      assert.strictEqual(tests[1].description, '[b]');
      assert.strictEqual(tests[1].file, pathlib.normalize('/mnt/c/Users/b.cpp'));
      assert.strictEqual(tests[1].line, 42 - 1);
      assert.strictEqual(tests[1].skipped, false);
      assert.strictEqual(tests[1].getStaticEvent('1'), undefined);
    });

    it('should reload with extra lines before and after', async function () {
      const { runnable } = createCatch2Runnable();

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
      const res = await runnable['_reloadFromString'](testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.label.localeCompare(b.label));

      assert.strictEqual(tests.length, 1);

      assert.strictEqual(tests[0].testNameAsId, 'first');
      assert.strictEqual(tests[0].label, 'first');
      assert.strictEqual(tests[0].description, '[a]');
      assert.strictEqual(tests[0].file, pathlib.normalize('/mnt/c/Users/a.cpp'));
      assert.strictEqual(tests[0].line, 12 - 1);
      assert.strictEqual(tests[0].skipped, false);
      assert.strictEqual(tests[0].getStaticEvent('1'), undefined);
    });

    it('should reload with too long filename', async function () {
      const { runnable } = createCatch2Runnable();

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
      const res = await runnable['_reloadFromString'](testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.label.localeCompare(b.label));

      assert.strictEqual(tests.length, 5);

      assert.strictEqual(tests[0].label, 'nnnnnnnnnnnnnnnnnnnnn1');
      assert.strictEqual(
        tests[0].file,
        pathlib.normalize('../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/fffffffffffffffffffffffffffffffffffffffff.cpp'),
      );
      assert.strictEqual(tests[0].line, 11 - 1);

      assert.strictEqual(tests[1].label, 'nnnnnnnnnnnnnnnnnnnnn2');
      assert.strictEqual(
        tests[1].file,
        pathlib.normalize('../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/fffffffffffffffffff.cpp'),
      );
      assert.strictEqual(tests[1].line, 14 - 1);

      assert.strictEqual(tests[2].label, 'nnnnnnnnnnnnnnnnnnnnn3');
      assert.strictEqual(
        tests[2].file,
        pathlib.normalize('../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.cpp'),
      );
      assert.strictEqual(tests[2].line, 19 - 1);

      assert.strictEqual(tests[3].label, 'nnnnnnnnnnnnnnnnnnnnn4');
      assert.strictEqual(
        tests[3].file,
        pathlib.normalize('../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.cpp'),
      );
      assert.strictEqual(tests[3].line, 14 - 1);

      assert.strictEqual(tests[4].label, 'nnnnnnnnnnnnnnnnnnnnn5');
      assert.strictEqual(
        tests[4].file,
        pathlib.normalize(
          '../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff/ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.cpp',
        ),
      );
      assert.strictEqual(tests[4].line, 14 - 1);
    });
  });

  context('reloadText', function () {
    it('should handle duplicated test name', async function () {
      expectedLoggedWarning('reloadChildren -> catch2TestListOutput.stderr');
      const { runnable } = createCatch2Runnable();

      const testListErrOutput = [
        'error: TEST_CASE( "biggest rectangle" ) already defined.',
        '  First seen at ../Task/biggest_rectangle.cpp:46',
        '  Redefined at ../Task/biggest_rectangle.cpp:102',
        '',
      ];

      imitation.spawnStub
        .withArgs(
          runnableProperties.path,
          ['[.],*', '--verbosity', 'high', '--list-tests', '--use-colour', 'no'],
          sinon.match.any,
        )
        .returns(new ChildProcessStub('Matching test cases:' + EOL, undefined, testListErrOutput.join(EOL)));

      const res = await await runnable['_reloadChildren']();

      const tests = [...res.tests].sort((a, b) => a.label.localeCompare(b.label));

      assert.strictEqual(tests.length, 1);

      assert.strictEqual(tests[0].label, '⚡️ Unexpected ERROR while parsing');
      // TODO: assert.strictEqual(tests[0].description, '⚡️ Run me for details ⚡️');
      assert.strictEqual(tests[0].file, undefined);
      assert.strictEqual(tests[0].line, undefined);
      assert.strictEqual(tests[0].skipped, true);
      assert.strictEqual(tests[0].getStaticEvent('1')?.state, 'errored');
      assert.strictEqual(
        tests[0].getStaticEvent('1')?.message,
        [
          `❗️Unexpected stderr!`,
          `(One might can use ignoreTestEnumerationStdErr as the LAST RESORT. Check README for details.)`,
          `spawn`,
          `stout:`,
          `Matching test cases:`,
          '',
          `stderr:`,
          ...testListErrOutput,
        ].join(EOL),
      );
    });
  });
});
