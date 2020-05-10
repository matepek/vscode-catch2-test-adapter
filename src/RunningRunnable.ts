import * as os from 'os';
import { ChildProcess } from 'child_process';

import { AbstractTest } from './AbstractTest';
import { LoggerWrapper } from './LoggerWrapper';
import { promisify } from 'util';
import { CancellationToken } from './Util';

export class ProcessResult {
  public constructor(public readonly error?: Error) {}

  public get noError(): boolean {
    return this.error === undefined;
  }

  public static ok(): ProcessResult {
    return new ProcessResult(undefined);
  }

  public static error(message: string): ProcessResult {
    return new ProcessResult(Error(message));
  }

  public static createFromSignal(signal: string): ProcessResult {
    return new ProcessResult(Error('Signal received: ' + signal));
  }
  public static createFromErrorCode(code: number): ProcessResult {
    if (os.platform() === 'win32') {
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
      const curr = badCodes.get(code);
      if (curr) return ProcessResult.error('Process error: ' + curr);
    }
    return ProcessResult.ok();
  }
}

///

export class RunningRunnable {
  public constructor(
    public readonly process: ChildProcess,
    public readonly childrenToRun: readonly AbstractTest[],
    private readonly _cancellationToken: CancellationToken,
  ) {
    const disp = _cancellationToken.onCancellationRequested(() => this.killProcess());

    process.once('close', () => {
      this._closed = true;
      disp.dispose();
    });

    process.stderr && process.stderr.on('data', (chunk: Uint8Array) => (this._stderr += chunk.toString()));
  }

  public get isCancelled(): boolean {
    return this._cancellationToken.isCancellationRequested;
  }

  public killProcess(timeout: number | null = null): void {
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
    } catch {}
  }

  public setPriorityAsync(log: LoggerWrapper): void {
    const priority = 16;
    let retryOnFailure = 5;

    const setPriorityInner = (): Promise<void> => {
      try {
        if (this.terminated) {
          return Promise.resolve();
        } else if (process.connected && process.pid) {
          os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW);
          log.debug('setPriority is done', `priority(${priority})`, `pid(${process.pid})`);

          return Promise.resolve();
        } else {
          return promisify(setTimeout)(500).then(setPriorityInner);
        }
      } catch (e) {
        log.warnS('setPriority failed', `pid(${process.pid})`, e, retryOnFailure);
        if (retryOnFailure-- > 0) return promisify(setTimeout)(500).then(setPriorityInner);
        else return Promise.resolve();
      }
    };

    // if it finishes quickly don't bother to do anything
    promisify(setTimeout)(2000).then(setPriorityInner);
  }

  public readonly startTime: number = Date.now();

  public get terminated(): boolean {
    return this._closed;
  }

  public get timeout(): number | null {
    return this._timeout;
  }

  public get stderr(): string {
    return this._stderr;
  }

  private _timeout: number | null = null;
  private _closed = false;
  private _killed = false;
  private _stderr = '';
}
