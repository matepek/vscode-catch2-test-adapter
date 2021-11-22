// TODO:release make it removed from webpack
export function debugBreak(_note?: string): void {
  debugger;
}

// TODO:release make it removed from webpack
export function debugAssert(condition: unknown, _msg?: string): void {
  if (!condition) debugger;
}

export function assert(condition: unknown): void {
  if (!condition) {
    debugBreak();
    throw Error('Assertion');
  }
}

export function debugOnly(func: () => void): void {
  func();
}
