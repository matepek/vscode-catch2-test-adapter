import * as assert from 'assert';
import * as cp from 'child_process';
import { EOL } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { spawnAsync, SpawnOptions, SpawnReturns } from '../src/FSWrapper';
import { ChildProcessStub, isWin } from './Common';

///

describe('FsWrapper.spawnAsync', function() {
  it('echoes', async function() {
    const isWin = process.platform === 'win32';
    const opt: SpawnOptions = isWin ? { shell: true } : {};
    const r = await spawnAsync('echo', ['apple'], opt);
    assert.equal(r.stdout, 'apple' + EOL);
    assert.equal(r.output.length, 3);
    assert.equal(r.output[1], 'apple' + EOL);
    assert.equal(r.output[2], '');
    assert.equal(r.status, 0);
  });

  it('not existing', function() {
    let hasErr = false;
    return spawnAsync('notexisting.exe')
      .then(
        () => {
          assert.ok(false);
        },
        () => {
          hasErr = true;
        },
      )
      .then(() => {
        assert.ok(hasErr);
      });
  });
});

describe('fs.spawn vs FsWrapper.spawnAsync', function() {
  function compare(actual: SpawnReturns, expected: cp.SpawnSyncReturns<string>): void {
    assert.deepStrictEqual(actual.signal, expected.signal);
    assert.deepStrictEqual(actual.status, expected.status);
    assert.deepStrictEqual(actual.output, expected.output);
    assert.deepStrictEqual(actual.stdout, expected.stdout);
    assert.deepStrictEqual(actual.output, expected.output);
    assert.deepStrictEqual(actual.stderr, expected.stderr);
    assert.deepStrictEqual(actual.error, expected.error);
  }

  it('echo apple', async function() {
    const fsRes = cp.spawnSync('echo', ['apple'], { encoding: 'utf8' });
    assert.strictEqual(fsRes.signal, null);
    assert.strictEqual(fsRes.status, 0);
    assert.strictEqual(fsRes.output[1].trim(), 'apple');
    assert.strictEqual(fsRes.stdout.trim(), 'apple');
    assert.strictEqual(fsRes.output[2], '');
    assert.strictEqual(fsRes.stderr, '');
    assert.strictEqual(fsRes.error, undefined);

    return spawnAsync('echo', ['apple']).then(res => {
      compare(res, fsRes);
    });
  });

  if (!isWin) {
    it('ls --wrongparam', async function() {
      const fsRes = cp.spawnSync('ls', ['--wrongparam'], { encoding: 'utf8' });
      assert.strictEqual(fsRes.signal, null);
      assert.notStrictEqual(fsRes.status, 0);
      assert.strictEqual(fsRes.error, undefined);

      assert.ok(typeof fsRes.output[1] === 'string');
      assert.ok(typeof fsRes.stdout === 'string');
      assert.ok(typeof fsRes.output[2] === 'string');
      assert.ok(typeof fsRes.stderr === 'string');

      return spawnAsync('ls', ['--wrongparam']).then(res => {
        compare(res, fsRes);
      });
    });
  }

  it('<not existing>', async function() {
    const fsRes = cp.spawnSync('fnksdlfnlskfdn', [], { encoding: 'utf8' });
    assert.strictEqual(fsRes.signal, null);
    assert.strictEqual(fsRes.status, null);
    assert.strictEqual(fsRes.output, null);
    assert.strictEqual(fsRes.stdout, null);
    assert.strictEqual(fsRes.stderr, null);
    assert.ok(fsRes.error instanceof Error, fsRes.error);

    return spawnAsync('fnksdlfnlskfdn', ['']).then(
      () => {
        assert.fail();
      },
      err => {
        assert.ok(err instanceof Error);
      },
    );
  });
});

describe('path', function() {
  describe('Uri', function() {
    it('sould resolve', function() {
      const a = vscode.Uri.file('/a/b/c');
      const b = vscode.Uri.file('/a/b/c/d/e');
      assert.equal(path.relative(a.fsPath, b.fsPath), path.normalize('d/e'));
    });
  });
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
    });

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
    });
  });
});

describe('vscode.Uri', function() {
  it('!=', function() {
    assert.ok(vscode.Uri.file(__filename) != vscode.Uri.file(__filename));
  });

  it('normalizes', function() {
    const parent = path.dirname(__filename);
    const filename = path.basename(__filename);
    assert.ok(!parent.endsWith('/') && !parent.endsWith('\\'));
    assert.strictEqual(
      path.normalize(vscode.Uri.file(parent + '/a/b/../../' + filename).fsPath),
      vscode.Uri.file(__filename).fsPath,
    );
  });
});

describe('ChildProcessFake', function() {
  it('should works', async function() {
    const cp = new ChildProcessStub('alma');
    let output = '';
    cp.stdout.on('data', (d: string) => {
      output += d;
    });
    await new Promise(resolve => {
      cp.on('close', resolve);
    }).then(() => {
      assert.strictEqual(output, 'alma');
    });
  });

  it('should works2', async function() {
    this.timeout(2000);
    this.slow(1500);
    const cp = new ChildProcessStub();
    let output = '';
    cp.stdout.on('data', (d: string) => {
      output += d;
    });
    cp.write('alma');
    setTimeout(() => {
      cp.close();
    }, 500);
    await new Promise(resolve => {
      cp.on('close', resolve);
    }).then(() => {
      assert.strictEqual(output, 'alma');
    });
  });
});
