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
