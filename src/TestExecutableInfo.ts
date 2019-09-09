import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

import { RootTestSuiteInfo } from './RootTestSuiteInfo';
import { AbstractTestSuiteInfo } from './AbstractTestSuiteInfo';
import * as c2fs from './FSWrapper';
import { resolveVariables, resolveOSEnvironmentVariables } from './Util';
import { TestSuiteInfoFactory } from './TestSuiteInfoFactory';
import { SharedVariables } from './SharedVariables';
import { GazeWrapper, VSCFSWatcherWrapper, FSWatcher } from './FSWatcher';

export class TestExecutableInfo implements vscode.Disposable {
  public constructor(
    private readonly _shared: SharedVariables,
    private readonly _rootSuite: RootTestSuiteInfo,
    private readonly _name: string | undefined,
    private readonly _description: string | undefined,
    private readonly _pattern: string,
    private readonly _defaultCwd: string,
    private readonly _cwd: string | undefined,
    private readonly _defaultEnv: { [prop: string]: string },
    private readonly _env: { [prop: string]: string } | undefined,
    private readonly _variableToValue: [string, string][],
    private readonly _dependsOn: string[],
  ) {}

  private _disposables: vscode.Disposable[] = [];

  private readonly _executables: Map<string /*fsPath*/, AbstractTestSuiteInfo> = new Map();

  private readonly _lastEventArrivedAt: Map<string /*fsPath*/, number /*Date*/> = new Map();

  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
  }

  public async load(): Promise<void> {
    const pattern = this._patternProcessor(this._pattern);

    this._shared.log.info('pattern', pattern);

    if (pattern.isAbsolute && pattern.isPartOfWs)
      this._shared.log.info('Absolute path is used for workspace directory. This is unnecessary, but it should work.');

    if (this._pattern.indexOf('\\') != -1) this._shared.log.info('Pattern contains backslash character.');

    let filePaths: string[] = [];

    let execWatcher: FSWatcher | undefined = undefined;
    try {
      if (pattern.isPartOfWs) {
        execWatcher = new VSCFSWatcherWrapper(this._shared.workspaceFolder, pattern.relativeToWsPosix);
      } else {
        execWatcher = new GazeWrapper([pattern.absPattern]);
      }

      filePaths = await execWatcher.watched();

      execWatcher.onError((err: Error) => this._shared.log.error('watcher error:', err));

      execWatcher.onAll(fsPath => {
        this._shared.log.info('watcher event:', fsPath);
        this._handleEverything(fsPath);
      });

      this._disposables.push(execWatcher);
    } catch (e) {
      execWatcher && execWatcher.dispose();
      filePaths.push(this._pattern);

      this._shared.log.error("Coudn't watch pattern", e);
    }

    const suiteCreationAndLoadingTasks: Promise<void>[] = [];

    for (let i = 0; i < filePaths.length; i++) {
      const file = filePaths[i];
      this._shared.log.info('Checking file for tests:', file);

      suiteCreationAndLoadingTasks.push(
        c2fs.isNativeExecutableAsync(file).then(
          () => {
            return this._createSuiteByUri(file).then(
              (suite: AbstractTestSuiteInfo) => {
                return suite.reloadTests(this._shared.taskPool).then(
                  () => {
                    if (this._rootSuite.insertChild(suite, false /* called later */)) {
                      this._executables.set(file, suite);
                    }
                  },
                  (reason: Error) => {
                    this._shared.log.warn("Couldn't load executable:", reason, suite);
                  },
                );
              },
              (reason: Error) => {
                this._shared.log.warn('Not a test executable', file, 'reason', reason);
              },
            );
          },
          (reason: Error) => {
            this._shared.log.info('Not an executable:', file, reason);
          },
        ),
      );
    }

    await Promise.all(suiteCreationAndLoadingTasks);

    this._rootSuite.uniquifySuiteLabels();

    if (this._dependsOn.length > 0) {
      try {
        // gaze can handle more patterns at once
        const absPatterns: string[] = [];

        for (const pattern of this._dependsOn) {
          const p = this._patternProcessor(pattern);
          if (p.isPartOfWs) {
            const w = new VSCFSWatcherWrapper(this._shared.workspaceFolder, p.relativeToWsPosix);
            this._disposables.push(w);

            w.onError((e: Error): void => this._shared.log.error('dependsOn watcher:', e, p));

            w.onAll((fsPath: string): void => {
              this._shared.log.info('dependsOn watcher event:', fsPath);
              this._shared.retire.fire([...this._executables.values()]);
            });
          } else {
            absPatterns.push(p.absPattern);
          }
        }

        if (absPatterns.length > 0) {
          const w = new GazeWrapper(absPatterns);
          this._disposables.push(w);

          w.onError((e: Error): void => this._shared.log.error('dependsOn watcher:', e, absPatterns));

          w.onAll((fsPath: string): void => {
            this._shared.log.info('dependsOn watcher event:', fsPath);
            this._shared.retire.fire([...this._executables.values()]);
          });
        }
      } catch (e) {
        this._shared.log.error('dependsOn error:', e);
      }
    }
  }

  private _patternProcessor(
    pattern: string,
  ): {
    isAbsolute: boolean;
    absPattern: string;
    relativeToWs: string;
    isPartOfWs: boolean;
    relativeToWsPosix: string;
  } {
    pattern = resolveOSEnvironmentVariables(pattern, false);
    const isAbsolute = path.isAbsolute(pattern);
    const absPattern = isAbsolute
      ? vscode.Uri.file(path.normalize(pattern)).fsPath
      : vscode.Uri.file(path.join(this._shared.workspaceFolder.uri.fsPath, pattern)).fsPath;
    const relativeToWs = path.relative(this._shared.workspaceFolder.uri.fsPath, absPattern);

    return {
      isAbsolute,
      absPattern,
      relativeToWs,
      isPartOfWs: !relativeToWs.startsWith('..'),
      relativeToWsPosix: relativeToWs.split('\\').join('/'),
    };
  }

  private _createSuiteByUri(filePath: string): Promise<AbstractTestSuiteInfo> {
    const relPath = path.relative(this._shared.workspaceFolder.uri.fsPath, filePath);

    let varToValue: [string, string][] = [];
    try {
      const filename = path.basename(filePath);
      const extFilename = path.extname(filename);
      const baseFilename = path.basename(filename, extFilename);
      const ext2Filename = path.extname(baseFilename);
      const base2Filename = path.basename(baseFilename, ext2Filename);
      const ext3Filename = path.extname(base2Filename);
      const base3Filename = path.basename(base2Filename, ext3Filename);

      varToValue = [
        ...this._variableToValue,
        ['${absPath}', filePath],
        ['${relPath}', relPath],
        ['${absDirpath}', path.dirname(filePath)],
        ['${relDirpath}', path.dirname(relPath)],
        ['${filename}', filename],
        ['${parentDirname}', path.basename(path.dirname(filePath))],
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

    const variableRe = /\$\{[^ ]*\}/;

    let resolvedName = relPath;
    try {
      if (this._name) resolvedName = resolveVariables(this._name, varToValue);
      else if (!this._description) resolvedName = resolveVariables('${filename}', varToValue);
      resolvedName = resolveOSEnvironmentVariables(resolvedName, false);

      if (resolvedName.match(variableRe)) this._shared.log.warn('Possibly unresolved variable', resolvedName);

      varToValue.push(['${name}', resolvedName]);
    } catch (e) {
      this._shared.log.error('resolvedLabel', e);
    }

    let resolvedDescription: string | undefined = undefined;
    try {
      if (this._description) {
        resolvedDescription = resolveVariables(this._description, varToValue);
        resolvedDescription = resolveOSEnvironmentVariables(resolvedDescription, false);

        if (resolvedDescription.match(variableRe))
          this._shared.log.warn('Possibly unresolved variable', resolvedDescription);

        varToValue.push(['${description}', resolvedDescription]);
      } else if (!this._name) {
        resolvedDescription = resolveVariables('${relDirpath}/', varToValue);
        varToValue.push(['${description}', resolvedDescription]);
      } else {
        varToValue.push(['${description}', '']);
      }
    } catch (e) {
      this._shared.log.error('resolvedDescription', e);
    }

    let resolvedCwd = this._defaultCwd;
    try {
      if (this._cwd) resolvedCwd = this._cwd;

      resolvedCwd = resolveVariables(resolvedCwd, varToValue);
      resolvedCwd = resolveOSEnvironmentVariables(resolvedCwd, false);

      if (resolvedCwd.match(variableRe)) this._shared.log.warn('Possibly unresolved variable', resolvedCwd);

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
      resolvedEnv = resolveOSEnvironmentVariables(resolvedEnv, true);
    } catch (e) {
      this._shared.log.error('resolvedEnv', e);
    }

    return new TestSuiteInfoFactory(this._shared, resolvedName, resolvedDescription, filePath, {
      cwd: resolvedCwd,
      env: Object.assign({}, process.env, resolvedEnv),
    }).create();
  }

  private _handleEverything(filePath: string): void {
    const isRunning = this._lastEventArrivedAt.get(filePath) !== undefined;
    if (isRunning) return;

    this._lastEventArrivedAt.set(filePath, Date.now());

    const x = (suite: AbstractTestSuiteInfo, exists: boolean, delay: number): Promise<void> => {
      let lastEventArrivedAt = this._lastEventArrivedAt.get(filePath);
      if (lastEventArrivedAt === undefined) {
        this._shared.log.error('assert');
        debugger;
        return Promise.resolve();
      } else if (Date.now() - lastEventArrivedAt > this._shared.execWatchTimeout) {
        this._shared.log.info('refresh timeout:', filePath);
        this._lastEventArrivedAt.delete(filePath);
        if (this._rootSuite.hasChild(suite)) {
          return new Promise<void>(resolve => {
            this._shared.loadWithTaskEmitter.fire(() => {
              this._executables.delete(filePath);
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
              .reloadTests(this._shared.taskPool)
              .then(() => {
                if (this._rootSuite.insertChild(suite, true)) {
                  this._executables.set(filePath, suite);
                }
                this._lastEventArrivedAt.delete(filePath);
                this._shared.retire.fire([suite]);
              })
              .then(resolve, reject);
          });
        }).catch((reason: Error) => {
          this._shared.log.info('Problem under reloadChildren:', reason, filePath, suite);
          return x(suite, false, Math.min(delay * 2, 2000));
        });
      } else {
        return promisify(setTimeout)(Math.min(delay * 2, 2000)).then(() => {
          return c2fs
            .isNativeExecutableAsync(filePath)
            .then(() => true, () => false)
            .then(isExec => x(suite, isExec, Math.min(delay * 2, 2000)));
        });
      }
    };

    let suite = this._executables.get(filePath);

    if (suite == undefined) {
      this._shared.log.info('new suite: ' + filePath);
      this._createSuiteByUri(filePath).then(
        (s: AbstractTestSuiteInfo) => {
          x(s, false, 64);
        },
        (reason: Error) => {
          this._shared.log.info("couldn't add: " + filePath, 'reson:', reason);
        },
      );
    } else {
      x(suite!, false, 64);
    }
  }
}
