//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as assert from 'assert';
import {SpawnOptions} from 'child_process';
import {EOL} from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {spawnAsync, statAsync} from '../FsWrapper';

assert.notEqual(vscode.workspace.workspaceFolders, undefined);
assert.equal(vscode.workspace.workspaceFolders!.length, 1);

const workspaceFolderUri = vscode.workspace.workspaceFolders![0].uri;

describe('FsWrapper.spawnAsync', function() {
  it('echoes', async function() {
    const isWin = process.platform === 'win32';
    const opt: SpawnOptions = isWin ? {shell: true} : {};
    const r = await spawnAsync('echo', ['apple'], opt);
    assert.equal(r.stdout, 'apple' + EOL);
    assert.equal(r.output.length, 2);
    assert.equal(r.output[0], 'apple' + EOL);
    assert.equal(r.status, 0);
  })

  it.skip('sleeps', async function() {
    this.timeout(1100);
    this.slow(1050);
    if (process.platform === 'darwin') {
      const r = await spawnAsync('sleep', ['1']);
      assert.equal(r.stdout, '');
      assert.equal(r.output.length, 0);
      assert.equal(r.status, 0);
    }
  })
})

describe('FsWrapper.statAsync', function() {
  it('doesnt exists', async function() {
    try {
      await statAsync('notexists');
      assert.ok(false);
    } catch (e) {
      assert.equal(e.code, 'ENOENT');
      assert.notEqual(e.errno, 0);
    }
  })

  it('exists', async function() {
    const res = await statAsync(
        path.join(workspaceFolderUri.fsPath, 'FsWrapper.test.js'));
    assert.ok(res.isFile());
    assert.ok(!res.isDirectory());
  })
})

describe('path', function() {
  describe('Uri', function() {
    it('sould resolve', function() {
      const a = vscode.Uri.file('/a/b/c');
      const b = vscode.Uri.file('/a/b/c/d/e');
      assert.equal(path.relative(a.fsPath, b.fsPath), path.normalize('d/e'));
    })
  })
  describe('extname', function() {
    it('extname', function() {
      const filename = path.basename('bar/foo/base.ext2.ext1');
      assert.equal(filename, 'base.ext2.ext1');

      const extFilename = path.extname(filename);
      assert.equal(extFilename, '.ext1');

      const baseFilename = path.basename(filename, extFilename);
      assert.equal(baseFilename, 'base.ext2');

      const ext2Filename = path.extname(baseFilename);
      assert.equal(ext2Filename, '.ext2');

      const base2Filename = path.basename(baseFilename, ext2Filename);
      assert.equal(base2Filename, 'base');

      const ext3Filename = path.extname(base2Filename);
      assert.equal(ext3Filename, '');

      const base3Filename = path.basename(base2Filename, ext3Filename);
      assert.equal(base3Filename, 'base');
    })

    it('.extname', function() {
      const filename = path.basename('bar/foo/.base.ext2.ext1');
      assert.equal(filename, '.base.ext2.ext1');

      const extFilename = path.extname(filename);
      assert.equal(extFilename, '.ext1');

      const baseFilename = path.basename(filename, extFilename);
      assert.equal(baseFilename, '.base.ext2');

      const ext2Filename = path.extname(baseFilename);
      assert.equal(ext2Filename, '.ext2');

      const base2Filename = path.basename(baseFilename, ext2Filename);
      assert.equal(base2Filename, '.base');

      const ext3Filename = path.extname(base2Filename);
      assert.equal(ext3Filename, '');

      const base3Filename = path.basename(base2Filename, ext3Filename);
      assert.equal(base3Filename, '.base');
    })
  })
})

describe('vscode.Uri', function() {
  it('!=', function() {
    assert.ok(vscode.Uri.file(workspaceFolderUri.path) != workspaceFolderUri);
  })
})