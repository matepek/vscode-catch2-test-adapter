import { AbstractTest } from '../AbstractTest';
import { AbstractExecutable } from '../AbstractExecutable';
import { SharedTestTags } from '../SharedTestTags';
import { TestItemParent } from '../../TestItemManager';

export class CppUTestTest extends AbstractTest {
  constructor(
    executable: AbstractExecutable,
    parent: TestItemParent,
    readonly group: string,
    readonly testName: string,
    label: string,
    isSkipped: boolean,
    file: string | undefined,
    line: string | undefined,
  ) {
    super(
      executable,
      parent,
      CppUTestTest.calcId(group, testName),
      label,
      file,
      line,
      isSkipped,
      undefined,
      undefined,
      [group],
      SharedTestTags.cpputest,
    );
  }

  update2(label: string, isSkipped: boolean, file: string | undefined, line: string | undefined): void {
    this.update(label, file, line, isSkipped, undefined, [this.group]).catch(e => this.log.exceptionS(e));
  }

  // CppUTest allows the same test name in multiple groups (`SameNameA.same` and `SameNameB.same`),
  // so the group has to be part of the id. Group and test name are both C identifiers,
  // hence splitting at the first '.' is unambiguous.
  static calcId(group: string, testName: string): string {
    return `${group}.${testName}`;
  }

  // The only argument form which selects exactly one test: substring based `-t`/`-g`/`-n` would
  // over-match and `-sg`/`-sn` would form a cross-product when more than one test is requested.
  get runFilterArg(): string {
    return `TEST(${this.group}, ${this.testName})`;
  }
}
