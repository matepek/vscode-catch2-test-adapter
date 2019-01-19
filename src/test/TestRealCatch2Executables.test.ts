//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fse from 'fs-extra';
import * as path from 'path';
import { inspect, promisify } from 'util';
import * as vscode from 'vscode';

import { TestAdapter, settings, isWin, waitFor } from './TestCommon';
import * as c2fs from '../FsWrapper';

///

const cppUri = vscode.Uri.file(path.join(settings.workspaceFolderUri.fsPath, 'cpp'));

function inCpp(relPath: string) {
  return vscode.Uri.file(path.join(cppUri.fsPath, relPath));
}

///

describe(path.basename(__filename), function () {
  async function compile(source: vscode.Uri, output: vscode.Uri) {
    if (isWin) {
      let vcvarsall: vscode.Uri | undefined;
      if (process.env['C2AVCVA']) { // local testing
        vcvarsall = vscode.Uri.file(process.env['C2AVCVA']!);
      } else if (
        process.env['APPVEYOR_BUILD_WORKER_IMAGE'] == 'Visual Studio 2017')
        vcvarsall = vscode.Uri.file(
          'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Community\\VC\\Auxiliary\\Build\\vcvarsall.bat');

      assert.notStrictEqual(vcvarsall, undefined, inspect(process.env));
      const command = '"' + vcvarsall!.fsPath + '" x86 && ' + [
        'cl.exe',
        '/EHsc',
        '/I"' + path.dirname(source.fsPath) + '"',
        '/Fe"' + output.fsPath + '"',
        '"' + source.fsPath + '"',
      ].join(' ');
      await promisify(cp.exec)(command);
    } else {
      await promisify(cp.exec)('"' + [
        'c++',
        '-x',
        'c++',
        '-std=c++11',
        '-o',
        output.fsPath,
        source.fsPath,
      ].join('" "') + '"');
      await promisify(cp.exec)('"' + [
        'chmod',
        '+x',
        output.fsPath,
      ].join('" "') + '"');
    }
    await promisify(setTimeout)(500);
    assert.ok(await c2fs.existsAsync(output.fsPath));
  }

  before(async function () {
    this.timeout(82000);

    if (!await c2fs.existsAsync(inCpp('../suite1.exe').fsPath))
      await compile(inCpp('../../../src/test/cpp/suite1.cpp'), inCpp('../suite1.exe'));

    if (!await c2fs.existsAsync(inCpp('../suite2.exe').fsPath))
      await compile(inCpp('../../../src/test/cpp/suite2.cpp'), inCpp('../suite2.exe'));

    if (!await c2fs.existsAsync(inCpp('../suite3.exe').fsPath))
      await compile(inCpp('../../../src/test/cpp/suite3.cpp'), inCpp('../suite3.exe'));
  })

  beforeEach(async function () {
    await fse.remove(cppUri.fsPath);
    await fse.mkdirp(cppUri.fsPath);
  })

  let adapter: TestAdapter;

  afterEach(async function () {
    this.timeout(8000);
    await adapter.waitAndDispose(this);
    await settings.resetConfig();
  })

  after(async function () {
    await fse.remove(cppUri.fsPath);
  })

  function copy(from: string, to: string) {
    return fse.copy(inCpp(from).fsPath, inCpp(to).fsPath);
  }

  context('example1', function () {
    it('should be found and run withouth error', async function () {
      if (process.env['TRAVIS'] == 'true') this.skip();
      this.timeout(8000);
      this.slow(2000);
      await settings.updateConfig(
        'executables', [{
          'name': '${baseFilename}',
          'pattern': 'cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*',
          'cwd': '${workspaceFolder}/cpp',
        }]);

      await copy('../suite1.exe', 'out/suite1.exe');
      await copy('../suite2.exe', 'out/suite2.exe');
      await copy('../suite3.exe', 'out/suite3.exe');

      await waitFor(this, () => { return fse.existsSync(inCpp('out/suite1.exe').fsPath); });
      await waitFor(this, () => { return fse.existsSync(inCpp('out/suite2.exe').fsPath); });
      await waitFor(this, () => { return fse.existsSync(inCpp('out/suite3.exe').fsPath); });

      adapter = new TestAdapter();
      await adapter.load();
      assert.strictEqual(adapter.root.children.length, 3);

      const eventCount = adapter.testStatesEvents.length;
      await adapter.run([adapter.root.id]);
      assert.strictEqual(
        adapter.testStatesEvents.length, eventCount + 86, inspect(adapter.testStatesEvents));
    })

    it('should be notified by watcher', async function () {
      if (process.env['TRAVIS'] == 'true') this.skip();
      this.timeout(8000);
      this.slow(4000);
      await settings.updateConfig(
        'executables', [{
          'name': '${baseFilename}',
          'pattern': 'cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*',
          'cwd': '${workspaceFolder}/cpp',
        }]);

      adapter = new TestAdapter();

      let autorunCounter = 0;
      adapter.autorun(() => {
        ++autorunCounter;
      });

      await adapter.load();
      assert.strictEqual(adapter.root.children.length, 0);
      assert.strictEqual(autorunCounter, 0);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return copy('../suite1.exe', 'out/suite1.exe');
      });

      assert.strictEqual(adapter.root.children.length, 1);
      assert.strictEqual(autorunCounter, 0);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return copy('../suite2.exe', 'out/sub/suite2X.exe');
      });

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(autorunCounter, 0);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return copy('../suite2.exe', 'out/sub/suite2.exe');
      });

      assert.strictEqual(adapter.root.children.length, 3);
      assert.strictEqual(autorunCounter, 0);

      await settings.updateConfig('defaultWatchTimeoutSec', 1);

      await adapter.doAndWaitForReloadEvent(this, () => {
        return fse.unlink(inCpp('out/sub/suite2X.exe').fsPath);
      });

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(autorunCounter, 0);

      const eventCount = adapter.testStatesEvents.length;
      await adapter.run([adapter.root.id]);
      assert.strictEqual(adapter.testStatesEvents.length, eventCount + 16);
      assert.strictEqual(autorunCounter, 0);
    })
  })
})