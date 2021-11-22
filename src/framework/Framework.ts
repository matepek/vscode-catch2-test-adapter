import * as vscode from 'vscode';

///

export type FrameworkType = 'catch2' | 'gtest' | 'doctest' | 'gbenchmark';
export type FrameworkId = FrameworkType | 'google-insider';

export class Framework {
  public constructor(public readonly id: FrameworkId, public readonly type: FrameworkType) {
    this.testTag = new vscode.TestTag(`framework.${type}`);
  }

  public readonly testTag: vscode.TestTag;

  ///

  public static readonly catch2 = new Framework('catch2', 'catch2');

  public static readonly gtest = new Framework('gtest', 'gtest');

  public static readonly doctest = new Framework('doctest', 'doctest');

  public static readonly gbenchmark = new Framework('gbenchmark', 'gbenchmark');

  public static readonly googleInsider = new Framework('google-insider', 'gtest');

  ///

  public static readonly map: Record<FrameworkId, Framework> = {
    catch2: Framework.catch2,
    gtest: Framework.gtest,
    doctest: Framework.doctest,
    gbenchmark: Framework.gbenchmark,
    'google-insider': Framework.googleInsider,
  };

  public static readonly list: ReadonlyArray<Framework> = Object.values(Framework.map);
}
