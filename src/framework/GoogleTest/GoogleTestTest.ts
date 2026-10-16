import { AbstractTest } from '../AbstractTest';
import { AbstractExecutable } from '../AbstractExecutable';
import { SharedTestTags } from '../SharedTestTags';
import { TestItemParent } from '../../TestItemManager';

export class GoogleTestTest extends AbstractTest {
  constructor(
    executable: AbstractExecutable,
    parent: TestItemParent,
    testNameAsId: string,
    testName: string,
    isSkipped: boolean,
    typeParam: string | undefined,
    valueParam: string | undefined,
    file: string | undefined,
    line: string | undefined,
  ) {
    super(
      executable,
      parent,
      testNameAsId,
      testName,
      file,
      line,
      isSkipped,
      undefined,
      AbstractTest.calcDescription(undefined, typeParam, valueParam, undefined),
      [],
      SharedTestTags.gtest,
    );
  }

  update2(
    testName: string,
    isSkipped: boolean,
    file: string | undefined,
    line: string | undefined,
    typeParam: string | undefined,
    valueParam: string | undefined,
  ): void {
    this.update(
      testName,
      file,
      line,
      isSkipped,
      AbstractTest.calcDescription(undefined, typeParam, valueParam, undefined),
      [],
    );
  }

  public static calcLabel(testName: string): string {
    return testName.startsWith('DISABLED_') ? testName.substring(9) : testName;
  }

  public static isSkipped(testName: string, suiteName: string): boolean {
    return suiteName.startsWith('DISABLED_') || testName.startsWith('DISABLED_');
  }
}
