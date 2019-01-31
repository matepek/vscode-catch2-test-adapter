//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

import { RootTestSuiteInfo } from './RootTestSuiteInfo';
import { AbstractTestSuiteInfo } from './AbstractTestSuiteInfo';
import * as c2fs from './FsWrapper';
import { resolveVariables } from './Helpers';
import { TestSuiteInfoFactory } from './TestSuiteInfoFactory';
import { SharedVariables } from './SharedVariables';

export class TestExecutableInfo implements vscode.Disposable {
  constructor(
    private readonly _shared: SharedVariables,
    private readonly _rootSuite: RootTestSuiteInfo,
    private readonly _name: string | undefined,
    private readonly _pattern: string,
    private readonly _cwd: string,
    private readonly _env: { [prop: string]: any },
    private readonly _variableToValue: [string, string][],
  ) { }

  private _disposables: vscode.Disposable[] = [];

  private _watcher: vscode.FileSystemWatcher | undefined = undefined;

  private readonly _executables: Map<string /*fsPath*/, AbstractTestSuiteInfo> = new Map();

  private readonly _lastEventArrivedAt: Map<string /*fsPath*/, number /*Date*/> = new Map();

  dispose() {
    this._disposables.forEach(d => d.dispose());
  }

  async load(): Promise<void> {
    const wsUri = this._shared.workspaceFolder.uri;
    const isAbsolute = path.isAbsolute(this._pattern);
    const absPattern = isAbsolute ? path.normalize(this._pattern) : path.join(wsUri.fsPath, this._pattern);
    const absPatternAsUri = vscode.Uri.file(absPattern);
    const relativeToWs = path.relative(wsUri.fsPath, absPatternAsUri.fsPath);
    const isPartOfWs = !relativeToWs.startsWith('..');
    const relativeToWsPosix = relativeToWs.split('\\').join('/');

    this._shared.log.info('TestExecutableInfo:load', this._pattern, wsUri.fsPath,
      isAbsolute, absPattern, relativeToWs, isPartOfWs, relativeToWsPosix);

    if (isAbsolute && isPartOfWs)
      this._shared.log.warn('Absolute path is used for workspace directory. This is unnecessary, but it should work.');
    if (this._pattern.indexOf('\\') != -1)
      this._shared.log.warn('Pattern contains backslash character.');

    let fileUris: vscode.Uri[] = [];

    if (isPartOfWs) {
      try {
        const relativePattern = new vscode.RelativePattern(this._shared.workspaceFolder, relativeToWsPosix);
        fileUris = await vscode.workspace.findFiles(relativePattern, null, 10000);

        if (fileUris.length === 10000) {
          this._shared.log.error('vscode.workspace.findFiles reached it\'s limit. Probablt pattern is not specific enough.', fileUris.map(u => u.fsPath));
        }

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
        this._shared.log.error(e, this);
      }
    } else {
      fileUris.push(absPatternAsUri);
    }

    for (let i = 0; i < fileUris.length; i++) {
      const file = fileUris[i];
      this._shared.log.info('Checking file for tests:', file.fsPath);

      await c2fs.accessAsync(file.fsPath, c2fs.ExecutableFlag).then(() => {
        return this._createSuiteByUri(file).then((suite: AbstractTestSuiteInfo) => {
          return suite.reloadChildren().then(() => {
            if (this._rootSuite.insertChild(suite, false/* called later */)) {
              this._executables.set(file.fsPath, suite);
            }
          }, (reason: any) => {
            this._shared.log.warn('Couldn\'t load executable:', reason, suite);
          });
        }, (reason: any) => {
          this._shared.log.warn('Not a test executable:', file.fsPath, 'reason:', reason);
        });
      }, (reason: any) => {
        this._shared.log.info('Not an executable:', file.fsPath, reason);
      });
    }

    this._rootSuite.uniquifySuiteLabels();
  }

  private _createSuiteByUri(file: vscode.Uri): Promise<AbstractTestSuiteInfo> {
    const relPath = path.relative(this._shared.workspaceFolder.uri.fsPath, file.fsPath);

    let varToValue: [string, string][] = [];
    try {
      const filename = path.basename(file.fsPath);
      const extFilename = path.extname(filename);
      const baseFilename = path.basename(filename, extFilename);
      const ext2Filename = path.extname(baseFilename);
      const base2Filename = path.basename(baseFilename, ext2Filename);
      const ext3Filename = path.extname(base2Filename);
      const base3Filename = path.basename(base2Filename, ext3Filename);

      varToValue = [
        ...this._variableToValue,
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
    } catch (e) { this._shared.log.error(e); }

    let resolvedLabel = relPath;
    if (this._name) {
      try {
        resolvedLabel = resolveVariables(this._name, varToValue);

        if (resolvedLabel.match(/\$\{.*\}/))
          this._shared.log.warn('Possibly unresolved variable: ' + resolvedLabel);
      } catch (e) { this._shared.log.error(__filename, e); }
    }

    let resolvedCwd = this._cwd;
    try {
      resolvedCwd = resolveVariables(this._cwd, varToValue);

      if (resolvedCwd.match(/\$\{.*\}/))
        this._shared.log.warn('Possibly unresolved variable: ' + resolvedCwd);

      resolvedCwd = path.normalize(vscode.Uri.file(resolvedCwd).fsPath);
    } catch (e) { this._shared.log.error(e); }

    let resolvedEnv: { [prop: string]: string } = {};
    try {
      Object.assign(resolvedEnv, process.env);
      Object.assign(resolvedEnv, this._shared.defaultEnv);
      Object.assign(resolvedEnv, resolveVariables(this._env, varToValue));
    } catch (e) { this._shared.log.error('resolvedEnv', e); }

    return new TestSuiteInfoFactory(
      this._shared,
      resolvedLabel,
      file.fsPath,
      { cwd: resolvedCwd, env: resolvedEnv },
    ).create();
  }

  private _handleEverything(uri: vscode.Uri) {
    const isRunning = this._lastEventArrivedAt.get(uri.fsPath) !== undefined;
    if (isRunning) return;

    this._lastEventArrivedAt.set(uri.fsPath, Date.now());

    const x = (suite: AbstractTestSuiteInfo, exists: boolean, delay: number): Promise<void> => {
      let lastEventArrivedAt = this._lastEventArrivedAt.get(uri.fsPath);
      if (lastEventArrivedAt === undefined) {
        this._shared.log.error('assert in ' + __filename);
        debugger;
        return Promise.resolve();
      } else if (Date.now() - lastEventArrivedAt! > this._shared.execWatchTimeout) {
        this._shared.log.info('refresh timeout: ' + uri.fsPath);
        this._lastEventArrivedAt.delete(uri.fsPath);
        if (this._rootSuite.hasChild(suite)) {
          return new Promise<void>(resolve => {
            this._shared.loadWithTaskEmitter.fire(() => {
              this._executables.delete(uri.fsPath);
              this._rootSuite.removeChild(suite)
              resolve();
            });
          });
        } else {
          return Promise.resolve();
        }
      } else if (exists) {
        return new Promise<void>((resolve, reject) => {
          this._shared.loadWithTaskEmitter.fire(() => {
            return suite.reloadChildren().then(() => {
              if (this._rootSuite.insertChild(suite, true)) {
                this._executables.set(uri.fsPath, suite);
              }
              this._lastEventArrivedAt.delete(uri.fsPath);
            }).then(resolve, reject);
          });
        }).catch((reason: any) => {
          this._shared.log.warn('Problem under reloadChildren:', reason, uri.fsPath, suite);
          return x(suite, false, Math.min(delay * 2, 2000));
        });
      } else {
        return promisify(setTimeout)(Math.min(delay * 2, 2000)).then(() => {
          return c2fs.isNativeExecutableAsync(uri.fsPath).then((isExecutable: boolean) => {
            return x(suite, isExecutable, Math.min(delay * 2, 2000));
          });
        });
      }
    };

    let suite = this._executables.get(uri.fsPath);

    if (suite == undefined) {
      this._shared.log.info('new suite: ' + uri.fsPath);
      this._createSuiteByUri(uri).then((s: AbstractTestSuiteInfo) => {
        x(s, false, 64);
      }, (reason: any) => {
        this._shared.log.info('couldn\'t add: ' + uri.fsPath, 'reson:', reason);
      });
    } else {
      x(suite!, false, 64);
    }
  }

  private _handleCreate(uri: vscode.Uri) {
    this._shared.log.info('create event: ' + uri.fsPath);
    return this._handleEverything(uri);
  }

  private _handleChange(uri: vscode.Uri) {
    this._shared.log.info('change event: ' + uri.fsPath);
    return this._handleEverything(uri);
  }

  private _handleDelete(uri: vscode.Uri) {
    this._shared.log.info('delete event: ' + uri.fsPath);
    return this._handleEverything(uri);
  }
}
