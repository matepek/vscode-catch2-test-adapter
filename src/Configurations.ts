import * as vscode from 'vscode';
import { LoggerWrapper } from './LoggerWrapper';
import { ExecutableConfig, ExecutableConfigFrameworkSpecific, RunTask } from './ExecutableConfig';
import { SharedVariables } from './SharedVariables';
import { hashString } from './Util';
import { performance } from 'perf_hooks';
import { TestGrouping } from './TestGroupingInterface';
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

export type Config =
  | 'test.executables'
  | 'test.parallelExecutionOfExecutableLimit'
  | 'test.advancedExecutables'
  | 'test.workingDirectory'
  | 'test.randomGeneratorSeed'
  | 'test.runtimeLimit'
  | 'test.parallelExecutionLimit'
  | 'discovery.gracePeriodForMissing'
  | 'discovery.retireDebounceLimit'
  | 'discovery.runtimeLimit'
  | 'discovery.testListCaching'
  | 'discovery.strictPattern'
  | 'debug.configTemplate'
  | 'debug.breakOnFailure'
  | 'debug.noThrow'
  | 'log.logpanel'
  | 'log.logfile'
  | 'log.logSentry'
  | 'log.userId'
  | 'gtest.treatGmockWarningAs'
  | 'gtest.gmockVerbose';

class ConfigurationChangeEvent {
  public constructor(private readonly event: vscode.ConfigurationChangeEvent) {}
  affectsConfiguration(config: Config, resource?: vscode.Uri): boolean {
    return this.event.affectsConfiguration(`${ConfigSectionBase}.${config}`, resource);
  }
}

interface ExecutableObjBase {
  comment?: string;
  pattern?: string;
  name?: string;
  description?: string;
  cwd?: string;
  env?: { [key: string]: string };
  envFile?: string;
  dependsOn?: string[];
  runTask?: RunTask;
  parallelizationLimit?: number;
  strictPattern?: boolean;
  catch2?: ExecutableConfigFrameworkSpecific;
  gtest?: ExecutableConfigFrameworkSpecific;
  doctest?: ExecutableConfigFrameworkSpecific;
  testGrouping?: TestGrouping; //undocumented
}

type Scopes = { [scope in NodeJS.Platform]?: ExecutableObjBase };

interface ExecutableObj extends ExecutableObjBase, Scopes {}

///

export class Configurations {
  private _new: vscode.WorkspaceConfiguration;

  public constructor(public _log: LoggerWrapper, private _workspaceFolderUri: vscode.Uri) {
    this._new = vscode.workspace.getConfiguration(ConfigSectionBase, _workspaceFolderUri);
  }

  // eslint-disable-next-line
  public getValues(): { test: any; discovery: any; debug: any; log: any; gtest: any } {
    return {
      test: this._new.get(Section.test),
      discovery: this._new.get(Section.discovery),
      debug: this._new.get(Section.debug),
      log: this._new.get(Section.log),
      gtest: this._new.get(Section.gtest),
    };
  }

  public static onDidChange(callbacks: (changeEvent: ConfigurationChangeEvent) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(changeEvent =>
      callbacks(new ConfigurationChangeEvent(changeEvent)),
    );
  }

  public getDebugConfigurationTemplate(): [vscode.DebugConfiguration, string] {
    const templateFromConfig = this._new.get<Record<string, unknown> | null | 'extensionOnly'>(
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
    let userId = this._new.get<string>('log.userId');

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
    const val = this._new.get('log.logSentry');
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

    const logSentry = this._new.get<SentryValue>(logSentryConfig, 'question');

    if (logSentry === 'question' || logSentry === 'disable' || logSentry === 'disable_1' || logSentry === 'disable_2') {
      const options = [
        'Sure! I love this extension and happy to help.',
        'Yes, but exclude current workspace',
        'Over my dead body (No)',
      ];
      vscode.window
        .showInformationMessage(
          'Hey there! C++ TestMate has [sentry.io](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/log.logSentry.md) integration to ' +
            'improve the stability and the development. 🤩 For this I want to send logs and errors ' +
            'but I would NEVER do it without your consent. ' +
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
    return this._new.get<boolean>('debug.breakOnFailure', true);
  }

  public getDefaultNoThrow(): boolean {
    return this._new.get<boolean>('debug.noThrow', false);
  }

  public getDefaultCwd(): string {
    const dirname = this._workspaceFolderUri.fsPath;
    return this._new.get<string>('test.workingDirectory', dirname);
  }

  public getRandomGeneratorSeed(): 'time' | number | null {
    const val = this._new.get<string>('test.randomGeneratorSeed', 'time');
    if (val === 'time') return val;
    if (val === '') return null;
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
    else return null;
  }

  public getParallelExecutionLimit(): number {
    const res = Math.max(1, this._new.get<number>('test.parallelExecutionLimit', 1));
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
    const res = this._new.get<number>('discovery.gracePeriodForMissing', 10) * 1000;
    return res;
  }

  public getRetireDebounceTime(): number {
    const res = this._new.get<number>('discovery.retireDebounceLimit', 1000);
    return res;
  }

  public getExecRunningTimeout(): null | number {
    const r = this._new.get<null | number>('test.runtimeLimit', null);
    return r !== null && r > 0 ? r * 1000 : null;
  }

  public getExecParsingTimeout(): number {
    const r = this._new.get<number>('discovery.runtimeLimit', 5);
    return r * 1000;
  }

  public getEnableTestListCaching(): boolean {
    return this._new.get<boolean>('discovery.testListCaching', false);
  }

  public getEnableStrictPattern(): boolean {
    return this._new.get<boolean>('discovery.strictPattern', false);
  }

  public getGoogleTestTreatGMockWarningAs(): 'nothing' | 'failure' {
    return this._new.get<'nothing' | 'failure'>('gtest.treatGmockWarningAs', 'nothing');
  }

  public getGoogleTestGMockVerbose(): 'default' | 'info' | 'warning' | 'error' {
    return this._new.get<'default' | 'info' | 'warning' | 'error'>('gtest.gmockVerbose', 'default');
  }

  public async getExecutables(shared: SharedVariables): Promise<ExecutableConfig[]> {
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
        undefined,
        [],
        { before: [], beforeEach: [], after: [], afterEach: [] },
        defaultParallelExecutionOfExecLimit,
        false,
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

      const createExecutableConfigFromObj = (origObj: ExecutableObj): ExecutableConfig => {
        const obj: ExecutableObj = Object.assign({}, origObj);

        if (typeof origObj[process.platform] === 'object') Object.assign(obj, origObj[process.platform]);

        const name: string | undefined = typeof obj.name === 'string' ? obj.name : undefined;

        const description: string | undefined = typeof obj.description === 'string' ? obj.description : undefined;

        let pattern = '';
        {
          if (typeof obj.pattern == 'string') pattern = obj.pattern;
          else {
            this._log.warn('pattern property is required', obj);
            throw Error('pattern property is required.');
          }
        }

        const cwd: string = typeof obj.cwd === 'string' ? obj.cwd : defaultCwd;

        const env: { [prop: string]: string } | undefined = typeof obj.env === 'object' ? obj.env : undefined;

        const envFile: string | undefined = typeof obj.envFile === 'string' ? obj.envFile : undefined;

        const dependsOn: string[] = Array.isArray(obj.dependsOn)
          ? obj.dependsOn.filter(v => typeof v === 'string')
          : [];

        const runTask: RunTask =
          typeof obj.runTask === 'object'
            ? {
                before: obj.runTask.before || [],
                beforeEach: obj.runTask.beforeEach || [],
                after: obj.runTask.after || [],
                afterEach: obj.runTask.afterEach || [],
              }
            : { before: [], beforeEach: [], after: [], afterEach: [] };

        const parallelizationLimit: number =
          typeof obj.parallelizationLimit === 'number' && !Number.isNaN(obj.parallelizationLimit)
            ? Math.max(1, obj.parallelizationLimit)
            : defaultParallelExecutionOfExecLimit;

        const strictPattern: boolean | undefined = obj.strictPattern;

        const defaultTestGrouping = obj.testGrouping ? obj.testGrouping : undefined;

        return new ExecutableConfig(
          shared,
          pattern,
          name,
          description,
          cwd,
          env,
          envFile,
          dependsOn,
          runTask,
          parallelizationLimit,
          strictPattern,
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
      if (obj.testGrouping) r.testGrouping = obj.testGrouping;
      else r.testGrouping = defaultTestGrouping;

      r.helpRegex = obj['helpRegex'];

      if (Array.isArray(obj.prependTestRunningArgs) && obj.prependTestRunningArgs.every(x => typeof x === 'string'))
        r.prependTestRunningArgs = obj.prependTestRunningArgs;

      if (Array.isArray(obj.prependTestListingArgs) && obj.prependTestListingArgs.every(x => typeof x === 'string'))
        r.prependTestListingArgs = obj.prependTestListingArgs;

      r.ignoreTestEnumerationStdErr = obj.ignoreTestEnumerationStdErr;

      r['debug.enableOutputColouring'] = obj['debug.enableOutputColouring'];
    }

    return r;
  }

  //public static readonly PublicKey: string = '';
}
