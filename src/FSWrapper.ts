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

export function isSpawnBusyError(err: Error): boolean {
  const errEx = err as Error & { code: undefined | string };
  if (errEx.code === 'EBUSY' || errEx.code === 'ETXTBSY') {
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

// https://askubuntu.com/questions/156392/what-is-the-equivalent-of-an-exe-file
const nativeExecutableExtensionFilter = new Set([
  '.a',
  '.bat',
  '.c',
  '.cc',
  '.cmake',
  '.cpp',
  '.cxx',
  '.deb',
  '.dir',
  '.gz',
  '.h',
  '.hpp',
  '.hxx',
  '.in',
  '.input',
  '.ko',
  '.log',
  '.md',
  '.mm',
  '.ninja',
  '.o',
  '.obj',
  '.pc',
  '.php',
  '.pyc',
  '.rpm',
  '.so',
  '.stamp',
  '.tar',
  '.txt',
  '.vcxproj.user',
  '.xml',
]);

const win32NativeExecutableExtensionFilter = new Set(['.exe', '.cmd', '.bat']);

export function isNativeExecutableAsync(filePath: string): Promise<void> {
  const ext = path.extname(filePath);
  if (process.platform === 'win32') {
    if (win32NativeExecutableExtensionFilter.has(ext)) return accessAsync(filePath, ExecutableFlag);
    else return Promise.reject(new Error('Not a native executable extension on win32: ' + filePath));
  } else {
    if (filePath.endsWith('/')) {
      // noted that we got ".../CMakeFiles/" a lot. I assume the slash means directory.
      return Promise.reject(new Error('It is a directory, not a native executable: ' + filePath));
    }
    if (nativeExecutableExtensionFilter.has(ext)) {
      return Promise.reject(new Error('Not a native executable (filtered because of its extension): ' + filePath));
    } else {
      return accessAsync(filePath, ExecutableFlag);
    }
  }
}

export function existsSync(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function getLastModiTime(filePath: string): Promise<number> {
  return promisify(fs.stat)(filePath).then((stat: fs.Stats) => {
    return stat.mtimeMs;
  });
}
