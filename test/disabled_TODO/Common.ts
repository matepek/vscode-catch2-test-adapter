import * as sms from 'source-map-support';
sms.install(); // maps exception location js -> ts

import deepStrictEqual = require('deep-equal');
import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as fse from 'fs-extra';
import { inspect, promisify } from 'util';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { RootSuite as OrigRootSuite } from '../src/RootSuite';

import { TestLoadFinishedEvent, TestLoadStartedEvent, TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';

import * as fsw from '../../src/util/FSWrapper';
import * as my from '../src/TestAdapter';
import * as my2 from '../src/SharedVariables';
import { Config } from '../../src/Configurations';
import { logger } from '../LogOutputContent.test';

///

function getId(t: my2.TestRunEvent): string {
  switch (t.type) {
    case 'test':
      return typeof t.test == 'string' ? t.test : t.test.id;
    case 'suite':
      return typeof t.suite == 'string' ? t.suite : t.suite.id;
    case 'started':
    case 'finished':
      return t.type;
    default:
      throw Error('assert');
  }
}

function simplifiedAssertEqualStateEvents(stateEvents: my2.TestRunEvent[], expectedArr: my2.TestRunEvent[]): void {
  if (stateEvents.length != expectedArr.length)
    console.log(`this._testStatesEvents.length(${stateEvents.length}) != expected.length(${expectedArr.length})`);

  try {
    for (let i = 0; i < expectedArr.length && i < stateEvents.length; ++i) {
      const actual = stateEvents[i];
      const expected = expectedArr[i];

      if (actual.type == 'test' && expected.type == 'test') {
        // eslint-disable-next-line
        assert.strictEqual(getId(actual), getId(expected), `index: ${i}`);
        assert.strictEqual(actual.state, expected.state, `index: ${i}`);
      } else if (actual.type == 'suite' && expected.type == 'suite') {
        // eslint-disable-next-line
        assert.strictEqual(getId(actual), getId(expected), `index: ${i}`);
        assert.strictEqual(actual.state, expected.state, `index: ${i}`);
      } else {
        assert.deepStrictEqual(actual.type, expected.type, `index: ${i}`);
      }
    }

    assert.strictEqual(stateEvents.length, expectedArr.length);
  } catch (e) {
    debugger;
    throw e;
  }
}

function indexOfStateEvent(stateEvents: my2.TestRunEvent[], searchFor: my2.TestRunEvent): number {
  const i = stateEvents.findIndex((v: my2.TestRunEvent) => {
    if (v.type !== searchFor.type) return false;
    if (v.type === 'suite' && searchFor.type === 'suite') {
      if (getId(v) !== getId(searchFor)) return false;
      if (v.state !== searchFor.state) return false;
    }
    if (v.type === 'test' && searchFor.type === 'test') {
      if (getId(v) !== getId(searchFor)) return false;
      if (v.state !== searchFor.state) return false;
    }
    if (v.type === 'started' && searchFor.type === 'started') {
      if (!deepStrictEqual(v.tests, searchFor.tests)) return false;
    }
    return true;
  });
  assert.ok(
    0 <= i,
    `getTestStatesEventIndex failed to find: ` +
      inspect(searchFor, false, 0) +
      '\nin:\n' +
      inspect(stateEvents, false, 1),
  );
  return i;
}

function stateEventSequence(
  stateEvents: my2.TestRunEvent[],
  before: my2.TestRunEvent,
  thanThis: my2.TestRunEvent,
): void {
  const l = indexOfStateEvent(stateEvents, before);
  const r = indexOfStateEvent(stateEvents, thanThis);
  assert.ok(l < r, 'testStateEventIndexLess: ' + inspect({ less: [l, before], thanThis: [r, thanThis] }));
}

///

export class TestAdapter extends my.TestAdapter {
  readonly loadEvents: (TestLoadStartedEvent | TestLoadFinishedEvent)[] = [];
  private readonly _loadEventsConn: vscode.Disposable;

  readonly stateEvents: my2.TestRunEvent[] = [];
  private readonly _stateEventsConn: vscode.Disposable;

  constructor() {
    super(settings.workspaceFolder, logger);

    this._loadEventsConn = this.tests((e: TestLoadStartedEvent | TestLoadFinishedEvent) => {
      this.loadEvents.push(e);
    });

    this._stateEventsConn = this.testStates((e: my2.TestRunEvent) => {
      this.stateEvents.push(e);
    });
  }

  dispose(): void {
    throw Error('should have called waitAndDispose');
  }

  async waitAndDispose(context: Mocha.Context): Promise<void> {
    await waitFor(context, () => {
      /* eslint-disable-next-line */
      return (this as any)._isDebugging === false;
    });

    await waitFor(context, () => {
      /* eslint-disable-next-line */
      return (this as any)._rootSuite._runningCounter === 0;
    });

    await waitFor(context, () => {
      /* eslint-disable-next-line */
      return (this as any)._testLoadingCounter === 0;
    });

    super.dispose();

    this._loadEventsConn.dispose();
    this._stateEventsConn.dispose();

    // check
    for (let i = 0; i < this.loadEvents.length; i += 2) {
      assert.deepStrictEqual(
        this.loadEvents[i],
        { type: 'started' },
        'Should be started but got: ' + inspect({ index: i, testsEvents: this.loadEvents }),
      );

      assert.ok(
        i + 1 < this.loadEvents.length,
        'Missing finished: ' + inspect({ index: i + 1, loadEvents: this.loadEvents }),
      );

      assert.equal(
        this.loadEvents[i + 1].type,
        'finished',
        'Should be finished but got: ' + inspect({ index: i + 1, loadEvents: this.loadEvents }),
      );
    }
  }

  get root(): TestSuiteInfo {
    return (this as any) /* eslint-disable-line */._rootSuite;
  }

  getGroup(...index: number[]): TestSuiteInfo {
    let group: TestSuiteInfo = this.root;
    for (let i = 0; i < index.length; i++) {
      assert.ok(group.children.length > index[i], index[i].toString());
      const next = group.children[index[i]];
      if (next.type === 'suite') group = next;
      else throw Error(`wrong type for ${index}[${i}]`);
    }
    return group;
  }

  getTest(...index: number[]): TestInfo {
    let group: TestSuiteInfo = this.root;
    for (let i = 0; i < index.length; i++) {
      assert.ok(group.children.length > index[i], index[i].toString());
      const next = group.children[index[i]];
      if (i + 1 === index.length) {
        if (next.type === 'test') return next;
        else throw Error(`wrong type for ${index}[${i}]`);
      } else {
        if (next.type === 'suite') group = next;
        else throw Error(`wrong type for ${index}[${i}]`);
      }
    }
    throw Error(`coudn't find test ${index}`);
  }

  get group(): TestSuiteInfo {
    return this.getGroup(0);
  }
  get group1(): TestSuiteInfo {
    return this.getGroup(1);
  }
  get group2(): TestSuiteInfo {
    return this.getGroup(2);
  }
  get group3(): TestSuiteInfo {
    return this.getGroup(3);
  }

  simplifiedAssertEqualStateEvents(expectedArr: my2.TestRunEvent[]): void {
    simplifiedAssertEqualStateEvents(this.stateEvents, expectedArr);
  }

  indexOfStateEvent(searchFor: my2.TestRunEvent): number {
    return indexOfStateEvent(this.stateEvents, searchFor);
  }

  stateEventSequence(before: my2.TestRunEvent, thanThis: my2.TestRunEvent): void {
    stateEventSequence(this.stateEvents, before, thanThis);
  }

  async doAndWaitForReloadEvent(
    context: Mocha.Context,
    action: () => Promise<void>,
  ): Promise<TestSuiteInfo | undefined> {
    const origCount = this.loadEvents.length;
    try {
      await action();
    } catch (e) {
      throw Error('action: "' + action.toString() + '" errored: ' + e);
    }
    try {
      await waitFor(context, () => {
        return this.loadEvents.length >= origCount + 2;
      });
    } catch (e) {
      throw Error('waiting after action: "' + action.toString() + '" errored: ' + e);
    }
    assert.equal(this.loadEvents.length, origCount + 2, action.toString());
    assert.equal(this.loadEvents[this.loadEvents.length - 1].type, 'finished');
    const e = this.loadEvents[this.loadEvents.length - 1] as TestLoadFinishedEvent;
    if (e.suite) {
      assert.strictEqual(e.suite.id, this.root.id);
    } else {
      assert.deepStrictEqual([], this.root.children);
    }
    return e.suite;
  }
}

///

export class ChildProcessStub extends EventEmitter implements ChildProcessWithoutNullStreams {
  readonly stdin: Writable = undefined as any; // eslint-disable-line
  readonly stdio: [
    Writable, // stdin
    Readable, // stdout
    Readable, // stderr
    Readable | Writable, // extra
    Readable | Writable, // extra
  ] = undefined as any; // eslint-disable-line
  readonly pid: number = undefined as any; // eslint-disable-line
  readonly connected: boolean = undefined as any; // eslint-disable-line

  // eslint-disable-next-line
  send(...args: any[]): boolean {
    throw Error('methond not implemented');
  }
  disconnect(): void {
    throw Error('methond not implemented');
  }
  unref(): void {
    throw Error('methond not implemented');
  }
  ref(): void {
    throw Error('methond not implemented');
  }
  get exitCode(): number | null {
    throw Error('methond not implemented');
  }
  get signalCode(): NodeJS.Signals | null {
    throw Error('methond not implemented');
  }
  get spawnargs(): string[] {
    throw Error('methond not implemented');
  }
  get spawnfile(): string {
    throw Error('methond not implemented');
  }

  readonly stdout: Readable;
  private _stdoutChunks: (string | null)[] = [];
  private _canPushOut = false;

  readonly stderr: Readable;
  private _stderrChunks: (string | null)[] = [];
  private _canPushErr = false;
  closed = false;
  killed = false;

  private _writeStdOut(): void {
    while (this._stdoutChunks.length && this._canPushOut)
      this._canPushOut = this.stdout.push(this._stdoutChunks.shift());
  }

  private _writeStdErr(): void {
    while (this._stderrChunks.length && this._canPushErr)
      this._canPushErr = this.stderr.push(this._stderrChunks.shift());
  }

  constructor(stdout?: string | Iterable<string>, close?: number | string, stderr?: string) {
    super();

    if (stdout === undefined) this._stdoutChunks = [];
    else if (typeof stdout === 'string') this._stdoutChunks = [stdout, null];
    else this._stdoutChunks = [...stdout, null];

    if (stderr === undefined) this._stderrChunks = [null];
    else if (typeof stderr === 'string') this._stderrChunks = [stderr, null];
    else throw new Error('assert');

    this.stdout = new Readable({
      read: (): void => {
        this._canPushOut = true;
        this._writeStdOut();
      },
    });
    this.stderr = new Readable({
      read: (): void => {
        this._canPushErr = true;
        this._writeStdErr();
      },
    });

    this.stdout.on('end', () => {
      this.closed = true;
      if (close === undefined) this.emit('close', 1, null);
      else if (typeof close === 'string') this.emit('close', null, close);
      else this.emit('close', close, null);
    });
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    if (signal === undefined) signal = 'SIGTERM';
    this.killed = true;
    this.emit('close', null, signal);
    this.stdout.push(null);
    this.stderr.push(null);
    return true;
  }

  write(data: string): void {
    this._stdoutChunks.push(data);
    this._writeStdOut();
  }

  close(): void {
    this._stdoutChunks.push(null);
    this._writeStdOut();
    this._stderrChunks.push(null);
    this._writeStdErr();
  }

  writeAndClose(data: string): void {
    this.write(data);
    this.close();
  }

  writeLineByLineAndClose(data: string): void {
    const lines = data.split('\n');
    lines.forEach(l => {
      this.write(l + '\n');
    });
    this.close();
  }
}

export class SharedVariables extends my2.SharedVariables {
  loadCount = 0;
  readonly stateEvents: my2.TestRunEvent[] = [];

  constructor(workspaceFolder: vscode.WorkspaceFolder = settings.workspaceFolder) {
    super(
      logger,
      workspaceFolder,
      async () => {
        ++this.loadCount;
        return undefined;
      },
      () => undefined,
      (event: my2.TestRunEvent) => {
        this.stateEvents.push(event);
      },
      () => undefined,
      async () => undefined,
      [],
      null,
      1000,
      null,
      1000,
      false,
      1,
      false,
      false,
      'nothing',
      'default',
    );
  }

  assertSimplifiedEqualStateEvents(expectedArr: my2.TestRunEvent[]): void {
    simplifiedAssertEqualStateEvents(this.stateEvents, expectedArr);
  }

  indexOfStateEvent(searchFor: my2.TestRunEvent): number {
    return indexOfStateEvent(this.stateEvents, searchFor);
  }

  assertStateEventSequence(before: my2.TestRunEvent, thanThis: my2.TestRunEvent): void {
    stateEventSequence(this.stateEvents, before, thanThis);
  }
}

export class RootSuite extends OrigRootSuite {
  constructor(shared: SharedVariables) {
    super(undefined, shared);
  }

  getGroup(...index: number[]): TestSuiteInfo {
    let group = this as TestSuiteInfo;
    for (let i = 0; i < index.length; i++) {
      assert.ok(group.children.length > index[i], index[i].toString());
      const next = group.children[index[i]];
      if (next.type === 'suite') group = next;
      else throw Error(`wrong type for ${index}[${i}]`);
    }
    return group;
  }

  getTest(...index: number[]): TestInfo {
    let group = this as TestSuiteInfo;
    for (let i = 0; i < index.length; i++) {
      assert.ok(group.children.length > index[i], index[i].toString());
      const next = group.children[index[i]];
      if (i + 1 === index.length) {
        if (next.type === 'test') return next;
        else throw Error(`wrong type for ${index}[${i}]`);
      } else {
        if (next.type === 'suite') group = next;
        else throw Error(`wrong type for ${index}[${i}]`);
      }
    }
    throw Error(`coudn't find test ${index}`);
  }
}
