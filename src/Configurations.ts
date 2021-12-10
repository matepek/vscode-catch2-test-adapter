import * as vscode from 'vscode';
import { LoggerWrapper } from './LoggerWrapper';
import { ExecutableConfig } from './ExecutableConfig';
import { WorkspaceShared } from './WorkspaceShared';
import { hashString } from './Util';
import { performance } from 'perf_hooks';
import { TestGrouping } from './TestGroupingInterface';
import {
  AdvancedExecutable,
  AdvancedExecutableArray,
  FrameworkSpecific,
  RunTask,
  ExecutionWrapper,
} from './AdvancedExecutableInterface';
import { platformUtil } from './util/Platform';

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
  constructor(private readonly event: vscode.ConfigurationChangeEvent) {}
  affectsConfiguration(config: Config, resource?: vscode.Uri): boolean {
    return this.event.affectsConfiguration(`${ConfigSectionBase}.${config}`, resource);
  }
}

///

export class Configurations {
  private _cfg: vscode.WorkspaceConfiguration;

  constructor(readonly _log: LoggerWrapper, private _workspaceFolderUri: vscode.Uri) {
    this._cfg = vscode.workspace.getConfiguration(ConfigSectionBase, _workspaceFolderUri);
  }

  private _get<T>(section: Config): T | undefined {
    return this._cfg.get<T>(section);
  }

  private _getD<T>(section: string, defaultValue: T): T {
    return this._cfg.get<T>(section, defaultValue);
  }

  // eslint-disable-next-line
  getValues(): { test: any; discovery: any; debug: any; log: any; gtest: any } {
    return {
      test: this._cfg.get(Section.test),
      discovery: this._cfg.get(Section.discovery),
      debug: this._cfg.get(Section.debug),
      log: this._cfg.get(Section.log),
      gtest: this._cfg.get(Section.gtest),
    };
  }

  static onDidChange(callbacks: (changeEvent: ConfigurationChangeEvent) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(changeEvent =>
      callbacks(new ConfigurationChangeEvent(changeEvent)),
    );
  }

  private _hasExtension(id: string): boolean {
    return vscode.extensions.all.find(e => e.id === id) !== undefined;
  }

  getDebugConfigurationTemplate(): DebugConfigData {
    const debugConfigData = ((): DebugConfigData => {
      const templateFromConfig = this._getD<vscode.DebugConfiguration | null | 'extensionOnly'>(
        'debug.configTemplate',
        null,
      );

      const template: vscode.DebugConfiguration = {
        name: '${label} (${suiteLabel})',
        request: 'launch',
        type: 'cppdbg',
      };

      if (typeof templateFromConfig === 'object' && templateFromConfig !== null) {
        Object.assign(template, templateFromConfig);
        this._log.debug('template', template);

        return { template, source: 'userDefined', launchSourceFileMap: {} };
      } else if (templateFromConfig === null) {
        const wpLaunchConfigs = vscode.workspace
          .getConfiguration('launch', this._workspaceFolderUri)
          .get('configurations');

        if (wpLaunchConfigs && Array.isArray(wpLaunchConfigs) && wpLaunchConfigs.length > 0) {
          for (let i = 0; i < wpLaunchConfigs.length; ++i) {
            if (wpLaunchConfigs[i].request !== 'launch') continue;

            const platformProp = platformUtil.getPlatformProperty(wpLaunchConfigs[i]);
            if (typeof platformProp?.type == 'string') {
              if (
                platformProp.type.startsWith('cpp') ||
                platformProp.type.startsWith('lldb') ||
                platformProp.type.startsWith('gdb')
              ) {
                // skip
              } else {
                continue;
              }
            } else if (typeof wpLaunchConfigs[i].type == 'string') {
              if (
                wpLaunchConfigs[i].type.startsWith('cpp') ||
                wpLaunchConfigs[i].type.startsWith('lldb') ||
                wpLaunchConfigs[i].type.startsWith('gdb')
              ) {
                // skip
              } else {
                continue;
              }
            } else {
              continue;
            }

            // putting as much known properties as much we can and hoping for the best 🤞
            Object.assign(template, wpLaunchConfigs[i], {
              program: '${exec}',
              target: '${exec}',
              arguments: '${argsStr}',
              args: '${argsArray}',
              cwd: '${cwd}',
              env: '${envObj}',
              environment: '${envObjArray}',
              sourceFileMap: '${sourceFileMapObj}',
            });

            this._log.info(
              "using debug config from launch.json. If it doesn't work for you please read the manual: https://github.com/matepek/vscode-catch2-test-adapter#or-user-can-manually-fill-it",
              template,
            );

            return { template, source: 'fromLaunchJson', launchSourceFileMap: wpLaunchConfigs[i].sourceFileMap };
          }
        }
      }

      if (this._hasExtension('vadimcn.vscode-lldb')) {
        Object.assign(template, {
          type: 'cppdbg',
          MIMode: 'lldb',
          program: '${exec}',
          args: '${argsArray}',
          cwd: '${cwd}',
          env: '${envObj}',
          sourceMap: '${sourceFileMapObj}',
        });

        return { template, source: 'vadimcn.vscode-lldb', launchSourceFileMap: {} };
      } else if (this._hasExtension('webfreak.debug')) {
        Object.assign(template, {
          type: 'gdb',
          target: '${exec}',
          arguments: '${argsStr}',
          cwd: '${cwd}',
          env: '${envObj}',
          valuesFormatting: 'prettyPrinters',
          pathSubstitutions: '${sourceFileMapObj}',
        });

        if (platformUtil.is('darwin')) {
          template.type = 'lldb-mi';
          // Note: for LLDB you need to have lldb-mi in your PATH
          // If you are on OS X you can add lldb-mi to your path using ln -s /Applications/Xcode.app/Contents/Developer/usr/bin/lldb-mi /usr/local/bin/lldb-mi if you have Xcode.
          template.lldbmipath = '/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-mi';
        }

        return { template, source: 'webfreak.debug', launchSourceFileMap: {} };
      } else if (this._hasExtension('ms-vscode.cpptools')) {
        // documentation says debug"environment" = [{...}] but that doesn't work
        Object.assign(template, {
          type: 'cppvsdbg',
          linux: { type: 'cppdbg', MIMode: 'gdb' },
          darwin: { type: 'cppdbg', MIMode: 'lldb' },
          windows: { type: 'cppvsdbg' },
          program: '${exec}',
          args: '${argsArray}',
          cwd: '${cwd}',
          env: '${envObj}',
          environment: '${envObjArray}',
          sourceFileMap: '${sourceFileMapObj}',
        });

        return { template, source: 'ms-vscode.cpptools', launchSourceFileMap: {} };
      }

      this._log.info('no debug config');
      throw Error(
        "For debugging 'testMate.cpp.debug.configTemplate' should be set: https://github.com/matepek/vscode-catch2-test-adapter#or-user-can-manually-fill-it",
      );
    })();

    const platfromProp = platformUtil.getPlatformProperty(debugConfigData.template);
    if (typeof platfromProp === 'object') Object.assign(debugConfigData.template, platfromProp);

    return debugConfigData;
  }

  getOrCreateUserId(): string {
    let userId = this._get<string>('log.userId');

    if (userId) {
      return userId;
    } else {
      let newUserId = (process.env['USER'] || process.env['USERNAME'] || 'user') + process.env['USERDOMAIN'];
      newUserId += performance.now().toString();
      newUserId += process.pid.toString();
      newUserId += Date.now().toString();
      userId = hashString(newUserId);
      this._cfg.update('log.userId', userId, vscode.ConfigurationTarget.Global);
      return userId;
    }
  }

  //  static decrypt(encryptedMsg: string): string {
  //   const buffer = Buffer.from(encryptedMsg, 'base64');
  //   const decrypted = crypto.privateDecrypt(Configurations.Key, buffer);
  //   return decrypted.toString('utf8');
  // }

  isSentryEnabled(): boolean {
    const val = this._get('log.logSentry');
    return val === 'enable' || val === 'enabled';
  }

  askSentryConsent(): void {
    const envAskSentry = process.env['TESTMATE_CPP_ASKSENTRYCONSENT'];
    if (envAskSentry === 'disabled_3') {
      return;
      //const decrypted = Configurations.decrypt(process.env['TESTMATE_CPP_LOGSENTRY']);
      //if (decrypted === 'disable_3') return;
    }

    const logSentryConfig: Config = 'log.logSentry';

    const logSentry = this._getD<SentryValue>(logSentryConfig, 'question');

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
            this._cfg
              .update(logSentryConfig, 'enable', vscode.ConfigurationTarget.Global)
              .then(undefined, e => this._log.exceptionS(e));
          } else if (value === options[1]) {
            this._cfg
              .update(logSentryConfig, 'enable', vscode.ConfigurationTarget.Global)
              .then(undefined, e => this._log.exceptionS(e));
            this._cfg
              .update(logSentryConfig, 'disable_3', vscode.ConfigurationTarget.WorkspaceFolder)
              .then(undefined, e => this._log.exceptionS(e));
          } else if (value === options[2]) {
            this._cfg
              .update(logSentryConfig, 'disable_3', vscode.ConfigurationTarget.Global)
              .then(undefined, e => this._log.exceptionS(e));
          }
        });
    }
  }

  getDebugBreakOnFailure(): boolean {
    return this._getD<boolean>('debug.breakOnFailure', true);
  }

  getDefaultNoThrow(): boolean {
    return this._getD<boolean>('debug.noThrow', false);
  }

  getDefaultCwd(): string {
    const dirname = this._workspaceFolderUri.fsPath;
    return this._getD<string>('test.workingDirectory', dirname);
  }

  getRandomGeneratorSeed(): 'time' | number | null {
    const val = this._getD<string>('test.randomGeneratorSeed', 'time');
    if (val === 'time') return val;
    if (val === '') return null;
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
    else return null;
  }

  private static _parallelExecutionLimitMetricSent = false;

  getParallelExecutionLimit(): number {
    const res = Math.max(1, this._getD<number>('test.parallelExecutionLimit', 1));
    if (typeof res != 'number') return 1;
    else {
      if (res > 1 && !Configurations._parallelExecutionLimitMetricSent) {
        this._log.infoS('Using test.parallelExecutionLimit');
        Configurations._parallelExecutionLimitMetricSent = true;
      }
      return res;
    }
  }

  getParallelExecutionOfExecutableLimit(): number {
    const cfgName: Config = 'test.parallelExecutionOfExecutableLimit';
    const res = Math.max(1, this._getD<number>(cfgName, 1));
    if (typeof res != 'number' || Number.isNaN(res)) return 1;
    else {
      if (res > 1) this._log.infoS(cfgName, res);
      return res;
    }
  }

  getExecWatchTimeout(): number {
    const res = this._getD<number>('discovery.gracePeriodForMissing', 10) * 1000;
    return res;
  }

  getExecRunningTimeout(): null | number {
    const r = this._getD<null | number>('test.runtimeLimit', null);
    return r !== null && r > 0 ? r * 1000 : null;
  }

  getExecParsingTimeout(): number {
    const r = this._getD<number>('discovery.runtimeLimit', 5);
    return r * 1000;
  }

  getEnableTestListCaching(): boolean {
    return this._getD<boolean>('discovery.testListCaching', false);
  }

  getEnableStrictPattern(): boolean {
    return this._getD<boolean>('discovery.strictPattern', false);
  }

  getGoogleTestTreatGMockWarningAs(): 'nothing' | 'failure' {
    return this._getD<'nothing' | 'failure'>('gtest.treatGmockWarningAs', 'nothing');
  }

  getGoogleTestGMockVerbose(): 'default' | 'info' | 'warning' | 'error' {
    return this._getD<'default' | 'info' | 'warning' | 'error'>('gtest.gmockVerbose', 'default');
  }

  getExecutableConfigs(shared: WorkspaceShared): ExecutableConfig[] {
    const defaultCwd = this.getDefaultCwd() || '${absDirpath}';
    const defaultParallelExecutionOfExecLimit = this.getParallelExecutionOfExecutableLimit() || 1;

    const createExecutableConfigFromPattern = (pattern: string): ExecutableConfig => {
      return new ExecutableConfig(
        shared,
        pattern,
        undefined,
        undefined,
        defaultCwd,
        this.getTerminalIntegratedEnv(),
        undefined,
        [],
        { before: [], beforeEach: [], after: [], afterEach: [] },
        defaultParallelExecutionOfExecLimit,
        false,
        undefined,
        undefined,
        undefined,
        {},
        {
          catch2: {},
          gtest: {},
          doctest: {},
          gbenchmark: {},
        },
      );
    };

    const [advanced, simple] = ((): [AdvancedExecutableArray | undefined, string | undefined] => {
      const advanced = this._cfg.inspect<AdvancedExecutableArray>('test.advancedExecutables');
      const simple = this._cfg.inspect<string>('test.executables');

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

      const createExecutableConfigFromObj = (origObj: AdvancedExecutable): ExecutableConfig => {
        const obj: AdvancedExecutable = Object.assign({}, origObj);

        // we are cheating here: it will work for other os but that is undocumented
        const platformSpecificProperty = platformUtil.getPlatformProperty(obj);
        if (platformSpecificProperty !== undefined) Object.assign(obj, platformSpecificProperty);

        const name: string | undefined = typeof obj.name === 'string' ? obj.name : undefined;

        const description: string | undefined = typeof obj.description === 'string' ? obj.description : undefined;

        let pattern = '';
        {
          if (typeof obj.pattern == 'string') pattern = obj.pattern;
          else {
            this._log.warn('pattern property is required', obj);
            throw Error('"pattern" property is required in advancedExecutables.');
          }
        }

        const cwd: string = typeof obj.cwd === 'string' ? obj.cwd : defaultCwd;

        const env: { [prop: string]: string } = typeof obj.env === 'object' ? obj.env : {};
        Object.assign(env, this.getTerminalIntegratedEnv());

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

        const markAsSkipped: boolean | undefined = obj.markAsSkipped;

        const waitForBuildProcess: boolean | undefined = obj.waitForBuildProcess;

        const defaultTestGrouping = obj.testGrouping;

        const spawnerConfig: ExecutionWrapper | undefined =
          typeof obj.executionWrapper === 'object' &&
          typeof obj.executionWrapper.path === 'string' &&
          (obj.executionWrapper.args === undefined ||
            (Array.isArray(obj.executionWrapper.args) && obj.executionWrapper.args.every(x => typeof x === 'string')))
            ? obj.executionWrapper
            : undefined;

        const sourceFileMap: Record<string, string> =
          typeof obj.sourceFileMap === 'object' &&
          Object.keys(obj.sourceFileMap).every(k => typeof k === 'string' && typeof obj.sourceFileMap![k] === 'string')
            ? obj.sourceFileMap
            : {};

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
          markAsSkipped,
          waitForBuildProcess,
          spawnerConfig,
          sourceFileMap,
          {
            catch2: this._getFrameworkSpecificSettings(defaultTestGrouping, obj['catch2']),
            gtest: this._getFrameworkSpecificSettings(defaultTestGrouping, obj['gtest']),
            doctest: this._getFrameworkSpecificSettings(defaultTestGrouping, obj['doctest']),
            gbenchmark: this._getFrameworkSpecificSettings(defaultTestGrouping, obj['gbenchmark']),
          },
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
    obj?: FrameworkSpecific,
  ): FrameworkSpecific {
    const r: FrameworkSpecific = {};
    if (typeof obj === 'object') {
      if (obj.testGrouping) r.testGrouping = obj.testGrouping;
      else r.testGrouping = defaultTestGrouping;

      if (typeof obj.helpRegex === 'string') r.helpRegex = obj['helpRegex'];

      if (Array.isArray(obj.prependTestRunningArgs) && obj.prependTestRunningArgs.every(x => typeof x === 'string'))
        r.prependTestRunningArgs = obj.prependTestRunningArgs;

      if (Array.isArray(obj.prependTestListingArgs) && obj.prependTestListingArgs.every(x => typeof x === 'string'))
        r.prependTestListingArgs = obj.prependTestListingArgs;

      if (typeof obj.ignoreTestEnumerationStdErr === 'boolean')
        r.ignoreTestEnumerationStdErr = obj.ignoreTestEnumerationStdErr;

      if (typeof obj['debug.enableOutputColouring'] === 'boolean')
        r['debug.enableOutputColouring'] = obj['debug.enableOutputColouring'];

      if (typeof obj.failIfExceedsLimitNs === 'number') r.failIfExceedsLimitNs = obj.failIfExceedsLimitNs;
    }

    return r;
  }

  private getTerminalIntegratedEnv(): Record<string, string> {
    const config = vscode.workspace.getConfiguration('terminal.integrated.env');
    switch (process.platform) {
      case 'darwin':
        return config.get('osx') ?? {};
      case 'win32':
        return config.get('windows') ?? {};
      case 'linux':
        return config.get('linux') ?? {};
    }
    return {};
  }
}

export type DebugConfigTemplateSource =
  | 'fromLaunchJson'
  | 'userDefined'
  | 'vadimcn.vscode-lldb'
  | 'ms-vscode.cpptools'
  | 'webfreak.debug';

export type DebugConfigData = {
  template: vscode.DebugConfiguration;
  source: DebugConfigTemplateSource;
  launchSourceFileMap?: Record<string, string>;
};
