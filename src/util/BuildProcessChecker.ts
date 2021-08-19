import { promisify } from 'util';
import * as psnode from 'ps-node';
import { LoggerWrapper } from '../LoggerWrapper';

///

// not so nice, init in rootsuite in the future
export class BuildProcessChecker {
  public constructor(private readonly _log: LoggerWrapper) {}

  private readonly _checkIntervalMillis = 2000;
  // https://en.wikipedia.org/wiki/List_of_compilers#C++_compilers
  private readonly _pattern =
    /[/\\](cmake|make|ninja|cl|c\+\+|ld|clang|gcc|g\+\+|link|icc|armcc|armclang)(-[^/\\]+)?(\.exe)?$/;
  private _lastChecked = 0;
  private _finishedP = Promise.resolve();
  private _finishedResolver = (): void => {}; // eslint-disable-line
  private _timerId: NodeJS.Timeout | undefined = undefined; // number if have running build process

  public dispose(): void {
    this._timerId && clearInterval(this._timerId);
    this._finishedResolver();
  }

  public resolveAtFinish(): Promise<void> {
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

    this._log.info('Checking running build related processes');
    this._timerId = setInterval(this._refresh.bind(this), this._checkIntervalMillis);
    this._refresh();

    return this._finishedP;
  }

  private async _refresh(): Promise<void> {
    try {
      const processes = await promisify(psnode.lookup)({
        command: this._pattern,
      });

      this._lastChecked = Date.now();

      if (processes.length > 0) {
        this._log.info('Found running build related processes: ' + processes.map(x => x.command).join(', '));
      } else {
        this._log.info('Not found running build related process');
        this._finishedResolver();
        clearInterval(this._timerId!);
        this._timerId = undefined;
      }
    } catch (reason) {
      this._log.exceptionS(reason);
    }
  }
}
