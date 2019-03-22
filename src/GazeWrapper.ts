//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as vscode from 'vscode';
const {Gaze} = require('gaze'); // eslint-disable-line

export class GazeWrapper extends Gaze implements vscode.Disposable {
  public constructor(patterns: string[]) {
    super(patterns);

    this._watcherReady = new Promise((resolve, reject) => {
      super.on('error', (err: Error) => {
        reject(err);
        this._watcherReady = Promise.reject(err);
      });
      super.on('ready', resolve);
    });
  }

  public ready(): Promise<void> {
    return this._watcherReady;
  }

  public watched(): Promise<string[]> {
    return this._watcherReady.then(() => {
      const filePaths: string[] = [];

      const watched = super.watched();

      for (const dir in watched) {
        for (const file of watched[dir]) {
          filePaths.push(file);
        }
      }

      return filePaths;
    });
  }

  public dispose(): void {
    // we only can close it after it is ready. (empiric)
    this._watcherReady.finally(() => {
      super.close();
    });
  }

  private _watcherReady: Promise<void>;
}
