//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { EventEmitter } from 'events';
import { Stream } from 'stream';
import * as vscode from 'vscode';

export class ChildProcessStub extends EventEmitter {
  readonly stdout = new Stream.Readable();
  public closed: boolean = false;

  constructor(data?: string | Iterable<string>, close?: number | string) {
    super();
    this.stdout.on('end', () => {
      this.closed = true;
      if (close === undefined)
        this.emit('close', 1, null);
      else if (typeof close === 'string')
        this.emit('close', null, close);
      else
        this.emit('close', close, null);
    });
    if (data != undefined) {
      if (typeof data !== 'string') {
        for (let line of data) {
          this.write(line);
        }
        this.close();
      } else {
        this.writeAndClose(data);
      }
    }
  }

  kill() {
    this.stdout.emit('end');
  }

  write(data: string): void {
    this.stdout.push(data);
  }

  close(): void {
    this.stdout.push(null);
  }

  writeAndClose(data: string): void {
    this.write(data);
    this.close();
  }

  writeLineByLineAndClose(data: string): void {
    const lines = data.split('\n');
    lines.forEach((l) => {
      this.write(l);
    });
    this.close();
  }
};

export class FileSystemWatcherStub implements vscode.FileSystemWatcher {
  constructor(
    private readonly path: vscode.Uri,
    readonly ignoreCreateEvents: boolean = false,
    readonly ignoreChangeEvents: boolean = false,
    readonly ignoreDeleteEvents: boolean = false) { }

  private readonly _onDidCreateEmitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly _onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly _onDidDeleteEmitter = new vscode.EventEmitter<vscode.Uri>();

  sendCreate() {
    this._onDidCreateEmitter.fire(this.path);
  }
  sendChange() {
    this._onDidChangeEmitter.fire(this.path);
  }
  sendDelete() {
    this._onDidDeleteEmitter.fire(this.path);
  }

  get onDidCreate(): vscode.Event<vscode.Uri> {
    return this._onDidCreateEmitter.event;
  }
  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChangeEmitter.event;
  }
  get onDidDelete(): vscode.Event<vscode.Uri> {
    return this._onDidDeleteEmitter.event;
  }

  dispose() {
    this._onDidCreateEmitter.dispose();
    this._onDidChangeEmitter.dispose();
    this._onDidDeleteEmitter.dispose();
  }
};