//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

import {spawnAsync, statAsync} from '../FsWrapper';

assert.notEqual(vscode.workspace.workspaceFolders, undefined);
assert.equal(vscode.workspace.workspaceFolders!.length, 1);

const workspaceFolderUri = vscode.workspace.workspaceFolders![0].uri;

describe('FsWrapper.spawnAsync', function() {
  it('echoes', async function() {
    const r = await spawnAsync('echo', ['apple']);
    assert.equal(r.stdout, 'apple\n');
    assert.equal(r.output.length, 2);
    assert.equal(r.output[0], 'apple\n');
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
      assert.equal(e.errno, -2);
    }
  })

  it('exists', async function() {
    const res = await statAsync(
        path.join(workspaceFolderUri.path, 'FsWrapper.test.js'));
    assert.ok(res.isFile());
    assert.ok(!res.isDirectory());
  })
})

describe('path', function() {
  context('Uri', function() {
    it('sould resolve', function() {
      const a = vscode.Uri.file('/a/b/c');
      const b = vscode.Uri.file('/a/b/c/d/e');
      assert.equal(path.relative(a.fsPath, b.fsPath), path.normalize('d/e'));
    })
  })
})