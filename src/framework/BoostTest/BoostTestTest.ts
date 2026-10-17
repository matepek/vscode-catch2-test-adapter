import { AbstractTest } from '../AbstractTest';
import { AbstractExecutable } from '../AbstractExecutable';
import { SharedTestTags } from '../SharedTestTags';
import { TestItemParent } from '../../TestItemManager';

export class BoostTestTest extends AbstractTest {
  constructor(
    executable: AbstractExecutable,
    parent: TestItemParent,
    id: string,
    label: string,
    file: string | undefined,
    line: string | undefined,
    enabled: boolean,
    labels: string[],
    private _expectedFailures: number,
    private _timeoutSec: number | undefined,
  ) {
    super(
      executable,
      parent,
      id,
      label,
      file,
      line,
      !enabled,
      undefined,
      BoostTestTest.calcBoostDescription(labels, _expectedFailures, _timeoutSec),
      labels,
      SharedTestTags.boosttest,
    );
  }

  get expectedFailures(): number {
    return this._expectedFailures;
  }

  get timeoutSec(): number | undefined {
    return this._timeoutSec;
  }

  update2(
    file: string | undefined,
    line: string | undefined,
    enabled: boolean,
    labels: string[],
    expectedFailures: number,
    timeoutSec: number | undefined,
  ): void {
    this._expectedFailures = expectedFailures;
    this._timeoutSec = timeoutSec;
    const description = BoostTestTest.calcBoostDescription(labels, expectedFailures, timeoutSec);
    super.update(this.label, file, line, !enabled, description, labels);
  }

  private static calcBoostDescription(
    labels: string[],
    expectedFailures: number,
    timeoutSec: number | undefined,
  ): string | undefined {
    const description: string[] = [];
    const tagsDesc = AbstractTest.calcDescription(labels, undefined, undefined, undefined);
    if (tagsDesc) description.push(tagsDesc);
    if (timeoutSec) description.push(`⏱${timeoutSec}s`);
    if (expectedFailures) description.push(`(expected failures: ${expectedFailures})`);
    return description.length ? description.join(' ') : undefined;
  }
}
