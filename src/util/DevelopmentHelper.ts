// TODO:future https://webpack.js.org/plugins/normal-module-replacement-plugin/

export function debugBreak(_note?: string): void {
  debugger;
}

export function debugAssert(condition: unknown, _msg?: string): void {
  if (!condition) debugger;
}

export function assert(condition: unknown): void {
  if (!condition) {
    debugger;
    throw Error('Assertion');
  }
}

// export function debugOnly(func: () => void): void {
//   func();
// }
