//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as cp from 'child_process';
import * as fs from 'fs';

export interface SpawnReturns extends cp.SpawnSyncReturns<string> { };
export interface SpawnOptions extends cp.SpawnOptions { };

export function spawnAsync(
  cmd: string, args?: string[],
  options?: SpawnOptions): Promise<SpawnReturns> {
  return new Promise((resolve, reject) => {
    const ret: SpawnReturns = {
      pid: 0,
      output: [<string><unknown>null, '', ''],
      stdout: '',
      stderr: '',
      status: 0,
      signal: <string><unknown>null,
      error: <Error><unknown>undefined,
    };
    const command = cp.spawn(cmd, args, options);
    ret.pid = command.pid;
    command.stdout.on('data', function (data) {
      ret.stdout += data;
      ret.output[1] = ret.stdout;
    });
    command.stderr.on('data', function (data) {
      ret.stderr += data;
      ret.output[2] = ret.stderr;
    });
    command.on('error', function (err: Error) {
      ret.error = err;
      reject(err);
    });
    command.on('close', function (code) {
      ret.status = code;
      resolve(ret)
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