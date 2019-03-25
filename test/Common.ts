//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import deepStrictEqual = require('deep-equal');
import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as fse from 'fs-extra';
import { inspect, promisify } from 'util';
import { EventEmitter } from 'events';
import { Readable } from 'stream';

import {
  TestEvent,
  TestLoadFinishedEvent,
  TestLoadStartedEvent,
  TestRunFinishedEvent,
  TestRunStartedEvent,
  TestSuiteEvent,
  TestSuiteInfo,
  TestInfo,
} from 'vscode-test-adapter-api';

import * as my from '../src/TestAdapter';

///

export const isWin = process.platform === 'win32';

///
assert.notStrictEqual(vscode.workspace.workspaceFolders, undefined);
assert.equal(vscode.workspace.workspaceFolders!.length, 1);

export const settings = new class {
  public constructor() {}

  public readonly workspaceFolderUri = vscode.workspace.workspaceFolders![0].uri;
  public readonly workspaceFolder = vscode.workspace.getWorkspaceFolder(this.workspaceFolderUri)!;
  public readonly dotVscodePath = path.join(this.workspaceFolderUri.fsPath, '.vscode');

  public getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('catch2TestExplorer', this.workspaceFolderUri);
  }

  // eslint-disable-next-line
  public updateConfig(key: string, value: any): Promise<void> {
    return new Promise(r =>
      this.getConfig()
        .update(key, value)
        .then(r),
    );
  }

  public resetConfig(): Promise<void> {
    const packageJson = fse.readJSONSync(path.join(__dirname, '../..', 'package.json'));
    const properties: { [prop: string]: string }[] = packageJson['contributes']['configuration']['properties'];
    let t: Thenable<void> = Promise.resolve();
    Object.keys(properties).forEach(key => {
      assert.ok(key.startsWith('catch2TestExplorer.'));
      const k = key.substr('catch2TestExplorer.'.length);
      if (k !== 'logfile')
        // don't want to override this
        t = t.then(() => {
          return this.getConfig().update(k, undefined);
        });
    });
    return new Promise(r => t.then(r));
  }
}();

export async function waitFor(context: Mocha.Context, condition: Function, timeout?: number): Promise<void> {
  if (timeout === undefined) timeout = context.timeout();
  const start = Date.now();
  let c = await condition();
  while (!(c = await condition()) && (Date.now() - start < timeout || !context.enableTimeouts()))
    await promisify(setTimeout)(32);
  assert.ok(c, 'title: ' + (context.test ? context.test.title : '?') + '\ncondition: ' + condition.toString());
}

///

export class FileSystemWatcherStub implements vscode.FileSystemWatcher {
  public constructor(
    private readonly path: vscode.Uri,
    readonly ignoreCreateEvents: boolean = false,
    readonly ignoreChangeEvents: boolean = false,
    readonly ignoreDeleteEvents: boolean = false,
  ) {}

  private readonly _onDidCreateEmitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly _onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly _onDidDeleteEmitter = new vscode.EventEmitter<vscode.Uri>();

  public sendCreate(): void {
    this._onDidCreateEmitter.fire(this.path);
  }
  public sendChange(): void {
    this._onDidChangeEmitter.fire(this.path);
  }
  public sendDelete(): void {
    this._onDidDeleteEmitter.fire(this.path);
  }

  public get onDidCreate(): vscode.Event<vscode.Uri> {
    return this._onDidCreateEmitter.event;
  }
  public get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChangeEmitter.event;
  }
  public get onDidDelete(): vscode.Event<vscode.Uri> {
    return this._onDidDeleteEmitter.event;
  }

  public dispose(): void {
    this._onDidCreateEmitter.dispose();
    this._onDidChangeEmitter.dispose();
    this._onDidDeleteEmitter.dispose();
  }
}

///

export class Imitation {
  public readonly sinonSandbox = sinon.createSandbox();

  public readonly spawnStub = this.sinonSandbox.stub(cp, 'spawn').named('spawnStub') as sinon.SinonStub<any[], any>; // eslint-disable-line

  public readonly vsfsWatchStub = this.sinonSandbox
    .stub(vscode.workspace, 'createFileSystemWatcher')
    .named('vscode.createFileSystemWatcher') as sinon.SinonStub<any[], any>; // eslint-disable-line

  public readonly fsAccessStub = this.sinonSandbox.stub(fs, 'access').named('access') as sinon.SinonStub<any[], any>; // eslint-disable-line

  public readonly fsReadFileSyncStub = this.sinonSandbox.stub(fs, 'readFileSync').named('fsReadFileSync') as any; // eslint-disable-line

  public readonly vsFindFilesStub = this.sinonSandbox
    .stub(vscode.workspace, 'findFiles')
    .named('vsFindFilesStub') as sinon.SinonStub<[vscode.GlobPattern | sinon.SinonMatcher], Thenable<vscode.Uri[]>>;

  public constructor() {
    this.resetToCallThrough();
  }

  public restore(): void {
    this.sinonSandbox.restore();
  }

  public resetToCallThrough(): void {
    this.sinonSandbox.reset();
    this.spawnStub.callThrough();
    this.vsfsWatchStub.callThrough();
    this.fsAccessStub.callThrough();
    this.fsReadFileSyncStub.callThrough();
    this.vsFindFilesStub.callThrough();
  }

  public createVscodeRelativePatternMatcher(p: string): sinon.SinonMatcher {
    return sinon.match((actual: vscode.RelativePattern) => {
      const required = new vscode.RelativePattern(settings.workspaceFolder, p);
      return required.base == actual.base && required.pattern == actual.pattern;
    });
  }

  public createAbsVscodeRelativePatternMatcher(p: string): sinon.SinonMatcher {
    return this.createVscodeRelativePatternMatcher(path.relative(settings.workspaceFolderUri.fsPath, p));
  }

  public handleAccessFileExists(path: string, flag: number, cb: (err: NodeJS.ErrnoException | null) => void): void {
    cb(null);
  }

  public handleAccessFileNotExists(path: string, cb: (err: NodeJS.ErrnoException | null | {}) => void): void {
    cb({
      code: 'ENOENT',
      errno: -2,
      message: 'ENOENT',
      path: path,
      syscall: 'stat',
    });
  }

  public createCreateFSWatcherHandler(
    watchers: Map<string, FileSystemWatcherStub>,
  ): (
    p: vscode.RelativePattern,
    ignoreCreateEvents: boolean,
    ignoreChangeEvents: boolean,
    ignoreDeleteEvents: boolean,
  ) => FileSystemWatcherStub {
    return (
      p: vscode.RelativePattern,
      ignoreCreateEvents: boolean,
      ignoreChangeEvents: boolean,
      ignoreDeleteEvents: boolean,
    ) => {
      const pp = path.join(p.base, p.pattern);
      const e = new FileSystemWatcherStub(
        vscode.Uri.file(pp),
        ignoreCreateEvents,
        ignoreChangeEvents,
        ignoreDeleteEvents,
      );
      watchers.set(pp, e);
      return e;
    };
  }
}

///

export class TestAdapter extends my.TestAdapter {
  public readonly testLoadsEvents: (TestLoadStartedEvent | TestLoadFinishedEvent)[] = [];
  private readonly testLoadsEventsConnection: vscode.Disposable;

  private readonly _testStatesEvents: (TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent)[] = [];
  private readonly testStatesEventsConnection: vscode.Disposable;

  public constructor() {
    super(settings.workspaceFolder);

    this.testLoadsEventsConnection = this.tests((e: TestLoadStartedEvent | TestLoadFinishedEvent) => {
      this.testLoadsEvents.push(e);
    });

    this.testStatesEventsConnection = this.testStates(
      (e: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent) => {
        this._testStatesEvents.push(e);
      },
    );
  }

  public dispose(): void {
    throw Error('should have called waitAndDispose');
  }

  public async waitAndDispose(context: Mocha.Context): Promise<void> {
    await waitFor(context, () => {
      return (this as any) /* eslint-disable-line */._mainTaskQueue._count == 0;
    });

    super.dispose();

    this.testLoadsEventsConnection.dispose();
    this.testStatesEventsConnection.dispose();

    // check
    for (let i = 0; i < this.testLoadsEvents.length; i++) {
      assert.deepStrictEqual(
        this.testLoadsEvents[i],
        { type: 'started' },
        inspect({ index: i, testsEvents: this.testLoadsEvents }),
      );
      i++;
      assert.ok(i < this.testLoadsEvents.length, inspect({ index: i, testLoadsEvents: this.testLoadsEvents }));
      assert.equal(this.testLoadsEvents[i].type, 'finished', inspect({ index: i, testsEvents: this.testLoadsEvents }));
    }
  }

  public get root(): TestSuiteInfo {
    return (this as any) /* eslint-disable-line */._rootSuite;
  }

  public get(...index: number[]): TestSuiteInfo | TestInfo {
    let res: TestSuiteInfo | TestInfo = this.root;
    for (let i = 0; i < index.length; i++) {
      assert.strictEqual(res.type, 'suite');
      assert.ok((res as TestSuiteInfo).children.length > index[i], index[i].toString());
      res = (res as TestSuiteInfo).children[index[i]];
    }
    return res;
  }

  public get suite1(): TestSuiteInfo {
    return this.get(0) as TestSuiteInfo;
  }
  public get suite2(): TestSuiteInfo {
    return this.get(1) as TestSuiteInfo;
  }
  public get suite3(): TestSuiteInfo {
    return this.get(2) as TestSuiteInfo;
  }
  public get suite4(): TestSuiteInfo {
    return this.get(3) as TestSuiteInfo;
  }

  public get testStatesEvents(): (TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent)[] {
    // eslint-disable-next-line
    return this._testStatesEvents.map((v: any) => {
      if (v.tooltip) v.tooltip = (v.tooltip as string).replace(/(Path|Cwd): .*/g, '$1: <masked>');
      return v;
    });
  }

  public getTestStatesEventIndex(
    searchFor: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent,
  ): number {
    const i = this.testStatesEvents.findIndex(
      (v: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent) => deepStrictEqual(searchFor, v),
    );
    assert.ok(0 <= i, 'getTestStatesEventIndex failed to find: ' + inspect(this.testStatesEvents));
    return i;
  }

  public async doAndWaitForReloadEvent(context: Mocha.Context, action: Function): Promise<TestSuiteInfo | undefined> {
    const origCount = this.testLoadsEvents.length;
    await action();
    await waitFor(context, () => {
      return this.testLoadsEvents.length >= origCount + 2;
    });
    assert.equal(this.testLoadsEvents.length, origCount + 2, action.toString());
    assert.equal(this.testLoadsEvents[this.testLoadsEvents.length - 1].type, 'finished');
    const e = this.testLoadsEvents[this.testLoadsEvents.length - 1] as TestLoadFinishedEvent;
    if (e.suite) {
      assert.strictEqual(e.suite, this.root);
    } else {
      assert.deepStrictEqual([], this.root.children);
    }
    return e.suite;
  }
}

///

export class ChildProcessFake extends EventEmitter {
  public readonly stdout: Readable;
  private _stdoutChunks: (string | null)[] = [];
  private _canPushOut: boolean = false;

  public readonly stderr: Readable;
  private _stderrChunks: (string | null)[] = [];
  private _canPushErr: boolean = false;
  public closed: boolean = false;

  private _writeStdOut(): void {
    while (this._stdoutChunks.length && this._canPushOut)
      this._canPushOut = this.stdout.push(this._stdoutChunks.shift());
  }

  private _writeStdErr(): void {
    while (this._stderrChunks.length && this._canPushErr)
      this._canPushErr = this.stderr.push(this._stderrChunks.shift());
  }

  public constructor(stdout?: string | Iterable<string>, close?: number | string, stderr?: string) {
    super();

    if (stdout === undefined) this._stdoutChunks = [];
    else if (typeof stdout === 'string') this._stdoutChunks = [stdout, null];
    else this._stdoutChunks = [...stdout, null];

    if (stderr === undefined) this._stderrChunks = [null];
    else if (typeof stderr === 'string') this._stderrChunks = [stderr, null];
    else throw new Error('assert');

    this.stdout = new Readable({
      read: () => {
        this._canPushOut = true;
        this._writeStdOut();
      },
    });
    this.stderr = new Readable({
      read: () => {
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

  public kill(signal?: string): void {
    if (signal === undefined) signal = 'SIGTERM';
    this.emit('close', null, signal);
    this.stdout.push(null);
    this.stderr.push(null);
  }

  public write(data: string): void {
    this._stdoutChunks.push(data);
    this._writeStdOut();
  }

  public close(): void {
    this._stdoutChunks.push(null);
    this._writeStdOut();
    this._stderrChunks.push(null);
    this._writeStdErr();
  }

  public writeAndClose(data: string): void {
    this.write(data);
    this.close();
  }

  public writeLineByLineAndClose(data: string): void {
    const lines = data.split('\n');
    lines.forEach(l => {
      this.write(l + '\n');
    });
    this.close();
  }
}
