//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as path from 'path';
import {inspect, promisify} from 'util';
import * as vscode from 'vscode';

import {C2AllTestSuiteInfo} from './C2AllTestSuiteInfo';
import {C2TestAdapter} from './C2TestAdapter';
import {C2TestSuiteInfo} from './C2TestSuiteInfo';
import * as c2fs from './FsWrapper';
import {resolveVariables} from './Helpers';

export class C2ExecutableInfo implements vscode.Disposable {
  constructor(
      private _adapter: C2TestAdapter,
      private readonly _allTests: C2AllTestSuiteInfo,
      public readonly name: string, public readonly pattern: string,
      public readonly cwd: string, public readonly env: {[prop: string]: any}) {
  }

  private _disposables: vscode.Disposable[] = [];
  private _watcher: vscode.FileSystemWatcher|undefined = undefined;

  private readonly _executables: Map<string /** filePath */, C2TestSuiteInfo> =
      new Map();

  dispose() {
    if (this._watcher) this._watcher.dispose();
    while (this._disposables.length) this._disposables.pop()!.dispose();
  }

  async load(): Promise<void> {
    const wsUri = this._adapter.workspaceFolder.uri;

    const isAbsolute = path.isAbsolute(this.pattern);
    const absPattern = isAbsolute ? path.normalize(this.pattern) :
                                    path.resolve(wsUri.fsPath, this.pattern);
    const absPatternAsUri = vscode.Uri.file(absPattern);
    const relativeToWs = path.relative(wsUri.fsPath, absPatternAsUri.fsPath);
    const isPartOfWs = !relativeToWs.startsWith('..');

    if(isAbsolute && isPartOfWs)
      this._adapter.log.info('Absolute path is used for workspace directory: ' + inspect([this]));
    if(this.pattern.indexOf('\\') != -1)
      this._adapter.log.warn('Pattern contains backslash character: ' + this.pattern);
    
    let fileUris: vscode.Uri[] = [];

    if (!isAbsolute) {
      const relativePattern = new vscode.RelativePattern(
          this._adapter.workspaceFolder, this.pattern);

      try {
        fileUris =
            await vscode.workspace.findFiles(relativePattern, undefined, 1000);

        // abs path string or vscode.RelativePattern is required.
        this._watcher = vscode.workspace.createFileSystemWatcher(
            relativePattern, false, false, false);
        this._disposables.push(this._watcher);
        this._disposables.push(
            this._watcher.onDidCreate(this._handleCreate, this));
        this._disposables.push(
            this._watcher.onDidChange(this._handleChange, this));
        this._disposables.push(
            this._watcher.onDidDelete(this._handleDelete, this));
      } catch (e) {
        this._adapter.log.error(inspect([e, this]));
      }
    } else {
      fileUris.push(absPatternAsUri);
    }

    for (let i = 0; i < fileUris.length; i++) {
      const file = fileUris[i];
      if (await this._verifyIsCatch2TestExecutable(file.fsPath)) {
        this._addFile(file);
      }
    }

    this._uniquifySuiteNames();

    for (const suite of this._executables.values()) {
      await suite.reloadChildren();
    }
  }

  private _addFile(file: vscode.Uri) {
    const wsUri = this._adapter.workspaceFolder.uri;

    let resolvedName = this.name;
    let resolvedCwd = this.cwd;
    let resolvedEnv: {[prop: string]: string} = this.env;
    try {
      const relPath = path.relative(wsUri.fsPath, file.fsPath);

      const filename = path.basename(file.fsPath);
      const extFilename = path.extname(filename);
      const baseFilename = path.basename(filename, extFilename);
      const ext2Filename = path.extname(baseFilename);
      const base2Filename = path.basename(baseFilename, ext2Filename);
      const ext3Filename = path.extname(base2Filename);
      const base3Filename = path.basename(base2Filename, ext3Filename);

      const varToValue: [string, string][] = [
        ...this._adapter.variableToValue,
        ['${absPath}', file.fsPath],
        ['${relPath}', relPath],
        ['${absDirpath}', path.dirname(file.fsPath)],
        ['${relDirpath}', path.dirname(relPath)],
        ['${filename}', filename],
        ['${extFilename}', extFilename],
        ['${baseFilename}', baseFilename],
        ['${ext2Filename}', ext2Filename],
        ['${base2Filename}', base2Filename],
        ['${ext3Filename}', ext3Filename],
        ['${base3Filename}', base3Filename],
      ];
      resolvedName = resolveVariables(this.name, varToValue);
      resolvedCwd = path.normalize(resolveVariables(this.cwd, varToValue));
      resolvedEnv = resolveVariables(this.env, varToValue);
    } catch (e) {
      this._adapter.log.error(inspect([e, this]));
    }

    const suite = this._allTests.createChildSuite(
        resolvedName, file.fsPath, {cwd: resolvedCwd, env: resolvedEnv});

    this._executables.set(file.fsPath, suite);

    return suite;
  }

  private readonly _lastEventArrivedAt:
      Map<string /* fsPath */, number /** Date.now */
          > = new Map();

  private _handleEverything(uri: vscode.Uri) {
    let suite = this._executables.get(uri.fsPath);

    if (suite == undefined) {
      suite = this._addFile(uri);
      this._uniquifySuiteNames();
    }

    const isRunning = this._lastEventArrivedAt.get(uri.fsPath) !== undefined;
    if (isRunning) {
      this._lastEventArrivedAt.set(uri.fsPath, Date.now());
      return;
    }

    this._lastEventArrivedAt.set(uri.fsPath, Date.now());

    const x =
        (exists: boolean, timeout: number, delay: number): Promise<void> => {
          let lastEventArrivedAt = this._lastEventArrivedAt.get(uri.fsPath);
          if (lastEventArrivedAt === undefined) {
            this._adapter.log.error('assert in ' + __filename);
            debugger;
            return Promise.resolve();
          }
          if (Date.now() - lastEventArrivedAt! > timeout) {
            this._lastEventArrivedAt.delete(uri.fsPath);
            this._executables.delete(uri.fsPath);
            this._adapter.testsEmitter.fire({type: 'started'});
            this._allTests.removeChild(suite!);
            this._adapter.testsEmitter.fire(
                {type: 'finished', suite: this._allTests});
            return Promise.resolve();
          } else if (exists) {
            return this._adapter.queue.then(() => {
              this._adapter.testsEmitter.fire({type: 'started'});
              return suite!.reloadChildren().then(
                  () => {
                    this._adapter.testsEmitter.fire(
                        {type: 'finished', suite: this._allTests});
                    this._lastEventArrivedAt.delete(uri.fsPath);
                  },
                  (err: any) => {
                    this._adapter.testsEmitter.fire(
                        {type: 'finished', suite: this._allTests});
                    this._adapter.log.warn(inspect(err));
                    return x(false, timeout, Math.min(delay * 2, 2000));
                  });
            });
          }
          return promisify(setTimeout)(Math.min(delay * 2, 2000)).then(() => {
            return c2fs.existsAsync(uri.fsPath).then((exists: boolean) => {
              return x(exists, timeout, Math.min(delay * 2, 2000));
            });
          });
        };
    // change event can arrive during debug session on osx (why?)
    // if (!this.isDebugging) {
    x(false, this._adapter.getExecWatchTimeout(), 64);
  }

  private _handleCreate(uri: vscode.Uri) {
    return this._handleEverything(uri);
  }

  private _handleChange(uri: vscode.Uri) {
    return this._handleEverything(uri);
  }

  private _handleDelete(uri: vscode.Uri) {
    return this._handleEverything(uri);
  }

  private _uniquifySuiteNames() {
    const uniqueNames: Map<string /* name */, [C2TestSuiteInfo]> = new Map();

    for (const suite of this._executables.values()) {
      const suites = uniqueNames.get(suite.origLabel);
      if (suites) {
        suites.push(suite);
      } else {
        uniqueNames.set(suite.origLabel, [suite]);
      }
    }

    for (const suites of uniqueNames.values()) {
      if (suites.length > 1) {
        let i = 1;
        for (const suite of suites) {
          suite.label = String(i++) + ') ' + suite.origLabel;
        }
      }
    }
  }

  private _verifyIsCatch2TestExecutable(path: string): Promise<boolean> {
    return c2fs.spawnAsync(path, ['--help'])
        .then(res => {
          return res.stdout.indexOf('Catch v2.') != -1;
        })
        .catch(e => {
          this._adapter.log.error(inspect(e));
          return false;
        });
  }
}
