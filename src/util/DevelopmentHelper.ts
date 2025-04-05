// TODO:future https://webpack.js.org/plugins/normal-module-replacement-plugin/

export function debugBreak(_note?: string): void {
  debugger; // eslint-disable-line
}

export function debugAssert(condition: unknown, _msg?: string): void {
  if (!condition) debugger; // eslint-disable-line
}

export function assert(condition: unknown): void {
  if (!condition) {
    debugger; // eslint-disable-line
    throw Error('Assertion');
  }
}

// export function debugOnly(func: () => void): void {
//   func();
// }
