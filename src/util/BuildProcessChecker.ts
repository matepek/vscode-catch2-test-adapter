import { Logger } from '../Logger';
import findProcess from 'find-process';
import { promisify } from 'node:util';
import psList, { ProcessDescriptor } from 'ps-list';
import { CancellationToken } from '../Util';

///

export interface BuildProcessChecker {
  dispose(): void;
  resolveAtFinish(pattern: string | boolean | undefined, token: CancellationToken): Promise<void>;
}

///

const _checkIntervalMillis = 2000;
// https://en.wikipedia.org/wiki/List_of_compilers#C++_compilers
const _defaultPattern =
  /(^|[/\\])(bazel|cmake|make|ninja|cl|c\+\+|ld|clang|clang\+\+|gcc|g\+\+|link|icc|armcc|armclang)(-[^/\\]+)?(\.exe)?$/;

///

export abstract class BuildProcessCheckerBase {
  constructor(protected readonly _log: Logger) {}

  private _isShutdown = false;

  dispose(): void {
    this._isShutdown = true;
  }

  private _patternToUseCache: { patternToUse: RegExp; pattern: string } | undefined = undefined;
  private readonly _runningChecks = new Map<string | boolean, Promise<void>>();

  resolveAtFinish(pattern: string | boolean, token: CancellationToken): Promise<void> {
    if (pattern === false) return Promise.resolve();

    let p = this._runningChecks.get(pattern);

    if (p === undefined) {
      let patternToUse;
      if (typeof pattern === 'string') {
        if (this._patternToUseCache?.pattern === pattern) {
          patternToUse = this._patternToUseCache.patternToUse;
        } else {
          patternToUse = new RegExp(pattern);
          this._patternToUseCache = { pattern, patternToUse };
        }
      } else {
        patternToUse = _defaultPattern;
      }

      p = Promise.resolve()
        .then(async () => {
          while (!this._isShutdown && !token.isCancellationRequested) {
            try {
              const processes = await this._find(patternToUse);
              if (processes.length > 0) {
                this._log.info(
                  'Found running build related processes: ' +
                    processes.map(x => JSON.stringify(x, undefined, 0)).join(', '),
                );
              } else {
                this._log.debug('Not found running build related process');
                return;
              }
            } catch (reason) {
              this._log.exceptionS('Finding process', reason);
              return;
            }
            await promisify(setTimeout)(_checkIntervalMillis);
          }
        })
        .finally(() => {
          // for a short period of time we just assume that no new build process was spawned
          promisify(setTimeout)(300).then(() => this._runningChecks.delete(pattern));
        });

      this._runningChecks.set(pattern, p);

      this._log.info('Checking running build related processes', patternToUse);
    }

    return p;
  }

  protected abstract _find(pattern: RegExp): Promise<string[]>;
}

///

export class FindProcessChecker extends BuildProcessCheckerBase {
  protected override async _find(pattern: RegExp): Promise<string[]> {
    const processes = await findProcess('name', pattern);
    return processes.map(p => p.name);
  }
}

///

export class PSListProcessChecker extends BuildProcessCheckerBase {
  private runningFind: Promise<ProcessDescriptor[]> | undefined = undefined;

  protected override async _find(pattern: RegExp): Promise<string[]> {
    if (this.runningFind) {
      const ps = await this.runningFind;
      return ps.filter(p => p.name.match(pattern)).map(p => p.name);
    }
    this.runningFind = psList({ all: false });
    const ps = await this.runningFind;
    this.runningFind = undefined;
    return ps.filter(p => p.name.match(pattern)).map(p => p.name);
  }
}

export const buildProcessCheckerFactory = {
  // https://www.npmjs.com/package/ps-list : "Works on macOS, Linux, and Windows. Windows ARM64 is not supported yet."
  create: (log: Logger) => {
    return process.platform === 'win32' && process.arch == 'x64'
      ? new PSListProcessChecker(log)
      : new FindProcessChecker(log);
  },
};
