import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as cp from 'child_process';

///

export type SpawnOptionsWithoutStdio = cp.SpawnOptionsWithoutStdio;
export type SpawnSyncReturns<T> = cp.SpawnSyncReturns<T>;
export type ChildProcessWithoutNullStreams = cp.ChildProcessWithoutNullStreams;

///

export function spawn(
  cmd: string,
  args: ReadonlyArray<string>,
  options: cp.SpawnOptionsWithoutStdio,
): cp.ChildProcessWithoutNullStreams {
  return cp.spawn(cmd, args, options);
}

///

export function isSpawnBusyError(err: any /*eslint-disable-line*/): boolean {
  if (err?.code === 'EBUSY' || err?.code === 'ETXTBSY') {
    return true;
  } else {
    return false;
  }
}

///

const ExecutableFlag = fs.constants.X_OK;

function accessAsync(filePath: string, flag: number): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.access(filePath, flag, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function isNativeExecutableAsync(
  filePath: string,
  extensionIncludeFilter: Set<string> | undefined,
  extensionExcludeFilter: Set<string> | undefined,
): Promise<void> {
  const ext = path.extname(filePath);
  if (extensionIncludeFilter) {
    if (!extensionIncludeFilter.has(ext)) return Promise.reject(new Error('Not included by filter: ' + filePath));
  } else if (extensionExcludeFilter) {
    if (extensionExcludeFilter.has(ext)) return Promise.reject(new Error('Excluded by fitler: ' + filePath));
  }
  if (process.platform !== 'win32' && filePath.endsWith('/')) {
    // noted that we got ".../CMakeFiles/" a lot. I assume the slash means directory.
    return Promise.reject(new Error('It is a directory, not a native executable: ' + filePath));
  }
  return accessAsync(filePath, ExecutableFlag);
}

export function existsSync(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function getLastModiTime(filePath: string): Promise<number> {
  return promisify(fs.stat)(filePath).then((stat: fs.Stats) => {
    return stat.mtimeMs;
  });
}

///

/**
 * Resolves symlinks in a file pattern while preserving glob patterns.
 *
 * This function walks through the path components and resolves any symlinks
 * in the concrete (non-glob) parts of the path. Allowing one to use symlinks
 * in file patterns without losing the globbing functionality.
 *
 * @param pattern - A file path or glob pattern that may contain symlinks
 * @returns The pattern with symlinks resolved
 *
 * @example
 * // If 'build-out' is a symlink to '/tmp/build-cache'
 * resolveSymlinksInPattern('/src/build-out/**\/*test*')
 * // Returns: '/tmp/build-cache/**\/*test*'
 */
export function resolveSymlinksInPattern(pattern: string): string {
  if (!pattern) return pattern;

  const isAbsolute = path.isAbsolute(pattern);
  const segments = pattern.split(path.sep).filter(s => s.length > 0);

  if (segments.length === 0) return pattern;

  const resolvedSegments: string[] = [];
  let currentPath = isAbsolute ? path.sep : '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    const hasGlob = /[*?[\]{}!]/.test(segment);
    if (hasGlob) {
      // Stop resolution at first glob
      resolvedSegments.push(...segments.slice(i));
      break;
    }

    currentPath = path.join(currentPath, segment);
    try {
      const stats = fs.lstatSync(currentPath);
      if (stats.isSymbolicLink()) {
        // Resolve the symlink
        const realPath = fs.realpathSync(currentPath);
        currentPath = realPath;

        // Update resolved segments with the real path components
        const realSegments = realPath.split(path.sep).filter(s => s.length > 0);
        resolvedSegments.length = 0; // Clear previous segments
        resolvedSegments.push(...realSegments);
      } else {
        // Not a symlink, just add the segment
        resolvedSegments.push(segment);
      }
    } catch (_err) {
      // Path doesn't exist yet or we can't access it
      // We can't resolve non-existing paths, so return as-is
      resolvedSegments.push(segment);
    }
  }

  let result = resolvedSegments.join(path.sep);
  // Restore leading slash for absolute paths if needed
  if (isAbsolute && !result.startsWith(path.sep)) {
    result = path.sep + result;
  }

  return result;
}
