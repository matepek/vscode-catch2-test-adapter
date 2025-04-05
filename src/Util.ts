import * as pathlib from 'path';
import * as c2fs from './util/FSWrapper';

///

export interface Disposable {
  dispose(): void;
}

/**
 * Represents a typed event.
 *
 * A function that represents an event to which you subscribe by calling it with
 * a listener function as argument.
 *
 * @sample `item.onDidChange(function(event) { console.log("Event happened: " + event); });`
 */
export interface Event<T> {
  /**
   * A function that represents an event to which you subscribe by calling it with
   * a listener function as argument.
   *
   * @param listener The listener function will be called when the event happens.
   * @param thisArgs The `this`-argument which will be used when calling the event listener.
   * @param disposables An array to which a [disposable](#Disposable) will be added.
   * @return A disposable which unsubscribes the event listener.
   */
  (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable; // eslint-disable-line
}

export interface CancellationFlag {
  /**
   * Is `true` when the token has been cancelled, `false` otherwise.
   */
  readonly isCancellationRequested: boolean;
}

export interface CancellationToken {
  /**
   * Is `true` when the token has been cancelled, `false` otherwise.
   */
  readonly isCancellationRequested: boolean;

  /**
   * An [event](#Event) which fires upon cancellation.
   */
  readonly onCancellationRequested: Event<void>;  
}

///

export function concatU(left: string | undefined, right: string | undefined, sep = ''): string | undefined {
  if (!right) return left;
  else if (!left) return right;
  else return left + sep + right;
}

export function concat(left: string, right: string, sep = ''): string {
  return concatU(left, right, sep)!;
}

export class Version {
  static from(value: string): Version | undefined {
    const match = value.match(/^(\d+)(?:\.(\d+)(?:\.(\d+))?)?$/);
    if (!match) return undefined;

    const [, major, minor, patch] = match;
    return new Version(Number(major), minor ? Number(minor) : undefined, patch ? Number(patch) : undefined);
  }

  constructor(
    readonly major: number,
    private readonly _minor?: number,
    private readonly _patch?: number,
  ) {}

  get minor(): number {
    return this._minor ? this._minor : 0;
  }

  get patch(): number {
    return this._patch ? this._patch : 0;
  }

  smaller(right: Version): boolean {
    if (this.major < right.major) return true;
    else if (this.major > right.major) return false;

    if (this.minor < right.minor) return true;
    else if (this.minor > right.minor) return false;

    if (this.patch < right.patch) return true;
    else if (this.patch > right.patch) return false;

    return false;
  }

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }
}

let uidCounter = 0;

export function generateId(): string {
  return (++uidCounter).toString();
}

export function parseLine(
  line: number | string | undefined,
  func?: (line: number) => void,
  adjust?: number,
): number | undefined {
  if (typeof line == 'number') {
    func && func(line);
    return line;
  } else if (typeof line == 'string') {
    let p = parseInt(line);
    if (Number.isNaN(p)) {
      return undefined;
    } else {
      if (adjust) p += adjust;
      func && func(p);
      return p;
    }
  } else return undefined;
}

import * as crypto from 'crypto';

export function hashString(str: string, algorithm = 'sha1'): string {
  const hash = crypto.createHash(algorithm);
  hash.update(str);
  return hash.digest('hex');
}

export function reindentLines(indentLevel: number, lines: string[], indentWidth = 2): string[] {
  let indent = 9999;
  lines.forEach(l => {
    let spaces = 0;
    while (spaces < l.length && l[spaces] === ' ') ++spaces;
    indent = Math.min(indent, spaces);
  });
  const reindented = lines.map(l => ' '.repeat(indentWidth * indentLevel) + l.substr(indent).trimRight());
  return reindented;
}

export function reindentStr(indentLevel: number, indentWidth = 2, ...strs: string[]): string[] {
  const lines = strs.flatMap(x => x.split(/\r?\n/));
  return reindentLines(indentLevel, lines, indentWidth);
}

export function milisecToStr(durationInMilisec: number): string {
  const minute = Math.floor(durationInMilisec / 60000);
  const sec = Math.floor((durationInMilisec - minute * 60000) / 1000);
  const miliSec = Math.round(durationInMilisec - minute * 60000 - sec * 1000);

  const durationArr = [
    [minute, 'm'],
    [sec, 's'],
    [miliSec, 'ms'],
  ].filter(v => v[0]);

  if (durationArr.length === 0) durationArr.push([0, 'ms']);

  return durationArr.map(v => v[0].toString() + v[1]).join(' ');
}

////////////////////////////////
// unused
import * as vscode from 'vscode';
import * as fs from 'fs';
import { promisify } from 'util';
import { Logger } from './Logger';

type VersionT = [number, number, number];
export class GoogleTestVersionFinder {
  private static readonly _versions: [number, VersionT][] = [
    [47254, [1, 0, 1]],
    [48592, [1, 0, 0]],
    [48150, [1, 1, 0]],
    // [51083, [1, 2, 0]],
    [51083, [1, 2, 1]], // !! Same as prev !! but good enough
    [54267, [1, 3, 0]],
    [74007, [1, 4, 0]],
    [77844, [1, 5, 0]],
    [82450, [1, 6, 0]],
    [85459, [1, 8, 0]],
    [88434, [1, 7, 0]],
    [89088, [1, 8, 1]],
    [93924, [1, 10, 0]],
  ];

  private static _version: Promise<VersionT | undefined> | undefined = undefined;

  static Get(log: Logger): Promise<VersionT | undefined> {
    if (this._version === undefined) {
      const cancellation = new vscode.CancellationTokenSource();

      promisify(setTimeout)(5000).finally(() => cancellation.cancel());

      this._version = new Promise<vscode.Uri[]>(resolve =>
        vscode.workspace
          .findFiles('**/include/gtest/gtest.h', '**/node_modules/**', 3, cancellation.token)
          .then(resolve),
      )
        .finally(() => cancellation.dispose())
        .then(async gtests => {
          if (gtests.length === 0) {
            log.warn('Google Test version not found');
            return undefined;
          }

          if (gtests.length > 1) {
            log.warn(
              'Google Test version: more than 1 has found',
              gtests.map(x => x.fsPath),
            );
          }

          const gtestPath =
            gtests.length === 1
              ? gtests[0].fsPath
              : gtests.reduce((prev: vscode.Uri, current: vscode.Uri) =>
                  prev.fsPath.length <= current.fsPath.length ? prev : current,
                ).fsPath;

          const stats = await promisify(fs.stat)(gtestPath);
          const fileSizeInBytes = stats['size'];
          const found = GoogleTestVersionFinder._versions.find(x => x[0] === fileSizeInBytes);

          if (found) {
            return found[1];
          } else {
            const distance = (current: [number, VersionT]): number => Math.abs(current[0] - fileSizeInBytes);

            const res = GoogleTestVersionFinder._versions.reduce((prev, current) =>
              distance(prev) <= distance(current) ? prev : current,
            );

            const resDistance = distance(res);

            if (resDistance < 50) {
              log.warn('Google Test version is not an exact match', fileSizeInBytes, resDistance, gtestPath);
              return res[1];
            } else {
              log.warn('Google Test version size is not a match', fileSizeInBytes, resDistance, gtestPath);
              return undefined;
            }
          }
        })
        .catch(e => {
          log.exceptionS(e);
          return undefined;
        });
    }

    return this._version;
  }
}

export function reverse<T>(array: readonly T[]): (func: (t: T) => void) => void {
  return (func: (t: T) => void): void => {
    for (let i = array.length - 1; i >= 0; --i) func(array[i]);
  };
}

export function unique<T>(array: readonly T[]): readonly T[] {
  return array.filter((v, i, a) => a.indexOf(v) === i);
}

export function getAbsolutePath(filePath: string, directories: Iterable<string>): string {
  if (pathlib.isAbsolute(filePath)) return filePath;

  for (const dir of directories) {
    try {
      let current: string = dir;
      let parent: string = pathlib.dirname(current);
      do {
        const f = pathlib.join(current, filePath);

        if (c2fs.existsSync(f)) return f;

        current = parent;
        parent = pathlib.dirname(current);
      } while (current != parent);
    } catch {}
  }

  return filePath;
}

export function getModiTime(path: string): Promise<number | undefined> {
  return promisify(fs.stat)(path).then(
    stat => stat.mtimeMs,
    () => undefined,
  );
}

export function waitWithTimout<T>(f: Promise<T>, timeoutMs: number, errMsg?: string): Promise<T> {
  return Promise.race([
    f,
    new Promise<T>((_r, rej) => setTimeout(() => rej(Error(errMsg ?? `Timeout ${timeoutMs} has expired`)), timeoutMs)),
  ]);
}
