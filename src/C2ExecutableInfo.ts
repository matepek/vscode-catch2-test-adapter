//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as path from 'path';
import {inspect, promisify} from 'util';
import * as vscode from 'vscode';

import {C2AllTestSuiteInfo} from './C2AllTestSuiteInfo';
import {C2TestSuiteInfo} from './C2TestSuiteInfo';
import * as c2fs from './FsWrapper';
import {resolveVariables} from './Helpers';

export class C2ExecutableInfo implements vscode.Disposable {
  constructor(
      private _allTests: C2AllTestSuiteInfo, public readonly name: string,
      public readonly pattern: string, public readonly cwd: string,
      public readonly env: {[prop: string]: any}) {}

  private _disposables: vscode.Disposable[] = [];
  private _watcher: vscode.FileSystemWatcher|undefined = undefined;

  private readonly _executables: Map<string /*fsPath*/, C2TestSuiteInfo> =
      new Map();

  private readonly _lastEventArrivedAt:
      Map<string /*fsPath*/, number /*Date*/
          > = new Map();

  dispose() {
    if (this._watcher) this._watcher.dispose();
    while (this._disposables.length) this._disposables.pop()!.dispose();
  }

  async load(): Promise<void> {
    const wsUri = this._allTests.workspaceFolder.uri;
    const pattern =
        this.pattern.startsWith('./') ? this.pattern.substr(2) : this.pattern;
    const isAbsolute = path.isAbsolute(pattern);
    const absPattern = isAbsolute ? path.normalize(pattern) :
                                    path.resolve(wsUri.fsPath, pattern);
    const absPatternAsUri = vscode.Uri.file(absPattern);
    const relativeToWs = path.relative(wsUri.fsPath, absPatternAsUri.fsPath);
    const isPartOfWs = !relativeToWs.startsWith('..');

    if (isAbsolute && isPartOfWs)
      this._allTests.log.info(
          'Absolute path is used for workspace directory: ' +
          inspect(this, true, 0));
    if (this.pattern.indexOf('\\') != -1)
      this._allTests.log.warn(
          'Pattern contains backslash character: ' + this.pattern);

    let fileUris: vscode.Uri[] = [];

    if (!isAbsolute || isPartOfWs) {
      let relativePattern: vscode.RelativePattern;
      if (isAbsolute)
        relativePattern = new vscode.RelativePattern(
            this._allTests.workspaceFolder, relativeToWs);
      else
        relativePattern =
            new vscode.RelativePattern(this._allTests.workspaceFolder, pattern);
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
        this._allTests.log.error(inspect([e, this]));
      }
    } else {
      fileUris.push(absPatternAsUri);
    }

    for (let i = 0; i < fileUris.length; i++) {
      const file = fileUris[i];
      const suite = this._addFile(file);
      this._executables.set(file.fsPath, suite);

      await suite.reloadChildren().catch((reason: any) => {
        this._allTests.log.warn(
            'Couldn\'t load suite: ' + inspect([reason, suite]));
        if (suite.catch2Version !== undefined)
          this._allTests.log.error('but it was a Catch2 executable');

        this._allTests.removeChild(suite);
      });
    }

    this._uniquifySuiteNames();
  }

  private _addFile(file: vscode.Uri) {
    const wsUri = this._allTests.workspaceFolder.uri;

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
        ...this._allTests.variableToValue,
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
      if (resolvedName.match(/\$\{.*\}/))
        this._allTests.log.warn(
            'Possibly unresolved variable: ' + resolvedName);
      resolvedCwd = path.normalize(resolveVariables(this.cwd, varToValue));
      if (resolvedCwd.match(/\$\{.*\}/))
        this._allTests.log.warn('Possibly unresolved variable: ' + resolvedCwd);
      resolvedEnv = resolveVariables(this.env, varToValue);
    } catch (e) {
      this._allTests.log.error(inspect([e, this]));
    }

    const suite = this._allTests.createChildSuite(
        resolvedName, file.fsPath, {cwd: resolvedCwd, env: resolvedEnv});

    return suite;
  }

  private _handleEverything(uri: vscode.Uri) {
    let suite = this._executables.get(uri.fsPath);

    if (suite == undefined) {
      suite = this._addFile(uri);
      this._executables.set(uri.fsPath, suite);
      this._uniquifySuiteNames();
    }

    const isRunning = this._lastEventArrivedAt.get(uri.fsPath) !== undefined;

    this._lastEventArrivedAt.set(uri.fsPath, Date.now());

    if (isRunning) return;

    const x = (exists: boolean, delay: number): Promise<void> => {
      let lastEventArrivedAt = this._lastEventArrivedAt.get(uri.fsPath);
      if (lastEventArrivedAt === undefined) {
        this._allTests.log.error('assert in ' + __filename);
        debugger;
        return Promise.resolve();
      }
      if (Date.now() - lastEventArrivedAt! > this._allTests.execWatchTimeout) {
        return this._allTests.sendLoadEvents(() => {
          this._lastEventArrivedAt.delete(uri.fsPath);
          this._executables.delete(uri.fsPath);
          this._allTests.removeChild(suite!);
          return Promise.resolve();
        });
      } else if (exists) {
        return this._allTests
            .sendLoadEvents(() => {
              this._lastEventArrivedAt.delete(uri.fsPath);
              return suite!.reloadChildren().catch((reason: any) => {
                this._allTests.log.error(
                    'suite should exists, but there is some problem under reloading: ' +
                    inspect([reason, uri]));
                return x(false, Math.min(delay * 2, 2000));
              });
            })
            .then(() => {
              this._allTests.autorunEmitter.fire();
            });
      }
      return promisify(setTimeout)(Math.min(delay * 2, 2000)).then(() => {
        return c2fs.existsAsync(uri.fsPath).then((exists: boolean) => {
          return x(exists, Math.min(delay * 2, 2000));
        });
      });
    };
    // change event can arrive during debug session on osx (why?)
    x(false, 64);
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
    const uniqueNames: Map<string /* name */, C2TestSuiteInfo[]> = new Map();

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
}
