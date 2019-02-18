//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { TestSuiteInfo } from 'vscode-test-adapter-api';

import { generateUniqueId } from './IdGenerator';
import { SharedVariables } from './SharedVariables';
import { AbstractTestInfo } from './AbstractTestInfo';

///

export abstract class AbstractTestSuiteInfoBase implements TestSuiteInfo {
  public readonly type: 'suite' = 'suite';
  public readonly id: string;
  public label: string;
  public children: (AbstractTestSuiteInfoBase | AbstractTestInfo)[] = [];
  public file?: string;
  public line?: number;

  public constructor(protected readonly _shared: SharedVariables, public readonly origLabel: string, id?: string) {
    this.label = origLabel;
    this.id = id ? id : generateUniqueId();
  }

  public sendSkippedChildrenEvents(): void {
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      if (child instanceof AbstractTestInfo) {
        if (child.skipped) {
          this._shared.log.info('test is skipped:', child.label);
          this._shared.testStatesEmitter.fire(child.getStartEvent());
          this._shared.testStatesEmitter.fire(child.getSkippedEvent());
        }
      } else if (child instanceof AbstractTestSuiteInfoBase) {
        // skip
      } else {
        this._shared.log.error('unexpected case', child, this);
        debugger;
      }
    }
  }

  public addChild(child: AbstractTestSuiteInfoBase | AbstractTestInfo): void {
    if (this.children.indexOf(child) != -1) {
      this._shared.log.error('should not try to add the child twice', this, child);
      return;
    }

    if (this.children.length == 0) {
      this.file = child.file;
      this.line = child.file ? 0 : undefined;
    } else if (this.file != child.file) {
      this.file = undefined;
      this.line = undefined;
    }

    let i = this.children.findIndex((v: AbstractTestSuiteInfoBase | AbstractTestInfo) => {
      return child.origLabel.localeCompare(v.origLabel) < 0;
    });

    if (i == -1) i = this.children.length;

    this.children.splice(i, 0, child);
  }

  public findRouteToTestById(id: string): (AbstractTestSuiteInfoBase | AbstractTestInfo)[] | undefined {
    for (let i = 0; i < this.children.length; ++i) {
      const res = this.children[i].findRouteToTestById(id);
      if (res !== undefined) return [this, ...res];
    }
    return undefined;
  }

  public enumerateDescendants(fn: (v: AbstractTestSuiteInfoBase | AbstractTestInfo) => void): void {
    this.enumerateChildren(child => {
      fn(child);
      if (child instanceof AbstractTestSuiteInfoBase) child.enumerateDescendants(fn);
    });
  }

  public enumerateChildren(fn: (v: AbstractTestSuiteInfoBase | AbstractTestInfo) => void): void {
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      fn(child);
    }
  }

  public enumerateTestInfos(fn: (v: AbstractTestInfo) => void): void {
    this.enumerateDescendants(v => {
      if (v instanceof AbstractTestInfo) fn(v);
    });
  }

  public findTestInfo(pred: (v: AbstractTestInfo) => boolean): AbstractTestInfo | undefined {
    return this.findTestInfoInArray(this.children, pred);
  }

  public findTestInfoInArray(
    array: (AbstractTestSuiteInfoBase | AbstractTestInfo)[],
    pred: (v: AbstractTestInfo) => boolean,
  ): AbstractTestInfo | undefined {
    for (let i = 0; i < array.length; i++) {
      const res = array[i].findTestInfo(pred);
      if (res !== undefined) return res;
    }
    return undefined;
  }

  public getTestInfoCount(countSkipped: boolean): number {
    let count = 0;
    this.enumerateTestInfos(v => {
      if (countSkipped || !v.skipped) ++count;
    });
    return count;
  }
}
