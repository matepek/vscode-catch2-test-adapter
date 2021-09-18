import * as vscode from 'vscode';
import { AbstractTest, SharedWithTest } from '../AbstractTest';
import { AbstractExecutable } from '../AbstractExecutable';
import { SharedTestTags } from '../SharedTestTags';

export class GoogleBenchmarkTest extends AbstractTest {
  public constructor(
    shared: SharedWithTest,
    executable: AbstractExecutable,
    container: vscode.TestItemCollection,
    testNameAsId: string,
    public failIfExceedsLimitNs: number | undefined,
  ) {
    super(
      shared,
      executable,
      container,
      testNameAsId,
      testNameAsId,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      [],
      SharedTestTags.gbenchmark,
    );
  }

  public update2(failIfExceedsLimitNs: number | undefined): boolean {
    const changed = false;
    if (failIfExceedsLimitNs !== this.failIfExceedsLimitNs) {
      this.failIfExceedsLimitNs = failIfExceedsLimitNs;
      // don have to mark it changed
    }
    return changed;
  }
}
