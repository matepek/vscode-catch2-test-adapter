import { Logger } from '../Logger';
import find from 'find-process';
import psList from 'ps-list';

///

export interface BuildProcessChecker {
  dispose(): void;
  resolveAtFinish(pattern: string | boolean | undefined): Promise<void>;
}

///

const _checkIntervalMillis = 2000;
// https://en.wikipedia.org/wiki/List_of_compilers#C++_compilers
const _defaultPattern =
  /(^|[/\\])(bazel|cmake|make|ninja|cl|c\+\+|ld|clang|clang\+\+|gcc|g\+\+|link|icc|armcc|armclang)(-[^/\\]+)?(\.exe)?$/;

///

export abstract class BuildProcessCheckerBase {
  constructor(protected readonly _log: Logger) {}

  protected _lastChecked = 0;
  private _finishedP = Promise.resolve();
  protected _finishedResolver = (): void => {};
  protected _timerId: NodeJS.Timeout | undefined = undefined; // number if have running build process

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

    const patternToUse = typeof pattern == 'string' ? RegExp(pattern) : _defaultPattern;
    this._log.info('Checking running build related processes', patternToUse);
    this._timerId = global.setInterval(this._refresh.bind(this, patternToUse), _checkIntervalMillis);
    this._refresh(patternToUse);

    return this._finishedP;
  }

  protected abstract _refresh(pattern: RegExp): Promise<void>;
}

///

export class FindProcessChecker extends BuildProcessCheckerBase {
  protected override async _refresh(pattern: RegExp): Promise<void> {
    try {
      // wrong type definition for find handles RegExp: https://github.com/yibn2008/find-process/compare/1.4.11...2.0.0#diff-81b33228621820bded04ffbd7d49375fc742662fde6b7111ddb10457ceef7ae9R11
      const processes = await find('name', pattern as unknown as string);

      this._lastChecked = Date.now();

      if (processes.length > 0) {
        this._log.info(
          'Found running build related processes: ' + processes.map(x => JSON.stringify(x, undefined, 0)).join(', '),
        );
      } else {
        this._log.debug('Not found running build related process');
        this._finishedResolver();
        clearInterval(this._timerId!);
        this._timerId = undefined;
      }
    } catch (reason) {
      this._log.exceptionS(reason);
      clearInterval(this._timerId!);
      this._timerId = undefined;
      this._finishedResolver();
    }
  }
}

///

export class PSListProcessChecker extends BuildProcessCheckerBase {
  protected override async _refresh(pattern: RegExp): Promise<void> {
    try {
      const processes = await psList({ all: false });

      this._lastChecked = Date.now();

      const found = processes.find(v => {
        return v.name.match(pattern);
      });

      if (found !== undefined) {
        this._log.info('Found running at least 1 build related process: ' + (found.path ?? found.name));
      } else {
        this._log.debug('Not found running build related process');
        this._finishedResolver();
        clearInterval(this._timerId!);
        this._timerId = undefined;
      }
    } catch (reason) {
      this._log.exceptionS(reason);
      clearInterval(this._timerId!);
      this._timerId = undefined;
      this._finishedResolver();
    }
  }
}
