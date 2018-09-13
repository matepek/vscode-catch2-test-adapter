//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

let uidCounter: number = 0;

export function generateUniqueId(): string {
  return (++uidCounter).toString();
}
