//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as cp from 'child_process';
import * as fs from 'fs';

export function spawnAsync(
    cmd: string, args?: string[],
    options?: cp.SpawnOptions): Promise<cp.SpawnSyncReturns<string>> {
  return new Promise((resolve) => {
    const command = cp.spawn(cmd, args, options);
    const ret: cp.SpawnSyncReturns<string> = {
      pid: command.pid,
      output: [],
      stdout: '',
      stderr: '',
      status: 0,
      signal: '',
      error: new Error()
    };
    command.stdout.on('data', function(data) {
      ret.stdout += data;
      ret.output.push(data);
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

export function existsSync(path: string): boolean {
  return fs.existsSync(path);
}

export function readdirSync(path: string): string[] {
  return fs.readdirSync(path, 'utf8');
}