import * as assert from 'assert';
import * as cp from 'child_process';
import * as fse from 'fs-extra';
import * as path from 'path';
import { inspect, promisify } from 'util';
import * as vscode from 'vscode';

import { TestAdapter, settings, isWin, waitFor } from './Common';
import * as c2fs from '../src/FSWrapper';

///

const cppUri = vscode.Uri.file(path.join(settings.workspaceFolderUri.fsPath, 'cpp'));

function inCpp(relPath: string): string {
  return vscode.Uri.file(path.join(cppUri.fsPath, relPath)).fsPath;
}

///

describe(path.basename(__filename), function() {
  async function compile(source: string, output: string): Promise<void> {
    if (isWin) {
      let vcvarsall: vscode.Uri | undefined;
      if (process.env['C2AVCVA']) {
        // local testing
        vcvarsall = vscode.Uri.file(process.env['C2AVCVA']!);
      } else if (process.env['APPVEYOR_BUILD_WORKER_IMAGE'] == 'Visual Studio 2017')
        vcvarsall = vscode.Uri.file(
          'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Community\\VC\\Auxiliary\\Build\\vcvarsall.bat',
        );

      assert.notStrictEqual(vcvarsall, undefined, inspect(process.env));
      const command =
        '"' +
        vcvarsall!.fsPath +
        '" x86 && ' +
        ['cl.exe', '/EHsc', '/I"' + path.dirname(source) + '"', '/Fe"' + output + '"', '"' + source + '"'].join(' ');
      await promisify(cp.exec)(command);
    } else {
      await promisify(cp.exec)('"' + ['c++', '-x', 'c++', '-std=c++11', '-o', output, source].join('" "') + '"');
      await promisify(cp.exec)('"' + ['chmod', '+x', output].join('" "') + '"');
    }
    await promisify(setTimeout)(500);
    await c2fs.isNativeExecutableAsync(output).catch(() => {
      assert.fail();
    });
  }

  before(async function() {
    this.timeout(82000);

    await c2fs
      .isNativeExecutableAsync(inCpp('../suite1.exe'))
      .catch(() => compile(path.join(__dirname, '../../test/cpp/suite1.cpp'), inCpp('../suite1.exe')));

    await c2fs
      .isNativeExecutableAsync(inCpp('../suite2.exe'))
      .catch(() => compile(path.join(__dirname, '../../test/cpp/suite2.cpp'), inCpp('../suite2.exe')));

    await c2fs
      .isNativeExecutableAsync(inCpp('../suite3.exe'))
      .catch(() => compile(path.join(__dirname, '../../test/cpp/suite3.cpp'), inCpp('../suite3.exe')));
  });

  beforeEach(async function() {
    await fse.remove(cppUri.fsPath);
    await fse.mkdirp(cppUri.fsPath);
    await settings.resetConfig();
  });

  let adapter: TestAdapter;

  afterEach(async function() {
    this.timeout(8000);
    await adapter.waitAndDispose(this);
  });

  after(async function() {
    await fse.remove(cppUri.fsPath);
    await settings.resetConfig();
  });

  function copy(from: string, to: string): Promise<void> {
    return fse.copy(inCpp(from), inCpp(to));
  }

  context('example1', function() {
    it('should be found and run withouth error', async function() {
      if (process.env['TRAVIS'] == 'true') this.skip();

      this.timeout(8000);
      this.slow(2000);
      await settings.updateConfig('executables', [
        {
          name: '${baseFilename}',
          pattern: 'cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*',
          cwd: '${workspaceFolder}/cpp',
        },
      ]);

      await copy('../suite1.exe', 'out/suite1.exe');
      await copy('../suite2.exe', 'out/suite2.exe');
      await copy('../suite3.exe', 'out/suite3.exe');

      await waitFor(this, () => {
        return fse.existsSync(inCpp('out/suite1.exe'));
      });
      await waitFor(this, () => {
        return fse.existsSync(inCpp('out/suite2.exe'));
      });
      await waitFor(this, () => {
        return fse.existsSync(inCpp('out/suite3.exe'));
      });

      adapter = new TestAdapter();
      await adapter.load();
      assert.strictEqual(adapter.root.children.length, 3);

      const eventCount = adapter.testStatesEvents.length;
      await adapter.run([adapter.root.id]);
      assert.strictEqual(adapter.testStatesEvents.length, eventCount + 84, inspect(adapter.testStatesEvents));
    });

    it('should be notified by watcher', async function() {
      if (process.env['TRAVIS'] == 'true') this.skip();

      this.timeout(8000);
      this.slow(4000);
      await settings.updateConfig('executables', [
        {
          name: '${baseFilename}',
          pattern: 'cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*',
          cwd: '${workspaceFolder}/cpp',
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
        return copy('../suite1.exe', 'out/suite1.exe');
      });

      assert.strictEqual(adapter.root.children.length, 1);
      assert.strictEqual(retireCounter, 0);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return copy('../suite2.exe', 'out/sub/suite2X.exe');
      });

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(retireCounter, 0);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return copy('../suite2.exe', 'out/sub/suite2.exe');
      });

      assert.strictEqual(adapter.root.children.length, 3);
      assert.strictEqual(retireCounter, 0);

      await settings.updateConfig('defaultWatchTimeoutSec', 1);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return fse.unlink(inCpp('out/sub/suite2X.exe'));
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
