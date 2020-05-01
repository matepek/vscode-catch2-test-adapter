import * as vscode from 'vscode';
import { LoggerWrapper } from './LoggerWrapper';
import { ExecutableConfig, ExecutableConfigFrameworkSpecific } from './ExecutableConfig';
import { SharedVariables } from './SharedVariables';
import { hashString } from './Util';
import { performance } from 'perf_hooks';

type SentryValue = 'question' | 'enable' | 'enabled' | 'disable' | 'disable_1' | 'disable_2' | 'disable_3';

const ConfigSection = 'copper';

type MigratableConfig =
  | 'test.executables'
  | 'test.workingDirectory'
  | 'test.randomGeneratorSeed'
  | 'test.runtimeLimit'
  | 'test.parallelExecutionLimit'
  | 'discovery.misssingFileWaitingTimeLimit'
  | 'discovery.retireDebounceLimit'
  | 'discovery.runtimeLimit'
  | 'discovery.testListCaching'
  | 'debug.configTemplate'
  | 'debug.breakOnFailure'
  | 'debug.noThrow'
  | 'log.logpanel'
  | 'log.logfile'
  | 'log.logSentry'
  | 'log.userId'
  | 'gtest.treatGmockWarningAs'
  | 'gtest.gmockVerbose';

export type Config = 'test.executable' | MigratableConfig;

type OldConfig =
  | 'executables'
  | 'defaultCwd'
  | 'defaultRngSeed'
  | 'defaultWatchTimeoutSec'
  | 'retireDebounceTimeMilisec'
  | 'defaultRunningTimeoutSec'
  | 'defaultExecParsingTimeoutSec'
  | 'workerMaxNumber'
  | 'debugConfigTemplate'
  | 'debugBreakOnFailure'
  | 'defaultNoThrow'
  | 'logpanel'
  | 'logfile'
  | 'logSentry'
  | 'userId'
  | 'enableTestListCaching'
  | 'googletest.treatGmockWarningAs'
  | 'googletest.gmockVerbose';

const MigrationV1V2NamePairs: { [key in MigratableConfig]: OldConfig } = {
  'test.executables': 'executables',
  'test.workingDirectory': 'defaultCwd',
  'test.randomGeneratorSeed': 'defaultRngSeed',
  'discovery.misssingFileWaitingTimeLimit': 'defaultWatchTimeoutSec',
  'discovery.retireDebounceLimit': 'retireDebounceTimeMilisec',
  'test.runtimeLimit': 'defaultRunningTimeoutSec',
  'discovery.runtimeLimit': 'defaultExecParsingTimeoutSec',
  'test.parallelExecutionLimit': 'workerMaxNumber',
  'debug.configTemplate': 'debugConfigTemplate',
  'debug.breakOnFailure': 'debugBreakOnFailure',
  'debug.noThrow': 'defaultNoThrow',
  'log.logpanel': 'logpanel',
  'log.logfile': 'logfile',
  'log.logSentry': 'logSentry',
  'log.userId': 'userId',
  'discovery.testListCaching': 'enableTestListCaching',
  'gtest.treatGmockWarningAs': 'googletest.treatGmockWarningAs',
  'gtest.gmockVerbose': 'googletest.gmockVerbose',
};

class ConfigurationChangeEvent {
  public constructor(private readonly event: vscode.ConfigurationChangeEvent) {}
  affectsConfiguration(section: Config, resource?: vscode.Uri): boolean {
    return this.event.affectsConfiguration(`${ConfigSection}.${section}`, resource);
  }
}

///

export class Configurations {
  private _old: vscode.WorkspaceConfiguration;
  private _new: vscode.WorkspaceConfiguration;

  public constructor(public _log: LoggerWrapper, private _workspaceFolderUri: vscode.Uri) {
    this._old = vscode.workspace.getConfiguration('catch2TestExplorer', _workspaceFolderUri);
    this._new = vscode.workspace.getConfiguration(ConfigSection, _workspaceFolderUri);

    this._getNewOrOldAndMigrate('log.logpanel'); // force migrate
    this._getNewOrOldAndMigrate('log.logfile'); // force migrate
  }

  // eslint-disable-next-line
  private _isDefinedConfig(config: any): boolean {
    return (
      config !== undefined &&
      (config.globalValue !== undefined ||
        config.workspaceValue !== undefined ||
        config.workspaceFolderValue !== undefined)
    );
  }

  private _getNewOrOldAndMigrate<T>(newName: MigratableConfig): T | undefined {
    const oldName = MigrationV1V2NamePairs[newName];
    const oldVals = this._old.inspect<T>(oldName);

    if (oldVals !== undefined && this._isDefinedConfig(oldVals)) {
      // NOTE: update is async operation
      // This is not the nicest solution but should work and simple.

      this._new.update(newName, oldVals.globalValue, vscode.ConfigurationTarget.Global);
      this._new.update(newName, oldVals.workspaceValue, vscode.ConfigurationTarget.Workspace);
      this._new.update(newName, oldVals.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder);

      const oldVal = this._old.get<T>(oldName);

      this._old.update(oldName, undefined, vscode.ConfigurationTarget.Global);
      this._old.update(oldName, undefined, vscode.ConfigurationTarget.Workspace);
      this._old.update(oldName, undefined, vscode.ConfigurationTarget.WorkspaceFolder);

      return oldVal;
    } else {
      return this._new.get<T>(newName);
    }
  }

  private _getNewOrOldOrDefAndMigrate<T>(newName: MigratableConfig, defaultValue: T): T {
    const val = this._getNewOrOldAndMigrate<T>(newName);
    if (val !== undefined) return val;
    else return defaultValue;
  }

  public static onDidChange(callbacks: (changeEvent: ConfigurationChangeEvent) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(changeEvent =>
      callbacks(new ConfigurationChangeEvent(changeEvent)),
    );
  }

  public getDebugConfigurationTemplate(): vscode.DebugConfiguration {
    const templateFromConfig = this._getNewOrOldOrDefAndMigrate<object | null | 'extensionOnly'>(
      'debug.configTemplate',
      null,
    );

    if (typeof templateFromConfig === 'object' && templateFromConfig !== null) {
      const debugConfig = Object.assign(
        {
          name: '${label} (${suiteLabel})',
          request: 'launch',
          type: 'cppdbg',
        },
        templateFromConfig,
      );
      this._log.infoS('using user defined debug config');
      this._log.debug('debugConfig', debugConfig);
      return debugConfig;
    }

    if (templateFromConfig === null) {
      const wpLaunchConfigs = vscode.workspace
        .getConfiguration('launch', this._workspaceFolderUri)
        .get('configurations');

      if (wpLaunchConfigs && Array.isArray(wpLaunchConfigs) && wpLaunchConfigs.length > 0) {
        for (let i = 0; i < wpLaunchConfigs.length; ++i) {
          if (
            wpLaunchConfigs[i].request == 'launch' &&
            typeof wpLaunchConfigs[i].type == 'string' &&
            (wpLaunchConfigs[i].type.startsWith('cpp') ||
              wpLaunchConfigs[i].type.startsWith('lldb') ||
              wpLaunchConfigs[i].type.startsWith('gdb'))
          ) {
            // putting as much known properties as much we can and hoping for the best 🤞
            const debugConfig = Object.assign({}, wpLaunchConfigs[i], {
              name: '${label} (${suiteLabel})',
              program: '${exec}',
              target: '${exec}',
              arguments: '${argsStr}',
              args: '${args}',
              cwd: '${cwd}',
              env: '${envObj}',
            });
            this._log.infoS('using debug cofing from launch.json');
            this._log.debug(
              "using debug config from launch.json. If it doesn't work for you please read the manual: https://github.com/matepek/vscode-catch2-test-adapter#or-user-can-manually-fill-it",
              debugConfig,
            );
            return debugConfig;
          }
        }
      }
    }

    const template: vscode.DebugConfiguration = {
      name: '${label} (${suiteLabel})',
      request: 'launch',
      type: 'cppdbg',
    };

    if (vscode.extensions.getExtension('vadimcn.vscode-lldb')) {
      this._log.infoSMessageWithTags('using debug extension', { extension: 'vadimcn.vscode-lldb' });
      Object.assign(template, {
        type: 'cppdbg',
        MIMode: 'lldb',
        program: '${exec}',
        args: '${args}',
        cwd: '${cwd}',
        env: '${envObj}',
      });
    } else if (vscode.extensions.getExtension('webfreak.debug')) {
      this._log.infoSMessageWithTags('using debug extension', { extension: 'webfreak.debug' });
      Object.assign(template, {
        type: 'gdb',
        target: '${exec}',
        arguments: '${argsStr}',
        cwd: '${cwd}',
        env: '${envObj}',
        valuesFormatting: 'prettyPrinters',
      });

      if (process.platform === 'darwin') {
        template.type = 'lldb-mi';
        // Note: for LLDB you need to have lldb-mi in your PATH
        // If you are on OS X you can add lldb-mi to your path using ln -s /Applications/Xcode.app/Contents/Developer/usr/bin/lldb-mi /usr/local/bin/lldb-mi if you have Xcode.
        template.lldbmipath = '/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-mi';
      }
    } else if (vscode.extensions.getExtension('ms-vscode.cpptools')) {
      this._log.infoSMessageWithTags('using debug extension', { extension: 'ms-vscode.cpptools' });
      // documentation says debug"environment" = [{...}] but that doesn't work
      Object.assign(template, {
        type: 'cppvsdbg',
        linux: { type: 'cppdbg', MIMode: 'gdb' },
        osx: { type: 'cppdbg', MIMode: 'lldb' },
        windows: { type: 'cppvsdbg' },
        program: '${exec}',
        args: '${args}',
        cwd: '${cwd}',
        env: '${envObj}',
      });
    } else {
      this._log.info('no debug config');
      throw Error(
        "For debugging 'copper.debug.configTemplate' should be set: https://github.com/matepek/vscode-catch2-test-adapter#or-user-can-manually-fill-it",
      );
    }
    return template;
  }

  public getOrCreateUserId(): string {
    let userId = this._getNewOrOldAndMigrate<string>('log.userId');

    if (userId) {
      return userId;
    } else {
      let newUserId = (process.env['USER'] || process.env['USERNAME'] || 'user') + process.env['USERDOMAIN'];
      newUserId += performance.now().toString();
      newUserId += process.pid.toString();
      newUserId += Date.now().toString();
      userId = hashString(newUserId);
      this._new.update('log.userId', userId, vscode.ConfigurationTarget.Global);
      return userId;
    }
  }

  public isSentryEnabled(): boolean {
    const val = this._getNewOrOldAndMigrate('log.logSentry');
    return val === 'enable' || val === 'enabled';
  }

  public askSentryConsent(): void {
    const logSentryConfig: Config = 'log.logSentry';

    const logSentry = this._getNewOrOldOrDefAndMigrate<SentryValue>(logSentryConfig, 'question');

    if (logSentry === 'question' || logSentry === 'disable' || logSentry === 'disable_1' || logSentry === 'disable_2') {
      const options = [
        'Sure! I love this extension and happy to help.',
        'Yes, but exclude the current workspace.',
        'Over my dead body',
      ];
      vscode.window
        .showInformationMessage(
          'Hey there! The extension now has [sentry.io](https://sentry.io/welcome) integration to ' +
            'improve the stability and the development. 🤩 For this, I want to log and send errors ' +
            'to [sentry.io](https://sentry.io/welcome), but I would NEVER do it without your consent. ' +
            'Please be understandable and allow it. 🙏' +
            ' (`catch2TestExplorer.logSentry: "enable"/"disable"`)',
          ...options,
        )
        .then((value: string | undefined) => {
          this._log.info('Sentry consent', value);

          if (value === options[0]) {
            this._new.update(logSentryConfig, 'enable', vscode.ConfigurationTarget.Global);
          } else if (value === options[1]) {
            this._new.update(logSentryConfig, 'enable', vscode.ConfigurationTarget.Global);
            this._new.update(logSentryConfig, 'disable_3', vscode.ConfigurationTarget.WorkspaceFolder);
          } else if (value === options[2]) {
            this._new.update(logSentryConfig, 'disable_3', vscode.ConfigurationTarget.Global);
          }
        });
    }
  }

  public getDebugBreakOnFailure(): boolean {
    return this._getNewOrOldOrDefAndMigrate<boolean>('debug.breakOnFailure', true);
  }

  public getDefaultNoThrow(): boolean {
    return this._getNewOrOldOrDefAndMigrate<boolean>('debug.noThrow', false);
  }

  public getDefaultCwd(): string {
    const dirname = this._workspaceFolderUri.fsPath;
    return this._getNewOrOldOrDefAndMigrate<string>('test.workingDirectory', dirname);
  }

  public getDefaultEnvironmentVariables(): { [prop: string]: string } {
    return this._old.get('defaultEnv', {});
  }

  public getRandomGeneratorSeed(): string | number | null {
    return this._getNewOrOldOrDefAndMigrate<null | string | number>('test.randomGeneratorSeed', null);
  }

  public getParallelExecutionLimit(): number {
    const res = Math.max(1, this._getNewOrOldOrDefAndMigrate<number>('test.parallelExecutionLimit', 1));
    if (typeof res != 'number') return 1;
    else {
      if (res > 1) this._log.infoS('workerMaxNumber', 1);
      return res;
    }
  }

  public getExecWatchTimeout(): number {
    const res = this._getNewOrOldOrDefAndMigrate<number>('discovery.misssingFileWaitingTimeLimit', 10) * 1000;
    return res;
  }

  public getRetireDebounceTime(): number {
    const res = this._getNewOrOldOrDefAndMigrate<number>('discovery.retireDebounceLimit', 1000);
    return res;
  }

  public getExecRunningTimeout(): null | number {
    const r = this._getNewOrOldOrDefAndMigrate<null | number>('test.runtimeLimit', null);
    return r !== null && r > 0 ? r * 1000 : null;
  }

  public getExecParsingTimeout(): number {
    const r = this._getNewOrOldOrDefAndMigrate<number>('discovery.runtimeLimit', 5);
    return r * 1000;
  }

  public getEnableTestListCaching(): boolean {
    return this._getNewOrOldOrDefAndMigrate<boolean>('discovery.testListCaching', false);
  }

  public getGoogleTestTreatGMockWarningAs(): 'nothing' | 'failure' {
    return this._getNewOrOldOrDefAndMigrate<'nothing' | 'failure'>('gtest.treatGmockWarningAs', 'nothing');
  }

  public getGoogleTestGMockVerbose(): 'default' | 'info' | 'warning' | 'error' {
    return this._getNewOrOldOrDefAndMigrate<'default' | 'info' | 'warning' | 'error'>('gtest.gmockVerbose', 'default');
  }

  public getExecutables(shared: SharedVariables, variableToValue: [string, string][]): ExecutableConfig[] {
    const defaultCwd = this.getDefaultCwd() || '${absDirpath}';
    const defaultEnv = this.getDefaultEnvironmentVariables() || {};

    type ExecOldType = null | string | string[] | { [prop: string]: string } | ({ [prop: string]: string } | string)[];

    let configExecs: ExecOldType | undefined = this._getNewOrOldAndMigrate<ExecOldType>('test.executables');

    if (configExecs === null) {
      //disabled
      return [];
    }

    if (Array.isArray(configExecs) && configExecs.length === 0) {
      configExecs = this._new.get<ExecOldType>(
        'test.executable',
        '{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*',
      );
    }

    const executables: ExecutableConfig[] = [];

    this._log.setContext('executables', { executables: configExecs });

    // eslint-disable-next-line
    const createFromObject = (obj: { [prop: string]: any }): ExecutableConfig => {
      const name: string | undefined = typeof obj.name === 'string' ? obj.name : undefined;

      const description: string | undefined = typeof obj.description === 'string' ? obj.description : undefined;

      let pattern = '';
      {
        if (typeof obj.pattern == 'string') pattern = obj.pattern;
        else if (typeof obj.path == 'string') pattern = obj.path;
        else {
          this._log.debug('pattern property is required', obj);
          throw Error('pattern property is required.');
        }
      }

      const cwd: string | undefined = typeof obj.cwd === 'string' ? obj.cwd : undefined;

      const env: { [prop: string]: string } | undefined = typeof obj.env === 'object' ? obj.env : undefined;

      const dependsOn: string[] = Array.isArray(obj.dependsOn) ? obj.dependsOn.filter(v => typeof v === 'string') : [];

      const parallelizationLimit: number = typeof obj.parallelizationLimit === 'number' ? obj.parallelizationLimit : 1;

      const testGrouping: object = obj.testGrouping ? obj.testGrouping : undefined;

      // eslint-disable-next-line
      const framework = (obj: any): ExecutableConfigFrameworkSpecific => {
        const r: ExecutableConfigFrameworkSpecific = {};
        if (typeof obj === 'object') {
          if (typeof obj.helpRegex === 'string') r.helpRegex = obj['helpRegex'];

          if (
            Array.isArray(obj.prependTestRunningArgs) &&
            // eslint-disable-next-line
            (obj.prependTestRunningArgs as any[]).every(x => typeof x === 'string')
          )
            r.prependTestRunningArgs = obj.prependTestRunningArgs;

          if (
            Array.isArray(obj.prependTestListingArgs) &&
            // eslint-disable-next-line
            (obj.prependTestListingArgs as any[]).every(x => typeof x === 'string')
          )
            r.prependTestListingArgs = obj.prependTestListingArgs;

          if (obj.ignoreTestEnumerationStdErr) r.ignoreTestEnumerationStdErr = obj.ignoreTestEnumerationStdErr;

          if (obj.testGrouping) r.testGrouping = obj.testGrouping;
          else if (testGrouping) r.testGrouping = testGrouping;
        }
        return r;
      };

      return new ExecutableConfig(
        shared,
        pattern,
        name,
        description,
        cwd,
        env,
        dependsOn,
        parallelizationLimit,
        defaultCwd,
        defaultEnv,
        variableToValue,
        framework(obj['catch2']),
        framework(obj['gtest']),
        framework(obj['doctest']),
      );
    };

    if (typeof configExecs === 'string') {
      if (configExecs.length == 0) return [];
      executables.push(
        new ExecutableConfig(
          shared,
          configExecs,
          undefined,
          undefined,
          undefined,
          undefined,
          [],
          1,
          defaultCwd,
          defaultEnv,
          variableToValue,
          {},
          {},
          {},
        ),
      );
    } else if (Array.isArray(configExecs)) {
      for (let i = 0; i < configExecs.length; ++i) {
        const configExec = configExecs[i];
        if (typeof configExec === 'string') {
          const configExecsName = String(configExec);
          if (configExecsName.length > 0) {
            executables.push(
              new ExecutableConfig(
                shared,
                configExecsName,
                undefined,
                undefined,
                undefined,
                undefined,
                [],
                1,
                defaultCwd,
                defaultEnv,
                variableToValue,
                {},
                {},
                {},
              ),
            );
          }
        } else if (typeof configExec === 'object') {
          try {
            executables.push(createFromObject(configExec));
          } catch (e) {
            this._log.warn(e, configExec);
            throw e;
          }
        } else {
          this._log.error('_getExecutables', configExec, i);
        }
      }
    } else if (configExecs === null || configExecs === undefined) {
      return [];
    } else if (typeof configExecs === 'object') {
      try {
        executables.push(createFromObject(configExecs));
      } catch (e) {
        this._log.warn(e, configExecs);
        throw e;
      }
    } else {
      this._log.error("executables couldn't be recognised:", executables);
      throw new Error('Config error: wrong type: executables');
    }

    return executables;
  }
}
