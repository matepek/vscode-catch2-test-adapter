import { AbstractTest } from './AbstractTest';
import { AbstractSuite } from './AbstractSuite';
import { SharedVariables } from './SharedVariables';

export class GroupSuite extends AbstractSuite {
  public children: AbstractTest[] = [];

  public constructor(shared: SharedVariables, label: string, old?: GroupSuite) {
    super(shared, label, undefined, old ? old.id : undefined);
  }

  public findGroup(pred: (v: GroupSuite) => boolean): GroupSuite | undefined {
    if (pred(this)) return this;
    else return super.findGroup(pred);
  }
}
