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
    command.stdout.on('data', function(data) {
      ret.stdout += data;
      ret.output[0] = ret.stdout;
    });
    command.on('close', function(code) {
      ret.status = code;
      resolve(ret)
    });
    command.on('error', function(err) {
      ret.error = err;
      resolve(ret);
    });
  })
}

export function statSync(path: string): fs.Stats {
  return fs.statSync(path);
}

export type Stats = fs.Stats;

export function statAsync(path: string): Promise<Stats> {
  return new Promise<Stats>((resolve, reject) => {
    fs.stat(path, (err: NodeJS.ErrnoException, stats: fs.Stats) => {
      if (err)
        reject(err);
      else
        resolve(stats);
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

export function readdirSync(path: string): string[] {
  return fs.readdirSync(path, 'utf8');
}

export type FSWatcher = fs.FSWatcher;

export function watch(path: string): FSWatcher {
  return fs.watch(path);
}