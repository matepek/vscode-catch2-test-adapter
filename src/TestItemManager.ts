import * as vscode from 'vscode';
import { AbstractTest } from './framework/AbstractTest';
import { parseLine } from './Util';
import { AbstractExecutable } from './framework/AbstractExecutable';

///

export type TestItemParent = vscode.TestItem | undefined;

export interface FilePathResolver {
  /**
   *
   * @param file don't have to be normalized
   * @returns normalized file path
   */
  findSourceFilePath(file: string | undefined): string | undefined;
}

export class TestItemManager {
  constructor(private controller: vscode.TestController) {}

  getChildCollection(item: vscode.TestItem | undefined): vscode.TestItemCollection {
    return item ? item.children : this.controller.items;
  }

  createOrReplace(
    parent: vscode.TestItem | undefined,
    testId: string,
    label: string,
    file: string | undefined,
    line: string | number | undefined,
    testData: AbstractTest | undefined,
  ): vscode.TestItem {
    const id = testId;
    const uri: vscode.Uri | undefined = file ? vscode.Uri.file(file) : undefined;
    const item = this.controller.createTestItem(id, label, uri);
    if (uri) {
      parseLine(line, l => (item.range = new vscode.Range(l - 1, 0, l, 0)));
    }
    if (testData) this.testItem2test.set(item, testData);
    else this.testItem2test.delete(item);

    if (parent) {
      parent.children.delete(item.id);
      parent.children.add(item);
    } else if (parent === undefined) {
      this.controller.items.delete(item.id);
      this.controller.items.add(item);
    }

    return item;
  }

  private readonly testItem2test = new WeakMap<vscode.TestItem, AbstractTest>();

  map(item: vscode.TestItem): AbstractTest | undefined {
    return this.testItem2test.get(item);
  }

  async update(
    item: vscode.TestItem,
    file: string | undefined,
    line: string | undefined,
    fileResolver: FilePathResolver,
    label: string | null,
    description: string | undefined | null,
    tags: vscode.TestTag[] | null,
  ): Promise<vscode.TestItem> {
    const resolvedFile = fileResolver.findSourceFilePath(file);
    const resolvedFileUri = resolvedFile ? vscode.Uri.file(resolvedFile) : undefined;

    if (item.uri?.fsPath !== resolvedFileUri?.fsPath) {
      const newItem = this.createOrReplace(
        item.parent,
        item.id,
        label !== null ? label : item.label,
        file,
        line,
        this.map(item),
      );

      item.children.forEach(c => newItem.children.add(c));
      newItem.description = description !== null ? description : item.description;
      newItem.tags = tags !== null ? tags : item.tags;
      newItem.error = item.error;
      newItem.busy = item.busy;
      newItem.canResolveChildren = item.canResolveChildren;

      return newItem;
    } else {
      if (line === undefined) {
        if (item.range) item.range = undefined;
      } else if (item.range === undefined || (item.range.start.line + 1).toString() !== line) {
        const lineP = parseLine(line);
        if (lineP) item.range = new vscode.Range(lineP - 1, 0, lineP, 0);
      }

      if (label !== null && item.label !== label) item.label = label;
      if (description !== null && item.description !== description) item.description = description;
      if (tags !== null) item.tags = tags;

      return item;
    }
  }

  *enumerateDescendants(item: vscode.TestItem): IterableIterator<vscode.TestItem> {
    for (const [_, c] of item.children) {
      yield c;
      for (const cc of this.enumerateDescendants(c)) {
        yield cc;
      }
    }
  }

  // maps only if the TestItem explicitly represents the executable. relates to groupByExecuable
  private readonly testItem2ExecDirectly = new WeakMap<vscode.TestItem, AbstractExecutable>();

  setDirectExec(item: vscode.TestItem, exec: AbstractExecutable): void {
    this.testItem2ExecDirectly.set(item, exec);
  }

  getDirectExec(item: vscode.TestItem): AbstractExecutable | undefined {
    return this.testItem2ExecDirectly.get(item);
  }
}
