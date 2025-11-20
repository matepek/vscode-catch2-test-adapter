import * as assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';

import { resolveSymlinksInPattern } from '../src/util/FSWrapper';
import { settings, isWin } from './Common';
import { Logger } from '../src/Logger';

describe(path.basename(__filename), function () {
  let tempDir: string;
  let logger: Logger;

  beforeEach(async function () {
    // Create temporary directory for symlink tests
    tempDir = path.join(settings.workspaceFolderUri.fsPath, '.test-symlinks');
    await fse.ensureDir(tempDir);
    logger = new Logger();
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
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.strictEqual(result, path.join(realDir, '**', '*test*'));    });

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
      const result = await resolveSymlinksInPattern(pattern, logger);

      // Should resolve to the ultimate real path
      assert.strictEqual(result, path.join(realDir, '**', '*test*'));    });

    it('should resolve symlink at the root of pattern', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'build-cache');
      const symlinkDir = path.join(tempDir, 'build-out');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlinkDir);

      const pattern = path.join(symlinkDir, '**', '*test*');
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.strictEqual(result, path.join(realDir, '**', '*test*'));    });

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
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.strictEqual(result, path.join(realDir, 'subdirectory', '**', '*test*'));    });
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
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.strictEqual(result, path.join(realDir, '**', '*'));    });

    it('should preserve * wildcards', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, '*test*');
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.strictEqual(result, path.join(realDir, '*test*'));    });

    it('should preserve ? wildcards', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, 'test??.exe');
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.strictEqual(result, path.join(realDir, 'test??.exe'));    });

    it('should preserve [] character ranges', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, 'test[0-9].exe');
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.strictEqual(result, path.join(realDir, 'test[0-9].exe'));    });

    it('should preserve {} brace expansions', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, '{test,Test,TEST}*');
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.strictEqual(result, path.join(realDir, '{test,Test,TEST}*'));    });

    it('should preserve complex glob patterns', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'real');
      const symlink = path.join(tempDir, 'link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlink);

      const pattern = path.join(symlink, '{build,Build,BUILD}', '**', '*{test,Test,TEST}*');
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.strictEqual(result, path.join(realDir, '{build,Build,BUILD}', '**', '*{test,Test,TEST}*'));    });

    it('should return pattern unchanged when no symlinks exist', async function () {
      const regularDir = path.join(tempDir, 'regular-dir');
      await fse.ensureDir(regularDir);

      const pattern = path.join(regularDir, '**', '*test*');
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.strictEqual(result, pattern);    });

    it('should handle non-existent paths gracefully', async function () {
      const nonExistentPath = path.join(tempDir, 'does-not-exist', '**', '*test*');
      const result = await resolveSymlinksInPattern(nonExistentPath, logger);

      assert.strictEqual(result, nonExistentPath);    });

    it('should handle empty pattern', async function () {
      const result = await resolveSymlinksInPattern('', logger);
      assert.strictEqual(result, '');    });

    it('should handle pattern with only glob characters', async function () {
      const pattern = '**/*test*';
      const result = await resolveSymlinksInPattern(pattern, logger);
      assert.strictEqual(result, pattern);    });

    it('should return absolute paths', async function () {
      if (isWin) {
        this.skip();
      }

      const realDir = path.join(tempDir, 'absolute-real');
      const symlinkDir = path.join(tempDir, 'absolute-link');

      await fse.ensureDir(realDir);
      await fse.symlink(realDir, symlinkDir);

      const pattern = path.join(symlinkDir, '**', '*');
      const result = await resolveSymlinksInPattern(pattern, logger);

      assert.ok(path.isAbsolute(result), 'Resolved path should be absolute');
      assert.strictEqual(result, path.join(realDir, '**', '*'));    });

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
      const result = await resolveSymlinksInPattern(pattern, logger);

      // Should resolve up to the symlink, then keep the rest as-is
      assert.strictEqual(result, path.join(realDir, '*', 'subdir', 'file.txt'));    });
  });
});
