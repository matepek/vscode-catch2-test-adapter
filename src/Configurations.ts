import * as vscode from 'vscode';
import { LoggerWrapper } from './LoggerWrapper';
import { ExecutableConfig, ExecutableConfigFrameworkSpecific, RunTask } from './ExecutableConfig';
import { SharedVariables } from './SharedVariables';
import { hashString } from './Util';
import { performance } from 'perf_hooks';
import { TestGrouping } from './TestGroupingInterface';
import { ResolveRule } from './util/ResolveRule';
//import * as crypto from 'crypto';

type SentryValue = 'question' | 'enable' | 'enabled' | 'disable' | 'disable_1' | 'disable_2' | 'disable_3';

const ConfigSectionBase = 'testMate.cpp';

const enum Section {
  'test' = 'test',
  'discovery' = 'discovery',
  'debug' = 'debug',
  'log' = 'log',
  'gtest' = 'gtest',
}

type MigratableConfig =
  | 'test.advancedExecutables'
  | 'test.workingDirectory'
  | 'test.randomGeneratorSeed'
  | 'test.runtimeLimit'
  | 'test.parallelExecutionLimit'
  | 'discovery.gracePeriodForMissing'
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

export type Config = 'test.executables' | 'test.parallelExecutionOfExecutableLimit' | MigratableConfig;

const OldConfigSectionBase = 'catch2TestExplorer';

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
  'test.advancedExecutables': 'executables',
  'test.workingDirectory': 'defaultCwd',
  'test.randomGeneratorSeed': 'defaultRngSeed',
  'test.runtimeLimit': 'defaultRunningTimeoutSec',
  'test.parallelExecutionLimit': 'workerMaxNumber',
  'discovery.gracePeriodForMissing': 'defaultWatchTimeoutSec',
  'discovery.retireDebounceLimit': 'retireDebounceTimeMilisec',
  'discovery.runtimeLimit': 'defaultExecParsingTimeoutSec',
  'discovery.testListCaching': 'enableTestListCaching',
  'debug.configTemplate': 'debugConfigTemplate',
  'debug.breakOnFailure': 'debugBreakOnFailure',
  'debug.noThrow': 'defaultNoThrow',
  'log.logpanel': 'logpanel',
  'log.logfile': 'logfile',
  'log.logSentry': 'logSentry',
  'log.userId': 'userId',
  'gtest.treatGmockWarningAs': 'googletest.treatGmockWarningAs',
  'gtest.gmockVerbose': 'googletest.gmockVerbose',
};

class ConfigurationChangeEvent {
  public constructor(private readonly event: vscode.ConfigurationChangeEvent) {}
  affectsConfiguration(config: Config, resource?: vscode.Uri): boolean {
    return this.event.affectsConfiguration(`${ConfigSectionBase}.${config}`, resource);
  }
}

interface ExecutableObj {
  comment?: string;
  pattern?: string;
  name?: string;
  description?: string;
  cwd?: string;
  env?: { [key: string]: string };
  dependsOn?: string[];
  runTask?: RunTask;
  parallelizationLimit?: number;
  catch2?: ExecutableConfigFrameworkSpecific;
  gtest?: ExecutableConfigFrameworkSpecific;
  doctest?: ExecutableConfigFrameworkSpecific;
  testGrouping?: TestGrouping; //undocumented
}

///

export class Configurations {
  private _old: vscode.WorkspaceConfiguration;
  private _new: vscode.WorkspaceConfiguration;

  public constructor(public _log: LoggerWrapper, private _workspaceFolderUri: vscode.Uri) {
    this._old = vscode.workspace.getConfiguration(OldConfigSectionBase, _workspaceFolderUri);
    this._new = vscode.workspace.getConfiguration(ConfigSectionBase, _workspaceFolderUri);

    this._getNewOrOldAndMigrate('log.logpanel'); // force migrate
    this._getNewOrOldAndMigrate('log.logfile'); // force migrate
  }

  // eslint-disable-next-line
  public getValues(): { test: any; discovery: any; debug: any; log: any; gtest: any; depricated: any } {
    return {
      test: this._new.get(Section.test),
      discovery: this._new.get(Section.discovery),
      debug: this._new.get(Section.debug),
      log: this._new.get(Section.log),
      gtest: this._new.get(Section.gtest),
      depricated: this._old.get(OldConfigSectionBase),
    };
  }

  private _isDefinedConfig<T>(config: {
    key: string;
    defaultValue?: T;
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
  }): boolean {
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

      const oldVal = this._old.get<T>(oldName);

      if (oldVals.globalValue !== undefined)
        this._new
          .update(newName, oldVals.globalValue, vscode.ConfigurationTarget.Global)
          .then(undefined, e => this._log.exceptionS(e));

      if (oldVals.workspaceValue !== undefined)
        this._new
          .update(newName, oldVals.workspaceValue, vscode.ConfigurationTarget.Workspace)
          .then(undefined, e => this._log.exceptionS(e));

      if (oldVals.workspaceFolderValue !== undefined)
        this._new
          .update(newName, oldVals.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder)
          .then(undefined, e => this._log.exceptionS(e));

      if (oldVals.globalValue !== undefined)
        this._old
          .update(oldName, undefined, vscode.ConfigurationTarget.Global)
          .then(undefined, e => this._log.exceptionS(e));

      if (oldVals.workspaceValue !== undefined)
        this._old
          .update(oldName, undefined, vscode.ConfigurationTarget.Workspace)
          .then(undefined, e => this._log.exceptionS(e));

      if (oldVals.workspaceFolderValue !== undefined)
        this._old
          .update(oldName, undefined, vscode.ConfigurationTarget.WorkspaceFolder)
          .then(undefined, e => this._log.exceptionS(e));

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

  public getDebugConfigurationTemplate(): [vscode.DebugConfiguration, string] {
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
      this._log.debug('debugConfig', debugConfig);
      return [debugConfig, 'userDefined'];
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
            const debugConfig: vscode.DebugConfiguration = Object.assign({}, wpLaunchConfigs[i], {
              name: '${label} (${suiteLabel})',
              program: '${exec}',
              target: '${exec}',
              arguments: '${argsStr}',
              args: '${args}',
              cwd: '${cwd}',
              env: '${envObj}',
            });
            this._log.info(
              "using debug config from launch.json. If it doesn't work for you please read the manual: https://github.com/matepek/vscode-catch2-test-adapter#or-user-can-manually-fill-it",
              debugConfig,
            );
            return [debugConfig, 'fromLaunchJson'];
          }
        }
      }
    }

    const template: vscode.DebugConfiguration = {
      name: '${label} (${suiteLabel})',
      request: 'launch',
      type: 'cppdbg',
    };
    let source = 'unknown';

    if (vscode.extensions.getExtension('vadimcn.vscode-lldb')) {
      source = 'vadimcn.vscode-lldb';
      Object.assign(template, {
        type: 'cppdbg',
        MIMode: 'lldb',
        program: '${exec}',
        args: '${args}',
        cwd: '${cwd}',
        env: '${envObj}',
      });
    } else if (vscode.extensions.getExtension('webfreak.debug')) {
      source = 'webfreak.debug';
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
      source = 'ms-vscode.cpptools';
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
        "For debugging 'testMate.cpp.debug.configTemplate' should be set: https://github.com/matepek/vscode-catch2-test-adapter#or-user-can-manually-fill-it",
      );
    }
    return [template, source];
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

  // public static decrypt(encryptedMsg: string): string {
  //   const buffer = Buffer.from(encryptedMsg, 'base64');
  //   const decrypted = crypto.privateDecrypt(Configurations.PublicKey, buffer);
  //   return decrypted.toString('utf8');
  // }

  public isSentryEnabled(): boolean {
    const val = this._getNewOrOldAndMigrate('log.logSentry');
    return val === 'enable' || val === 'enabled';
  }

  public askSentryConsent(): void {
    const envAskSentry = process.env['TESTMATE_CPP_ASKSENTRYCONSENT'];
    if (envAskSentry === 'disabled_3') {
      return;
      //const decrypted = Configurations.decrypt(process.env['TESTMATE_CPP_LOGSENTRY']);
      //if (decrypted === 'disable_3') return;
    }

    const logSentryConfig: Config = 'log.logSentry';

    const logSentry = this._getNewOrOldOrDefAndMigrate<SentryValue>(logSentryConfig, 'question');

    if (logSentry === 'question' || logSentry === 'disable' || logSentry === 'disable_1' || logSentry === 'disable_2') {
      const options = [
        'Sure! I love this extension and happy to help.',
        'Yes, but exclude current workspace',
        'Over my dead body (No)',
      ];
      vscode.window
        .showInformationMessage(
          'Hey there! C++ TestMate has [sentry.io](https://sentry.io/welcome) integration to ' +
            'improve the stability and the development. 🤩 For this I want to send logs and errors ' +
            'to [sentry.io](https://sentry.io/welcome) but I would NEVER do it without your consent. ' +
            'Please be understandable and allow it. 🙏',
          ...options,
        )
        .then((value: string | undefined) => {
          this._log.info('Sentry consent', value);

          if (value === options[0]) {
            this._new
              .update(logSentryConfig, 'enable', vscode.ConfigurationTarget.Global)
              .then(undefined, e => this._log.exceptionS(e));
          } else if (value === options[1]) {
            this._new
              .update(logSentryConfig, 'enable', vscode.ConfigurationTarget.Global)
              .then(undefined, e => this._log.exceptionS(e));
            this._new
              .update(logSentryConfig, 'disable_3', vscode.ConfigurationTarget.WorkspaceFolder)
              .then(undefined, e => this._log.exceptionS(e));
          } else if (value === options[2]) {
            this._new
              .update(logSentryConfig, 'disable_3', vscode.ConfigurationTarget.Global)
              .then(undefined, e => this._log.exceptionS(e));
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

  public getRandomGeneratorSeed(): 'time' | number | null {
    const val = this._getNewOrOldOrDefAndMigrate<string>('test.randomGeneratorSeed', 'time');
    if (val === 'time') return val;
    if (val === '') return null;
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
    else return null;
  }

  public getParallelExecutionLimit(): number {
    const res = Math.max(1, this._getNewOrOldOrDefAndMigrate<number>('test.parallelExecutionLimit', 1));
    if (typeof res != 'number') return 1;
    else {
      if (res > 1) this._log.infoS('Using test.parallelExecutionLimit');
      return res;
    }
  }

  public getParallelExecutionOfExecutableLimit(): number {
    const cfgName: Config = 'test.parallelExecutionOfExecutableLimit';
    const res = Math.max(1, this._new.get<number>(cfgName, 1));
    if (typeof res != 'number' || Number.isNaN(res)) return 1;
    else {
      if (res > 1) this._log.infoS(cfgName, res);
      return res;
    }
  }

  public getExecWatchTimeout(): number {
    const res = this._getNewOrOldOrDefAndMigrate<number>('discovery.gracePeriodForMissing', 10) * 1000;
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

  public async getExecutables(shared: SharedVariables, variableToValue: ResolveRule[]): Promise<ExecutableConfig[]> {
    type ExecOldType = null | string | string[] | ExecutableObj | (ExecutableObj | string)[];

    const oldVals = this._old.inspect<ExecOldType>('executables');

    if (oldVals !== undefined && this._isDefinedConfig(oldVals)) {
      const migrate = async (oldVal: ExecOldType | undefined, target: vscode.ConfigurationTarget): Promise<void> => {
        if (oldVal === undefined) return;

        const update = async (simpleVal: string | undefined, val: ExecutableObj[] | undefined): Promise<void> => {
          const newNameSimple: Config = 'test.executables';
          const newName: Config = 'test.advancedExecutables';
          await this._new.update(newNameSimple, simpleVal, target).then(undefined, e => this._log.exceptionS(e));
          await this._new.update(newName, val, target).then(undefined, e => this._log.exceptionS(e));
          this._old.update(MigrationV1V2NamePairs[newName], undefined, target);
        };

        // null means disabled in case of old
        // in case of new ('', undefined|[] means disabled)
        if (oldVal === null) {
          await update('', undefined);
        } else if (typeof oldVal === 'string') {
          await update(oldVal, undefined);
        } else if (Array.isArray(oldVal)) {
          const newVals: ExecutableObj[] = [];
          for (const v of oldVal) {
            if (typeof v === 'string') {
              newVals.push({ pattern: v });
            } else if (typeof v === 'object') {
              newVals.push(v);
            } else {
              this._log.errorS('unhandled config case', v, oldVal, target);
            }
          }
          if (newVals.length === 0) {
            await update('', undefined);
          } else if (newVals.length === 1 && Object.keys(newVals[0]).length === 1 && newVals[0].pattern !== undefined) {
            await update(newVals[0].pattern, undefined);
          } else {
            await update(undefined, newVals);
          }
        } else if (typeof oldVal === 'object') {
          if (Object.keys(oldVal).length === 1 && oldVal.pattern !== undefined) {
            await update(oldVal.pattern, undefined);
          } else {
            await update(undefined, [oldVal as ExecutableObj]);
          }
        } else {
          this._log.errorS('unhandled config case', oldVal, target);
        }
      };

      // we dont have to wait for the result another change will be triggered
      migrate(oldVals.globalValue, vscode.ConfigurationTarget.Global);
      migrate(oldVals.workspaceValue, vscode.ConfigurationTarget.Workspace);
      migrate(oldVals.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder);
    }

    const defaultCwd = this.getDefaultCwd() || '${absDirpath}';
    const defaultParallelExecutionOfExecLimit = this.getParallelExecutionOfExecutableLimit() || 1;

    const createExecutableConfigFromPattern = (pattern: string): ExecutableConfig => {
      return new ExecutableConfig(
        shared,
        pattern,
        undefined,
        undefined,
        defaultCwd,
        undefined,
        [],
        { before: [], beforeEach: [] },
        defaultParallelExecutionOfExecLimit,
        variableToValue,
        {},
        {},
        {},
      );
    };

    const [advanced, simple] = ((): [ExecutableObj[] | undefined, string | undefined] => {
      const advanced = this._new.inspect<ExecutableObj[]>('test.advancedExecutables');
      const simple = this._new.inspect<string>('test.executables');

      if (advanced === undefined || simple === undefined) {
        this._log.errorS('advanced === undefined || simple === undefined', advanced, simple);
        throw Error('Assertion. Please file an issue.');
      }

      if (advanced.workspaceFolderValue !== undefined || simple.workspaceFolderValue !== undefined)
        return [advanced.workspaceFolderValue, simple.workspaceFolderValue];
      if (advanced.workspaceValue !== undefined || simple.workspaceValue !== undefined)
        return [advanced.workspaceValue, simple.workspaceValue];
      if (advanced.globalValue !== undefined || simple.globalValue !== undefined)
        return [advanced.globalValue, simple.globalValue];
      if (advanced.defaultValue !== undefined || simple.defaultValue !== undefined)
        return [advanced.defaultValue, simple.defaultValue];
      else return [undefined, undefined];
    })();

    if (advanced === undefined || (Array.isArray(advanced) && advanced.length === 0)) {
      this._log.info('`test.advancedExecutables` is not defined. trying to use `test.executables`');

      if (simple === undefined) {
        return [createExecutableConfigFromPattern('{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*')];
      } else if (typeof simple === 'string') {
        if (simple.length === 0) {
          // disabled
          return [];
        } else {
          return [createExecutableConfigFromPattern(simple)];
        }
      } else {
        this._log.warn('test.executables should be an string or undefined', simple);
        throw Error(
          "`test.executables` couldn't be recognised. It should be a string. For fine-tuning use `test.advancedExecutables`.",
        );
      }
    } else if (Array.isArray(advanced)) {
      const executables: ExecutableConfig[] = [];

      this._log.setContext('executables', advanced);

      const createExecutableConfigFromObj = (obj: ExecutableObj): ExecutableConfig => {
        const name: string | undefined = typeof obj.name === 'string' ? obj.name : undefined;

        const description: string | undefined = typeof obj.description === 'string' ? obj.description : undefined;

        let pattern = '';
        {
          if (typeof obj.pattern == 'string') pattern = obj.pattern;
          else {
            this._log.debug('pattern property is required', obj);
            throw Error('pattern property is required.');
          }
        }

        const cwd: string = typeof obj.cwd === 'string' ? obj.cwd : defaultCwd;

        const env: { [prop: string]: string } | undefined = typeof obj.env === 'object' ? obj.env : undefined;

        const dependsOn: string[] = Array.isArray(obj.dependsOn)
          ? obj.dependsOn.filter(v => typeof v === 'string')
          : [];

        const runTask: RunTask =
          typeof obj.runTask === 'object'
            ? { before: obj.runTask.before || [], beforeEach: obj.runTask.beforeEach || [] }
            : { before: [], beforeEach: [] };

        const parallelizationLimit: number =
          typeof obj.parallelizationLimit === 'number' && !Number.isNaN(obj.parallelizationLimit)
            ? Math.max(1, obj.parallelizationLimit)
            : defaultParallelExecutionOfExecLimit;

        const defaultTestGrouping = obj.testGrouping ? obj.testGrouping : undefined;

        return new ExecutableConfig(
          shared,
          pattern,
          name,
          description,
          cwd,
          env,
          dependsOn,
          runTask,
          parallelizationLimit,
          variableToValue,
          this._getFrameworkSpecificSettings(defaultTestGrouping, obj['catch2']),
          this._getFrameworkSpecificSettings(defaultTestGrouping, obj['gtest']),
          this._getFrameworkSpecificSettings(defaultTestGrouping, obj['doctest']),
        );
      };

      for (const conf of advanced) {
        if (typeof conf === 'string') {
          // this is not supported in the package.json but working
          executables.push(createExecutableConfigFromPattern(conf));
        } else {
          executables.push(createExecutableConfigFromObj(conf));
        }
      }

      return executables;
    } else {
      this._log.warn('test.advancedExecutables should be an array or undefined', advanced);
      throw Error("`test.advancedExecutables` couldn't be recognised");
    }
  }

  private _getFrameworkSpecificSettings(
    defaultTestGrouping: TestGrouping | undefined,
    obj?: ExecutableConfigFrameworkSpecific,
  ): ExecutableConfigFrameworkSpecific {
    const r: ExecutableConfigFrameworkSpecific = {};
    if (typeof obj === 'object') {
      if (typeof obj.helpRegex === 'string') r.helpRegex = obj['helpRegex'];

      if (Array.isArray(obj.prependTestRunningArgs) && obj.prependTestRunningArgs.every(x => typeof x === 'string'))
        r.prependTestRunningArgs = obj.prependTestRunningArgs;

      if (Array.isArray(obj.prependTestListingArgs) && obj.prependTestListingArgs.every(x => typeof x === 'string'))
        r.prependTestListingArgs = obj.prependTestListingArgs;

      if (obj.ignoreTestEnumerationStdErr) r.ignoreTestEnumerationStdErr = obj.ignoreTestEnumerationStdErr;

      if (obj.testGrouping) r.testGrouping = obj.testGrouping;
      else r.testGrouping = defaultTestGrouping;
    }

    return r;
  }

  //public static readonly PublicKey: string = '';
}
