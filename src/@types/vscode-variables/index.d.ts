declare module 'vscode-variables' {
  function vscodeVariables(str: string, recursive?: boolean): string;
  export = vscodeVariables;
}
