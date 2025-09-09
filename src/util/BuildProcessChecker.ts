/// <reference types="node" />
import { Logger } from '../Logger';
import psList from 'ps-list';

///

// not so nice, init in rootsuite in the future
export class BuildProcessChecker {
  constructor(private readonly _log: Logger) {}

  private readonly _checkIntervalMillis = 2000;
  // https://en.wikipedia.org/wiki/List_of_compilers#C++_compilers
  private readonly _defaultPattern =
    /(^|[/\\])(bazel|cmake|make|ninja|cl|c\+\+|ld|clang|clang\+\+|gcc|g\+\+|link|icc|armcc|armclang)(-[^/\\]+)?(\.exe)?$/;
  private _lastChecked = 0;
  private _finishedP = Promise.resolve();
  private _finishedResolver = (): void => {};
  private _timerId: NodeJS.Timeout | undefined = undefined; // number if have running build process

  dispose(): void {
    if (this._timerId) clearInterval(this._timerId);
    this._finishedResolver();
  }

  resolveAtFinish(pattern: string | boolean | undefined): Promise<void> {
    if (pattern === false) return Promise.resolve();

    if (this._timerId !== undefined) {
      return this._finishedP;
    }

    const elapsed = Date.now() - this._lastChecked;

    if (elapsed < 300) {
      return Promise.resolve();
    }

    this._finishedP = new Promise(r => {
      this._finishedResolver = r;
    });

    const patternToUse = typeof pattern == 'string' ? RegExp(pattern) : this._defaultPattern;
    this._log.info('Checking running build related processes', patternToUse);
    this._timerId = global.setInterval(this._refresh.bind(this, patternToUse), this._checkIntervalMillis);
    this._refresh(patternToUse);

    return this._finishedP;
  }

  private async _refresh(pattern: RegExp): Promise<void> {
    try {
      const allProcesses = await psList();
      const processes = allProcesses.filter((proc: { name: string }) => pattern.test(proc.name));

      this._lastChecked = Date.now();

      if (processes.length > 0) {
        this._log.info(
          'Found running build related processes: ' +
            processes.map((x: { name: string }) => JSON.stringify(x, undefined, 0)).join(', '),
        );
      } else {
        this._log.info('Not found running build related process');
        this._finishedResolver();
        if (this._timerId) clearInterval(this._timerId);
        this._timerId = undefined;
      }
    } catch (reason) {
      this._log.exceptionS(reason);
      if (this._timerId) clearInterval(this._timerId);
      this._timerId = undefined;
      this._finishedResolver();
    }
  }
}
