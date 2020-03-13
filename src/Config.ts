import * as vscode from 'vscode';
import { LogWrapper } from './LogWrapper';
import { TestExecutableInfo, TestExecutableInfoFrameworkSpecific } from './TestExecutableInfo';
import { RootTestSuiteInfo } from './RootTestSuiteInfo';
import { SharedVariables } from './SharedVariables';
import { hashString } from './Util';
import { performance } from 'perf_hooks';

export class Config {
  private _vsConfig: vscode.WorkspaceConfiguration;

  public constructor(public _log: LogWrapper, private _workspaceFolderUri: vscode.Uri) {
    this._vsConfig = vscode.workspace.getConfiguration('catch2TestExplorer', _workspaceFolderUri);
  }

  public getDebugConfigurationTemplate(): vscode.DebugConfiguration {
    const templateFromConfig = this._vsConfig.get<object | null | 'extensionOnly'>('debugConfigTemplate', null);

    if (typeof templateFromConfig === 'object' && templateFromConfig !== null) {
      this._log.info('using user defined debug config');
      return Object.assign(
        {
          name: '${label} (${suiteLabel})',
          request: 'launch',
          type: 'cppdbg',
        },
        templateFromConfig,
      );
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
            this._log.info(
              "using debug config from launch.json. If it doesn't wokr for you please read the manual: https://github.com/matepek/vscode-catch2-test-adapter#or-user-can-manually-fill-it",
            );
            // putting as much known properties as much we can and hoping for the best 🤞
            return Object.assign({}, wpLaunchConfigs[i], {
              name: '${label} (${suiteLabel})',
              program: '${exec}',
              target: '${exec}',
              arguments: '${argsStr}',
              args: '${args}',
              cwd: '${cwd}',
              env: '${envObj}',
            });
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
      this._log.info('using debug extension: vadimcn.vscode-lldb');
      Object.assign(template, {
        type: 'cppdbg',
        MIMode: 'lldb',
        program: '${exec}',
        args: '${args}',
        cwd: '${cwd}',
        env: '${envObj}',
      });
    } else if (vscode.extensions.getExtension('webfreak.debug')) {
      this._log.info('using debug extension: webfreak.debug');
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
      this._log.info('using debug extension: ms-vscode.cpptools');
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
      throw Error(
        "For debugging 'catch2TestExplorer.debugConfigTemplate' should be set: https://github.com/matepek/vscode-catch2-test-adapter#or-user-can-manually-fill-it",
      );
    }
    return template;
  }

  public getOrCreateUserId(): string {
    const userId = this._vsConfig.get<string>('userId');

    if (userId) {
      return userId;
    }

    let newUserId = (process.env['USER'] || process.env['USERNAME'] || 'user') + process.env['USERDOMAIN'];
    newUserId += performance.now().toString();
    newUserId += process.pid.toString();
    newUserId += Date.now().toString();

    newUserId = hashString(newUserId);

    this._vsConfig.update('userId', newUserId, vscode.ConfigurationTarget.Global);

    return newUserId;
  }

  public isSentryEnabled(): boolean {
    return this._vsConfig.get<string>('logSentry') === 'enabled';
  }

  public askSentryConsent(): void {
    // TODO: enable it in the next month
    return;

    const logSentry = this._vsConfig.get<'enable' | 'disable' | 'disable_1' | 'disable_2' | 'question'>(
      'logSentry',
      'question',
    );

    if (logSentry === 'question' || logSentry === 'disable' || logSentry === 'disable_1') {
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
            this._vsConfig.update('logSentry', 'enable', vscode.ConfigurationTarget.Global);
          } else if (value === options[1]) {
            this._vsConfig.update('logSentry', 'enable', vscode.ConfigurationTarget.Global);
            this._vsConfig.update('logSentry', 'disable_2', vscode.ConfigurationTarget.WorkspaceFolder);
          } else if (value === options[2]) {
            this._vsConfig.update('logSentry', 'disable_2', vscode.ConfigurationTarget.Global);
          }
        });
    }
  }

  public getDebugBreakOnFailure(): boolean {
    return this._vsConfig.get<boolean>('debugBreakOnFailure', true);
  }

  public getDefaultNoThrow(): boolean {
    return this._vsConfig.get<boolean>('defaultNoThrow', false);
  }

  public getDefaultCwd(): string {
    const dirname = this._workspaceFolderUri.fsPath;
    return this._vsConfig.get<string>('defaultCwd', dirname);
  }

  public getDefaultEnvironmentVariables(): { [prop: string]: string } {
    return this._vsConfig.get('defaultEnv', {});
  }

  public getDefaultRngSeed(): string | number | null {
    return this._vsConfig.get<null | string | number>('defaultRngSeed', null);
  }

  public getWorkerMaxNumber(): number {
    const res = Math.max(1, this._vsConfig.get<number>('workerMaxNumber', 1));
    if (typeof res != 'number') return 1;
    else return res;
  }

  public getDefaultExecWatchTimeout(): number {
    const res = this._vsConfig.get<number>('defaultWatchTimeoutSec', 10) * 1000;
    return res;
  }

  public getRetireDebounceTime(): number {
    const res = this._vsConfig.get<number>('retireDebounceTimeMilisec', 1000);
    return res;
  }

  public getDefaultExecRunningTimeout(): null | number {
    const r = this._vsConfig.get<null | number>('defaultRunningTimeoutSec', null);
    return r !== null && r > 0 ? r * 1000 : null;
  }

  public getDefaultExecParsingTimeout(): number {
    const r = this._vsConfig.get<number>('defaultExecParsingTimeoutSec', 5);
    return r * 1000;
  }

  public getEnableTestListCaching(): boolean {
    return this._vsConfig.get<boolean>('enableTestListCaching', false);
  }

  public getGoogleTestTreatGMockWarningAs(): 'nothing' | 'failure' {
    return this._vsConfig.get<'nothing' | 'failure'>('googletest.treatGmockWarningAs', 'nothing');
  }

  public getGoogleTestGMockVerbose(): 'default' | 'info' | 'warning' | 'error' {
    return this._vsConfig.get<'default' | 'info' | 'warning' | 'error'>(
      'catch2TestExplorer.googletest.gmockVerbose',
      'default',
    );
  }

  public getExecutables(
    shared: SharedVariables,
    rootSuite: RootTestSuiteInfo,
    variableToValue: [string, string][],
  ): TestExecutableInfo[] {
    const defaultCwd = this.getDefaultCwd() || '${absDirpath}';
    const defaultEnv = this.getDefaultEnvironmentVariables() || {};

    const executables: TestExecutableInfo[] = [];

    const configExecs:
      | undefined
      | null
      | string
      | string[]
      | { [prop: string]: string }
      | ({ [prop: string]: string } | string)[] = this._vsConfig.get('executables');

    const createFromObject = (obj: { [prop: string]: string }): TestExecutableInfo => {
      const name: string | undefined = typeof obj.name === 'string' ? obj.name : undefined;

      const description: string | undefined = typeof obj.description === 'string' ? obj.description : undefined;

      let pattern = '';
      {
        if (typeof obj.pattern == 'string') pattern = obj.pattern;
        else if (typeof obj.path == 'string') pattern = obj.path;
        else {
          this._log.debug('pattern property is required', obj);
          throw Error('Error: pattern property is required.');
        }
      }

      const cwd: string | undefined = typeof obj.cwd === 'string' ? obj.cwd : undefined;

      const env: { [prop: string]: string } | undefined = typeof obj.env === 'object' ? obj.env : undefined;

      const dependsOn: string[] = Array.isArray(obj.dependsOn) ? obj.dependsOn.filter(v => typeof v === 'string') : [];

      // eslint-disable-next-line
      const framework = (obj: any): TestExecutableInfoFrameworkSpecific => {
        const r: TestExecutableInfoFrameworkSpecific = {};
        if (typeof obj === 'object') {
          if (typeof obj.helpRegex === 'string') r.helpRegex = obj['helpRegex'];

          if (
            Array.isArray(obj.additionalRunArguments) &&
            // eslint-disable-next-line
            (obj.additionalRunArguments as any[]).every(x => typeof x === 'string')
          )
            r.additionalRunArguments = obj.additionalRunArguments;

          if (typeof obj.ignoreTestEnumerationStdErr) r.ignoreTestEnumerationStdErr = obj.ignoreTestEnumerationStdErr;
        }
        return r;
      };

      return new TestExecutableInfo(
        shared,
        rootSuite,
        pattern,
        name,
        description,
        cwd,
        env,
        dependsOn,
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
        new TestExecutableInfo(
          shared,
          rootSuite,
          configExecs,
          undefined,
          undefined,
          undefined,
          undefined,
          [],
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
              new TestExecutableInfo(
                shared,
                rootSuite,
                configExecsName,
                undefined,
                undefined,
                undefined,
                undefined,
                [],
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
