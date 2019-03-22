//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

import { RootTestSuiteInfo } from './RootTestSuiteInfo';
import { AbstractTestSuiteInfo } from './AbstractTestSuiteInfo';
import * as c2fs from './FsWrapper';
import { resolveVariables } from './Util';
import { TestSuiteInfoFactory } from './TestSuiteInfoFactory';
import { SharedVariables } from './SharedVariables';
import { GazeWrapper } from './GazeWrapper';

export class TestExecutableInfo implements vscode.Disposable {
  public constructor(
    private readonly _shared: SharedVariables,
    private readonly _rootSuite: RootTestSuiteInfo,
    private readonly _name: string | undefined,
    private readonly _pattern: string,
    private readonly _defaultCwd: string,
    private readonly _cwd: string | undefined,
    private readonly _defaultEnv: { [prop: string]: string },
    private readonly _env: { [prop: string]: string } | undefined,
    private readonly _variableToValue: [string, string][],
  ) {}

  private _disposables: vscode.Disposable[] = [];

  private _watcher: vscode.FileSystemWatcher | undefined = undefined;

  private readonly _executables: Map<string /*fsPath*/, AbstractTestSuiteInfo> = new Map();

  private readonly _lastEventArrivedAt: Map<string /*fsPath*/, number /*Date*/> = new Map();

  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
  }

  public async load(): Promise<void> {
    const wsUri = this._shared.workspaceFolder.uri;
    const isAbsolute = path.isAbsolute(this._pattern);
    const absPattern = isAbsolute ? path.normalize(this._pattern) : path.join(wsUri.fsPath, this._pattern);
    const absPatternAsUri = vscode.Uri.file(absPattern);
    const relativeToWs = path.relative(wsUri.fsPath, absPatternAsUri.fsPath);
    const isPartOfWs = !relativeToWs.startsWith('..');
    const relativeToWsPosix = relativeToWs.split('\\').join('/');

    this._shared.log.info(
      this._pattern,
      wsUri.fsPath,
      isAbsolute,
      absPattern,
      relativeToWs,
      isPartOfWs,
      relativeToWsPosix,
    );

    if (isAbsolute && isPartOfWs)
      this._shared.log.warn('Absolute path is used for workspace directory. This is unnecessary, but it should work.');
    if (this._pattern.indexOf('\\') != -1) this._shared.log.warn('Pattern contains backslash character.');

    let fileUris: vscode.Uri[] = [];

    if (isPartOfWs) {
      try {
        const relativePattern = new vscode.RelativePattern(this._shared.workspaceFolder, relativeToWsPosix);
        fileUris = await vscode.workspace.findFiles(relativePattern, null, 10000);

        if (fileUris.length === 10000) {
          this._shared.log.error(
            "vscode.workspace.findFiles reached it's limit. Probablt pattern is not specific enough.",
            fileUris.map(u => u.fsPath),
          );
        }

        // abs path string or vscode.RelativePattern is required.
        this._watcher = vscode.workspace.createFileSystemWatcher(relativePattern, false, false, false);
        this._disposables.push(this._watcher);
        this._disposables.push(this._watcher.onDidCreate(this._handleCreate, this));
        this._disposables.push(this._watcher.onDidChange(this._handleChange, this));
        this._disposables.push(this._watcher.onDidDelete(this._handleDelete, this));
      } catch (e) {
        this._shared.log.error(e, this);
      }
    } else {
      this._shared.log.info('absPath is used', absPatternAsUri.fsPath);
      try {
        const absWatcher = new GazeWrapper([absPatternAsUri.fsPath]);
        this._disposables.push(absWatcher);

        absWatcher.on('error', (e: Error) => this._shared.log.error('gaze:', e));

        absWatcher.on('all', (event: string, filePath: string) => {
          this._shared.log.info('gaze all event:', event, filePath);
          this._handleEverything(vscode.Uri.file(filePath));
        });

        const filePaths = await absWatcher.watched();

        for (const file of filePaths) {
          fileUris.push(vscode.Uri.file(file));
        }
      } catch (e) {
        this._shared.log.error(e, this);
        fileUris.push(absPatternAsUri);
      }
    }

    const suiteCreationAndLoadingTasks: Promise<void>[] = [];

    for (let i = 0; i < fileUris.length; i++) {
      const file = fileUris[i];
      this._shared.log.info('Checking file for tests:', file.fsPath);

      suiteCreationAndLoadingTasks.push(
        c2fs.isNativeExecutableAsync(file.fsPath).then(
          () => {
            return this._createSuiteByUri(file).then(
              (suite: AbstractTestSuiteInfo) => {
                return suite.reloadChildren().then(
                  () => {
                    if (this._rootSuite.insertChild(suite, false /* called later */)) {
                      this._executables.set(file.fsPath, suite);
                    }
                  },
                  (reason: Error) => {
                    this._shared.log.warn("Couldn't load executable:", reason, suite);
                  },
                );
              },
              (reason: Error) => {
                this._shared.log.warn('Not a test executable:', file.fsPath, 'reason:', reason);
              },
            );
          },
          (reason: Error) => {
            this._shared.log.info('Not an executable:', file.fsPath, reason);
          },
        ),
      );
    }

    await Promise.all(suiteCreationAndLoadingTasks);

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
        ['${parentDirname}', path.basename(path.dirname(file.fsPath))],
        ['${extFilename}', extFilename],
        ['${baseFilename}', baseFilename],
        ['${ext2Filename}', ext2Filename],
        ['${base2Filename}', base2Filename],
        ['${ext3Filename}', ext3Filename],
        ['${base3Filename}', base3Filename],
      ];
    } catch (e) {
      this._shared.log.error(e);
    }

    let resolvedLabel = relPath;
    try {
      if (this._name) resolvedLabel = resolveVariables(this._name, varToValue);

      if (resolvedLabel.match(/\$\{.*\}/)) this._shared.log.warn('Possibly unresolved variable: ' + resolvedLabel);

      varToValue.push(['${name}', resolvedLabel]);
    } catch (e) {
      this._shared.log.error('resolvedLabel', e);
    }

    let resolvedCwd = this._defaultCwd;
    try {
      if (this._cwd) resolvedCwd = this._cwd;

      resolvedCwd = resolveVariables(resolvedCwd, varToValue);

      if (resolvedCwd.match(/\$\{.*\}/)) this._shared.log.warn('Possibly unresolved variable: ' + resolvedCwd);

      resolvedCwd = path.resolve(this._shared.workspaceFolder.uri.fsPath, resolvedCwd);

      varToValue.push(['${cwd}', resolvedCwd]);
    } catch (e) {
      this._shared.log.error('resolvedCwd', e);
    }

    let resolvedEnv: { [prop: string]: string } = {};
    try {
      Object.assign(resolvedEnv, this._defaultEnv);

      if (this._env) Object.assign(resolvedEnv, this._env);

      resolvedEnv = resolveVariables(resolvedEnv, varToValue);
    } catch (e) {
      this._shared.log.error('resolvedEnv', e);
    }

    return new TestSuiteInfoFactory(this._shared, resolvedLabel, file.fsPath, {
      cwd: resolvedCwd,
      env: resolvedEnv,
    }).create();
  }

  private _handleEverything(uri: vscode.Uri): void {
    const isRunning = this._lastEventArrivedAt.get(uri.fsPath) !== undefined;
    if (isRunning) return;

    this._lastEventArrivedAt.set(uri.fsPath, Date.now());

    const x = (suite: AbstractTestSuiteInfo, exists: boolean, delay: number): Promise<void> => {
      let lastEventArrivedAt = this._lastEventArrivedAt.get(uri.fsPath);
      if (lastEventArrivedAt === undefined) {
        this._shared.log.error('assert');
        debugger;
        return Promise.resolve();
      } else if (Date.now() - lastEventArrivedAt > this._shared.execWatchTimeout) {
        this._shared.log.info('refresh timeout:', uri.fsPath);
        this._lastEventArrivedAt.delete(uri.fsPath);
        if (this._rootSuite.hasChild(suite)) {
          return new Promise<void>(resolve => {
            this._shared.loadWithTaskEmitter.fire(() => {
              this._executables.delete(uri.fsPath);
              this._rootSuite.removeChild(suite);
              resolve();
            });
          });
        } else {
          return Promise.resolve();
        }
      } else if (exists) {
        return new Promise<void>((resolve, reject) => {
          this._shared.loadWithTaskEmitter.fire(() => {
            return suite
              .reloadChildren()
              .then(() => {
                if (this._rootSuite.insertChild(suite, true)) {
                  this._executables.set(uri.fsPath, suite);
                }
                this._lastEventArrivedAt.delete(uri.fsPath);
              })
              .then(resolve, reject);
          });
        }).catch((reason: Error) => {
          this._shared.log.warn('Problem under reloadChildren:', reason, uri.fsPath, suite);
          return x(suite, false, Math.min(delay * 2, 2000));
        });
      } else {
        return promisify(setTimeout)(Math.min(delay * 2, 2000)).then(() => {
          return c2fs
            .isNativeExecutableAsync(uri.fsPath)
            .then(() => true, () => false)
            .then(isExec => x(suite, isExec, Math.min(delay * 2, 2000)));
        });
      }
    };

    let suite = this._executables.get(uri.fsPath);

    if (suite == undefined) {
      this._shared.log.info('new suite: ' + uri.fsPath);
      this._createSuiteByUri(uri).then(
        (s: AbstractTestSuiteInfo) => {
          x(s, false, 64);
        },
        (reason: Error) => {
          this._shared.log.info("couldn't add: " + uri.fsPath, 'reson:', reason);
        },
      );
    } else {
      x(suite!, false, 64);
    }
  }

  private _handleCreate(uri: vscode.Uri): void {
    this._shared.log.info('create event: ' + uri.fsPath);
    return this._handleEverything(uri);
  }

  private _handleChange(uri: vscode.Uri): void {
    this._shared.log.info('change event: ' + uri.fsPath);
    return this._handleEverything(uri);
  }

  private _handleDelete(uri: vscode.Uri): void {
    this._shared.log.info('delete event: ' + uri.fsPath);
    return this._handleEverything(uri);
  }
}
