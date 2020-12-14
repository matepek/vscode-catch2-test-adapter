import * as path from 'path';
import { EOL } from 'os';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { SharedVariables, RootSuite, ChildProcessStub } from './Common';
import { RunnableFactory } from '../src/RunnableFactory';
import { DefaultSpawner } from '../src/Spawner';
import * as fsw from '../src/util/FSWrapper';

///

describe(path.basename(__filename), function () {
  const sharedVariables = new SharedVariables();
  const root = new RootSuite(sharedVariables);

  const sinonSandbox = sinon.createSandbox();

  let spawnStub: sinon.SinonStub<
    [string, readonly string[], fsw.SpawnOptionsWithoutStdio],
    fsw.ChildProcessWithoutNullStreams
  >;

  before(function () {
    spawnStub = sinonSandbox.stub(fsw, 'spawn').named('spawnStub');
  });

  beforeEach(function () {
    sinonSandbox.reset();
  });

  after(function () {
    sinonSandbox.restore();
  });

  describe('gtest', function () {
    it('recognises', async function () {
      const factory = new RunnableFactory(
        sharedVariables,
        'execname',
        'execdesc',
        root,
        'execpath.exe',
        {},
        [],
        {},
        {},
        {},
        {},
        1,
        false,
        {},
        new DefaultSpawner(),
        {},
      );

      spawnStub
        .withArgs('execpath.exe', ['--help'], { timeout: sharedVariables.execParsingTimeout })
        .returns(
          new ChildProcessStub(
            [
              'Running main() from gmock_main.cc',
              'This program contains tests written using Google Test. You can use the',
              'following command line flags to control its behavior:',
              '',
              'Test Selection:',
              '  --gtest_list_tests',
              '      List the names of all tests instead of running them. The name of',
              '      TEST(Foo, Bar) is "Foo.Bar".',
            ].join(EOL),
          ),
        );

      const created = await factory.create(false);

      assert.strictEqual(created.frameworkName, 'GoogleTest');
      // eslint-disable-next-line
      assert.strictEqual((created as any)._argumentPrefix, 'gtest_');
    });

    it('recognises different prefix', async function () {
      const factory = new RunnableFactory(
        sharedVariables,
        'execname',
        'execdesc',
        root,
        'execpath.exe',
        {},
        [],
        {},
        {},
        {},
        {},
        1,
        false,
        {},
        new DefaultSpawner(),
        {},
      );

      spawnStub
        .withArgs('execpath.exe', ['--help'], { timeout: sharedVariables.execParsingTimeout })
        .returns(
          new ChildProcessStub(
            [
              'Running main() from gmock_main.cc',
              'This program contains tests written using Google Test. You can use the',
              'following command line flags to control its behavior:',
              '',
              'Test Selection:',
              '  --mate_list_tests',
              '      List the names of all tests instead of running them. The name of',
              '      TEST(Foo, Bar) is "Foo.Bar".',
            ].join(EOL),
          ),
        );

      const created = await factory.create(false);

      assert.strictEqual(created.frameworkName, 'GoogleTest');
      // eslint-disable-next-line
      assert.strictEqual((created as any)._argumentPrefix, 'mate_');
    });
  });
});
