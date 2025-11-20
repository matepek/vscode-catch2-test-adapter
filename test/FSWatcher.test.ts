import * as assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';

import { GazeWrapper, VSCFSWatcherWrapper } from '../src/util/FSWatcher';
import { settings, isWin } from './Common';

describe(path.basename(__filename), function () {
  let tempDir: string;

  beforeEach(async function () {
    // Create temporary directory for symlink tests
    tempDir = path.join(settings.workspaceFolderUri.fsPath, '.test-fswatcher');
    await fse.ensureDir(tempDir);
  });

  afterEach(async function () {
    if (await fse.pathExists(tempDir)) {
      await fse.remove(tempDir);
    }
  });

  describe('GazeWrapper with symlinks', function () {
    it('should watch files through symlinked directories', async function () {
      if (isWin) {
        this.skip();
      }

      this.timeout(10000);
      this.slow(5000);

      const realDir = path.join(tempDir, 'real-gaze');
      const symlinkDir = path.join(tempDir, 'link-gaze');
      const testFile = path.join(realDir, 'test.txt');

      await fse.ensureDir(realDir);
      await fse.writeFile(testFile, 'test content');
      await fse.symlink(realDir, symlinkDir);

      const pattern = path.join(symlinkDir, '*');
      const watcher = new GazeWrapper([pattern]);

      try {
        await watcher.ready();
        const watched = await watcher.watched();

        // Should find the test file through the symlink
        assert.ok(watched.length > 0, 'Should find files through symlink');
        assert.ok(
          watched.some(f => f.endsWith('test.txt')),
          'Should find test.txt through symlink',
        );
      } finally {
        watcher.dispose();
      }
    });

    it('should watch multiple patterns with symlinks', async function () {
      if (isWin) {
        this.skip();
      }

      this.timeout(10000);
      this.slow(5000);

      const realDir1 = path.join(tempDir, 'real-1');
      const realDir2 = path.join(tempDir, 'real-2');
      const link1 = path.join(tempDir, 'link-1');
      const link2 = path.join(tempDir, 'link-2');

      await fse.ensureDir(realDir1);
      await fse.ensureDir(realDir2);
      await fse.writeFile(path.join(realDir1, 'test1.txt'), 'content1');
      await fse.writeFile(path.join(realDir2, 'test2.txt'), 'content2');
      await fse.symlink(realDir1, link1);
      await fse.symlink(realDir2, link2);

      const patterns = [path.join(link1, '*'), path.join(link2, '*')];
      const watcher = new GazeWrapper(patterns);

      try {
        await watcher.ready();
        const watched = await watcher.watched();

        assert.ok(watched.length >= 2, 'Should find files in both symlinked directories');
        assert.ok(
          watched.some(f => f.endsWith('test1.txt')),
          'Should find test1.txt',
        );
        assert.ok(
          watched.some(f => f.endsWith('test2.txt')),
          'Should find test2.txt',
        );
      } finally {
        watcher.dispose();
      }
    });

    it('should handle nested directories through symlinks', async function () {
      if (isWin) {
        this.skip();
      }

      this.timeout(10000);
      this.slow(5000);

      const realDir = path.join(tempDir, 'real-nested');
      const nestedDir = path.join(realDir, 'nested', 'deep');
      const symlinkDir = path.join(tempDir, 'link-nested');
      const testFile = path.join(nestedDir, 'deep-test.txt');

      await fse.ensureDir(nestedDir);
      await fse.writeFile(testFile, 'nested content');
      await fse.symlink(realDir, symlinkDir);

      const pattern = path.join(symlinkDir, '**', '*test*');
      const watcher = new GazeWrapper([pattern]);

      try {
        await watcher.ready();
        const watched = await watcher.watched();

        assert.ok(
          watched.some(f => f.endsWith('deep-test.txt')),
          'Should find files in nested directories through symlink',
        );
      } finally {
        watcher.dispose();
      }
    });

    it('should handle errors gracefully with invalid symlinks', async function () {
      if (isWin) {
        this.skip();
      }

      this.timeout(10000);
      this.slow(5000);

      // Create a broken symlink (pointing to non-existent target)
      const brokenLink = path.join(tempDir, 'broken-link');
      await fse.symlink('/nonexistent/path', brokenLink);

      const pattern = path.join(brokenLink, '*');
      const watcher = new GazeWrapper([pattern]);

      try {
        await watcher.ready();
        const watched = await watcher.watched();

        assert.equal(watched.length, 0, 'Should not find files through broken symlink');
      } finally {
        watcher.dispose();
      }
    });

    it('should detect file changes through symlinks', async function () {
      if (isWin) {
        this.skip();
      }

      this.timeout(15000);
      this.slow(10000);

      const realDir = path.join(tempDir, 'change-real');
      const symlinkDir = path.join(tempDir, 'change-link');
      const testFile = path.join(realDir, 'changeable.txt');

      await fse.ensureDir(realDir);
      await fse.writeFile(testFile, 'initial');
      await fse.symlink(realDir, symlinkDir);

      const pattern = path.join(symlinkDir, '*');
      const watcher = new GazeWrapper([pattern]);

      const changes: string[] = [];
      watcher.onAll((fsPath: string) => {
        changes.push(fsPath);
      });

      try {
        await watcher.ready();

        await fse.writeFile(testFile, 'modified');

        // Try to handle gaze debouncing without wasting too much time
        const startTime = Date.now();
        const timeout = 5000;
        let changeDetected = false;

        while (Date.now() - startTime < timeout) {
          if (changes.length > 0) {
            changeDetected = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        assert.ok(changeDetected, 'Should have detected file change through symlink within 5 seconds');
      } finally {
        watcher.dispose();
      }
    });
  });

  describe('VSCFSWatcherWrapper with symlinks', function () {
    it('should watch files through symlinked directories', async function () {
      if (isWin) {
        this.skip();
      }

      this.timeout(10000);
      this.slow(5000);

      // Create real directory with test file inside workspace
      const realDir = path.join(tempDir, 'vsc-real');
      const symlinkDir = path.join(tempDir, 'vsc-link');
      const testFile = path.join(realDir, 'vsc-test.txt');

      await fse.ensureDir(realDir);
      await fse.writeFile(testFile, 'vscode watcher test');
      await fse.symlink(realDir, symlinkDir);

      // Create relative pattern from workspace folder
      const workspacePath = settings.workspaceFolderUri.fsPath;
      const relativePattern = path.relative(workspacePath, path.join(symlinkDir, '*'));

      const watcher = new VSCFSWatcherWrapper(settings.workspaceFolder, relativePattern, []);

      try {
        await watcher.ready();
        const watched = await watcher.watched();

        assert.equal(watched.length, 1, 'Should find files through symlink');
        assert.ok(
          watched.some(f => f.endsWith('vsc-test.txt')),
          'Should find vsc-test.txt through symlink',
        );
      } finally {
        watcher.dispose();
      }
    });

    it('should handle glob patterns with symlinks', async function () {
      if (isWin) {
        this.skip();
      }

      this.timeout(10000);
      this.slow(5000);

      const realDir = path.join(tempDir, 'vsc-glob-real');
      const symlinkDir = path.join(tempDir, 'vsc-glob-link');

      await fse.ensureDir(realDir);
      await fse.writeFile(path.join(realDir, 'match-test.txt'), 'test1');
      await fse.writeFile(path.join(realDir, 'match-test2.txt'), 'test2');
      await fse.writeFile(path.join(realDir, 'no-match.txt'), 'other');
      await fse.symlink(realDir, symlinkDir);

      const workspacePath = settings.workspaceFolderUri.fsPath;
      const relativePattern = path.relative(workspacePath, path.join(symlinkDir, '*test*'));

      const watcher = new VSCFSWatcherWrapper(settings.workspaceFolder, relativePattern, []);

      try {
        await watcher.ready();
        const watched = await watcher.watched();

        assert.equal(watched.length, 2, 'Should find matching files through symlink');
        watched.forEach(file => {
          assert.ok(path.basename(file).includes('test'), 'Found files should match pattern');
        });
      } finally {
        watcher.dispose();
      }
    });

    it('should handle exclude patterns with symlinks', async function () {
      if (isWin) {
        this.skip();
      }

      this.timeout(10000);
      this.slow(5000);

      const realDir = path.join(tempDir, 'vsc-exclude-real');
      const symlinkDir = path.join(tempDir, 'vsc-exclude-link');

      await fse.ensureDir(realDir);
      await fse.writeFile(path.join(realDir, 'include.txt'), 'include');
      await fse.writeFile(path.join(realDir, 'exclude.txt'), 'exclude');
      await fse.symlink(realDir, symlinkDir);

      const workspacePath = settings.workspaceFolderUri.fsPath;
      const relativePattern = path.relative(workspacePath, path.join(symlinkDir, '*'));
      const excludePatterns = ['**/exclude.txt'];

      const watcher = new VSCFSWatcherWrapper(settings.workspaceFolder, relativePattern, excludePatterns);

      try {
        await watcher.ready();
        const watched = await watcher.watched();

        assert.equal(watched.length, 1, 'Should find only included files');

        const hasExcluded = watched.some(f => f.endsWith('exclude.txt'));
        assert.ok(!hasExcluded, 'Should not include excluded files');
      } finally {
        watcher.dispose();
      }
    });
  });
});
