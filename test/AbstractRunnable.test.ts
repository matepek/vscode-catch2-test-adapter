import * as assert from 'assert';
import * as pathlib from 'path';
import { SharedVariables, RootSuite, ChildProcessStub } from './Common';
import { RunnableProperties } from '../src/RunnableProperties';
import { RunnableReloadResult, AbstractRunnable } from '../src/AbstractRunnable';
import { AbstractTest, StaticTestEventBase, AbstractTestEvent } from '../src/AbstractTest';
import * as sinon from 'sinon';
import { TestGrouping, GroupByExecutable } from '../src/TestGroupingInterface';
import { Suite } from '../src/Suite';
import { CancellationTokenSource } from 'vscode';
import { DefaultSpawner } from '../src/Spawner';
import * as fsw from '../src/FSWrapper';

///

class Runnable extends AbstractRunnable {
  public constructor(shared: SharedVariables, rootSuite: RootSuite, properties: RunnableProperties) {
    super(shared, rootSuite, properties, 'for test', Promise.resolve(undefined));
  }

  public _reloadChildren(): Promise<RunnableReloadResult> {
    throw Error('_reloadChildren should be mocked');
  }

  // eslint-disable-next-line
  public _getRunParamsInner(childrenToRun: readonly Readonly<AbstractTest>[]): string[] {
    throw Error('_getRunParams should be mocked');
  }

  public _handleProcess(): Promise<void> {
    throw Error('_handleProcess should be mocked');
  }

  protected _getDebugParamsInner(): string[] {
    throw Error('getDebugParams should be mocked');
  }
}

class Test extends AbstractTest {
  public constructor(
    shared: SharedVariables,
    runnable: AbstractRunnable,
    parent: Suite, // ascending
    testNameAsId: string,
    label: string,
    file: string | undefined,
    line: number | undefined,
    skipped: boolean,
    staticEvent: StaticTestEventBase | undefined,
    pureTags: string[], // without brackets
  ) {
    super(
      shared,
      runnable,
      parent,
      testNameAsId,
      label,
      file,
      line,
      skipped,
      staticEvent,
      pureTags,
      undefined,
      undefined,
      undefined,
    );
  }

  public compare(testNameAsId: string): boolean {
    return this.testNameAsId === testNameAsId;
  }

  public parseAndProcessTestCase(): AbstractTestEvent {
    throw Error('unimplemented');
  }
}

type RunnablePriv = {
  _createSubtreeAndAddTest(
    testGrouping: TestGrouping,
    testNameAsId: string,
    testName: string,
    file: string | undefined,
    tags: string[], // in case of google test it is the TestCase
    createTest: (parent: Suite) => AbstractTest,
    updateTest: (old: AbstractTest) => boolean,
  ): [AbstractTest, boolean];
  _reloadChildren(): Promise<RunnableReloadResult>;
  _reloadFromString(testListOutput: string): RunnableReloadResult;
  _reloadFromXml(testListOutput: string): RunnableReloadResult;
  _getGroupByExecutable(): GroupByExecutable;
};

const getPriv = (c: Runnable): RunnablePriv => (c as unknown) as RunnablePriv;

const groupByExec: TestGrouping = { groupByExecutable: {} };

///

describe(pathlib.basename(__filename), function () {
  const sinonSandbox = sinon.createSandbox();

  after(function () {
    sinonSandbox.restore();
  });

  const exec1Prop = new RunnableProperties(
    'name',
    undefined,
    [
      { resolve: '${filename}', rule: 'path1' },
      { resolve: '${relDirpath}', rule: 'relDirpath' },
      { resolve: '${osPathSep}', rule: 'osPathSep' },
    ],
    'path1.exe',
    {},
    {},
    1,
    false,
    {},
    new DefaultSpawner(),
    [],
  );

  it('should reloadTests only if changed', async function () {
    const shared = new SharedVariables();
    const root = new RootSuite(shared);
    const runnable = new Runnable(shared, root, exec1Prop);

    let loadCount = 0;
    const reloadStub = sinonSandbox.stub(runnable, '_reloadChildren');

    reloadStub.callsFake(async (): Promise<RunnableReloadResult> => new RunnableReloadResult());

    await runnable.reloadTests(shared.taskPool);

    assert.strictEqual(runnable.tests.size, 0);
    assert.strictEqual(root.children.length, 0);
    assert.strictEqual(shared.loadCount, loadCount);

    reloadStub.callsFake(
      async (): Promise<RunnableReloadResult> => {
        return new RunnableReloadResult().add(
          ...getPriv(runnable)._createSubtreeAndAddTest(
            groupByExec,
            'test1nameid',
            'test1name',
            'test1file.cpp',
            [],
            (parent: Suite) => {
              return new Test(
                shared,
                runnable,
                parent,
                'test1nameid',
                'test1label',
                'test1file.cpp',
                42,
                false,
                undefined,
                [],
              );
            },
            () => {
              return false;
            },
          ),
        );
      },
    );

    await runnable.reloadTests(shared.taskPool);

    assert.strictEqual(runnable.tests.size, 1);
    assert.strictEqual(root.children.length, 1);
    assert.strictEqual(shared.loadCount, ++loadCount);

    await runnable.reloadTests(shared.taskPool);

    assert.strictEqual(runnable.tests.size, 1);
    assert.strictEqual(root.children.length, 1);
    assert.strictEqual(shared.loadCount, loadCount, 'no reload because update returns false');

    reloadStub.callsFake(
      async (): Promise<RunnableReloadResult> => {
        return new RunnableReloadResult()
          .add(
            ...getPriv(runnable)._createSubtreeAndAddTest(
              groupByExec,
              'test1nameid',
              'test1name',
              'test1file.cpp',
              [],
              (parent: Suite) => {
                return new Test(
                  shared,
                  runnable,
                  parent,
                  'test1nameid',
                  'test1label',
                  'test1file.cpp',
                  42,
                  false,
                  undefined,
                  [],
                );
              },
              () => {
                return false;
              },
            ),
          )
          .add(
            ...getPriv(runnable)._createSubtreeAndAddTest(
              groupByExec,
              'test2nameid',
              'test2name',
              'test2file.cpp',
              [],
              (parent: Suite) =>
                new Test(
                  shared,
                  runnable,
                  parent,
                  'test2nameid',
                  'test2label',
                  'test2file.cpp',
                  42,
                  false,
                  undefined,
                  [],
                ),
              () => {
                return true;
              },
            ),
          );
      },
    );

    await runnable.reloadTests(shared.taskPool);

    assert.strictEqual(runnable.tests.size, 2);
    assert.strictEqual(root.children.length, 1);
    assert.strictEqual(shared.loadCount, ++loadCount);

    await runnable.reloadTests(shared.taskPool);

    assert.strictEqual(runnable.tests.size, 2);
    assert.strictEqual(root.children.length, 1);
    assert.strictEqual(shared.loadCount, ++loadCount, 'should reload becasue update returns true');

    reloadStub.callsFake(
      async (): Promise<RunnableReloadResult> => {
        return new RunnableReloadResult().add(
          ...getPriv(runnable)._createSubtreeAndAddTest(
            groupByExec,
            'test1nameid',
            'test1name',
            'test1file.cpp',
            [],
            (parent: Suite) => {
              return new Test(
                shared,
                runnable,
                parent,
                'test1nameid',
                'test1label',
                'test1file.cpp',
                42,
                false,
                undefined,
                [],
              );
            },
            () => {
              return false;
            },
          ),
        );
      },
    );

    await runnable.reloadTests(shared.taskPool);

    assert.strictEqual(runnable.tests.size, 2);
    assert.strictEqual(root.children.length, 1);
    assert.strictEqual(shared.loadCount, ++loadCount, 'reloads because test was deleted');

    await runnable.reloadTests(shared.taskPool);

    assert.strictEqual(runnable.tests.size, 2);
    assert.strictEqual(root.children.length, 1);
    assert.strictEqual(shared.loadCount, ++loadCount, 'should not reload because the remaining suite was unchanged');
  });

  context('executable with tests', async function () {
    const shared = new SharedVariables();
    const root = new RootSuite(shared);
    const runnable = new Runnable(shared, root, exec1Prop);

    let spawnStub: sinon.SinonStub<
      [string, readonly string[], fsw.SpawnOptionsWithoutStdio],
      fsw.ChildProcessWithoutNullStreams
    >;

    before(async function () {
      spawnStub = sinonSandbox.stub(fsw, 'spawn');

      sinonSandbox.stub(runnable, '_reloadChildren').callsFake(
        async (): Promise<RunnableReloadResult> => {
          return new RunnableReloadResult()
            .add(
              ...getPriv(runnable)._createSubtreeAndAddTest(
                groupByExec,
                'test1nameid',
                'test1name',
                'test1file.cpp',
                [],
                (parent: Suite) => {
                  return new Test(
                    shared,
                    runnable,
                    parent,
                    'test1nameid',
                    'test1label',
                    'test1file.cpp',
                    41,
                    false,
                    undefined,
                    [],
                  );
                },
                () => {
                  return false;
                },
              ),
            )
            .add(
              ...getPriv(runnable)._createSubtreeAndAddTest(
                groupByExec,
                'test2nameid',
                'test2name',
                'test2file.cpp',
                [],
                (parent: Suite) => {
                  return new Test(
                    shared,
                    runnable,
                    parent,
                    'test2nameid',
                    'test2label',
                    'test2file.cpp',
                    42,
                    false,
                    undefined,
                    [],
                  );
                },
                () => {
                  return false;
                },
              ),
            )
            .add(
              ...getPriv(runnable)._createSubtreeAndAddTest(
                groupByExec,
                'test3nameid',
                'test3name',
                'test3file.cpp',
                [],
                (parent: Suite) => {
                  return new Test(
                    shared,
                    runnable,
                    parent,
                    'test3nameid',
                    'test3label',
                    'test3file.cpp',
                    43,
                    false,
                    { state: 'errored', message: 'static event' },
                    [],
                  );
                },
                () => {
                  return false;
                },
              ),
            )
            .add(
              ...getPriv(runnable)._createSubtreeAndAddTest(
                groupByExec,
                'test4nameid',
                'test4name',
                'test4file.cpp',
                [],
                (parent: Suite) => {
                  return new Test(
                    shared,
                    runnable,
                    parent,
                    'test4nameid',
                    'test4label',
                    'test4file.cpp',
                    44,
                    true,
                    undefined,
                    [],
                  );
                },
                () => {
                  return false;
                },
              ),
            );
        },
      );

      await runnable.reloadTests(shared.taskPool);

      assert.strictEqual(runnable.tests.size, 4);
      assert.strictEqual(root.children.length, 1);

      sinon
        .stub(runnable, '_getRunParamsInner')
        .callsFake((childrenToRun: readonly Readonly<AbstractTest>[]): string[] => {
          return childrenToRun.map(t => t.id).sort();
        });

      sinonSandbox.stub(runnable, '_handleProcess').resolves();

      spawnStub.withArgs(exec1Prop.path, sinon.match.any, sinon.match.any).callsFake(() => new ChildProcessStub(''));
    });

    beforeEach(function () {
      shared.stateEvents.splice(0);
      shared.loadCount = 0;
      spawnStub.resetHistory();
    });

    after(function () {
      spawnStub.restore();
    });

    it('should run none', async function () {
      await runnable.run('1', [], false, shared.taskPool, new CancellationTokenSource().token);

      shared.assertSimplifiedEqualStateEvents([]);
      assert.deepStrictEqual(
        spawnStub.args.map(a => a[1]),
        [],
      );
    });

    it('should run all', async function () {
      await runnable.run('1', [], true, shared.taskPool, new CancellationTokenSource().token);

      // static event
      shared.assertSimplifiedEqualStateEvents([{ type: 'test', test: root.getTest(0, 2), state: 'errored' }]);

      // because 2 normal, 1 staticevent and 1 skipped
      assert.deepStrictEqual(
        spawnStub.args.map(a => a[1]),
        [[root.getTest(0, 0), root.getTest(0, 1)].map(t => t.id).sort()],
      );
    });

    it('should run normal', async function () {
      const normal = root.getTest(0, 0);
      await runnable.run('1', [normal.id], false, shared.taskPool, new CancellationTokenSource().token);

      shared.assertSimplifiedEqualStateEvents([]);
      assert.deepStrictEqual(
        spawnStub.args.map(a => a[1]),
        [[normal].map(t => t.id).sort()],
      );
    });

    it('should run force run skipped', async function () {
      const skipped = root.getTest(0, 3);

      await runnable.run('1', [skipped.id], false, shared.taskPool, new CancellationTokenSource().token);

      shared.assertSimplifiedEqualStateEvents([]);
      assert.deepStrictEqual(
        spawnStub.args.map(a => a[1]),
        [[skipped].map(t => t.id).sort()],
      );
    });

    it('should run force staticEvent', async function () {
      const staticEvent = root.getTest(0, 2);

      await runnable.run('1', [staticEvent.id], false, shared.taskPool, new CancellationTokenSource().token);

      // static event
      shared.assertSimplifiedEqualStateEvents([{ type: 'test', test: root.getTest(0, 2), state: 'errored' }]);

      assert.deepStrictEqual(
        spawnStub.args.map(a => a[1]),
        [],
      );
    });
  });

  //TODO: tests about variables
  //TODO: tests about grouping
});
