import { AbstractTest } from './AbstractTest';
import { AbstractSuite } from './AbstractSuite';
import { SharedVariables } from './SharedVariables';

export class GroupSuite extends AbstractSuite {
  public children: AbstractTest[] = [];

  public constructor(shared: SharedVariables, label: string, old?: AbstractSuite) {
    super(shared, label, undefined, old ? old.id : undefined);
  }
}
