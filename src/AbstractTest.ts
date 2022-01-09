import * as vscode from 'vscode';
import { AbstractExecutable } from './AbstractExecutable';
import { debugAssert } from './util/DevelopmentHelper';
import { SharedTestTags } from './SharedTestTags';

///

export abstract class AbstractTest {
  private _item: vscode.TestItem;

  protected constructor(
    readonly exec: AbstractExecutable,
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
    readonly subLevel = 0,
  ) {
    this._item = this.exec.shared.testController.createOrReplace(parent, id, label, resolvedFile, line, this);

    this._item.description = description;

    if (this._staticError) {
      debugAssert(this._staticError.length > 0);
      this._item.error = this._staticError.join('\n');
    }

    this._item.tags = this._calcTags();
  }

  readonly log = this.exec.log;

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
    this._item = await this.exec.shared.testController.update(this._item, file, line, this.exec, null, null, null);
    if (oldItem !== this._item) {
      this.exec.log.info('TestItem locaction has been updated', {
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

    this.exec.shared.testController.update(this._item, file, line, this.exec, label, description, tagsCalculated);

    if (skipped !== null && this._skipped !== skipped) {
      this._skipped = skipped;
      this._skipReported = false;
    }
  }

  get label(): string {
    return this._item.label;
  }

  get skipped(): boolean {
    return this._skipped || this.exec.shared.markAsSkipped;
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
    const tags = [
      this._frameworkTag,
      new vscode.TestTag(`level.` + this.subLevel),
      ...this._tags.map(x => new vscode.TestTag(`tag."${x}"`)),
    ];
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
    enableRunAndDebug = false,
  ): Promise<SubTest> {
    const resolvedFile = await this.exec.findSourceFilePath(file);

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
      this.exec,
      this,
      id,
      label,
      resolvedFile,
      line,
      this._tags,
      this._frameworkTag,
      this.subLevel + 1,
      enableRunAndDebug,
    );

    if (this.subLevel === 0 && this._subTests.size === 0) this._item.canResolveChildren = true;

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
    executable: AbstractExecutable,
    readonly parentTest: AbstractTest,
    id: string,
    label: string | undefined,
    file: string | undefined,
    line: string | undefined,
    tags: string[],
    frameworkTag: vscode.TestTag,
    level: number,
    private readonly enableRunAndDebug: boolean,
  ) {
    super(
      executable,
      parentTest.item,
      id,
      '⤷ ' + (label ?? id),
      file,
      line,
      false,
      undefined,
      undefined,
      tags,
      frameworkTag,
      enableRunAndDebug,
      enableRunAndDebug,
      level,
    );
  }

  override get label(): string {
    return this.item.description!;
  }

  updateSub(label: string | undefined, file: string | undefined, line: string | undefined): void {
    super.update(label ? '⤷ ' + label : null, file, line, null, null, null);
  }

  override async getOrCreateSubTest(
    id: string,
    label: string | undefined,
    file: string | undefined,
    line: string | undefined,
  ): Promise<SubTest> {
    return super.getOrCreateSubTest(id, label, file, line, this.enableRunAndDebug);
  }
}
