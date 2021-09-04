import * as pathlib from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

import { AbstractRunnable } from './AbstractRunnable';
import * as c2fs from './util/FSWrapper';
import { getAbsolutePath, findURIs } from './Util';
import {
  resolveOSEnvironmentVariables,
  createPythonIndexerForPathVariable,
  createPythonIndexerForStringVariable,
  resolveVariablesAsync,
  ResolveRuleAsync,
} from './util/ResolveRule';
import { RunnableFactory } from './RunnableFactory';
import { SharedVariables } from './SharedVariables';
import { GazeWrapper, VSCFSWatcherWrapper, FSWatcher } from './util/FSWatcher';
import { RootSuite } from './RootSuite';
import { readJSONSync } from 'fs-extra';
import { Spawner, DefaultSpawner, SpawnWithExecutor } from './Spawner';
import { RunTask, ExecutionWrapper, FrameworkSpecific } from './AdvancedExecutableInterface';
import { LoggerWrapper } from './LoggerWrapper';

///

export class ExecutableConfig implements vscode.Disposable {
  public constructor(
    private readonly _shared: SharedVariables,
    private readonly _pattern: string,
    private readonly _name: string | undefined,
    private readonly _description: string | undefined,
    private readonly _cwd: string,
    private readonly _env: { [prop: string]: string } | undefined,
    private readonly _envFile: string | undefined,
    private readonly _dependsOn: string[],
    private readonly _runTask: RunTask,
    private readonly _parallelizationLimit: number,
    private readonly _strictPattern: boolean | undefined,
    private readonly _markAsSkipped: boolean | undefined,
    private readonly _waitForBuildProcess: boolean | undefined,
    private readonly _executionWrapper: ExecutionWrapper | undefined,
    private readonly _sourceFileMap: Record<string, string>,
    private readonly _catch2: FrameworkSpecific,
    private readonly _gtest: FrameworkSpecific,
    private readonly _doctest: FrameworkSpecific,
    private readonly _cpputest: FrameworkSpecific,
    private readonly _gbenchmark: FrameworkSpecific,
  ) {
    const createUriSymbol: unique symbol = Symbol('createUri');
    type CreateUri = { [createUriSymbol]: () => vscode.Uri };

    this._disposables.push(
      vscode.languages.registerDocumentLinkProvider(
        { language: 'testMate.cpp.testOutput' },
        {
          provideDocumentLinks: (
            document: vscode.TextDocument,
            token: vscode.CancellationToken, // eslint-disable-line
          ): vscode.ProviderResult<vscode.DocumentLink[]> => {
            const text = document.getText();
            const result: vscode.DocumentLink[] = [];

            const findLinks = (regexType: 'catch2' | 'gtest' | 'general', resolvePath: boolean): void => {
              const lines = text.split(/\r?\n/);
              for (let i = 0; i < lines.length; ++i) {
                if (token.isCancellationRequested) return;

                const matches = findURIs(lines[i], regexType);

                for (let j = 0; j < matches.length; ++j) {
                  const match = matches[j];

                  const file = match.file;
                  const col = match.column ? `:${match.column}` : '';
                  const fragment = match.line ? `${match.line}${col}` : undefined;
                  const link: vscode.DocumentLink = new vscode.DocumentLink(
                    new vscode.Range(i, match.index, i, match.index + match.full.length),
                  );

                  if (resolvePath) {
                    (link as unknown as CreateUri)[createUriSymbol] = (): vscode.Uri => {
                      const dirs = new Set([...this._runnables.keys()].map(k => pathlib.dirname(k)));
                      const resolvedFile = getAbsolutePath(file, dirs);
                      return vscode.Uri.file(resolvedFile).with({ fragment });
                    };
                  } else {
                    link.target = vscode.Uri.file(file).with({ fragment });
                  }

                  result.push(link);
                }
              }
            };

            if (text.startsWith('[ RUN      ]')) {
              findLinks('gtest', true);
            } else if (text.startsWith('⏱Duration:')) {
              findLinks('catch2', true);
            } else {
              //https://github.com/matepek/vscode-catch2-test-adapter/issues/207
              findLinks('general', false);
            }
            return result;
          },
          resolveDocumentLink: (link: vscode.DocumentLink): vscode.ProviderResult<vscode.DocumentLink> => {
            link.target = (link as unknown as CreateUri)[createUriSymbol]();
            return link;
          },
        },
      ),
    );
  }

  private _cancellationFlag = { isCancellationRequested: false };
  private _disposables: vscode.Disposable[] = [];

  public dispose(): void {
    this._cancellationFlag.isCancellationRequested = true;
    this._disposables.forEach(d => d.dispose());
  }

  private readonly _runnables: Map<string /*fsPath*/, AbstractRunnable> = new Map();

  public async load(rootSuite: RootSuite): Promise<unknown[]> {
    const pattern = await this._pathProcessor(this._pattern);

    this._shared.log.info('pattern', this._pattern, this._shared.workspaceFolder.uri.fsPath, pattern);

    if (pattern.isAbsolute && pattern.isPartOfWs)
      this._shared.log.info('Absolute path is used for workspace directory. This is unnecessary, but it should work.');

    if (this._pattern.indexOf('\\') != -1)
      this._shared.log.info('Pattern contains backslash character. Try to avoid that.');

    let filePaths: string[] = [];

    let execWatcher: FSWatcher | undefined = undefined;
    try {
      if (pattern.isPartOfWs) {
        execWatcher = new VSCFSWatcherWrapper(this._shared.workspaceFolder, pattern.relativeToWsPosix);
      } else {
        execWatcher = new GazeWrapper([pattern.absPath]);
      }

      filePaths = await execWatcher.watched();

      execWatcher.onError((err: Error) => {
        // eslint-disable-next-line
        if ((err as any).code == 'ENOENT') this._shared.log.info('watcher error', err);
        else this._shared.log.error('watcher error', err);
      });

      execWatcher.onAll(fsPath => {
        this._shared.log.info('watcher event:', fsPath);
        this._handleEverything(fsPath, rootSuite);
      });

      this._disposables.push(execWatcher);
    } catch (e) {
      execWatcher && execWatcher.dispose();
      filePaths.push(this._pattern);

      this._shared.log.exceptionS(e, "Couldn't watch pattern");
    }

    const suiteCreationAndLoadingTasks: Promise<void>[] = [];

    for (let i = 0; i < filePaths.length; i++) {
      const file = filePaths[i];
      this._shared.log.debug('Checking file for tests:', file);

      if (this._shouldIgnorePath(file)) continue;

      if (this._isDuplicate(file)) continue;

      suiteCreationAndLoadingTasks.push(
        (async (): Promise<void> => {
          try {
            await c2fs.isNativeExecutableAsync(file);
            try {
              const factory = await this._createSuiteByUri(file, rootSuite);
              const suite = await factory.create(false);
              try {
                await suite.reloadTests(this._shared.taskPool, this._cancellationFlag);
                this._runnables.set(file, suite);
              } catch (reason) {
                this._shared.log.warn("Couldn't load executable", reason, suite);
                if (
                  this._strictPattern === true ||
                  (this._strictPattern === undefined && this._shared.enabledStrictPattern === true)
                )
                  throw Error(
                    `Coudn\'t load executable while using "discovery.strictPattern" or "test.advancedExecutables:strictPattern": ${file}\n  ${reason}`,
                  );
              }
            } catch (reason) {
              this._shared.log.debug('Not a test executable:', file, 'reason:', reason);
              if (
                this._strictPattern === true ||
                (this._strictPattern === undefined && this._shared.enabledStrictPattern === true)
              )
                throw Error(
                  `Coudn\'t load executable while using "discovery.strictPattern" or "test.advancedExecutables:strictPattern": ${file}\n  ${reason}`,
                );
            }
          } catch (reason) {
            this._shared.log.debug('Not an executable:', file, reason);
          }
        })(),
      );
    }

    const errors: unknown[] = [];
    for (const task of suiteCreationAndLoadingTasks) {
      try {
        await task;
      } catch (e) {
        errors.push(e);
      }
    }
    if (errors.length > 0) return errors;

    if (this._dependsOn.length > 0) {
      try {
        // gaze can handle more patterns at once
        const absPatterns: string[] = [];

        for (const pattern of this._dependsOn) {
          const p = await this._pathProcessor(pattern);
          if (p.isPartOfWs) {
            const w = new VSCFSWatcherWrapper(this._shared.workspaceFolder, p.relativeToWsPosix);
            this._disposables.push(w);

            w.onError((e: Error): void => this._shared.log.error('dependsOn watcher:', e, p));

            w.onAll((fsPath: string): void => {
              this._shared.log.info('dependsOn watcher event:', fsPath);
              this._shared.sendRetireEvent(this._runnables.values());
            });
          } else {
            absPatterns.push(p.absPath);
          }
        }

        if (absPatterns.length > 0) {
          const w = new GazeWrapper(absPatterns);
          this._disposables.push(w);

          w.onError((e: Error): void => this._shared.log.error('dependsOn watcher:', e, absPatterns));

          w.onAll((fsPath: string): void => {
            this._shared.log.info('dependsOn watcher event:', fsPath);
            this._shared.sendRetireEvent(this._runnables.values());
          });
        }
      } catch (e) {
        this._shared.log.error('dependsOn error:', e);
      }
    }

    return [];
  }

  private async _pathProcessor(
    path: string,
    moreVarsToResolve?: readonly ResolveRuleAsync[],
  ): Promise<{
    isAbsolute: boolean;
    absPath: string;
    isPartOfWs: boolean;
    relativeToWsPosix: string;
  }> {
    path = await this._resolveVariables(path, false, moreVarsToResolve);

    const normPattern = path.replace(/\\/g, '/');
    const isAbsolute = pathlib.posix.isAbsolute(normPattern) || pathlib.win32.isAbsolute(normPattern);
    const absPath = isAbsolute
      ? vscode.Uri.file(pathlib.normalize(path)).fsPath
      : vscode.Uri.file(pathlib.join(this._shared.workspaceFolder.uri.fsPath, normPattern)).fsPath;
    const relativeToWs = pathlib.relative(this._shared.workspaceFolder.uri.fsPath, absPath);

    return {
      isAbsolute,
      absPath: absPath,
      isPartOfWs: !relativeToWs.startsWith('..') && relativeToWs !== absPath, // pathlib.relative('B:\wp', 'C:\a\b') == 'C:\a\b'
      relativeToWsPosix: relativeToWs.replace(/\\/g, '/'),
    };
  }

  private async _createSuiteByUri(filePath: string, rootSuite: RootSuite): Promise<RunnableFactory> {
    const relPath = pathlib.relative(this._shared.workspaceFolder.uri.fsPath, filePath);

    let varToValue: ResolveRuleAsync[] = [];

    const subPath = createPythonIndexerForPathVariable;

    const subFilename = (valName: string, filename: string): ResolveRuleAsync =>
      createPythonIndexerForStringVariable(valName, filename, '.', '.');

    try {
      const filename = pathlib.basename(filePath);
      const extFilename = pathlib.extname(filename);
      const baseFilename = pathlib.basename(filename, extFilename);
      const relDirpath = pathlib.dirname(relPath);

      varToValue = [
        { resolve: '${filename}', rule: filename }, // redundant but might faster
        { resolve: '${relDirpath}', rule: relDirpath }, // redundant but might faster
        subFilename('filename', filename),
        subPath('relPath', relPath),
        subPath('absPath', filePath),
        subPath('relDirpath', relDirpath),
        subPath('absDirpath', pathlib.dirname(filePath)),
        { resolve: '${extFilename}', rule: extFilename },
        { resolve: '${baseFilename}', rule: baseFilename },
        ...this._shared.varToValue,
      ];
    } catch (e) {
      this._shared.log.exceptionS(e);
    }

    const variableRe = /\$\{[^ ]*\}/;

    let resolvedCwd = '.';
    try {
      resolvedCwd = await this._resolveVariables(this._cwd, false, varToValue);

      if (resolvedCwd.match(variableRe)) this._shared.log.warn('Possibly unresolved variable', resolvedCwd);

      resolvedCwd = pathlib.resolve(this._shared.workspaceFolder.uri.fsPath, resolvedCwd);

      varToValue.push(subPath('cwd', resolvedCwd));
    } catch (e) {
      this._shared.log.error('resolvedCwd', e);
    }

    let resolvedEnv: Record<string, string> = {};
    try {
      if (this._env) Object.assign(resolvedEnv, this._env);

      resolvedEnv = await this._resolveVariables(resolvedEnv, true, varToValue);
    } catch (e) {
      this._shared.log.error('resolvedEnv', e);
    }

    if (this._envFile) {
      const resolvedEnvFile = await this._pathProcessor(this._envFile, varToValue);
      try {
        const envFromFile = readJSONSync(resolvedEnvFile.absPath);
        if (typeof envFromFile !== 'object') throw Error('envFile is not a JSON object');

        const props = Object.getOwnPropertyNames(envFromFile);
        for (const p of props)
          if (typeof envFromFile[p] !== 'string') throw Error('property of envFile is not a string: ' + p);

        Object.assign(resolvedEnv, envFromFile);
        this._shared.log.info(
          'Extra environment variables has been added from file',
          resolvedEnvFile.absPath,
          envFromFile,
        );
      } catch (e) {
        this._shared.log.warn('Unable to parse envFile', `"${resolvedEnvFile.absPath}"`, e);
      }
    }

    checkEnvForPath(resolvedEnv, this._shared.log);

    let spawner: Spawner = new DefaultSpawner();
    if (this._executionWrapper) {
      try {
        const resolvedPath = await this._pathProcessor(this._executionWrapper.path, varToValue);
        const resolvedArgs = await this._resolveVariables(this._executionWrapper.args, false, varToValue);
        spawner = new SpawnWithExecutor(resolvedPath.absPath, resolvedArgs);
        this._shared.log.info('executionWrapper was specified', resolvedPath, resolvedArgs);
      } catch (e) {
        this._shared.log.warn('Unable to apply executionWrapper', e);
      }
    }

    return new RunnableFactory(
      this._shared,
      this._name,
      this._description,
      rootSuite,
      filePath,
      {
        cwd: resolvedCwd,
        env: Object.assign({}, process.env, resolvedEnv),
      },
      varToValue,
      this._catch2,
      this._gtest,
      this._doctest,
      this._cpputest,
      this._gbenchmark,
      this._parallelizationLimit,
      this._markAsSkipped === true,
      this._runTask,
      spawner,
      this._sourceFileMap,
    );
  }

  private readonly _lastEventArrivedAt: Map<string /*fsPath*/, number /*Date*/> = new Map();

  private async _handleEverything(filePath: string, rootSuite: RootSuite): Promise<void> {
    if (this._cancellationFlag.isCancellationRequested) return;

    const isHandlerRunningForFile = this._lastEventArrivedAt.get(filePath) !== undefined;

    this._lastEventArrivedAt.set(filePath, Date.now());

    if (isHandlerRunningForFile) return;

    await promisify(setTimeout)(1000); // just not to be hasty. no other reason for this

    const runnable = this._runnables.get(filePath);

    if (runnable !== undefined) {
      this._recursiveHandleRunnable(runnable)
        .catch(reject => {
          this._shared.log.errorS(`_recursiveHandleRunnable errors should be handled inside`, reject);
        })
        .finally(() => {
          this._lastEventArrivedAt.delete(filePath);
        });
    } else {
      if (this._shouldIgnorePath(filePath)) return;

      this._shared.log.info('possibly new suite: ' + filePath);

      this._recursiveHandleFile(filePath, rootSuite)
        .catch(reject => {
          this._shared.log.errorS(`_recursiveHandleFile errors should be handled inside`, reject);
        })
        .finally(() => {
          this._lastEventArrivedAt.delete(filePath);
        });
    }
  }

  private async _recursiveHandleFile(
    filePath: string,
    rootSuite: RootSuite,
    delay = 1024,
    tryCount = 1,
  ): Promise<void> {
    if (this._cancellationFlag.isCancellationRequested) return;

    const lastEventArrivedAt = this._lastEventArrivedAt.get(filePath);

    if (lastEventArrivedAt === undefined) {
      this._shared.log.errorS('_recursiveHandleFile: lastEventArrivedAt');
      debugger;
      return;
    }

    if (Date.now() - lastEventArrivedAt > this._shared.execWatchTimeout) {
      this._shared.log.info('file refresh timeout:', filePath);
      return;
    }

    const isExec = await c2fs.isNativeExecutableAsync(filePath).then(
      () => true,
      () => false,
    );

    if (isExec) {
      try {
        const factory = await this._createSuiteByUri(filePath, rootSuite);
        const runnable = await factory.create(true);

        return this._recursiveHandleRunnable(runnable).catch(reject => {
          this._shared.log.errorS(`_recursiveHandleFile._recursiveHandleFile errors should be handled inside`, reject);
        });
      } catch (reason) {
        const nextDelay = Math.min(delay + 1000, 5000);

        if (tryCount > 20) {
          this._shared.log.info("couldn't add file", filePath, 'reason', reason, tryCount);
          return;
        }

        if (c2fs.isSpawnBusyError(reason)) {
          this._shared.log.debug('_recursiveHandleFile: busy, retrying... ' + filePath, 'reason:', reason);
        } else {
          this._shared.log.debug('_recursiveHandleFile: other error... ' + filePath, 'reason:', reason);
        }

        await promisify(setTimeout)(delay);

        return this._recursiveHandleFile(filePath, rootSuite, nextDelay, tryCount + 1);
      }
    }
  }

  private async _recursiveHandleRunnable(
    runnable: AbstractRunnable,
    isFileExistsAndExecutable = false,
    delay = 128,
  ): Promise<void> {
    if (this._cancellationFlag.isCancellationRequested) return;

    const filePath = runnable.properties.path;
    const lastEventArrivedAt = this._lastEventArrivedAt.get(filePath);

    if (lastEventArrivedAt === undefined) {
      this._shared.log.errorS('_recursiveHandleRunnable: lastEventArrivedAt');
      debugger;
      return;
    }

    if (isFileExistsAndExecutable) {
      if (this._waitForBuildProcess) await this._shared.buildProcessChecker.resolveAtFinish();

      try {
        await runnable.reloadTests(this._shared.taskPool, this._cancellationFlag);
        this._runnables.set(filePath, runnable); // it might be set already but we don't care
        this._shared.sendRetireEvent([runnable]);
      } catch (reason: any /*eslint-disable-line*/) {
        if (reason?.code === undefined)
          this._shared.log.debug('problem under reloading', { reason, filePath, runnable });
        return this._recursiveHandleRunnable(runnable, false, Math.min(delay * 2, 2000));
      }
    } else if (Date.now() - lastEventArrivedAt > this._shared.execWatchTimeout) {
      this._shared.log.info('refresh timeout:', filePath);
      const foundRunnable = this._runnables.get(filePath);
      if (foundRunnable) {
        return this._shared.loadWithTask(async (): Promise<void> => {
          foundRunnable.removeTests();
          this._runnables.delete(filePath);
        });
      }
    } else {
      await promisify(setTimeout)(delay);

      const isExec = await c2fs.isNativeExecutableAsync(filePath).then(
        () => true,
        () => false,
      );

      return this._recursiveHandleRunnable(runnable, isExec, Math.min(delay * 2, 2000));
    }
  }

  private _shouldIgnorePath(filePath: string): boolean {
    if (!this._pattern.match(/(\/|\\)_deps(\/|\\)/) && filePath.indexOf('/_deps/') !== -1) {
      // cmake fetches the dependencies here. we dont care about it 🤞
      this._shared.log.info('skipping because it is under "/_deps/"', filePath);
      return true;
    } else if (!this._pattern.match(/(\/|\\)CMakeFiles(\/|\\)/) && filePath.indexOf('/CMakeFiles/') !== -1) {
      // cmake fetches the dependencies here. we dont care about it 🤞
      this._shared.log.info('skipping because it is under "/CMakeFiles/"', filePath);
      return true;
    } else {
      return false;
    }
  }

  private _isDuplicate(filePath: string): boolean {
    return this._runnables.has(filePath);
  }

  private async _resolveVariables<T>(
    value: T,
    strictAllowed: boolean,
    moreVarsToResolve?: readonly ResolveRuleAsync[],
  ): Promise<T> {
    let resolved = resolveOSEnvironmentVariables(value, strictAllowed);
    resolved = await resolveVariablesAsync(resolved, this._shared.varToValue);
    if (moreVarsToResolve) resolved = await resolveVariablesAsync(resolved, moreVarsToResolve);
    this._shared.log.debug('ExecutableConfig.resolveVariable: ', { value, resolved, strictAllowed });
    return resolved;
  }
}

function checkEnvForPath(env: Record<string, string>, log: LoggerWrapper): void {
  if (process.platform === 'win32') {
    checkPathVariance('PATH', env, log);
    checkPathVariance('Path', env, log);
    checkPathVariance('path', env, log);
  }
}

function checkPathVariance(variance: string, env: Record<string, string>, log: LoggerWrapper): void {
  if (variance in env) {
    if (env[variance].indexOf('/') != -1)
      log.warn(`Env variable ${variance} contains slash on Windows: "${env[variance]}". That won't really work.`);
  }
}
