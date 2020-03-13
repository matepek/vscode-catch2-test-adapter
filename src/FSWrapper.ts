import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface SpawnReturns extends cp.SpawnSyncReturns<string> {
  closed: boolean;
}

export type SpawnOptions = cp.SpawnOptions;

export function spawnAsync(
  cmd: string,
  args?: string[],
  options?: SpawnOptions,
  timeout?: number,
): Promise<SpawnReturns> {
  return new Promise((resolve, reject) => {
    const ret: SpawnReturns = {
      pid: 0,
      output: [(null as unknown) as string, '', ''],
      stdout: '',
      stderr: '',
      status: 0,
      signal: null,
      error: (undefined as unknown) as Error,
      closed: false,
    };

    const command = cp.spawn(cmd, args || [], options || {});
    // eslint-disable-next-line
    (ret as any).process = command; // for debugging

    ret.pid = command.pid;

    command.stdout!.on('data', function(data) {
      ret.stdout += data;
      ret.output[1] = ret.stdout;
    });

    command.stderr!.on('data', function(data) {
      ret.stderr += data;
      ret.output[2] = ret.stderr;
    });

    command.on('error', function(err: Error) {
      ret.error = err;
      reject(err);
    });

    command.on('close', function(code: number, signal: NodeJS.Signals) {
      ret.closed = true;

      if (signal !== null) {
        ret.signal = signal;
        reject(new Error('FsWrapper.spawnAsync signal: ' + signal));
      } else {
        ret.status = code;
        resolve(ret);
      }
    });

    if (timeout !== undefined && timeout > 0) {
      setTimeout(() => {
        if (ret.closed !== true) {
          command.kill('SIGKILL');
          reject(new Error('FsWrapper.spawnAsync timeout: ' + timeout));
        }
      }, timeout);
    }
  });
}

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
  '.o',
  '.pc',
  '.php',
  '.pyc',
  '.rpm',
  '.so',
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
