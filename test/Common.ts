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

import * as fsw from '../src/util/FSWrapper';
import { Config } from '../src/Configurations';
import { logger } from './LogOutputContent.test';

///

export const isWin = process.platform === 'win32';

///

export class ChildProcessStub extends EventEmitter implements ChildProcessWithoutNullStreams {
  public readonly stdin: Writable = undefined as any; // eslint-disable-line
  public readonly stdio: [
    Writable, // stdin
    Readable, // stdout
    Readable, // stderr
    Readable | Writable, // extra
    Readable | Writable, // extra
  ] = undefined as any; // eslint-disable-line
  public readonly pid: number = undefined as any; // eslint-disable-line
  public readonly connected: boolean = undefined as any; // eslint-disable-line

  // eslint-disable-next-line
  public send(...args: any[]): boolean {
    throw Error('methond not implemented');
  }
  public disconnect(): void {
    throw Error('methond not implemented');
  }
  public unref(): void {
    throw Error('methond not implemented');
  }
  public ref(): void {
    throw Error('methond not implemented');
  }
  public get exitCode(): number | null {
    throw Error('methond not implemented');
  }
  public get signalCode(): NodeJS.Signals | null {
    throw Error('methond not implemented');
  }
  public get spawnargs(): string[] {
    throw Error('methond not implemented');
  }
  public get spawnfile(): string {
    throw Error('methond not implemented');
  }

  public readonly stdout: Readable;
  private _stdoutChunks: (string | null)[] = [];
  private _canPushOut = false;

  public readonly stderr: Readable;
  private _stderrChunks: (string | null)[] = [];
  private _canPushErr = false;
  public closed = false;
  public killed = false;

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

  public kill(signal?: NodeJS.Signals | number): boolean {
    if (signal === undefined) signal = 'SIGTERM';
    this.killed = true;
    this.emit('close', null, signal);
    this.stdout.push(null);
    this.stderr.push(null);
    return true;
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

///
assert.notStrictEqual(vscode.workspace.workspaceFolders, undefined);
assert.equal(vscode.workspace.workspaceFolders!.length, 1);

export const settings = new (class {
  public readonly workspaceFolderUri = vscode.workspace.workspaceFolders![0].uri;
  public readonly workspaceFolder = vscode.workspace.getWorkspaceFolder(this.workspaceFolderUri)!;
  public readonly dotVscodePath = path.join(this.workspaceFolderUri.fsPath, '.vscode');

  public getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('testMate.cpp', this.workspaceFolderUri);
  }

  private _getOldConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('catch2TestExplorer', this.workspaceFolderUri);
  }

  // eslint-disable-next-line
  public updateConfig(key: Config, value: any): Promise<void> {
    return new Promise((r, rj) => this.getConfig().update(key, value).then(r, rj));
  }

  public resetConfig(): Promise<void> {
    const packageJson = fse.readJSONSync(path.join(__dirname, '../..', 'package.json'));
    const properties: { [prop: string]: string }[] = packageJson['contributes']['configuration']['properties'];
    const updatePs: Thenable<void>[] = [];
    const config = this.getConfig();
    const oldConfig = this._getOldConfig();

    Object.keys(properties).forEach(key => {
      assert.ok(key.startsWith('testMate.cpp.') || key.startsWith('catch2TestExplorer.'));

      if (key.startsWith('testMate.cpp.')) {
        const k = key.substr('testMate.cpp.'.length);
        // don't want to override these
        if (k !== 'log.logfile' && k !== 'log.logSentry' && k !== 'log.userId')
          updatePs.push(config.update(k, undefined));
      } else if (key.startsWith('catch2TestExplorer.')) {
        const k = key.substr('catch2TestExplorer.'.length);
        updatePs.push(oldConfig.update(k, undefined));
      }
    });

    return Promise.all(updatePs).then();
  }
})();

export async function waitFor(context: Mocha.Context, condition: () => boolean, timeout?: number): Promise<void> {
  if (timeout === undefined) timeout = context.timeout() - 1000 /*need some time for error handling*/;
  const start = Date.now();
  let c = await condition();
  while (
    !(c = await condition()) &&
    (Date.now() - start < timeout || (context.enableTimeouts && !context.enableTimeouts()))
  )
    await promisify(setTimeout)(32);
  if (!c) throw Error('in test: ' + (context.test ? context.test.title : '?') + '. Condition: ' + condition.toString());
}

export async function waitForMilisec(context: Mocha.Context, milisec: number): Promise<void> {
  const start = Date.now();
  return waitFor(context, () => Date.now() - start > milisec);
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

  public readonly spawnStub = this.sinonSandbox.stub(fsw, 'spawn').named('spawnStub');

  public readonly vsfsWatchStub = this.sinonSandbox
    .stub(vscode.workspace, 'createFileSystemWatcher')
    .named('vscode.createFileSystemWatcher');

  public readonly fsStat = this.sinonSandbox.stub(fs, 'stat').named('stat');

  public readonly fsAccessStub = this.sinonSandbox.stub(fs, 'access').named('access') as unknown as sinon.SinonStub<
    [fs.PathLike, string, (err: NodeJS.ErrnoException | null) => void],
    void
  >;

  public readonly fsReadFileSyncStub = this.sinonSandbox.stub(fs, 'readFileSync').named('fsReadFileSync');

  public readonly vsFindFilesStub = this.sinonSandbox.stub(vscode.workspace, 'findFiles').named('vsFindFilesStub');

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
    this.fsStat.callThrough();
    this.fsAccessStub.callThrough();
    this.fsReadFileSyncStub.callThrough();
    this.vsFindFilesStub.callThrough();
  }

  public createVscodeRelativePatternMatcher(p: string): sinon.SinonMatcher {
    const required = new vscode.RelativePattern(settings.workspaceFolder, p);
    return sinon.match((actual: vscode.RelativePattern) => {
      return required.base == actual.base && required.pattern == actual.pattern;
    });
  }

  public createAbsVscodeRelativePatternMatcher(p: string): sinon.SinonMatcher {
    return this.createVscodeRelativePatternMatcher(path.relative(settings.workspaceFolderUri.fsPath, p));
  }

  public handleAccessFileExists(
    path: fse.PathLike,
    flag: string,
    cb: (err: NodeJS.ErrnoException | null) => void,
  ): void {
    cb(null);
  }

  public handleAccessFileNotExists(
    path: fse.PathLike,
    flag: string,
    cb: (err: NodeJS.ErrnoException | null) => void,
  ): void {
    cb({
      name: 'errname',
      code: 'ENOENT',
      errno: -2,
      message: 'ENOENT',
      path: path.toString(),
      syscall: 'stat',
    });
  }

  public createCreateFSWatcherHandler(
    watchers: Map<string, FileSystemWatcherStub>,
  ): (
    p: vscode.GlobPattern,
    ignoreCreateEvents?: boolean | undefined,
    ignoreChangeEvents?: boolean | undefined,
    ignoreDeleteEvents?: boolean | undefined,
  ) => FileSystemWatcherStub {
    return (
      p: vscode.GlobPattern,
      ignoreCreateEvents?: boolean | undefined,
      ignoreChangeEvents?: boolean | undefined,
      ignoreDeleteEvents?: boolean | undefined,
    ): FileSystemWatcherStub => {
      const pp = typeof p === 'string' ? p : path.join(p.base, p.pattern);
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
