import * as pathlib from 'path';

// eslint-disable-next-line
function _mapAllStrings<T>(value: T, parent: any, mapperFunc: (s: string, parent: any) => any): T {
  if (value === null || value === undefined || typeof value === 'function') {
    return value;
  } else if (typeof value === 'string') {
    return (mapperFunc(value, parent) as unknown) as T;
  } else if (Array.isArray(value)) {
    // eslint-disable-next-line
    const newValue: any[] = [];
    for (const v of value) {
      const res = _mapAllStrings(v, newValue, mapperFunc);
      if (res !== undefined) newValue.push(res);
    }
    return (newValue as unknown) as T;
  } else if (typeof value === 'object') {
    const newValue: T = Object.create(Object.getPrototypeOf(value));
    Object.defineProperties(newValue, Object.getOwnPropertyDescriptors(value));
    for (const prop in value) {
      const res = _mapAllStrings(value[prop], newValue, mapperFunc);
      if (res !== undefined) newValue[prop] = res;
    }
    return newValue;
  } else {
    return value;
  }
}

// eslint-disable-next-line
export interface ResolveRule<R = any> {
  resolve: string | RegExp;
  rule: R | (() => R) | ((m: RegExpMatchArray) => R);
  isFlat?: boolean;
}

export function resolveVariables<T, R = string>(value: T, varValue: readonly ResolveRule<R>[]): T {
  // eslint-disable-next-line
  return _mapAllStrings(value, undefined, (s: string, parent: any): any => {
    for (let i = 0; i < varValue.length; ++i) {
      const { resolve, rule, isFlat } = varValue[i];
      if (typeof rule === 'string') {
        s = s.replace(resolve, rule);
      } else if (resolve instanceof RegExp && typeof rule === 'function') {
        if ((rule as Function).length > 1) throw Error('resolveVariables regex func should expect 1 argument');

        let m = s.match(resolve);

        if (m) {
          if (m.index === 0 && m[0].length === s.length) {
            return (rule as Function)(m); // return type can be anything
          }

          let remainingStr = s;
          const newStr: string[] = [];
          while (m && m.index !== undefined) {
            newStr.push(remainingStr.substr(0, m.index));

            const repl = (rule as Function)(m);
            if (typeof repl !== 'string') throw Error('resolveVariables regex func return type should be string');
            newStr.push(repl);

            remainingStr = remainingStr.substr(m.index + m[0].length);
            m = remainingStr.match(resolve);
          }
          s = newStr.join('') + remainingStr;
        }
      } else if (s === resolve) {
        if (typeof rule === 'function') {
          return (rule as Function)();
        } else if (isFlat && Array.isArray(rule) && Array.isArray(parent)) {
          parent.push(...rule);
          return undefined;
        } else {
          return rule;
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
  return _mapAllStrings(value, undefined, (s: string, parent: any): any => {
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
): {
  resolve: string | RegExp;
  rule: (m: RegExpMatchArray) => string;
} {
  const varRegex = new RegExp('\\${' + varName + PythonIndexerRegexStr + '?}');

  const array = value.split(separator);
  const replacer = (m: RegExpMatchArray): string => {
    return processArrayWithPythonIndexer(array, m).join(join);
  };

  return { resolve: varRegex, rule: replacer };
}

export function createPythonIndexerForPathVariable(
  valName: string,
  pathStr: string,
): {
  resolve: string | RegExp;
  rule: (m: RegExpMatchArray) => string;
} {
  const { resolve, rule } = createPythonIndexerForStringVariable(
    valName,
    pathlib.normalize(pathStr),
    /\/|\\/,
    pathlib.sep,
  );
  return { resolve, rule: (m: RegExpMatchArray): string => pathlib.normalize(rule(m)) };
}
