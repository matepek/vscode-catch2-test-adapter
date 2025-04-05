import * as path from 'path';
import * as vscode from 'vscode';
const { Gaze } = require('gaze');

export interface FSWatcher extends vscode.Disposable {
  ready: () => Promise<void>;
  watched: () => Promise<string[]>;
  onAll: (handler: (fsPath: string) => void) => void;
  onError: (handler: (err: Error) => void) => void;
}

function longestCommonPath(paths: string[]): [string, string[]] {
  if (paths.length < 1) throw new Error('Need at least 1 path');

  const x = paths.map(p => p.split(/(\/|\\)/));

  let firstDiff = 0;

  while (x.every(v => firstDiff < v.length && v[firstDiff].indexOf('*') === -1 && v[firstDiff] === x[0][firstDiff]))
    firstDiff++;

  return [path.join(...x[0].slice(0, firstDiff)), x.map(p => p.slice(firstDiff)).map(p => path.join(...p))];
}

export class GazeWrapper implements FSWatcher {
  constructor(patterns: string[]) {
    const [cwd, children] = longestCommonPath(patterns);
    this._gaze = new Gaze(children, { cwd, debounceDelay: 2000, interval: 2000 });

    this._watcherReady = new Promise((resolve, reject) => {
      this._gaze.on('error', (err: Error) => {
        reject(err);
        this._watcherReady = Promise.reject(err);
      });
      this._gaze.on('ready', resolve);
    });
  }

  ready(): Promise<void> {
    return this._watcherReady;
  }

  async watched(): Promise<string[]> {
    await this.ready();
    const filePaths: string[] = [];
    const watched = this._gaze.watched();
    for (const dir in watched) {
      for (const file of watched[dir]) {
        filePaths.push(file);
      }
    }
    return filePaths;
  }

  dispose(): void {
    // we only can close it after it is ready. (empiric)
    this.ready().finally(() => {
      this._gaze.close();
    });
  }

  onAll(handler: (fsPath: string) => void): void {
    this._gaze.on('all', (_event: string, fsPath: string) => {
      handler(fsPath);
    });
  }

  onError(handler: (err: Error) => void): void {
    this._gaze.on('error', handler);
  }

  private readonly _gaze: any; // eslint-disable-line
  private _watcherReady: Promise<void>;
}

export class VSCFSWatcherWrapper implements FSWatcher {
  constructor(workspaceFolder: vscode.WorkspaceFolder, relativePattern: string, excludePatterns: string[]) {
    if (path.isAbsolute(relativePattern)) throw new Error('Relative path is expected:' + relativePattern);

    this._relativePattern = new vscode.RelativePattern(workspaceFolder, relativePattern);
    this._vscWatcher = vscode.workspace.createFileSystemWatcher(this._relativePattern, false, false, false);
    this._disposables.push(this._vscWatcher);
    this._excludePattern = excludePatterns;
  }

  private readonly _relativePattern: vscode.RelativePattern;
  private readonly _vscWatcher: vscode.FileSystemWatcher;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _excludePattern: readonly string[] = [];

  dispose(): void {
    this._disposables.forEach(c => c.dispose());
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  async watched(): Promise<string[]> {
    if (!this._isGlobPattern()) {
      return [path.join(this._relativePattern.baseUri.fsPath, this._relativePattern.pattern)];
    }
    // this trick seems working but would need more understanding
    const exclude =
      this._excludePattern.length === 0
        ? null
        : this._excludePattern.length === 1
          ? this._excludePattern[0]
          : '{' + this._excludePattern.join(',') + '}';
    const uris = await vscode.workspace.findFiles(this._relativePattern, exclude, 10000);
    return uris.map(v => v.fsPath);
  }

  onAll(handler: (fsPath: string) => void): void {
    this._disposables.push(this._vscWatcher.onDidCreate((uri: vscode.Uri) => handler(uri.fsPath)));
    this._disposables.push(this._vscWatcher.onDidChange((uri: vscode.Uri) => handler(uri.fsPath)));
    this._disposables.push(this._vscWatcher.onDidDelete((uri: vscode.Uri) => handler(uri.fsPath)));
  }

  onError(_handler: (err: Error) => void): void {
    return undefined;
  }

  _isGlobPattern(): boolean {
    /* According to findFiles documentation:
     * Glob patterns can have the following syntax:
     * * `*` to match zero or more characters in a path segment
     * * `?` to match on one character in a path segment
     * * `**` to match any number of path segments, including none
     * * `{}` to group conditions (e.g. `**​/*.{ts,js}` matches all TypeScript and JavaScript files)
     * * `[]` to declare a range of characters to match in a path segment (e.g., `example.[0-9]` to match on `example.0`, `example.1`, …)
     * * `[!...]` to negate a range of characters to match in a path segment (e.g., `example.[!0-9]` to match on `example.a`, `example.b`, but not `example.0`)
     *
     */
    return this._relativePattern.pattern.match(this._globRe) !== null;
  }

  private readonly _globRe = /(?<!\\)(\[|\*|\?|\{)/;
}
