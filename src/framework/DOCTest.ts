import { AbstractTest, SharedWithTest } from '../AbstractTest';
import { AbstractExecutable } from '../AbstractExecutable';
import { SharedTestTags } from '../SharedTestTags';
import { TestItemParent } from '../TestItemManager';

interface Frame {
  name: string;
  filename: string;
  line: number;
}

export class DOCSection implements Frame {
  public constructor(name: string, filename: string, line: number) {
    this.name = name;
    // some debug adapter on ubuntu starts debug session in shell,
    // this prevents the SECTION("`pwd`") to be executed
    this.name = this.name.replace(/`/g, '\\`');

    this.filename = filename;
    this.line = line;
  }

  public readonly name: string;
  public readonly filename: string;
  public readonly line: number;
  public readonly children: DOCSection[] = [];
  public failed = false;
}

export class DOCTest extends AbstractTest {
  public constructor(
    shared: SharedWithTest,
    executable: AbstractExecutable,
    parent: TestItemParent,
    testNameAsId: string,
    tags: string[],
    file: string | undefined,
    line: string | undefined,
    description: string | undefined,
    skipped: boolean,
  ) {
    super(
      shared,
      executable,
      parent,
      testNameAsId,
      testNameAsId.startsWith('  Scenario:') ? testNameAsId.trimLeft() : testNameAsId,
      file,
      line,
      skipped,
      undefined,
      AbstractTest.calcDescription(tags, undefined, undefined, description),
      tags,
      SharedTestTags.doctest,
    );
  }

  public update2(
    file: string | undefined,
    line: string | undefined,
    tags: string[],
    skipped: boolean,
    description: string | undefined,
  ): void {
    const calcDescription = AbstractTest.calcDescription(tags, undefined, undefined, description);
    super.update(this.label, file, line, skipped, calcDescription, tags);
  }

  public getEscapedTestName(): string {
    /* ',' has special meaning */
    return this.id.replace(/,/g, '?');
  }
}
