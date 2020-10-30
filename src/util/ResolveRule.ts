import * as pathlib from 'path';

///

function _mapAllStrings(
  value: any /*eslint-disable-line*/,
  parent: any /*eslint-disable-line*/,
  mapperFunc: (s: string, parent: any) => any /*eslint-disable-line*/,
): any /*eslint-disable-line*/ {
  if (value === null) return null;
  switch (typeof value) {
    case 'bigint':
    case 'boolean':
    case 'function':
    case 'number':
    case 'symbol':
    case 'undefined':
      return value;
    case 'string': {
      return mapperFunc(value, parent);
    }
    case 'object': {
      if (Array.isArray(value)) {
        const newValue: any[] = []; /*eslint-disable-line*/
        for (const v of value) {
          const res = _mapAllStrings(v, value, mapperFunc);
          if (res !== undefined) newValue.push(res);
        }
        return newValue;
      } else {
        const newValue = Object.create(Object.getPrototypeOf(value));
        Object.defineProperties(newValue, Object.getOwnPropertyDescriptors(value));
        for (const prop in value) {
          const res = _mapAllStrings(value[prop], value, mapperFunc);
          if (res !== undefined) newValue[prop] = res;
        }
        return newValue;
      }
    }
  }
}

async function _mapAllStringsAsync(
  value: any /*eslint-disable-line*/,
  parent: any /*eslint-disable-line*/,
  mapperFunc: (s: string, parent: any) => Promise<any> /*eslint-disable-line*/,
): Promise<any> /*eslint-disable-line*/ {
  if (value === null) return null;
  switch (typeof value) {
    case 'bigint':
    case 'boolean':
    case 'function':
    case 'number':
    case 'symbol':
    case 'undefined':
      return value;
    case 'string': {
      return mapperFunc(value, parent);
    }
    case 'object': {
      if (Array.isArray(value)) {
        const newValue: any[] = []; /*eslint-disable-line*/
        for (const v of value) {
          const res = await _mapAllStringsAsync(v, value, mapperFunc);
          if (res !== undefined) newValue.push(res);
        }
        return newValue;
      } else {
        const newValue = Object.create(Object.getPrototypeOf(value));
        Object.defineProperties(newValue, Object.getOwnPropertyDescriptors(value));
        for (const prop in value) {
          const res = await _mapAllStringsAsync(value[prop], value, mapperFunc);
          if (res !== undefined) newValue[prop] = res;
        }
        return newValue;
      }
    }
  }
}

function replaceAllString(input: string, resolve: string, rule: string): string {
  let resolved = input;
  let resolved2 = input.replace(resolve, rule);
  while (resolved !== resolved2) {
    resolved = resolved2;
    resolved2 = input.replace(resolve, rule);
  }
  return resolved;
}

async function replaceAllRegExp(
  input: string,
  resolve: RegExp,
  rule: (m: RegExpMatchArray) => Promise<string>,
  firstMatch: RegExpMatchArray,
): Promise<string> {
  let m: RegExpMatchArray | null = firstMatch;
  let remainingStr = input;
  const newStr: string[] = [];

  while (m && m.index !== undefined) {
    newStr.push(remainingStr.substr(0, m.index));

    const ruleV = await rule(m);
    if (typeof ruleV !== 'string') throw Error('resolveVariables regex func return type should be string');
    newStr.push(ruleV);

    remainingStr = remainingStr.substr(m.index + m[0].length);
    m = remainingStr.match(resolve);
  }

  return newStr.join('') + remainingStr;
}

interface ResolveStrRuleStr {
  resolve: string;
  rule: string;
  isFlat?: boolean;
}

interface ResolveStrRuleAsync<R> {
  resolve: string;
  rule: () => Promise<R>;
  isFlat?: boolean;
}

interface ResolveRegexRuleAsync {
  resolve: RegExp;
  rule: (m: RegExpMatchArray) => Promise<string>;
  isFlat?: never;
}

// eslint-disable-next-line
export type ResolveRuleAsync<R = any> = ResolveStrRuleStr | ResolveStrRuleAsync<R> | ResolveRegexRuleAsync;

// eslint-disable-next-line
export function resolveVariablesAsync<T>(value: T, varValue: readonly ResolveRuleAsync<any>[]): Promise<T> {
  return _mapAllStringsAsync(
    value,
    undefined,
    // eslint-disable-next-line
    async (s: string, parent: any): Promise<any> => {
      for (let i = 0; i < varValue.length; ++i) {
        const { resolve, rule, isFlat } = varValue[i];

        if (typeof resolve == 'string') {
          if (s === resolve) {
            if (typeof rule == 'string') {
              return rule;
            } else {
              const ruleV = await (rule as () => Promise<any>)(); // eslint-disable-line
              if (isFlat && Array.isArray(parent)) {
                if (Array.isArray(ruleV)) {
                  parent.push(...ruleV);
                } else {
                  parent.push(ruleV);
                }
                return undefined;
              } else {
                return ruleV;
              }
            }
          } else if (typeof rule == 'string') {
            s = replaceAllString(s, resolve, rule);
          } else {
            // rule as Function
            if (s.indexOf(resolve) != -1) {
              const ruleV = await (rule as () => Promise<any>)(); // eslint-disable-line
              s = replaceAllString(s, resolve, ruleV);
            }
          }
        } else {
          const ruleF = rule as (m: RegExpMatchArray) => Promise<string>;
          // resolve as RegExp && rule as Function
          // eslint-disable-next-line
          if (rule.length > 1) throw Error('resolveVariables regex func should expect 1 argument');

          const match = s.match(resolve);

          if (match) {
            // whole input matches
            if (match.index === 0 && match[0].length === s.length) {
              return ruleF(match);
            }

            s = await replaceAllRegExp(s, resolve, ruleF, match);
          }
        }
      }

      return Promise.resolve(s);
    },
  );
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
  return _mapAllStrings(value, undefined, (s: string, parent: any): string | undefined => {
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
): ResolveRegexRuleAsync {
  const varRegex = new RegExp('\\${' + varName + PythonIndexerRegexStr + '?}');

  const array = value.split(separator);
  const replacer = async (m: RegExpMatchArray): Promise<string> => {
    return processArrayWithPythonIndexer(array, m).join(join);
  };

  return { resolve: varRegex, rule: replacer };
}

export function createPythonIndexerForPathVariable(valName: string, pathStr: string): ResolveRegexRuleAsync {
  const { resolve, rule } = createPythonIndexerForStringVariable(
    valName,
    pathlib.normalize(pathStr),
    /\/|\\/,
    pathlib.sep,
  );
  return { resolve, rule: async (m: RegExpMatchArray): Promise<string> => pathlib.normalize(await rule(m)) };
}
