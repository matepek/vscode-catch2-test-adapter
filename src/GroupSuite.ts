import { AbstractTest } from './AbstractTest';
import { AbstractSuit } from './AbstractSuit';
import { SharedVariables } from './SharedVariables';

export class GroupSuite extends AbstractSuit {
  public children: AbstractTest[] = [];

  public constructor(shared: SharedVariables, label: string, old?: GroupSuite) {
    super(shared, label, undefined, old ? old.id : undefined);
  }

  public findGroup(pred: (v: GroupSuite) => boolean): GroupSuite | undefined {
    if (pred(this)) return this;
    else return super.findGroup(pred);
  }
}
