import * as path from 'path';
import * as vscode from 'vscode';
import * as chokidar from 'chokidar';
import { glob } from 'glob';

export interface FSWatcher extends vscode.Disposable {
  ready: () => Promise<void>;
  watched: () => Promise<string[]>;
  onAll: (handler: (fsPath: string) => void) => void;
  onError: (handler: (err: unknown) => void) => void;
}

function longestCommonPath(paths: string[]): [string, string[]] {
  if (paths.length < 1) throw new Error('Need at least 1 path');

  const x = paths.map(p => p.split(/(\/|\\)/));

  let firstDiff = 0;

  while (x.every(v => firstDiff < v.length && v[firstDiff].indexOf('*') === -1 && v[firstDiff] === x[0][firstDiff]))
    firstDiff++;

  if (x.length === 1 && x[0].length === firstDiff) firstDiff--;

  return [path.join(...x[0].slice(0, firstDiff)), x.map(p => p.slice(firstDiff)).map(p => path.join(...p))];
}

export class ChokidarWrapper implements FSWatcher {
  constructor(patterns: string[]) {
    const [cwd, children] = longestCommonPath(patterns);
    this._cwd = cwd;
    this._impl = new chokidar.FSWatcher({ cwd, awaitWriteFinish: true, followSymlinks: true });
    this._readyP = Promise.resolve().then(async () => {
      const arr = await glob(children, { cwd, follow: true });
      if (arr.length > 0) {
        const ready = new Promise<void>(r => this._impl.once('ready', r));
        this._impl.add(arr);
        return ready;
      }
    });
  }

  async ready() {
    await this._readyP;
  }

  async watched(): Promise<string[]> {
    await this._readyP;
    const watched = this._impl.getWatched();
    const filePaths: string[] = [];
    for (const dir in watched) {
      for (const file of watched[dir]) {
        filePaths.push(path.join(this._cwd, dir, file));
      }
    }
    return filePaths;
  }

  dispose(): void {
    this._readyP.finally(() => this._impl.close()).catch(e => console.error('chockidar', e));
  }

  onAll(handler: (fsPath: string) => void): void {
    this._impl.on('all', (_event: string, fsPath: string) => {
      handler(path.join(this._cwd, fsPath));
    });
  }

  onError(handler: (err: unknown) => void): void {
    this._impl.on('error', handler);
  }

  private readonly _cwd: string;
  private readonly _impl: chokidar.FSWatcher;
  private readonly _readyP: Promise<void>;
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

  onError(_handler: (err: unknown) => void): void {
    return undefined;
  }

  _isGlobPattern(): boolean {
    /* According to findFiles documentation:
     * Glob patterns can have the following syntax:
     * * `*` to match zero or more characters in a path segment
     * * `?` to match on one character in a path segment
     * * `**` to match any number of path segments, including none
     * * `{}` to group conditions matches all TypeScript and JavaScript files)
     * * `[]` to declare a range of characters to match in a path segment (e.g., `example.[0-9]` to match on `example.0`, `example.1`, …)
     * * `[!...]` to negate a range of characters to match in a path segment (e.g., `example.[!0-9]` to match on `example.a`, `example.b`, but not `example.0`)
     *
     */
    return this._relativePattern.pattern.match(this._globRe) !== null;
  }

  private readonly _globRe = /(?<!\\)(\[|\*|\?|\{)/;
}
