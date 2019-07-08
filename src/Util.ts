// eslint-disable-next-line
function _mapAllStrings<T>(value: T, mapperFunc: (s: string) => any): T {
  if (typeof value === 'string') {
    return (mapperFunc(value) as unknown) as T;
  } else if (Array.isArray(value)) {
    // eslint-disable-next-line
    return ((value as any[]).map((v: any) => _mapAllStrings(v, mapperFunc)) as unknown) as T;
  } else if (typeof value === 'object') {
    // eslint-disable-next-line
    const newValue: any = {};
    for (const prop in value) {
      newValue[prop] = _mapAllStrings(value[prop], mapperFunc);
    }
    return newValue;
  } else {
    return value;
  }
}

// eslint-disable-next-line
export function resolveVariables<T>(value: T, varValue: [string, any][]): T {
  // eslint-disable-next-line
  return _mapAllStrings(value, (s: string): any => {
    for (let i = 0; i < varValue.length; ++i) {
      if (s === varValue[i][0] && typeof varValue[i][1] !== 'string') {
        return varValue[i][1];
      }
      s = s.replace(varValue[i][0], varValue[i][1]);
    }
    return s;
  });
}

// eslint-disable-next-line
export function resolveOSEnvironmentVariables<T>(value: T): T {
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
    const m = s.match(/\$\{os_env:([A-z_][A-z0-9_]*)\}/gm);
    if (m) {
      for (const envExpr of m) {
        const envName = envExpr.substring('${os_env:'.length, envExpr.length - 1);
        const val = getValueOfEnv(envName);
        if (val !== undefined) s = s.replace(envExpr, val);
      }
    }
    return s;
  });
}

let uidCounter = 0;

export function generateUniqueId(): string {
  return (++uidCounter).toString();
}
