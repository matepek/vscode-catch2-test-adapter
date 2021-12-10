import * as vscode from 'vscode';

///

export type FrameworkType = 'catch2' | 'gtest' | 'doctest' | 'gbenchmark';
export type FrameworkId = FrameworkType | 'google-insider';

export class Framework {
  constructor(readonly id: FrameworkId, readonly type: FrameworkType) {
    this.testTag = new vscode.TestTag(`framework.${type}`);
  }

  readonly testTag: vscode.TestTag;

  ///

  static readonly catch2 = new Framework('catch2', 'catch2');

  static readonly gtest = new Framework('gtest', 'gtest');

  static readonly doctest = new Framework('doctest', 'doctest');

  static readonly gbenchmark = new Framework('gbenchmark', 'gbenchmark');

  static readonly googleInsider = new Framework('google-insider', 'gtest');

  ///

  static readonly map: Record<FrameworkId, Framework> = {
    catch2: Framework.catch2,
    gtest: Framework.gtest,
    doctest: Framework.doctest,
    gbenchmark: Framework.gbenchmark,
    'google-insider': Framework.googleInsider,
  };

  static readonly list: ReadonlyArray<Framework> = Object.values(Framework.map);
}
