import * as pathlib from 'path';
import * as c2fs from './FSWrapper';

export function concatU(left: string | undefined, right: string | undefined, sep = ''): string | undefined {
  if (!right) return left;
  else if (!left) return right;
  else return left + sep + right;
}

export function concat(left: string, right: string, sep = ''): string {
  return concatU(left, right, sep)!;
}

export class Version {
  public constructor(
    public readonly major: number,
    private readonly _minor?: number,
    private readonly _patch?: number,
  ) {}

  public get minor(): number {
    return this._minor ? this._minor : 0;
  }

  public get patch(): number {
    return this._patch ? this._patch : 0;
  }

  public smaller(right: Version): boolean {
    if (this.major < right.major) return true;
    else if (this.major > right.major) return false;

    if (this.minor < right.minor) return true;
    else if (this.minor > right.minor) return false;

    if (this.patch < right.patch) return true;
    else if (this.patch > right.patch) return false;

    return false;
  }

  public toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }
}

// eslint-disable-next-line
function _mapAllStrings<T>(value: T, mapperFunc: (s: string) => any): T {
  if (value === null || value === undefined || typeof value === 'function') {
    return value;
  } else if (typeof value === 'string') {
    return (mapperFunc(value) as unknown) as T;
  } else if (Array.isArray(value)) {
    // eslint-disable-next-line
    return ((value as any[]).map((v: any) => _mapAllStrings(v, mapperFunc)) as unknown) as T;
  } else if (typeof value === 'object') {
    // eslint-disable-next-line
    const newValue: any = {};
    for (const prop in value) {
      const val = _mapAllStrings(value[prop], mapperFunc);
      if (val !== undefined) newValue[prop] = val;
    }
    return newValue;
  } else {
    return value;
  }
}

export type ResolveRulePair =
  // eslint-disable-next-line
  | [string, any]
  // eslint-disable-next-line
  | [RegExp, undefined | null | boolean | number | string | (() => any) | ((m: RegExpMatchArray) => any)];

// eslint-disable-next-line
export function resolveVariables<T>(value: T, varValue: readonly ResolveRulePair[]): T {
  // eslint-disable-next-line
  return _mapAllStrings(value, (s: string): any => {
    for (let i = 0; i < varValue.length; ++i) {
      if (typeof varValue[i][1] === 'string') {
        s = s.replace(varValue[i][0], varValue[i][1]);
      } else if (varValue[i][0] instanceof RegExp && typeof varValue[i][1] === 'function') {
        if ((varValue[i][1] as Function).length > 1)
          throw Error('resolveVariables regex func should expect 1 argument');

        let m = s.match(varValue[i][0]);

        if (m) {
          if (m.index === 0 && m[0].length === s.length) {
            return varValue[i][1](m); // return type can be anything
          }

          let remainingStr = s;
          const newStr: string[] = [];
          while (m && m.index !== undefined) {
            newStr.push(remainingStr.substr(0, m.index));

            const repl = varValue[i][1](m);
            if (typeof repl !== 'string') throw Error('resolveVariables regex func return type should be string');
            newStr.push(repl);

            remainingStr = remainingStr.substr(m.index + m[0].length);
            m = remainingStr.match(varValue[i][0]);
          }
          s = newStr.join('') + remainingStr;
        }
      } else if (s === varValue[i][0]) {
        if (typeof varValue[i][1] === 'function') {
          return varValue[i][1]();
        } else {
          return varValue[i][1];
        }
      }
    }
    return s;
  });
}

// eslint-disable-next-line
export function resolveOSEnvironmentVariables<T>(value: T, strictAllowed: boolean): T {
  const getValueOfEnv = (prop: string): string | undefined => {
    const normalize = (s: string): string => (process.platform === 'win32' ? s.toLowerCase() : s);
    const normProp = normalize(prop);
    for (const prop in process.env) {
      if (normalize(prop) == normProp) {
        return process.env[prop];
      }
    }
    return undefined;
  };
  // eslint-disable-next-line
  return _mapAllStrings(value, (s: string): any => {
    let replacedS = '';
    while (true) {
      const match = s.match(/\$\{(os_env|os_env_strict):([A-z_][A-z0-9_]*)\}/);

      if (!match) return replacedS + s;

      const val = getValueOfEnv(match[2]);

      replacedS += s.substring(0, match.index!);

      if (val !== undefined) {
        replacedS += val;
      } else {
        if (match[1] === 'os_env_strict') {
          if (strictAllowed) return undefined;
          else replacedS += '<missing env>';
        } else {
          // skip: replaces to empty string
        }
      }

      s = s.substring(match.index! + match[0].length);
    }
  });
}

export const PythonIndexerRegexStr = '(?:\\[(?:(-?[0-9]+)|(-?[0-9]+)?:(-?[0-9]+)?)\\])';

export function processArrayWithPythonIndexer<T>(arr: readonly T[], match: RegExpMatchArray): T[] {
  if (match[1]) {
    const idx = Number(match[1]);
    if (idx < 0) return [arr[arr.length + idx]];
    else return [arr[idx]];
  } else {
    const idx1 = match[2] === undefined ? undefined : Number(match[2]);
    const idx2 = match[3] === undefined ? undefined : Number(match[3]);
    return arr.slice(idx1, idx2);
  }
}

export function createPythonIndexerForStringVariable(
  varName: string,
  value: string,
  separator: string | RegExp,
  join: string,
): [RegExp, (m: RegExpMatchArray) => string] {
  const varRegex = new RegExp('\\${' + varName + PythonIndexerRegexStr + '?}');

  const array = value.split(separator);
  const replacer = (m: RegExpMatchArray): string => {
    return processArrayWithPythonIndexer(array, m).join(join);
  };

  return [varRegex, replacer];
}

export function createPythonIndexerForPathVariable(
  valName: string,
  pathStr: string,
): [RegExp, (m: RegExpMatchArray) => string] {
  const [regex, repl] = createPythonIndexerForStringVariable(valName, pathlib.normalize(pathStr), /\/|\\/, pathlib.sep);
  return [regex, (m: RegExpMatchArray): string => pathlib.normalize(repl(m))];
}

let uidCounter = 0;

export function generateId(): string {
  return (++uidCounter).toString();
}

import * as crypto from 'crypto';

export function hashString<T>(str: string, algorithm = 'sha1'): string {
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

export function reindentStr(indentLevel: number, str: string | undefined, indentWidth = 2): string[] {
  if (typeof str !== 'string') return [];

  const lines = str.split(/\r?\n/);
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
import { SharedVariables } from './SharedVariables';
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

  public static Get(shared: SharedVariables): Promise<VersionT | undefined> {
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
            shared.log.warn('Google Test version not found');
            return undefined;
          }

          if (gtests.length > 1) {
            shared.log.warn(
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
              shared.log.warn('Google Test version is not an exact match', fileSizeInBytes, resDistance, gtestPath);
              return res[1];
            } else {
              shared.log.warn('Google Test version size is not a match', fileSizeInBytes, resDistance, gtestPath);
              return undefined;
            }
          }
        })
        .catch(e => {
          shared.log.exceptionS(e);
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

export class AdvancedII<T> implements IterableIterator<T> {
  public constructor(public readonly next: () => IteratorResult<T>) {}

  public static from<T>(iterable: Iterable<T>): AdvancedII<T> {
    return new AdvancedII<T>(iterable[Symbol.iterator]().next);
  }

  public toArray(): T[] {
    return [...this];
  }

  [Symbol.iterator](): AdvancedII<T> {
    return this;
  }

  public map<U>(func: (t: T) => U): AdvancedII<U> {
    const nextFunc = this.next;
    let next: IteratorResult<T> = (undefined as unknown) as IteratorResult<T>;

    return new AdvancedII<U>(
      (): IteratorResult<U> => {
        next = nextFunc();

        return next.done ? { value: undefined, done: true } : { value: func(next.value), done: false };
      },
    );
  }

  public filter(func: (t: T) => boolean): AdvancedII<T> {
    const nextFunc = this.next;
    let next: IteratorResult<T> = (undefined as unknown) as IteratorResult<T>;

    return new AdvancedII<T>(
      (): IteratorResult<T> => {
        next = nextFunc();
        while (!next.done && !func(next.value)) next = nextFunc();

        return next.done ? { value: undefined, done: true } : { value: next.value, done: false };
      },
    );
  }
}

export function getAbsolutePath(filePath: string, directories: Iterable<string>): string | undefined {
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

  return undefined;
}
