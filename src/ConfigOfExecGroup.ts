import * as pathlib from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

import { AbstractExecutable } from './framework/AbstractExecutable';
import * as c2fs from './util/FSWrapper';
import {
  createPythonIndexerForPathVariable,
  createPythonIndexerForStringVariable,
  ResolveRuleAsync,
  resolveAllAsync,
  createRegexReplaceForStringVariable,
} from './util/ResolveRule';
import { ExecutableFactory } from './framework/ExecutableFactory';
import { WorkspaceShared } from './WorkspaceShared';
import { GazeWrapper, VSCFSWatcherWrapper, FSWatcher } from './util/FSWatcher';
import { readJSONSync } from 'fs-extra';
import { Spawner, DefaultSpawner, SpawnWithExecutor } from './Spawner';
import { RunTaskConfig, ExecutionWrapperConfig, FrameworkSpecificConfig } from './AdvancedExecutableInterface';
import { Logger } from './Logger';
import { debugBreak } from './util/DevelopmentHelper';
import { FrameworkType } from './framework/Framework';
import { readFileSync } from 'fs';
import { getModiTime } from './Util';
import { SubProgressReporter } from './util/ProgressReporter';
import { ExecCloner } from './framework/AbstractExecutable';
import { DebugConfigData } from './DebugConfigType';

///

export class ConfigOfExecGroup implements vscode.Disposable {
  constructor(
    private readonly _shared: WorkspaceShared,
    private readonly _pattern: string,
    private readonly _exclude: string | undefined,
    private readonly _name: string | undefined,
    private readonly _description: string | undefined,
    private readonly _cwd: string,
    private readonly _env: { [prop: string]: string },
    private readonly _envFile: string | undefined,
    private readonly _dependsOn: string[],
    private readonly _runTask: RunTaskConfig,
    private readonly _parallelizationLimit: number,
    private readonly _strictPattern: boolean | undefined,
    private readonly _markAsSkipped: boolean | undefined,
    private readonly _executableCloning: boolean | undefined,
    executableSuffixToInclude: string[] | undefined,
    private readonly _waitForBuildProcess: boolean | string | undefined,
    private readonly _debugConfigData: DebugConfigData | undefined,
    private readonly _executionWrapper: ExecutionWrapperConfig | undefined,
    private readonly _sourceFileMap: Record<string, string>,
    private readonly _frameworkSpecific: Record<FrameworkType, FrameworkSpecificConfig>,
  ) {
    this._executableSuffixToInclude =
      process.platform === 'win32' ? new Set(executableSuffixToInclude ?? ['.exe', '.cmd', '.bat']) : undefined;
    // https://askubuntu.com/questions/156392/what-is-the-equivalent-of-an-exe-file
    this._executableSuffixToExclude =
      process.platform !== 'win32'
        ? new Set([
            '.a',
            '.bat',
            '.c',
            '.cc',
            '.cmake',
            '.cpp',
            '.cxx',
            '.deb',
            '.dir',
            '.gz',
            '.h',
            '.hpp',
            '.hxx',
            '.in',
            '.input',
            '.ko',
            '.log',
            '.md',
            '.mm',
            '.ninja',
            '.o',
            '.obj',
            '.pc',
            '.php',
            '.pyc',
            '.rpm',
            '.so',
            '.stamp',
            '.tar',
            '.txt',
            '.vcxproj.user',
            '.xml',
          ])
        : undefined;
  }

  private readonly _executableSuffixToInclude: Set<string> | undefined;
  private readonly _executableSuffixToExclude: Set<string> | undefined;
  private _disposables: vscode.Disposable[] = [];

  dispose(): void {
    this._disposables.forEach(d => d.dispose());

    for (const exec of this._executables.values()) {
      exec.dispose();
    }
  }

  private readonly _executables: Map<string /*fsPath*/, AbstractExecutable> = new Map();

  async load(progressReporter: SubProgressReporter): Promise<unknown[]> {
    const pattern = await this._pathProcessor(this._pattern);

    this._shared.log.info('pattern', this._pattern, this._shared.workspaceFolder.uri.fsPath, pattern);

    if (pattern.isAbsolute && pattern.isPartOfWs)
      this._shared.log.info('Absolute path is used for workspace directory. This is unnecessary, but it should work.');

    if (this._pattern.indexOf('\\') != -1)
      this._shared.log.info('Pattern contains backslash character. Try to avoid that.');

    let enabledExcludes: string[] = [];
    try {
      if (this._exclude === null || this._exclude === undefined) {
        // skip
      } else if (typeof this._exclude === 'string') {
        const excludeObj = vscode.workspace.getConfiguration().get<Record<string, boolean>>(this._exclude);
        if (typeof excludeObj === 'object') {
          enabledExcludes = Object.entries(excludeObj)
            .filter(i => i[1])
            .map(i => i[0]);
        } else if (excludeObj !== undefined && excludeObj !== null) {
          this._shared.log.error('Unknown exclude format, should be {}');
        }
      } else {
        this._shared.log.error('Unknown exclude type');
      }
    } catch (err) {
      this._shared.log.error('Something wrong with exclusion', err);
    }

    if (enabledExcludes.length > 0) {
      this._shared.log.info(
        'Test executables might be ignored! Excluding some patterns because they are set in vscode',
        enabledExcludes,
        this._exclude,
      );
    }

    let filePaths: string[] = [];

    let execWatcher: FSWatcher | undefined = undefined;
    try {
      if (pattern.isPartOfWs) {
        execWatcher = new VSCFSWatcherWrapper(this._shared.workspaceFolder, pattern.relativeToWsPosix, enabledExcludes);
      } else {
        execWatcher = new GazeWrapper([pattern.absPath]);
      }

      filePaths = await execWatcher.watched();

      // TODO: we could figure out that it is a symlink and add extra
      // filePaths.forEach(f => {
      //   try {
      //     if (fs.readlinkSync(f)) {
      //       console.log(`sym ${f}`);
      //     }
      //   } catch (e) {
      //     console.log(`not sym ${f}`);
      //   }
      // });

      execWatcher.onError((err: Error) => {
        // eslint-disable-next-line
        if ((err as any).code == 'ENOENT') this._shared.log.info('watcher error', err);
        else this._shared.log.error('watcher error', err);
      });

      execWatcher.onAll(fsPath => {
        this._shared.log.info('watcher event:', fsPath);
        this._handleEverything(fsPath);
      });

      this._disposables.push(execWatcher);
    } catch (e) {
      if (execWatcher) execWatcher.dispose();
      filePaths.push(this._pattern);

      this._shared.log.exceptionS(e, "Couldn't watch pattern");
    }

    progressReporter.setMax(filePaths.length);
    const suiteCreationAndLoadingTasks: Promise<void>[] = [];

    for (const file of filePaths) {
      this._shared.log.debug('Checking file for tests:', file);

      if (this._shouldIgnorePath(file)) continue;

      if (this._isDuplicate(file)) continue;

      suiteCreationAndLoadingTasks.push(
        (async (): Promise<void> => {
          try {
            await c2fs.isNativeExecutableAsync(file, this._executableSuffixToInclude, this._executableSuffixToExclude);
            try {
              const factory = await this._createSuiteByUri(file);
              const suite = await factory.create(false);
              if (suite) {
                try {
                  await suite.reloadTests(this._shared.taskPool, this._shared.cancellationToken);
                  this._executables.set(file, suite);
                } catch (reason) {
                  debugBreak();
                  this._shared.log.warn("Couldn't load executable", reason, suite);
                  if (
                    this._strictPattern === true ||
                    (this._strictPattern === undefined && this._shared.enabledStrictPattern === true)
                  )
                    throw Error(
                      `Coudn't load executable while using "discovery.strictPattern" or "test.advancedExecutables:strictPattern": ${file}\n  ${reason}`,
                    );
                }
              }
            } catch (reason) {
              this._shared.log.debug('Not a test executable:', file, 'reason:', reason);
              if (
                this._strictPattern === true ||
                (this._strictPattern === undefined && this._shared.enabledStrictPattern === true)
              )
                throw Error(
                  `Coudn't load executable while using "discovery.strictPattern" or "test.advancedExecutables:strictPattern": ${file}\n  ${reason}`,
                );
            }
          } catch (reason) {
            this._shared.log.debug('Not an executable:', file, reason);
          }
          progressReporter.incrementBy1();
        })(),
      );
    }

    const errors: unknown[] = (await Promise.allSettled(suiteCreationAndLoadingTasks))
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason);

    if (errors.length > 0) return errors;

    if (this._dependsOn.length > 0) {
      try {
        // gaze can handle more patterns at once
        const absPatterns: string[] = [];

        for (const pattern of this._dependsOn) {
          const p = await this._pathProcessor(pattern);
          if (p.isPartOfWs) {
            const w = new VSCFSWatcherWrapper(this._shared.workspaceFolder, p.relativeToWsPosix, []);
            this._disposables.push(w);

            w.onError((e: Error): void => this._shared.log.error('dependsOn watcher:', e, p));

            w.onAll((fsPath: string): void => {
              this._shared.log.info('dependsOn watcher event:', fsPath);
              getModiTime(fsPath).then(modiTime => {
                for (const exec of this._executables.values())
                  exec.reloadTests(this._shared.taskPool, this._shared.cancellationToken, modiTime);
              });
              this.sendRetireAllExecutables();
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
            this.sendRetireAllExecutables();
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

  private async _createSuiteByUri(filePath: string): Promise<ExecutableFactory> {
    const relPath = pathlib.relative(this._shared.workspaceFolder.uri.fsPath, filePath);

    const varToValue: ResolveRuleAsync[] = [];

    try {
      const filename = pathlib.basename(filePath);
      const extFilename = pathlib.extname(filename);
      const baseFilename = pathlib.basename(filename, extFilename);
      const relDirpath = pathlib.dirname(relPath);

      varToValue.push(
        { resolve: '${filename}', rule: filename }, // redundant but might faster
        { resolve: '${relDirpath}', rule: relDirpath }, // redundant but might faster
        createPythonIndexerForStringVariable('filename', filename, '.', '.'),
        createRegexReplaceForStringVariable(this._shared.log, 'filename', filename),
        createPythonIndexerForPathVariable('relPath', relPath),
        createRegexReplaceForStringVariable(this._shared.log, 'relPath', relPath),
        createPythonIndexerForPathVariable('absPath', filePath),
        createPythonIndexerForPathVariable('relDirpath', relDirpath),
        createPythonIndexerForPathVariable('absDirpath', pathlib.dirname(filePath)),
        { resolve: '${extFilename}', rule: extFilename },
        { resolve: '${baseFilename}', rule: baseFilename },
        ...this._shared.varToValue,
      );
    } catch (e) {
      this._shared.log.exceptionS(e);
    }

    const variableRe = /\$\{[^ ]*\}/;

    let resolvedCwd = '.';
    try {
      resolvedCwd = await this._resolveVariables(this._cwd, false, varToValue);

      if (resolvedCwd.match(variableRe)) this._shared.log.warn('Possibly unresolved variable', resolvedCwd);

      resolvedCwd = pathlib.resolve(this._shared.workspaceFolder.uri.fsPath, resolvedCwd);

      varToValue.push(createPythonIndexerForPathVariable('cwd', resolvedCwd));
    } catch (e) {
      this._shared.log.error('resolvedCwd', e);
    }

    let resolvedEnv: Record<string, string> = this._env;
    try {
      resolvedEnv = await this._resolveVariables(resolvedEnv, true, varToValue);
    } catch (e) {
      this._shared.log.error('resolvedEnv', e);
    }

    if (this._envFile) {
      const resolvedEnvFile = await this._pathProcessor(this._envFile, varToValue);
      try {
        let envFromFile: Record<string, string> | undefined = undefined;
        if (resolvedEnvFile.absPath.endsWith('.json')) {
          envFromFile = readJSONSync(resolvedEnvFile.absPath);
        } else if (resolvedEnvFile.absPath.indexOf('.env') !== -1) {
          const content = readFileSync(resolvedEnvFile.absPath).toString();
          envFromFile = {};
          const lines = content.split(/\r?\n/).filter(x => {
            const t = x.trim();
            return t.length > 0 && !t.startsWith('#') && !t.startsWith('//');
          });
          lines.forEach((line: string) => {
            const eqChar = line.indexOf('=');
            if (eqChar !== -1) {
              let value = line.substring(eqChar + 1);
              if (value.startsWith('"') || value.startsWith("'")) value = value.substring(1);
              if (value.endsWith('"') || value.endsWith("'")) value = value.substring(0, value.length - 1);
              envFromFile![line.substring(0, eqChar)] = line.substring(eqChar + 1);
            } else {
              throw Error('line missing "=" in: "' + resolvedEnvFile.absPath + '"' + line);
            }
          });
        } else {
          throw Error('Unsupported file format: "' + resolvedEnvFile.absPath + '". Use only .json or .env');
        }

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

    const resolvedSourceFileMap = await resolveAllAsync(this._sourceFileMap, varToValue, false);
    for (const key in resolvedSourceFileMap) {
      resolvedSourceFileMap[key] = pathlib.normalize(resolvedSourceFileMap[key]);
    }

    return new ExecutableFactory(
      this._shared,
      this._name,
      this._description,
      filePath,
      {
        cwd: resolvedCwd,
        env: Object.assign({}, process.env, resolvedEnv),
      },
      varToValue,
      this._parallelizationLimit,
      this._markAsSkipped === true,
      this._executableCloning === true,
      this._debugConfigData,
      this._executableSuffixToInclude,
      this._executableSuffixToExclude,
      this._runTask,
      spawner,
      resolvedSourceFileMap,
      this._frameworkSpecific,
    );
  }

  private readonly _lastEventArrivedAt: Map<string /*fsPath*/, number /*Date*/> = new Map();

  private async _handleEverything(filePath: string): Promise<void> {
    if (this._shared.cancellationToken.isCancellationRequested) return;

    const isHandlerRunningForFile = this._lastEventArrivedAt.get(filePath) !== undefined;

    this._lastEventArrivedAt.set(filePath, Date.now());

    if (isHandlerRunningForFile) return;

    await promisify(setTimeout)(1000); // just not to be hasty. no other reason for this

    const runnable = this._executables.get(filePath);

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

      this._recursiveHandleFile(filePath)
        .catch(reject => {
          this._shared.log.errorS(`_recursiveHandleFile errors should be handled inside`, reject);
        })
        .finally(() => {
          this._lastEventArrivedAt.delete(filePath);
        });
    }
  }

  private async _recursiveHandleFile(filePath: string, delay = 1024, tryCount = 1): Promise<void> {
    if (this._shared.cancellationToken.isCancellationRequested) return;

    const lastEventArrivedAt = this._lastEventArrivedAt.get(filePath);

    if (lastEventArrivedAt === undefined) {
      this._shared.log.errorS('_recursiveHandleFile: lastEventArrivedAt');
      debugger; // eslint-disable-line
      return;
    }

    if (Date.now() - lastEventArrivedAt > this._shared.execWatchTimeout) {
      this._shared.log.info('file refresh timeout:', filePath);
      return;
    }

    const isExec = await c2fs
      .isNativeExecutableAsync(filePath, this._executableSuffixToInclude, this._executableSuffixToExclude)
      .then(
        () => true,
        () => false,
      );

    if (isExec) {
      try {
        const factory = await this._createSuiteByUri(filePath);
        const runnable = await factory.create(true);

        if (runnable) {
          return this._recursiveHandleRunnable(runnable).catch(reject => {
            this._shared.log.errorS(
              `_recursiveHandleFile._recursiveHandleFile errors should be handled inside`,
              reject,
            );
          });
        }
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

        return this._recursiveHandleFile(filePath, nextDelay, tryCount + 1);
      }
    }
  }

  private async _recursiveHandleRunnable(
    executable: AbstractExecutable,
    isFileExistsAndExecutable = false,
    delay = 128,
  ): Promise<void> {
    if (this._shared.cancellationToken.isCancellationRequested) return;

    const filePath = executable.shared.path;
    const lastEventArrivedAt = this._lastEventArrivedAt.get(filePath);

    if (lastEventArrivedAt === undefined) {
      this._shared.log.errorS('_recursiveHandleRunnable: lastEventArrivedAt');
      debugger; // eslint-disable-line
      return;
    }

    if (isFileExistsAndExecutable) {
      await this._shared.buildProcessChecker.resolveAtFinish(this._waitForBuildProcess);

      try {
        await executable.reloadTests(this._shared.taskPool, this._shared.cancellationToken);
        this._executables.set(filePath, executable); // it might be set already but we don't care
        this._shared.sendRetireEvent([executable]);
      } catch (reason: any /*eslint-disable-line*/) {
        if (reason?.code === undefined)
          this._shared.log.debug('problem under reloading', { reason, filePath, runnable: executable });
        return this._recursiveHandleRunnable(executable, false, Math.min(delay * 2, 2000));
      }
    } else if (Date.now() - lastEventArrivedAt > this._shared.execWatchTimeout) {
      this._shared.log.info('refresh timed out:', filePath);
      const foundRunnable = this._executables.get(filePath);
      if (foundRunnable) {
        foundRunnable.dispose();
        this._executables.delete(filePath);
      }
    } else {
      await promisify(setTimeout)(delay);

      const isExec = await c2fs
        .isNativeExecutableAsync(filePath, this._executableSuffixToInclude, this._executableSuffixToExclude)
        .then(
          () => true,
          () => false,
        );

      return this._recursiveHandleRunnable(executable, isExec, Math.min(delay * 2, 2000));
    }
  }

  private _shouldIgnorePath(filePath: string): boolean {
    if (!this._pattern.match(/(\/|\\)_deps(\/|\\)/) && filePath.match(/(\/|\\)_deps(\/|\\)/)) {
      // cmake fetches the dependencies here. we dont care about it 🤞
      this._shared.log.info('skipping because it is under "/_deps/"', filePath);
      return true;
    } else if (!this._pattern.match(/(\/|\\)CMakeFiles(\/|\\)/) && filePath.match(/(\/|\\)CMakeFiles(\/|\\)/)) {
      // cmake fetches the dependencies here. we dont care about it 🤞
      this._shared.log.info('skipping because it is under "/CMakeFiles/"', filePath);
      return true;
    } else if (filePath.endsWith(ExecCloner.suffix)) {
      this._shared.log.info('skipping because it is part of the cloning feature of this extension', filePath);
      return true;
    } else {
      return false;
    }
  }

  private _isDuplicate(filePath: string): boolean {
    return this._executables.has(filePath);
  }

  private async _resolveVariables<T>(
    value: T,
    strictAllowed: boolean,
    moreVarsToResolve?: readonly ResolveRuleAsync[],
  ): Promise<T> {
    const varToValue = moreVarsToResolve ? [...this._shared.varToValue, ...moreVarsToResolve] : this._shared.varToValue;
    const resolved = resolveAllAsync(value, varToValue, strictAllowed);
    this._shared.log.debug('ExecutableConfig.resolveVariable: ', { value, resolved, strictAllowed });
    return resolved;
  }

  public sendRetireAllExecutables(): void {
    this._shared.sendRetireEvent(this._executables.values());
  }
}

function checkEnvForPath(env: Record<string, string>, log: Logger): void {
  if (process.platform === 'win32') {
    checkPathVariance('PATH', env, log);
    checkPathVariance('Path', env, log);
    checkPathVariance('path', env, log);
  }
}

function checkPathVariance(variance: string, env: Record<string, string>, log: Logger): void {
  if (variance in env) {
    if (env[variance].indexOf('/') != -1)
      log.warn(`Env variable ${variance} contains slash on Windows: "${env[variance]}". That won't really work.`);
  }
}
