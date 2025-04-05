import * as pathlib from 'path';

///

function _mapAllStrings(value: unknown, parent: unknown, mapperFunc: (s: string, parent: unknown) => unknown): unknown {
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
      if (value === null) {
        return null;
      } else if (Array.isArray(value)) {
        const newValue: unknown[] = [];
        for (const v of value) {
          const res = _mapAllStrings(v, value, mapperFunc);
          if (res !== undefined) newValue.push(res);
        }
        return newValue;
      } else {
        const newValue = Object.create(Object.getPrototypeOf(value));
        Object.defineProperties(newValue, Object.getOwnPropertyDescriptors(value));
        for (const prop in value) {
          const res = _mapAllStrings((value as Record<string, unknown>)[prop], value, mapperFunc);
          if (res !== undefined) newValue[prop] = res;
        }
        return newValue;
      }
    }
  }
}

const _flatResolved = Symbol('special value which means that the veriable was flat resolved');

async function _mapAllStringsAsync(
  value: unknown,
  parent: unknown,
  mapperFunc: (s: string, parent: unknown) => Promise<unknown>,
): Promise<unknown> {
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
      if (value === null) {
        return null;
      } else if (Array.isArray(value)) {
        const newValue: unknown[] = [];
        for (const v of value) {
          const res = await _mapAllStringsAsync(v, newValue, mapperFunc);
          if (res !== _flatResolved) newValue.push(res);
        }
        return newValue;
      } else {
        const newValue = Object.create(Object.getPrototypeOf(value));
        Object.defineProperties(newValue, Object.getOwnPropertyDescriptors(value));
        for (const prop in value) {
          const res = await _mapAllStringsAsync((value as Record<string, unknown>)[prop], newValue, mapperFunc);
          if (res !== _flatResolved) newValue[prop] = res;
          else delete newValue[prop];
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
    newStr.push(remainingStr.substring(0, m.index));

    const ruleV = await rule(m);
    if (typeof ruleV !== 'string') throw Error('resolveVariables regex func return type should be string');
    newStr.push(ruleV);

    remainingStr = remainingStr.substring(m.index + m[0].length);
    m = remainingStr.match(resolve);
  }

  return newStr.join('') + remainingStr;
}

interface ResolveStrRuleStr {
  resolve: string;
  rule: string;
  isFlat?: boolean;
}

interface ResolveStrRule<R> {
  resolve: string;
  rule: () => R | Promise<R>;
  isFlat?: boolean;
}

interface ResolveRegexRule {
  resolve: RegExp;
  rule: (m: RegExpMatchArray) => string;
  isFlat?: never;
}

interface ResolveRegexRuleAsync {
  resolve: RegExp;
  rule: (m: RegExpMatchArray) => Promise<string>;
  isFlat?: never;
}

// eslint-disable-next-line
export type ResolveRuleAsync<R = any> =
  | ResolveStrRuleStr
  | ResolveStrRule<R>
  | ResolveRegexRule
  | ResolveRegexRuleAsync;

export async function resolveVariablesAsync<T>(value: T, varValue: readonly ResolveRuleAsync<unknown>[]): Promise<T> {
  const mapper = async (s: string, parent: unknown): Promise<unknown> => {
    for (let i = 0; i < varValue.length; ++i) {
      const { resolve, rule, isFlat } = varValue[i];

      if (typeof resolve == 'string') {
        if (s === resolve) {
          if (typeof rule == 'string') {
            return rule;
          } /* rule is callable */ else {
            const ruleV = await (rule as () => Promise<unknown>)();
            if (isFlat) {
              if (Array.isArray(parent)) {
                if (Array.isArray(ruleV)) {
                  parent.push(...ruleV);
                  return _flatResolved;
                }
              } else if (typeof parent === 'object' && parent !== null) {
                if (typeof ruleV === 'object') {
                  Object.assign(parent, ruleV);
                  return _flatResolved;
                }
              }
              throw Error(
                `resolveVariablesAsync: coudn't flat-resolve because ${typeof parent} != ${typeof ruleV} for ${s}`,
              );
            } else {
              return ruleV;
            }
          }
        } else if (typeof rule == 'string') {
          s = replaceAllString(s, resolve, rule);
        } /* rule is callable */ else {
          if (s.indexOf(resolve) != -1) {
            const ruleV = await (rule as () => Promise<string>)();
            s = replaceAllString(s, resolve, ruleV);
          }
        }
      } else {
        const ruleF = rule as (m: RegExpMatchArray) => Promise<string>;
        // resolve as RegExp && rule as Function

        if (rule.length > 1) {
          throw Error('resolveVariables regex func should expect 1 argument');
        }

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

    return s;
  };

  let resolved = await _mapAllStringsAsync(value, undefined, mapper);

  // adding an extra level resolution
  if (typeof resolved === 'string' && resolved.indexOf('$') !== -1)
    resolved = await _mapAllStringsAsync(resolved, undefined, mapper);

  return resolved as T;
}

const _normalizedEnvCache: Record<string, string | undefined> =
  process.platform === 'win32'
    ? Object.keys(process.env).reduce((o, key) => Object.assign(o, { [key.toLowerCase()]: process.env[key] }), {})
    : process.env;

export function resolveOSEnvironmentVariables<T>(value: T, strictAllowed: boolean): T {
  return _mapAllStrings(value, undefined, (s: string): string | undefined => {
    let replacedS = '';
    while (true) {
      const match = s.match(/\$\{(env|os_env|os_env_strict):([A-z_][A-z0-9_]*)\}/);

      if (!match) return replacedS + s;

      const envName = process.platform === 'win32' ? match[2].toLowerCase() : match[2];

      const val = _normalizedEnvCache[envName];

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
  }) as T;
}

export async function resolveAllAsync<T>(
  value: T,
  varValue: readonly ResolveRuleAsync<unknown>[],
  strictAllowed: boolean,
  availableRecursionCount = 3,
): Promise<T> {
  let resolved = await resolveVariablesAsync(value, varValue);
  resolved = resolveOSEnvironmentVariables(resolved, strictAllowed);
  if (value === resolved || availableRecursionCount == 0) return resolved;
  else return resolveAllAsync(resolved, varValue, strictAllowed, availableRecursionCount - 1);
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

export function createPythonIndexerForArray(varName: string, array: string[], join: string): ResolveRegexRule {
  const resolve = new RegExp('\\$\\{' + varName + PythonIndexerRegexStr + '?\\}');

  return {
    resolve,
    rule: (m: RegExpMatchArray): string => processArrayWithPythonIndexer(array, m).join(join),
  };
}

export function createPythonIndexerForStringVariable(
  varName: string,
  value: string,
  separator: string | RegExp,
  join: string,
): ResolveRegexRule {
  return createPythonIndexerForArray(varName, value.split(separator), join);
}

export function createPythonIndexerForPathVariable(varName: string, pathStr: string): ResolveRegexRule {
  const { resolve, rule } = createPythonIndexerForStringVariable(
    varName,
    pathlib.normalize(pathStr),
    /\/|\\/,
    pathlib.sep,
  );

  const r: ResolveRegexRule = {
    resolve,
    rule: (m: RegExpMatchArray): string => {
      try {
        return pathlib.normalize(rule(m));
      } catch (e) {
        return m[0];
      }
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (r as any)._pathStr = pathStr;
  return r;
}

export function cloneRecursively<T>(value: T): T {
  return _mapAllStrings(value, undefined, x => x) as T;
}
