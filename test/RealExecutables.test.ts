import * as assert from 'assert';
import * as cp from 'child_process';
import * as fse from 'fs-extra';
import * as path from 'path';
import { inspect, promisify } from 'util';
import * as vscode from 'vscode';

import { TestAdapter, settings, isWin, waitFor } from './Common';
import { DefaultSpawner } from '../src/Spawner';
import * as c2fs from '../src/FSWrapper';

///

const spawner = new DefaultSpawner();

///

const outPath = path.dirname(path.dirname(__filename));

assert(outPath.endsWith('out'));

const cppUri = vscode.Uri.file(path.join(outPath, 'cpp'));

function inCpp(relPath: string): string {
  const p = isWin ? path.join(cppUri.fsPath, 'Debug', relPath) : path.join(cppUri.fsPath, relPath);
  return vscode.Uri.file(p).fsPath;
}

function inWS(relPath: string): string {
  return vscode.Uri.file(path.join(settings.workspaceFolderUri.fsPath, relPath)).fsPath;
}

function inWSTmp(relPath: string): string {
  return inWS(path.join('tmp', relPath));
}

async function spawn(command: string, cwd: string, ...args: string[]): Promise<void> {
  console.log('$ ' + [command, ...args.map(x => '"' + x + '"')].join(' '));
  return new Promise((resolve, reject) => {
    const c = cp.spawn(command, args, { cwd, stdio: 'pipe' });
    const proc = { output: '' };
    c.on('exit', (code: number) => {
      if (code !== 0) console.log(proc.output);
      code == 0 ? resolve() : reject(new Error('Process exited with: ' + code));
    });
    c.stdout.on('data', x => (proc.output += x.toString()));
    c.stderr.on('data', x => (proc.output += x.toString()));
  });
}

///

describe(path.basename(__filename), function () {
  async function compile(): Promise<void> {
    await fse.mkdirp(cppUri.fsPath);

    await spawn('cmake', cppUri.fsPath, '../../test/cpp');

    if (isWin) {
      await spawn('msbuild.exe', cppUri.fsPath, 'ALL_BUILD.vcxproj');
    } else {
      await spawn('make', cppUri.fsPath);
    }
  }

  this.timeout(352000);

  before(async function () {
    const exec = ['suite1.exe', 'suite2.exe', 'suite3.exe', 'gtest1.exe'];

    for (const e of exec) {
      if (!c2fs.existsSync(inCpp(e))) {
        await compile();
        break;
      }
    }

    for (const e of exec) {
      await c2fs.isNativeExecutableAsync(inCpp(e));
    }
  });

  beforeEach(async function () {
    await settings.resetConfig();
    await fse.remove(inWSTmp('.'));
    await fse.mkdirp(inWSTmp('.'));
  });

  let adapter: TestAdapter;

  afterEach(async function () {
    if (adapter !== undefined) await adapter.waitAndDispose(this);
  });

  after(async function () {
    await fse.remove(inWSTmp('.'));
    await settings.resetConfig();
  });

  function copy(from: string, to: string): Promise<void> {
    return fse.copy(from, to);
  }

  context('Catch2 tests', function () {
    it('should be found and run withouth error', async function () {
      if (process.env['TRAVIS'] == 'true') this.skip();

      this.timeout(8000);
      this.slow(2000);
      await settings.updateConfig('test.advancedExecutables', [
        {
          name: '${baseFilename}',
          pattern: 'tmp/*suite[0-9].exe',
          cwd: '${workspaceFolder}',
        },
      ]);

      await copy(inCpp('suite1.exe'), inWSTmp('suite1.exe'));
      await copy(inCpp('suite2.exe'), inWSTmp('suite2.exe'));
      await copy(inCpp('suite3.exe'), inWSTmp('suite3.exe'));

      await waitFor(this, () => {
        return fse.existsSync(inWSTmp('suite1.exe'));
      });
      await waitFor(this, () => {
        return fse.existsSync(inWSTmp('suite2.exe'));
      });
      await waitFor(this, () => {
        return fse.existsSync(inWSTmp('suite3.exe'));
      });

      adapter = new TestAdapter();
      await adapter.load();
      assert.strictEqual(adapter.root.children.length, 3);

      const eventCount = adapter.stateEvents.length;
      await adapter.run([adapter.root.id]);

      assert.strictEqual(
        adapter.stateEvents.length - eventCount,
        2 + // start,fin
        2 + //suite1 start,fin
        5 * 2 + // suite1 tests
        2 + //suite2 start,fin
        2 * 2 + // suite2 tests
        2 + //suite3 start,fin
        29 * 2 + // suite3 tests
          6 * 1, // because old catch2 is buggy and we send staticEvent for 6 tests with parent
        inspect(
          adapter.stateEvents.map((v, i) => {
            if (v.type === 'suite' && typeof v.suite != 'string')
              return `${i}: [${v.type} ${v.state}: "${v.suite.label}" ]`;
            if (v.type === 'test' && typeof v.test != 'string')
              return `${i}:    [${v.type} ${v.state}: "${v.test.label}" ]`;
            else return `[${v.type}]`;
          }),
        ),
      );
    });

    it.skip('should be notified by watcher', async function () {
      this.timeout(8000);
      this.slow(4000);

      await settings.updateConfig('test.advancedExecutables', [
        {
          name: '${baseFilename}',
          pattern: 'tmp/suite[0-9].exe',
          cwd: '${workspaceFolder}',
        },
      ]);

      adapter = new TestAdapter();

      let retireCounter = 0;
      adapter.retire(() => {
        ++retireCounter;
      });

      await adapter.load();
      assert.strictEqual(adapter.root.children.length, 0);
      assert.strictEqual(retireCounter, 0);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return copy(inCpp('suite1.exe'), inWSTmp('suite1.exe'));
      });

      assert.strictEqual(adapter.root.children.length, 1);
      assert.strictEqual(retireCounter, 0);

      await fse.mkdirp(inWSTmp('sub'));

      await adapter.doAndWaitForReloadEvent(this, () => {
        return copy(inCpp('suite2.exe'), inWSTmp('sub/suite2X.exe'));
      });

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(retireCounter, 0);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return copy(inCpp('suite2.exe'), inWSTmp('sub/suite2.exe'));
      });

      assert.strictEqual(adapter.root.children.length, 3);
      assert.strictEqual(retireCounter, 0);

      await settings.updateConfig('discovery.gracePeriodForMissing', 1);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return fse.unlink(inWSTmp('sub/suite2X.exe'));
      });

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(retireCounter, 1);

      const eventCount = adapter.stateEvents.length;
      await adapter.run([adapter.root.id]);

      assert.strictEqual(adapter.stateEvents.length, eventCount + 14);
      assert.strictEqual(retireCounter, 1);
    });
  });

  context('Google tests', function () {
    it('should be found and run withouth error', async function () {
      if (process.env['TRAVIS'] == 'true') this.skip();

      this.timeout(8000);
      this.slow(2000);
      await settings.updateConfig('test.advancedExecutables', [
        {
          name: '${baseFilename}',
          pattern: 'tmp/gtest[0-9].exe',
          cwd: '${workspaceFolder}',
        },
      ]);

      await copy(inCpp('gtest1.exe'), inWSTmp('gtest1.exe'));

      await waitFor(this, () => {
        return fse.existsSync(inWSTmp('gtest1.exe'));
      });

      adapter = new TestAdapter();
      await adapter.load();
      assert.strictEqual(adapter.root.children.length, 1);

      const eventCount = adapter.stateEvents.length;
      await adapter.run([adapter.root.id]);
      assert.strictEqual(adapter.stateEvents.length - eventCount, 52, inspect(adapter.stateEvents));
    });
  });

  context('doctest tests', function () {
    it('should be found and run withouth error', async function () {
      if (process.env['TRAVIS'] == 'true') this.skip();

      this.timeout(8000);
      this.slow(2000);
      await settings.updateConfig('test.advancedExecutables', [
        {
          name: '${baseFilename}',
          pattern: 'tmp/doctest[0-9].exe',
          cwd: '${workspaceFolder}',
        },
      ]);

      await copy(inCpp('doctest1.exe'), inWSTmp('doctest1.exe'));

      await waitFor(this, () => {
        return fse.existsSync(inWSTmp('doctest1.exe'));
      });

      adapter = new TestAdapter();
      await adapter.load();
      assert.strictEqual(adapter.root.children.length, 1);

      const eventCount = adapter.stateEvents.length;
      await adapter.run([adapter.root.id]);
      assert.strictEqual(adapter.stateEvents.length - eventCount, 32);
    });
  });

  context('spawn parameter', function () {
    const testWithArgC = function (count: number) {
      return async function (): Promise<void> {
        // FSWrapper spawnAsync uses cp.spawn too so it is convenient to use it for testing

        const args = Array.from(Array(count).keys()).map(x => (x % 10).toString().repeat(10));

        const res = await spawner.spawnAsync(inCpp('echo_args.exe'), ['0', ...args], {});

        const stdout = res.stdout.trimRight().split(/\r?\n/);

        assert.deepStrictEqual(stdout, args);
      };
    };

    it('should work with argc=10', testWithArgC(10));
    it('should work with argc=1000', testWithArgC(1000));

    const testWithLength = function (length: number) {
      return async function (): Promise<void> {
        // FSWrapper spawnAsync uses cp.spawn too so it is convenient to use it for testing

        const args = ['x'.repeat(length)];

        const res = await spawner.spawnAsync(inCpp('echo_args.exe'), args, {});

        const stdout = res.stdout.trimRight().split(/\r?\n/);

        assert.deepStrictEqual(stdout, args);
      };
    };

    it('should work with long argv.length=10', testWithLength(10));
    it('should work with long argv.length=100000', testWithLength(31000));
  });

  context('parallel spawn', function () {
    async function waitFor(condition: () => Promise<boolean>, timeout: number): Promise<void> {
      const start = Date.now();
      let c = await condition();
      while (!(c = await condition()) && Date.now() - start < timeout) await promisify(setTimeout)(128);
      if (!c) throw Error('assert');
    }

    const testWith = function (count: number, atLeast: number) {
      return async function (): Promise<void> {
        let max = 0;
        let running = 0;
        let finished = 0;
        const processes: cp.ChildProcessWithoutNullStreams[] = [];

        for (let i = 0; i < count; ++i) {
          const p = cp.spawn(inCpp('echo_args.exe'), ['3', 'before', 'after']);
          processes.push(p);

          p.on('close', () => {
            running--;
            finished++;
          });

          p.stdout!.on('data', (chunk: Uint8Array) => {
            const output = chunk.toString();

            if (output.indexOf('before') != -1 && output.indexOf('after') == -1) running++;

            max = Math.max(max, running);
          });
        }

        await waitFor(async () => {
          return finished === count;
        }, count * 3500);

        assert.ok(max >= atLeast, `Failed: ${max} >= ${atLeast}`);
      };
    };

    // not interesting tests, it was just good to see that it is actually working
    it.skip('should work with 10', testWith(10, 5));
    it.skip('should work with 20', testWith(20, 5));
  });
});
