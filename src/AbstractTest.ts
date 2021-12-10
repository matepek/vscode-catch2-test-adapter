import * as vscode from 'vscode';
import { AbstractExecutable } from './AbstractExecutable';
import { LoggerWrapper } from './LoggerWrapper';
import { debugAssert } from './util/DevelopmentHelper';
import { SharedTestTags } from './SharedTestTags';
import { TestItemManager } from './TestItemManager';

///

export interface SharedWithTest {
  log: LoggerWrapper;
  testController: TestItemManager;
}
///

export abstract class AbstractTest {
  private _item: vscode.TestItem;

  protected constructor(
    readonly shared: SharedWithTest,
    readonly executable: AbstractExecutable,
    parent: vscode.TestItem | undefined,
    readonly id: string, // identifies the test inside the executable
    label: string, // usually the same as testId
    resolvedFile: string | undefined,
    line: string | undefined,
    private _skipped: boolean,
    private _staticError: string[] | undefined,
    description: string | undefined,
    private _tags: string[],
    private readonly _frameworkTag: vscode.TestTag,
    readonly debuggable = true,
    readonly runnable = true,
  ) {
    this._item = this.shared.testController.createOrReplace(parent, id, label, resolvedFile, line, this);

    this._item.description = description;

    if (this._staticError) {
      debugAssert(this._staticError.length > 0);
      this._item.error = this._staticError.join('\n');
    }

    this._item.tags = this._calcTags();
  }

  get item(): Readonly<vscode.TestItem> {
    return this._item;
  }

  get file(): string | undefined {
    return this._item.uri?.path;
  }

  get line(): string | undefined {
    return this._item.range?.start.line.toString();
  }

  async updateFL(file: string | undefined, line: string | undefined): Promise<void> {
    const oldItem = this._item;
    this._item = await this.shared.testController.update(this._item, file, line, this.executable, null, null, null);
    if (oldItem !== this._item) {
      this.shared.log.info('TestItem locaction has been updated', {
        old: oldItem.uri?.path,
        current: this._item.uri?.path,
      });
    }
  }

  async update(
    label: string | null,
    file: string | undefined,
    line: string | undefined,
    skipped: boolean | null,
    description: string | undefined | null,
    tags: string[] | null,
  ): Promise<void> {
    let tagsCalculated: vscode.TestTag[] | null = null;
    if (tags !== null) {
      this._tags = tags;
      tagsCalculated = this._calcTags();
    }

    this.shared.testController.update(this._item, file, line, this.executable, label, description, tagsCalculated);

    if (skipped !== null && this._skipped !== skipped) {
      this._skipped = skipped;
      this._skipReported = false;
    }
  }

  get label(): string {
    return this._item.label;
  }

  get skipped(): boolean {
    return this._skipped || this.executable.properties.markAsSkipped;
  }

  set skipped(skipped: boolean) {
    if (this._skipped !== skipped) {
      this._skipped = skipped;
      this._skipReported = false;
    }
  }

  private _skipReported = false;

  reportIfSkippedFirstOnly(testRun: vscode.TestRun): boolean {
    const skipped = this.skipped;
    if (!this._skipReported && skipped) {
      this._skipReported = true;
      testRun.skipped(this._item);
    }
    return skipped;
  }

  get hasStaticError(): boolean {
    return this._staticError !== undefined;
  }

  static calcDescription(
    tags: string[] | undefined,
    typeParam: string | undefined,
    valueParam: string | undefined,
    desc: string | undefined,
  ): string | undefined {
    const description: string[] = [];

    if (tags && tags.length > 0) description.push(tags.map(t => `[${t}]`).join(''));

    const param = [typeParam, valueParam].filter(x => !!x);
    if (param.length) {
      description.push(`{Param:\`${param.join(';')}\`}`);
    }

    if (desc) description.push(`"${desc.trim()}"`);

    return description.length ? description.join(' ') : undefined;
  }

  private _calcTags(): vscode.TestTag[] {
    const tags = [this._frameworkTag, ...this._tags.map(x => new vscode.TestTag(x))];
    this.skipped && tags.push(SharedTestTags.skipped);
    if (!this._staticError) {
      this.runnable && tags.push(SharedTestTags.runnable);
      this.debuggable && tags.push(SharedTestTags.debuggable);
    }
    return tags;
  }

  ///

  private _subTests: Map<string /*id*/, SubTest> | undefined = undefined;

  async getOrCreateSubTest(
    id: string,
    label: string | undefined,
    file: string | undefined,
    line: string | undefined,
  ): Promise<SubTest> {
    const resolvedFile = await this.executable.resolveAndFindSourceFilePath(file);

    if (this._subTests) {
      const found = this._subTests.get(id);

      if (found) {
        found.updateSub(label, resolvedFile, line);
        return found;
      }
    } else {
      this._subTests = new Map();
    }

    const subTest = new SubTest(
      this.shared,
      this.executable,
      this._item,
      id,
      label,
      resolvedFile,
      line,
      this._frameworkTag,
    );
    this._subTests.set(id, subTest);

    return subTest;
  }

  clearSubTests(): void {
    this._item.children.replace([]);
    this._subTests = undefined;
  }

  removeMissingSubTests(subTestTree: SubTestTree): void {
    this._item.children.forEach(c => {
      const subSections = subTestTree.get(c.id);
      if (subSections) {
        const subTest = this._subTests?.get(c.id);
        if (subTest) subTest.removeMissingSubTests(subSections);
      } else {
        this._item.children.delete(c.id);
        this._subTests?.delete(c.id);
      }
    });
  }
}

///

export type SubTestTree = Map<string, SubTestTree>;

///

export class SubTest extends AbstractTest {
  constructor(
    shared: SharedWithTest,
    executable: AbstractExecutable,
    readonly parent: vscode.TestItem,
    id: string,
    label: string | undefined,
    file: string | undefined,
    line: string | undefined,
    frameworkTag: vscode.TestTag,
  ) {
    super(
      shared,
      executable,
      parent,
      id,
      '⤷',
      file,
      line,
      false,
      undefined,
      label || id,
      [],
      frameworkTag,
      false,
      false,
    );
  }

  override get label(): string {
    return this.item.description!;
  }

  updateSub(label: string | undefined, file: string | undefined, line: string | undefined): void {
    super.update(null, file, line, null, label || this.id, null);
  }
}
