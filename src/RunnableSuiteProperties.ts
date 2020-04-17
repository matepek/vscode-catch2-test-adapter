import * as pathlib from 'path';
import * as c2fs from './FSWrapper';
import { TestExecutableInfoFrameworkSpecific } from './Executable';
import { processArrayWithPythonIndexer, PythonIndexerRegexStr } from './Util';

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
      this._groupBySourceIndexes = _frameworkSpecific.groupBySource.match(PythonIndexerRegexStr);
    } else {
      this._groupBySourceIndexes = null;
    }

    this.populateGroupTags();
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

  private readonly _groupBySourceIndexes: RegExpMatchArray | null;

  public get groupBySource(): boolean {
    return this._groupBySourceIndexes !== null;
  }

  public getSourcePartForGrouping(path: string): string {
    if (this._groupBySourceIndexes) {
      const pathArray = path.split(/\/|\\/);
      return pathlib.join(...processArrayWithPythonIndexer(pathArray, this._groupBySourceIndexes));
    } else {
      throw Error('assertion: getSourcePartForGrouping');
    }
  }

  private readonly _tagGroups: string[][] = [];

  private populateGroupTags(): void {
    if (!Array.isArray(this._frameworkSpecific.groupByTags)) return;

    for (const v of this._frameworkSpecific.groupByTags) {
      const m = v.match(/(\[[^\[\]]+\])/g);
      if (m) this._tagGroups.push(m.sort());
    }
  }

  public get groupByTagsType(): 'disabled' | 'allCombination' | 'byArray' {
    if (this._frameworkSpecific.groupByTags === true) return 'allCombination';
    else if (this._tagGroups.length > 0) return 'byArray';
    else return 'disabled';
  }

  public getTagGroupArray(): string[][] {
    return this._tagGroups;
  }

  public readonly groupBySingleRegex: RegExp | undefined;

  public get groupUngroupablesTo(): string {
    return this._frameworkSpecific.groupUngroupablesTo ? this._frameworkSpecific.groupUngroupablesTo : '';
  }
}
