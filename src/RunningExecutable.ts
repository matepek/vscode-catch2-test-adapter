import * as os from 'os';
import * as ansi from 'ansi-colors';

import { ChildProcessWithoutNullStreams } from './util/FSWrapper';
import { AbstractTest } from './framework/AbstractTest';
import { Logger } from './Logger';
import { promisify } from 'util';
import { CancellationToken, generateId } from './Util';
import { SpawnBuilder } from './Spawner';
import { assert } from './util/DevelopmentHelper';
import { SharedVarOfExec } from './framework/SharedVarOfExec';
///

export enum ExecutableRunResultValue {
  OK = 'OK',
  CancelledByUser = 'CancelledByUser',
  TimeoutByUser = 'TimeoutByUser',
  Errored = 'Errored',
}

///

export class ExecutableRunResult {
  private constructor(
    readonly value: ExecutableRunResultValue,
    private readonly _error: string | undefined,
  ) {}

  get Ok(): boolean {
    return this.value === ExecutableRunResultValue.OK;
  }

  toString(): string {
    switch (this.value) {
      case ExecutableRunResultValue.OK:
        return 'Exit(0) / OK';
      case ExecutableRunResultValue.CancelledByUser:
        return 'CancelledByUser';
      case ExecutableRunResultValue.TimeoutByUser:
        return 'TimeoutByUser';
      case ExecutableRunResultValue.Errored:
        assert(this._error);
        return this._error!;
    }
  }

  static Ok(): ExecutableRunResult {
    return new ExecutableRunResult(ExecutableRunResultValue.OK, undefined);
  }

  static Error(message: string): ExecutableRunResult {
    return new ExecutableRunResult(ExecutableRunResultValue.Errored, message);
  }

  static createFromSignal(signal: string): ExecutableRunResult {
    return new ExecutableRunResult(ExecutableRunResultValue.Errored, 'Signal received: ' + signal);
  }

  static createFromErrorCode(code: number): ExecutableRunResult {
    if (os.platform() === 'win32') {
      const curr = badCodes.get(code);
      if (curr) return ExecutableRunResult.Error('Process error: ' + curr);
    }
    return ExecutableRunResult.Ok();
  }

  static create(
    code: number | null,
    signal: string | null,
    isCancellationRequested: boolean,
    timedout: boolean,
  ): ExecutableRunResult {
    if (isCancellationRequested) return new ExecutableRunResult(ExecutableRunResultValue.CancelledByUser, undefined);
    else if (timedout) return new ExecutableRunResult(ExecutableRunResultValue.TimeoutByUser, undefined);
    else if (code !== null && code !== undefined) return ExecutableRunResult.createFromErrorCode(code);
    else if (signal !== null && signal !== undefined) return ExecutableRunResult.createFromSignal(signal);
    else return ExecutableRunResult.Error('fd139a7a');
  }
}

///

export class RunningExecutable {
  static async create(
    spawnBuilder: SpawnBuilder,
    childrenToRun: readonly AbstractTest[] | null,
    cancellationToken: CancellationToken,
    shared: SharedVarOfExec,
  ): Promise<RunningExecutable> {
    const process = await spawnBuilder.spawn();
    return new RunningExecutable(spawnBuilder, process, childrenToRun, cancellationToken, shared);
  }

  private constructor(
    readonly spawnBuilder: SpawnBuilder,
    readonly process: ChildProcessWithoutNullStreams,
    readonly childrenToRun: readonly AbstractTest[] | null,
    readonly cancellationToken: CancellationToken,
    readonly shared: SharedVarOfExec,
  ) {
    this.runPrefix = this.process.pid ? ansi.dim(`#${this.process.pid}│ `) : ansi.dim(`$${generateId()}│ `);
    const wp = this.shared.workspacePath + '/';
    if (this.process.spawnfile.startsWith(wp)) {
      this.spawnfile = this.process.spawnfile.substring(wp.length);
    } else this.spawnfile = this.process.spawnfile;

    const disp = cancellationToken.onCancellationRequested(() => this.killProcess());

    this.result = new Promise(resolve => {
      this.process.once('close', (code: number | null, signal: string | null) => {
        this._closed = true;
        disp.dispose();
        resolve(ExecutableRunResult.create(code, signal, cancellationToken.isCancellationRequested, this.timedout));
      });
    });
  }

  killProcess(timeout: number | null = null): void {
    try {
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
    } catch {} // eslint-disable-line
  }

  readonly runPrefix: string;
  readonly spawnfile: string;
  readonly startTime: number = Date.now();

  get terminated(): boolean {
    return this._closed;
  }

  get timeout(): number | null {
    return this._timeout;
  }

  get timedout(): boolean {
    return typeof this._timeout == 'number';
  }

  private _timeout: number | null = null;
  private _closed = false;
  private _killed = false;

  readonly result: Promise<ExecutableRunResult>;

  setPriorityAsync(log: Logger): void {
    const priority = 16;
    let retryOnFailure = 5;

    const setPriorityInner = (): Promise<void> => {
      try {
        if (this.terminated) {
          return Promise.resolve();
        } else if (this.process.pid && this.process.exitCode === null) {
          os.setPriority(this.process.pid, os.constants.priority.PRIORITY_LOW);
          log.debug('setPriority is done', `priority(${priority})`, `pid(${this.process.pid})`);

          return Promise.resolve();
        } else {
          return promisify(setTimeout)(500).then(setPriorityInner);
        }
      } catch (e) {
        log.warn('setPriority failed', `pid(${this.process.pid})`, e, retryOnFailure);
        if (retryOnFailure-- > 0) return promisify(setTimeout)(500).then(setPriorityInner);
        else return Promise.resolve();
      }
    };

    // if it finishes quickly don't bother to do anything
    promisify(setTimeout)(2000).then(setPriorityInner);
  }

  getProcStartLine(): string {
    return (
      this.runPrefix + ansi.dim(`Started PID#${this.process.pid} - '${this.spawnfile}'\r\n`) + this.runPrefix + '\r\n'
    );
  }

  getProcStopLine(result: ExecutableRunResult): string {
    return (
      this.runPrefix + ansi.dim(`Stopped PID#${this.process.pid} - ${result.toString()} - '${this.spawnfile}'\r\n`)
    );
  }
}

///

//http://www.trytoprogram.com/batch-file-return-code/
const badCodes = new Map<number, string>([
  [
    9009,
    'Program is not recognized as an internal or external command, operable program or batch file. Indicates that command, application name or path has been misspelled when configuring the Action.',
  ],
  [3221225477, 'Access violation. Indicates that the executed program has terminated abnormally or crashed.'],
  [-1073741819, 'Access violation. Indicates that the executed program has terminated abnormally or crashed.'],
  [3221225495, 'Not enough virtual memory is available. Indicates that Windows has run out of memory.'],
  [-1073741801, 'Not enough virtual memory is available. Indicates that Windows has run out of memory.'],
  [
    3221225786,
    'The application terminated as a result of a CTRL+C. Indicates that the application has been terminated either by user’s keyboard input CTRL+C or CTRL+Break or closing command prompt window.',
  ],
  [
    -1073741510,
    'The application terminated as a result of a CTRL+C. Indicates that the application has been terminated either by user’s keyboard input CTRL+C or CTRL+Break or closing command prompt window.',
  ],
  [
    3221225794,
    'The application failed to initialize properly. Indicates that the application has been launched on a Desktop to which current user has no access rights. Another possible cause is that either gdi32.dll or user32.dll has failed to initialize.',
  ],
  [
    -1073741502,
    'The application failed to initialize properly. Indicates that the application has been launched on a Desktop to which current user has no access rights. Another possible cause is that either gdi32.dll or user32.dll has failed to initialize.',
  ],
  [221225495, 'Not enough virtual memory is available. It indicates that Windows has run out of memory.'],
  [-1073741801, 'Not enough virtual memory is available. It indicates that Windows has run out of memory.'],
  [
    3221226505,
    'Stack buffer overflow / overrun. Error can indicate a bug in the executed software that causes stack overflow, leading to abnormal termination of the software.',
  ],
  [
    -1073740791,
    'Stack buffer overflow / overrun. Error can indicate a bug in the executed software that causes stack overflow, leading to abnormal termination of the software.',
  ],
  [3762507597, 'Unhandled exception in .NET application. More details may be available in Windows Event log.'],
  [-532459699, 'Unhandled exception in .NET application. More details may be available in Windows Event log.'],
]);
