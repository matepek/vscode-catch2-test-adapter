import * as assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';

import { resolveSymlinksInPattern } from '../src/util/FSWrapper';
import { settings, isWin } from './Common';

describe(path.basename(__filename), function () {
  let tempDir: string;

  beforeEach(async function () {
    // Create temporary directory for symlink tests
    tempDir = path.join(settings.workspaceFolderUri.fsPath, '.test-symlinks');
    await fse.ensureDir(tempDir);
  });

  afterEach(async function () {
    if (await fse.pathExists(tempDir)) {
      await fse.remove(tempDir);
    }
  });

  describe('basic symlink resolution', function () {
    it('should resolve a single symlink directory', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real-dir');
      const symlinkDir = path.join(tempDir, 'symlink-dir');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlinkDir);

      const pattern = path.join(symlinkDir, '**', '*test*');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.strictEqual(resolved, path.join(realDir, '**', '*test*'));
    });

    it('should resolve nested symlinks', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real-dir');
      const intermediateSymlink = path.join(tempDir, 'intermediate');
      const finalSymlink = path.join(tempDir, 'final');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, intermediateSymlink);
      await fse.symlink(intermediateSymlink, finalSymlink);

      const pattern = path.join(finalSymlink, '**', '*test*');
      const resolved = resolveSymlinksInPattern(pattern);

      // Should resolve to the ultimate real path
      assert.strictEqual(resolved, path.join(realDir, '**', '*test*'));
    });

    it('should resolve symlink at the root of pattern', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'build-cache');
      const symlinkDir = path.join(tempDir, 'build-out');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlinkDir);

      const pattern = path.join(symlinkDir, '**', '*test*');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.strictEqual(resolved, path.join(realDir, '**', '*test*'));
    });

    it('should resolve symlink in the middle of path', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real-build');
      const symlinkDir = path.join(tempDir, 'build-link');
      const subDir = path.join(symlinkDir, 'subdirectory');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlinkDir);

      const pattern = path.join(subDir, '**', '*test*');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.strictEqual(resolved, path.join(realDir, 'subdirectory', '**', '*test*'));
    });
  });

  describe('glob pattern preservation', function () {
    it('should preserve ** recursive wildcards', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, '**', '*');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.strictEqual(resolved, path.join(realDir, '**', '*'));
    });

    it('should preserve * wildcards', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, '*test*');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.strictEqual(resolved, path.join(realDir, '*test*'));
    });

    it('should preserve ? wildcards', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, 'test??.exe');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.strictEqual(resolved, path.join(realDir, 'test??.exe'));
    });

    it('should preserve [] character ranges', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, 'test[0-9].exe');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.strictEqual(resolved, path.join(realDir, 'test[0-9].exe'));
    });

    it('should preserve {} brace expansions', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, '{test,Test,TEST}*');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.strictEqual(resolved, path.join(realDir, '{test,Test,TEST}*'));
    });

    it('should preserve complex glob patterns', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, '{build,Build,BUILD}', '**', '*{test,Test,TEST}*');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.strictEqual(resolved, path.join(realDir, '{build,Build,BUILD}', '**', '*{test,Test,TEST}*'));
    });

    it('should return pattern unchanged when no symlinks exist', async function () {
      const regularDir = path.join(tempDir, 'regular-dir');
      await fse.ensureDir(regularDir);

      const pattern = path.join(regularDir, '**', '*test*');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.strictEqual(resolved, pattern);
    });

    it('should handle non-existent paths gracefully', async function () {
      const nonExistentPath = path.join(tempDir, 'does-not-exist', '**', '*test*');
      const resolved = resolveSymlinksInPattern(nonExistentPath);

      assert.strictEqual(resolved, nonExistentPath);
    });

    it('should handle empty pattern', async function () {
      const resolved = resolveSymlinksInPattern('');
      assert.strictEqual(resolved, '');
    });

    it('should handle pattern with only glob characters', async function () {
      const pattern = '**/*test*';
      const resolved = resolveSymlinksInPattern(pattern);
      assert.strictEqual(resolved, pattern);
    });

    it('should return absolute paths', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'absolute-real');
      const symlinkDir = path.join(tempDir, 'absolute-link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlinkDir);

      const pattern = path.join(symlinkDir, '**', '*');
      const resolved = resolveSymlinksInPattern(pattern);

      assert.ok(path.isAbsolute(resolved), 'Resolved path should be absolute');
      assert.strictEqual(resolved, path.join(realDir, '**', '*'));
    });

    it('should stop resolving at first glob pattern', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      // Pattern has glob early, then more path components
      const pattern = path.join(symlink, '*', 'subdir', 'file.txt');
      const resolved = resolveSymlinksInPattern(pattern);

      // Should resolve up to the symlink, then keep the rest as-is
      assert.strictEqual(resolved, path.join(realDir, '*', 'subdir', 'file.txt'));
    });
  });
});
