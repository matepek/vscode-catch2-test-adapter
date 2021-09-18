import * as vscode from 'vscode';
import { parseLine } from './Util';
import { AbstractExecutable } from './AbstractExecutable';
import { LoggerWrapper } from './LoggerWrapper';
import { TestCreator } from './WorkspaceShared';
import { debugAssert } from './util/DevelopmentHelper';
import { SharedTestTags } from './SharedTestTags';

///

export interface SharedWithTest {
  log: LoggerWrapper;
  testItemCreator: TestCreator;
}
///

export abstract class AbstractTest {
  private _item: vscode.TestItem;
  private _line: number | undefined = undefined;

  protected constructor(
    public readonly shared: SharedWithTest,
    public readonly executable: AbstractExecutable,
    private readonly _container: vscode.TestItemCollection,
    public readonly id: string, // identifies the test inside the executable
    label: string, // usually the same as testId
    private _file: string | undefined,
    line: string | undefined,
    private _skipped: boolean,
    private _staticError: string[] | undefined,
    description: string | undefined,
    private _tags: string[],
    private readonly _frameworkTag: vscode.TestTag,
    public readonly debuggable = true,
    public readonly runnable = true,
  ) {
    _tags.sort();
    this._line = parseLine(line);

    this._item = this._createItem(label, description);
    this._container.add(this._item);
  }

  public get item(): Readonly<vscode.TestItem> {
    return this._item;
  }

  private _createItem(label: string, description: string | undefined): vscode.TestItem {
    const item = this.shared.testItemCreator(this.id, label, this._file, this._line, this);

    item.description = description;

    if (this._staticError) {
      debugAssert(this._staticError.length > 0);
      item.error = this._staticError.join('\n');
    }

    item.tags = this._calcTags();

    return item;
  }

  // null means unchanged
  public update(
    label: string | null,
    file: string | undefined,
    line: string | undefined,
    skipped: boolean | null,
    description: string | undefined | null,
    tags: string[] | null,
  ): void {
    if (tags !== null) this._tags = tags;

    if (this._file !== file) {
      this._file = file;
      this._line = parseLine(line);
      const item = this._createItem(
        label !== null ? label : this._item.label,
        description !== null ? description : this._item.description,
      );
      this._container.delete(this._item.id);
      this._container.add(item);
      this._item = item;
    } else {
      if (label !== null) this._item.label = label;
      this.line = line;
      if (description !== null) this._item.description = description;
      if (tags !== null) this._item.tags = this._calcTags();
    }
    if (skipped !== null && this._skipped !== skipped) {
      this._skipped = skipped;
      this._skipReported = false;
    }
  }

  public get label(): string {
    return this._item.label;
  }

  public get file(): string | undefined {
    return this._file;
  }

  public set file(file: string | undefined) {
    if (this._file !== file) {
      this._file = file;
      const item = this._createItem(this._item.label, this._item.description);
      this._container.delete(this._item.id);
      this._container.add(item);
      this._item = item;
    }
  }

  public get line(): number | undefined {
    return this._line;
  }

  public set line(line: string | number | undefined) {
    const newLine = parseLine(line);
    if (newLine !== this._line) {
      this._line = newLine;
      this._item.range = newLine !== undefined ? new vscode.Range(newLine - 1, 0, newLine - 1, 0) : undefined;
    }
  }

  public set description(description: string | undefined) {
    this._item.description = description;
  }

  public get skipped(): boolean {
    return this._skipped || this.executable.properties.markAsSkipped;
  }

  public set skipped(skipped: boolean) {
    if (this._skipped !== skipped) {
      this._skipped = skipped;
      this._skipReported = false;
    }
  }

  private _skipReported = false;

  public reportIfSkippedFirstOnly(testRun: vscode.TestRun): boolean {
    const skipped = this.skipped;
    if (!this._skipReported && skipped) {
      this._skipReported = true;
      testRun.skipped(this._item);
    }
    return skipped;
  }

  public get hasStaticError(): boolean {
    return this._staticError !== undefined;
  }

  public static calcDescription(
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

  public resolve(): Promise<void> {
    if (this._subTests) this._item.children.replace([...this._subTests].map(x => x[1].item));
    return Promise.resolve();
  }

  private _subTests: Map<string /*id*/, SubTest> | undefined = undefined;

  public getOrCreateSubTest(
    id: string,
    label: string | undefined,
    file: string | undefined,
    line: string | undefined,
  ): SubTest {
    if (this._subTests) {
      const found = this._subTests.get(id);

      if (found) {
        found.updateSub(label, file, line);
        return found;
      }
    } else {
      this._subTests = new Map();
    }

    const subTest = new SubTest(this.shared, this.executable, this._item, id, label, file, line, this._frameworkTag);
    this._subTests.set(id, subTest);

    return subTest;
  }

  public clearSubTests(): void {
    this._item.children.replace([]);
    this._subTests = undefined;
  }
}

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
      parent.children,
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

  public get label(): string {
    return this.item.description!;
  }

  updateSub(label: string | undefined, file: string | undefined, line: string | undefined): void {
    super.update(null, file, line, null, label || this.id, null);
  }
}
