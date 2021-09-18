import * as path from 'path';
import * as assert from 'assert';
import { ExecutableConfig } from '../../src/ExecutableConfig';
import { WorkspaceShared } from '../../src/WorkspaceShared';

///

describe(path.basename(__filename), function () {
  this.timeout(5000);
  this.slow(1000);

  const shared = new WorkspaceShared();
  const execConfig = new ExecutableConfig(
    shared,
    'pattern',
    undefined,
    undefined,
    '.',
    undefined,
    undefined,
    [],
    {},
    1,
    undefined,
    undefined,
    undefined,
    undefined,
    {},
    {},
    {},
    {},
    {},
  );

  specify('_pathProcessor with posix name', async function () {
    {
      const path = await execConfig['_pathProcessor']('/mnt/a/b/c/d/e/**/*{test,Test,TEST}');

      assert.ok(path.isAbsolute);
      assert.ok(!path.isPartOfWs);
    }

    {
      const path = await execConfig['_pathProcessor']('a/b/c/d/e/**/*{test,Test,TEST}');

      assert.ok(!path.isAbsolute);
      assert.ok(path.isPartOfWs);
    }
  });

  specify('_pathProcessor with win name', async function () {
    {
      const path = await execConfig['_pathProcessor']('E:\\a\\b\\c\\d\\e\\**\\*{test,Test,TEST}*');

      assert.ok(path.isAbsolute);
      assert.ok(!path.isPartOfWs);
    }
    {
      const path = await execConfig['_pathProcessor']('a\\b\\c\\d\\e\\**\\*{test,Test,TEST}*');

      assert.ok(!path.isAbsolute);
      assert.ok(path.isPartOfWs);
    }
  });
});
