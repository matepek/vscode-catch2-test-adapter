//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as cp from 'child_process';
import * as fs from 'fs';

export type SpawnReturns = cp.SpawnSyncReturns<string>;

export function spawnAsync(
  cmd: string, args?: string[],
  options?: cp.SpawnOptions): Promise<SpawnReturns> {
  return new Promise((resolve) => {
    const ret: SpawnReturns = {
      pid: 0,
      output: ['', ''],
      stdout: '',
      stderr: '',
      status: 0,
      signal: '',
      error: new Error()
    };
    const command = cp.spawn(cmd, args, options);
    ret.pid = command.pid;
    command.stdout.on('data', function (data) {
      ret.stdout += data;
      ret.output[0] = ret.stdout;
    });
    command.on('close', function (code) {
      ret.status = code;
      resolve(ret)
    });
    command.on('error', function (err) {
      ret.error = err;
      resolve(ret);
    });
  })
}

export type Stats = fs.Stats;

export function statAsync(path: string): Promise<Stats> {
  return new Promise<Stats>((resolve, reject) => {
    fs.stat(
      path, (err: NodeJS.ErrnoException | null, stats: fs.Stats | undefined) => {
        if (stats)
          resolve(stats);
        else
          reject(err);
      });
  });
}

export function existsAsync(path: string): Promise<boolean> {
  return statAsync(path).then(
    () => {
      return true;
    },
    () => {
      return false;
    });
}

export function existsSync(path: string): boolean {
  return fs.existsSync(path);
}