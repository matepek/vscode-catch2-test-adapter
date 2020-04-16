import { AbstractTestInfo } from './AbstractTestInfo';
import { AbstractTestSuiteInfoBase } from './AbstractTestSuiteInfoBase';
import { SharedVariables } from './SharedVariables';

export class AbstractGroupTestSuiteInfo extends AbstractTestSuiteInfoBase {
  public children: AbstractTestInfo[] = [];

  public constructor(shared: SharedVariables, label: string, id?: string) {
    super(shared, label, undefined, id);
  }

  public addChild(test: AbstractTestInfo): void {
    super.addChild(test);
  }
}
