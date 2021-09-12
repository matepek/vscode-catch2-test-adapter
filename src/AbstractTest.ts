import * as vscode from 'vscode';
import * as path from 'path';
import { concat } from './Util';
import { AbstractRunnable } from './AbstractRunnable';
import { LoggerWrapper } from './LoggerWrapper';
import { TestCreator } from './WorkspaceShared';

export interface SharedWithTest {
  log: LoggerWrapper;
  testItemCreator: TestCreator;
}

export abstract class AbstractTest {
  public readonly item: vscode.TestItem;
  public readonly testNameAsId: string;
  public readonly debuggable = true;

  protected _label = '';
  protected _additionalDesciption = '';
  protected _additionalTooltip = '';
  protected _skipped = false;
  protected _tags: string[] = [];
  protected _testDescription: string | undefined = undefined;
  protected _typeParam: string | undefined = undefined; // gtest specific
  protected _valueParam: string | undefined = undefined; // gtest specific
  protected _file: string | undefined = undefined;
  protected _line: number | undefined = undefined;
  protected _staticError: string[] | undefined;

  protected constructor(
    protected readonly _shared: SharedWithTest,
    public readonly runnable: AbstractRunnable,
    testNameAsId: string,
    label: string,
    file: string | undefined,
    line: number | undefined,
    skipped: boolean,
    staticError: string[] | undefined,
    pureTags: string[], // without brackets
    testDescription: string | undefined,
    typeParam: string | undefined, // gtest specific
    valueParam: string | undefined, // gtest specific
  ) {
    this.testNameAsId = testNameAsId;

    this._updateBase(label, file, line, skipped, pureTags, testDescription, typeParam, valueParam, staticError);

    this.item = this._shared.testItemCreator(testNameAsId, this.label, file, line, this);

    this.item.description = this.description;
  }

  protected _updateBase(
    label: string,
    file: string | undefined,
    line: number | undefined,
    skipped: boolean,
    tags: string[], // without brackets
    testDescription: string | undefined,
    typeParam: string | undefined, // gtest specific
    valueParam: string | undefined, // gtest specific
    staticError: string[] | undefined,
  ): boolean {
    if (line && line < 0) throw Error('line smaller than zero');

    //TODO: move these to abstract test
    // if (description !== found.description) found.description = description;
    // if (range?.start.line !== found.range?.start.line) found.range = range;

    let changed = false;

    if (this._label != label) {
      changed = true;
      this._label = label;
    }

    const newFile = file ? path.normalize(file) : undefined;
    if (this._file != newFile) {
      changed = true;
      this._file = newFile;
    }

    if (this._line != line) {
      changed = true;
      this._line = line;
    }

    if (this._skipped != skipped) {
      changed = true;
      this._skipped = skipped;
    }

    if (this._testDescription != testDescription) {
      changed = true;
      this._testDescription = testDescription;
    }

    if (tags.length !== this._tags.length || tags.some(t => this._tags.indexOf(t) === -1)) {
      changed = true;
      this._tags = tags;
    }

    if (this._typeParam != typeParam) {
      changed = true;
      this._typeParam = typeParam;
    }

    if (this._valueParam != valueParam) {
      changed = true;
      this._valueParam = valueParam;
    }

    if (this._staticError?.toString() !== staticError?.toString()) {
      changed = true;
      this._staticError = staticError;

      this.item.error = staticError?.join('\n');
    }

    return changed;
  }

  public abstract compare(testNameAsId: string): boolean;

  // should be used only from TestEventBuilder
  public _updateDescriptionAndTooltip(description: string, tooltip: string): void {
    this._additionalDesciption = description;
    this._additionalTooltip = tooltip;
  }

  public get label(): string {
    return this._label;
  }

  public get description(): string {
    const description: string[] = [];

    if (this._tags.length > 0) description.push(this._tags.map(t => `[${t}]`).join(''));

    if (this._typeParam) description.push(`#️⃣Type: ${this._typeParam}`);

    if (this._valueParam) description.push(`#️⃣Value: ${this._valueParam}`);

    return concat(description.join('\n'), this._additionalDesciption, ' ');
  }

  public get tooltip(): string {
    const tooltip = [`Name: ${this.testNameAsId}`];

    if (this._tags.length > 0) {
      const tagsStr = this._tags.map(t => `[${t}]`).join('');
      tooltip.push(`Tags: ${tagsStr}`);
    }

    if (this._testDescription) tooltip.push(`Description: ${this._testDescription}`);

    if (this._typeParam) tooltip.push(`#️⃣TypeParam() = ${this._typeParam}`);

    if (this._valueParam) tooltip.push(`#️⃣GetParam() = ${this._valueParam}`);

    return concat(tooltip.join('\n'), this._additionalTooltip, '\n');
  }

  public get file(): string | undefined {
    return this._file;
  }

  public get line(): number | undefined {
    return this._line;
  }

  public get skipped(): boolean {
    return this._skipped || this.runnable.properties.markAsSkipped;
  }

  public abstract parseAndProcessTestCase(
    testRun: vscode.TestRun,
    output: string,
    rngSeed: number | undefined,
    timeout: number | null,
    stderr: string | undefined,
  ): void;

  public started(testRun: vscode.TestRun): void {
    this._shared.log.info('Test', this.testNameAsId, 'has started.');
    testRun.started(this.item);
    testRun.appendOutput(`### Started "${this.item.label}": >>>\r\n`);
  }

  public stopped(testRun: vscode.TestRun, durationMilis: number | undefined): void {
    this._shared.log.info('Test', this.testNameAsId, 'has stopped.');
    const d = durationMilis ? ` in ${Math.round(durationMilis * 1000) / 1000000} second(s)` : '';
    testRun.appendOutput(`<<< Finished "${this.item.label}"${d} ###\r\n`);
  }

  public createTestMessage(message: string): vscode.TestMessage {
    const m = new vscode.TestMessage(message);
    if (this.item.uri && this.item.range) m.location = new vscode.Location(this.item.uri, this.item.range);
    return m;
  }

  public reportError(testRun: vscode.TestRun, ...message: string[]): void {
    this.started(testRun);
    testRun.appendOutput(message.join('\r\n') + '\r\n');
    this.stopped(testRun, undefined);
    const m = this.createTestMessage(message.join('\n'));
    testRun.errored(this.item, m);
  }

  public reportStaticErrorIfHave(testRun: vscode.TestRun): boolean {
    if (this._staticError != undefined) {
      this.reportError(testRun, ...this._staticError);
      return true;
    } else return false;
  }

  public reportCancelled(testRun: vscode.TestRun, testOutput: string): void {
    this.reportError(testRun, '⏹ Run is stopped by user. ✋', '\n\nTest Output : R"""', testOutput, '"""');
  }

  public reportTimeout(testRun: vscode.TestRun, milisec: number): void {
    this.reportError(testRun, '⌛️ Timed out: "testMate.cpp.test.runtimeLimit": ' + milisec / 1000 + ' second(s).');
  }
}
