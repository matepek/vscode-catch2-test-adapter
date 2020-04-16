import { AbstractTestInfo } from './AbstractTestInfo';
import { AbstractTestSuiteInfoBase } from './AbstractTestSuiteInfoBase';
import { SharedVariables } from './SharedVariables';

export class GroupTestSuiteInfo extends AbstractTestSuiteInfoBase {
  public children: AbstractTestInfo[] = [];

  public constructor(shared: SharedVariables, label: string, old?: GroupTestSuiteInfo) {
    super(shared, label, undefined, old ? old.id : undefined);
  }

  public findGroup(pred: (v: GroupTestSuiteInfo) => boolean): GroupTestSuiteInfo | undefined {
    if (pred(this)) return this;
    else return super.findGroup(pred);
  }
}
