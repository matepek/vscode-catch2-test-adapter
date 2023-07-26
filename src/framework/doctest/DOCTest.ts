import { AbstractTest } from '../AbstractTest';
import { AbstractExecutable } from '../AbstractExecutable';
import { SharedTestTags } from '../SharedTestTags';
import { TestItemParent } from '../../TestItemManager';

export class DOCTest extends AbstractTest {
  constructor(
    executable: AbstractExecutable,
    parent: TestItemParent,
    testNameAsId: string,
    public readonly suiteName: string | undefined,
    tags: string[],
    file: string | undefined,
    line: string | undefined,
    description: string | undefined,
    skipped: boolean,
  ) {
    super(
      executable,
      parent,
      testNameAsId,
      testNameAsId.startsWith('  Scenario:') ? testNameAsId.trimStart() : testNameAsId,
      file,
      line,
      skipped,
      undefined,
      AbstractTest.calcDescription(tags, undefined, undefined, description),
      tags,
      SharedTestTags.doctest,
    );
  }

  update2(
    file: string | undefined,
    line: string | undefined,
    tags: string[],
    skipped: boolean,
    description: string | undefined,
  ): void {
    const calcDescription = AbstractTest.calcDescription(tags, undefined, undefined, description);
    super.update(this.label, file, line, skipped, calcDescription, tags);
  }

  getEscapedTestName(): string {
    /* ',' has special meaning */
    return this.id.replace(/,/g, '?');
  }
}
