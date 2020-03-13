import * as os from 'os';
import { ChildProcess } from 'child_process';

import { AbstractTestInfo } from './AbstractTestInfo';

export class ProcessResult {
  public error?: Error;

  public static createFromSignal(signal: string): ProcessResult {
    return { error: new Error('Signal received: ' + signal) };
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
      if (curr) return { error: new Error('Process error: ' + curr) };
    }
    return {};
  }
}

export class RunningTestExecutableInfo {
  public constructor(
    public readonly process: ChildProcess,
    public readonly childrenToRun: 'runAllTestsExceptSkipped' | Set<AbstractTestInfo>,
  ) {
    process.once('close', () => {
      this._closed = true;
    });

    process.stderr && process.stderr.on('data', (chunk: Uint8Array) => (this._stderr += chunk.toString()));
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

  public get stderr(): string {
    return this._stderr;
  }

  private _timeout: number | null = null;
  private _closed = false;
  private _killed = false;
  private _stderr = '';
}
