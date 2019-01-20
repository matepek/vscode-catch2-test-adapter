//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as assert from 'assert';
import { SpawnOptions } from 'child_process';
import { EOL } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { spawnAsync, statAsync } from '../FsWrapper';
import { ChildProcessStub } from './TestCommon';

describe(path.basename(__filename), function () {
  it('echoes', async function () {
    const isWin = process.platform === 'win32';
    const opt: SpawnOptions = isWin ? { shell: true } : {};
    const r = await spawnAsync('echo', ['apple'], opt);
    assert.equal(r.stdout, 'apple' + EOL);
    assert.equal(r.output.length, 2);
    assert.equal(r.output[0], 'apple' + EOL);
    assert.equal(r.status, 0);
  })

  it('not existing', function () {
    let hasErr = false;
    return spawnAsync('notexisting.exe')
      .then(
        () => {
          assert.ok(false);
        },
        (e: any) => {
          hasErr = true;
        })
      .then(() => {
        assert.ok(hasErr);
      });
  })
})

describe('FsWrapper.statAsync', function () {
  it('doesnt exists', async function () {
    try {
      await statAsync('notexists');
      assert.ok(false);
    } catch (e) {
      assert.equal(e.code, 'ENOENT');
      assert.notEqual(e.errno, 0);
    }
  })

  it('exists', async function () {
    const res = await statAsync(__filename);
    assert.ok(res.isFile());
    assert.ok(!res.isDirectory());
  })
})

describe('path', function () {
  describe('Uri', function () {
    it('sould resolve', function () {
      const a = vscode.Uri.file('/a/b/c');
      const b = vscode.Uri.file('/a/b/c/d/e');
      assert.equal(path.relative(a.fsPath, b.fsPath), path.normalize('d/e'));
    })
  })
  describe('extname', function () {
    it('extname', function () {
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

    it('.extname', function () {
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

describe('vscode.Uri', function () {
  it('!=', function () {
    assert.ok(vscode.Uri.file(__filename) != vscode.Uri.file(__filename));
  })

  it('normalizes', function () {
    const parent = path.dirname(__filename);
    const filename = path.basename(__filename);
    assert.ok(!parent.endsWith('/') && !parent.endsWith('\\'));
    assert.strictEqual(path.normalize(vscode.Uri.file(parent + '/a/b/../../' + filename).fsPath),
      vscode.Uri.file(__filename).fsPath);
  })
})

describe('ChildProcessStub', function () {
  it('should works', async function () {
    const cp = new ChildProcessStub("alma");
    let output: string = '';
    cp.stdout.on('data', (d: string) => {
      output += d;
    });
    await new Promise(resolve => {
      cp.on('close', resolve);
    }).then(() => {
      assert.strictEqual(output, 'alma');
    });
  })

  it('should works2', async function () {
    this.timeout(700);
    this.slow(600);
    const cp = new ChildProcessStub();
    let output: string = '';
    cp.stdout.on('data', (d: string) => {
      output += d;
    });
    cp.write('alma');
    setTimeout(() => { cp.close(); }, 500);
    await new Promise(resolve => {
      cp.on('close', resolve);
    }).then(() => {
      assert.strictEqual(output, 'alma');
    });
  })
})