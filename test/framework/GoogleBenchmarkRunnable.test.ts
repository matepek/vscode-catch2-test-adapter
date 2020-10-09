import * as assert from 'assert';
import * as pathlib from 'path';
import { Imitation, SharedVariables } from '../Common';
import { GoogleBenchmarkRunnable } from '../../src/framework/GoogleBenchmarkRunnable';
import { RootSuite } from '../../src/RootSuite';
import { RunnableProperties } from '../../src/RunnableProperties';
import { RunnableReloadResult } from '../../src/AbstractRunnable';
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
    {},
    new DefaultSpawner(),
  );

  const createGoogleBenchmarkRunnable = (): { runnable: GoogleBenchmarkRunnable; root: RootSuite } => {
    const root = new RootSuite(undefined, sharedVariables);
    return {
      root,
      runnable: new GoogleBenchmarkRunnable(sharedVariables, root, runnableProperties, Promise.resolve(undefined)),
    };
  };

  type GoogleBenchmarkRunnablePriv = {
    _reloadChildren(): Promise<RunnableReloadResult>;
    _reloadFromString(testListOutput: string): RunnableReloadResult;
    _reloadFromXml(testListOutput: string): RunnableReloadResult;
  };

  const getPriv = (c: GoogleBenchmarkRunnable): GoogleBenchmarkRunnablePriv =>
    (c as unknown) as GoogleBenchmarkRunnablePriv;

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
      const { root, runnable } = createGoogleBenchmarkRunnable();
      assert.strictEqual(runnable.tests.size, 0);

      const testOutput: string[] = ['BM_StringCreation', 'BM_StringCopy'];
      const res = getPriv(runnable)._reloadFromString(testOutput.join(EOL));

      const tests = [...res.tests].sort((a, b) => a.testNameAsId.localeCompare(b.testNameAsId));

      assert.strictEqual(tests.length, 2);

      assert.strictEqual(tests[0].testNameAsId, 'BM_StringCopy');
      assert.strictEqual(tests[0].label, 'BM_StringCopy');
      assert.strictEqual(tests[0].file, undefined);
      assert.strictEqual(tests[0].line, undefined);
      assert.strictEqual(tests[0].skipped, false);
      assert.strictEqual(tests[0].getStaticEvent('1'), undefined);
      assert.strictEqual(tests[1].testNameAsId, 'BM_StringCreation');
      assert.strictEqual(tests[1].label, 'BM_StringCreation');
      assert.strictEqual(tests[1].file, undefined);
      assert.strictEqual(tests[1].line, undefined);
      assert.strictEqual(tests[1].skipped, false);
      assert.strictEqual(tests[1].getStaticEvent('1'), undefined);

      assert.strictEqual(root.children.length, 1);
      const suite1 = root.children[0];
      assert.strictEqual(suite1.label, 'name');
      if (suite1.type === 'suite') {
        assert.strictEqual(suite1.children.length, 2);
      } else {
        assert.strictEqual(suite1.type, 'suite');
      }
    });
  });
});
