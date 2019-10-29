import * as assert from 'assert';
import * as cp from 'child_process';
import * as fse from 'fs-extra';
import * as path from 'path';
import { inspect } from 'util';
import * as vscode from 'vscode';

import { TestAdapter, settings, isWin, waitFor } from './Common';
import * as c2fs from '../src/FSWrapper';

///

const outPath = path.dirname(path.dirname(__filename));

assert(outPath.endsWith('out'));

const cppUri = vscode.Uri.file(path.join(outPath, 'cpp'));

function inCpp(relPath: string): string {
  return vscode.Uri.file(path.join(cppUri.fsPath, relPath)).fsPath;
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
    c.on('exit', (code: number) => {
      code == 0 ? resolve() : reject(new Error('Process exited with: ' + code));
    });
  });
}

///

describe(path.basename(__filename), function() {
  async function compile(): Promise<void> {
    await fse.mkdirp(cppUri.fsPath);

    await spawn('cmake', cppUri.fsPath, '../../test/cpp');

    if (isWin) {
      await spawn('msbuild.exe', cppUri.fsPath, 'ALL_BUILD.vcxproj');
    } else {
      await spawn('make', cppUri.fsPath);
    }
  }

  before(async function() {
    this.timeout(152000);

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

  beforeEach(async function() {
    await settings.resetConfig();
    await fse.remove(inWSTmp('.'));
    await fse.mkdirp(inWSTmp('.'));
  });

  let adapter: TestAdapter;

  afterEach(async function() {
    this.timeout(8000);

    if (adapter !== undefined) await adapter.waitAndDispose(this);
  });

  after(async function() {
    await fse.remove(inWSTmp('.'));
    await settings.resetConfig();
  });

  function copy(from: string, to: string): Promise<void> {
    return fse.copy(from, to);
  }

  context('example1', function() {
    it('should be found and run withouth error', async function() {
      //if (process.env['TRAVIS'] == 'true') this.skip();

      this.timeout(8000);
      this.slow(2000);
      await settings.updateConfig('executables', [
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

      const eventCount = adapter.testStatesEvents.length;
      await adapter.run([adapter.root.id]);
      assert.strictEqual(adapter.testStatesEvents.length, eventCount + 84, inspect(adapter.testStatesEvents));
    });

    it.only('should be notified by watcher', async function() {
      //if (process.env['TRAVIS'] == 'true') this.skip();

      this.timeout(8000);
      this.slow(4000);

      await settings.updateConfig('executables', [
        {
          name: '${baseFilename}',
          pattern: 'tmp/**/suite[0-9].exe',
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

      await settings.updateConfig('defaultWatchTimeoutSec', 1);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return fse.unlink(inWSTmp('sub/suite2X.exe'));
      });

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(retireCounter, 1);

      const eventCount = adapter.testStatesEvents.length;
      await adapter.run([adapter.root.id]);

      assert.strictEqual(adapter.testStatesEvents.length, eventCount + 14);
      assert.strictEqual(retireCounter, 1);
    });
  });
});
