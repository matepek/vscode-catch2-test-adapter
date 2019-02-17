//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { ChildProcess } from 'child_process';

import { AbstractTestInfo } from './AbstractTestInfo';

export class RunningTestExecutableInfo {
  public constructor(
    public readonly process: ChildProcess,
    public readonly childrenToRun: 'runAllTestsExceptSkipped' | Set<AbstractTestInfo>,
  ) {
    process.once('close', () => {
      this._closed = true;
    });
  }

  public killProcess(timeout: number | null = null): void {
    if (!this._closed && !this._killed) {
      this._killed = true;
      this._timeout = timeout;

      this.process.kill();

      setTimeout(() => {
        if (!this._closed) {
          this.process.kill('SIGKILL'); // process has 5 secs to handle SIGTERM
        }
      }, 5000);
    }
  }

  public readonly startTime: number = Date.now();

  public get terminated(): boolean {
    return this._closed;
  }

  public get timeout(): number | null {
    return this._timeout;
  }

  private _timeout: number | null = null;
  private _closed: boolean = false;
  private _killed: boolean = false;
}
