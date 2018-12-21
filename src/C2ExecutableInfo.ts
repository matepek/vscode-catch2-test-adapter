//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as path from 'path';
import { inspect, promisify } from 'util';
import * as vscode from 'vscode';

import { C2AllTestSuiteInfo } from './C2AllTestSuiteInfo';
import { TestSuiteInfoBase } from './C2TestSuiteInfo';
import * as c2fs from './FsWrapper';
import { resolveVariables } from './Helpers';

export class C2ExecutableInfo implements vscode.Disposable {
  constructor(
    private _allTests: C2AllTestSuiteInfo, public readonly name: string,
    public readonly pattern: string, public readonly cwd: string,
    public readonly env: { [prop: string]: any }) { }

  private _disposables: vscode.Disposable[] = [];
  private _watcher: vscode.FileSystemWatcher | undefined = undefined;

  private readonly _executables: Map<string /*fsPath*/, TestSuiteInfoBase> =
    new Map();

  private readonly _lastEventArrivedAt:
    Map<string /*fsPath*/, number /*Date*/
    > = new Map();

  dispose() {
    for (let i = 0; i < this._disposables.length; i++)
      this._disposables[i].dispose();
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

    if (isPartOfWs) {
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
      await this._createSuiteByUri(file).then((suite: TestSuiteInfoBase) => {
        return suite.reloadChildren().then(() => {
          this._executables.set(file.fsPath, suite);
          this._allTests.insertChildSuite(suite);
        }, (reason: any) => {
          this._allTests.log.error('Couldn\'t load executable: ' + inspect([reason, suite]));
        });
      }, (reason: any) => {
        this._allTests.log.info('Not a test executable: ' + file.fsPath);
      });
    }

    this._uniquifySuiteNames();
  }

  private _createSuiteByUri(file: vscode.Uri): Promise<TestSuiteInfoBase> {
    const wsUri = this._allTests.workspaceFolder.uri;

    let resolvedLabel = this.name;
    let resolvedCwd = this.cwd;
    let resolvedEnv: { [prop: string]: string } = this.env;
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
      resolvedLabel = resolveVariables(this.name, varToValue);
      if (resolvedLabel.match(/\$\{.*\}/))
        this._allTests.log.warn(
          'Possibly unresolved variable: ' + resolvedLabel);
      resolvedCwd = path.normalize(resolveVariables(this.cwd, varToValue));
      if (resolvedCwd.match(/\$\{.*\}/))
        this._allTests.log.warn('Possibly unresolved variable: ' + resolvedCwd);
      resolvedEnv = resolveVariables(this.env, varToValue);
    } catch (e) {
      this._allTests.log.error(inspect([e, this]));
    }

    return TestSuiteInfoBase.create(resolvedLabel, this._allTests,
      file.fsPath, { cwd: resolvedCwd, env: resolvedEnv });
  }

  private _handleEverything(uri: vscode.Uri) {
    const isRunning = this._lastEventArrivedAt.get(uri.fsPath) !== undefined;
    if (isRunning) return;

    this._lastEventArrivedAt.set(uri.fsPath, Date.now());

    const x = (suite: TestSuiteInfoBase, exists: boolean, delay: number): Promise<void> => {
      let lastEventArrivedAt = this._lastEventArrivedAt.get(uri.fsPath);
      if (lastEventArrivedAt === undefined) {
        this._allTests.log.error('assert in ' + __filename);
        debugger;
        return Promise.resolve();
      } else if (Date.now() - lastEventArrivedAt! > this._allTests.execWatchTimeout) {
        this._allTests.log.info('refresh timeout: ' + uri.fsPath);
        this._lastEventArrivedAt.delete(uri.fsPath);
        if (this._allTests.hasSuite(suite)) {
          return this._allTests.sendLoadEvents(() => {
            this._executables.delete(uri.fsPath);
            this._allTests.removeChild(suite);
            return Promise.resolve();
          });
        } else {
          return Promise.resolve();
        }
      } else if (exists) {
        // note: here we reload children outside start-finished event
        // it seems ok now, but maybe it is a problem, if insertChildSuite == false
        return suite.reloadChildren().then(() => {
          return this._allTests.sendLoadEvents(() => {
            if (this._allTests.insertChildSuite(suite)) {
              this._executables.set(uri.fsPath, suite);
              this._uniquifySuiteNames();
            }
            this._lastEventArrivedAt.delete(uri.fsPath);
            return Promise.resolve();
          });
        }, (reason: any) => {
          this._allTests.log.warn(
            'Problem under reloadChildren: ' + inspect([reason, uri.fsPath, suite]));
          return x(suite, false, Math.min(delay * 2, 2000));
        });
      } else {
        return promisify(setTimeout)(Math.min(delay * 2, 2000)).then(() => {
          return c2fs.existsAsync(uri.fsPath).then((exists: boolean) => {
            return x(suite, exists, Math.min(delay * 2, 2000));
          });
        });
      }
    };


    let suite = this._executables.get(uri.fsPath);

    if (suite == undefined) {
      this._allTests.log.info('new suite: ' + uri.fsPath);
      this._createSuiteByUri(uri).then((s: TestSuiteInfoBase) => {
        x(s, false, 64);
      }, (reason: any) => {
        this._allTests.log.info('couldn\'t add: ' + uri.fsPath);
      });
    } else {
      x(suite!, false, 64);
    }
  }

  private _handleCreate(uri: vscode.Uri) {
    this._allTests.log.info('create event: ' + uri.fsPath);
    return this._handleEverything(uri);
  }

  private _handleChange(uri: vscode.Uri) {
    this._allTests.log.info('change event: ' + uri.fsPath);
    return this._handleEverything(uri);
  }

  private _handleDelete(uri: vscode.Uri) {
    this._allTests.log.info('delete event: ' + uri.fsPath);
    return this._handleEverything(uri);
  }

  private _uniquifySuiteNames() {
    const uniqueNames: Map<string /* name */, TestSuiteInfoBase[]> = new Map();

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
