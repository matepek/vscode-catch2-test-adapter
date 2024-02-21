import * as vscode from 'vscode';

export type DebugConfig = vscode.DebugConfiguration | null | 'extensionOnly' | string;

export type DebugConfigTemplateSource =
  | 'fromLaunchJson'
  | 'fromLaunchJsonByName'
  | 'userDefined'
  | 'vadimcn.vscode-lldb'
  | 'ms-vscode.cpptools'
  | 'webfreak.debug';

export type DebugConfigData = {
  template: vscode.DebugConfiguration;
  source: DebugConfigTemplateSource;
  launchSourceFileMap?: Record<string, string>;
};
