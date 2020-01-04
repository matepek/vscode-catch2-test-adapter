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
export function resolveVariables<T>(value: T, varValue: ResolveRulePair[]): T {
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

let uidCounter = 0;

export function generateUniqueId(): string {
  return (++uidCounter).toString();
}

import * as crypto from 'crypto';

export function hashString<T>(str: string, algorithm: string = 'sha1'): string {
  const hash = crypto.createHash(algorithm);
  hash.update(str);
  return hash.digest('hex');
}

export function reindentLines(indentLevel: number, lines: string[], indentWidth: number = 2): string[] {
  let indent = 9999;
  lines.forEach(l => {
    let spaces = 0;
    while (spaces < l.length && l[spaces] === ' ') ++spaces;
    indent = Math.min(indent, spaces);
  });
  const reindented = lines.map(l => ' '.repeat(indentWidth * indentLevel) + l.substr(indent).trimRight());
  return reindented;
}

export function reindentStr(indentLevel: number, str: string | undefined, indentWidth: number = 2): string[] {
  if (typeof str !== 'string') return [];

  const lines = str.split(/\r?\n/);
  return reindentLines(indentLevel, lines, indentWidth);
}

export function milisecToStr(durationInMilisec: number): string {
  const minute = Math.floor(durationInMilisec / 60000);
  const sec = Math.floor((durationInMilisec - minute * 60000) / 1000);
  const miliSec = Math.round(durationInMilisec - minute * 60000 - sec * 1000);

  let durationArr = [
    [minute, 'm'],
    [sec, 's'],
    [miliSec, 'ms'],
  ].filter(v => v[0]);

  if (durationArr.length === 0) durationArr.push([0, 'ms']);

  return durationArr.map(v => v[0].toString() + v[1]).join(' ');
}
