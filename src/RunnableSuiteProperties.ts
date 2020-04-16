import * as pathlib from 'path';
import * as c2fs from './FSWrapper';
import { TestExecutableInfoFrameworkSpecific } from './Executable';

export class RunnableSuiteProperties {
  public constructor(
    public readonly path: string,
    public readonly options: c2fs.SpawnOptions,
    private readonly _frameworkSpecific: TestExecutableInfoFrameworkSpecific,
  ) {
    this.groupBySingleRegex = _frameworkSpecific.groupBySingleRegex
      ? new RegExp(_frameworkSpecific.groupBySingleRegex)
      : undefined;

    if (_frameworkSpecific.groupBySource) {
      const m = _frameworkSpecific.groupBySource.match(this._validationRegex);
      this._groupBySourceIndexes = m ? [m[1] ? Number(m[1]) : undefined, m[2] ? Number(m[2]) : undefined] : undefined;
    } else {
      this._groupBySourceIndexes = undefined;
    }
  }

  public get prependTestRunningArgs(): string[] {
    return this._frameworkSpecific.prependTestRunningArgs ? this._frameworkSpecific.prependTestRunningArgs : [];
  }

  public get prependTestListingArgs(): string[] {
    return this._frameworkSpecific.prependTestListingArgs ? this._frameworkSpecific.prependTestListingArgs : [];
  }

  public get ignoreTestEnumerationStdErr(): boolean {
    return this._frameworkSpecific.ignoreTestEnumerationStdErr === true;
  }

  private readonly _validationRegex = /^\[(-?[0-9]+)?:(-?[0-9]+)?\]$/;
  private readonly _groupBySourceIndexes: [number | undefined, number | undefined] | undefined;

  public get groupBySource(): boolean {
    return this._groupBySourceIndexes !== undefined;
  }

  public getSourcePartForGrouping(path: string): string {
    if (this._groupBySourceIndexes) {
      return pathlib
        .normalize(path)
        .split('/')
        .slice(this._groupBySourceIndexes[0], this._groupBySourceIndexes[1])
        .join('/');
    } else {
      throw Error('assertion: getSourcePartForGrouping');
    }
  }

  public get groupByTags(): boolean {
    return this._frameworkSpecific.groupByTags === true;
  }

  public readonly groupBySingleRegex: RegExp | undefined;
}
