// TODO:release make it removed from webpack
export function debugBreak(_note?: string): void {
  debugger;
}

// TODO:release make it removed from webpack
// eslint-disable-next-line
export function debugAssert(condition: any, _msg?: string): void {
  if (!condition) debugger;
}

export function assert(condition: boolean): void {
  if (!condition) {
    debugBreak();
    throw Error('Assertion');
  }
}

export function debugOnly(func: () => void): void {
  func();
}
