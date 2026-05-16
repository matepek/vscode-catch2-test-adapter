import * as vscode from 'vscode';
import * as TMA from '../TestMateApi';
import { Log } from 'vscode-test-adapter-util';
import { resolveVariablesAsync } from '../util/ResolveRule';

const testMateExtensionId = 'matepek.vscode-catch2-test-adapter';
const configSection = 'testMate.cpp.experimental.custom-adapter';
const label = 'custom by TestMate C++';

///

class CustomTestMateTestRunHandler implements TMA.TestMateTestRunHandler {
  constructor(
    private readonly testRun: TMA.TestMateTestRun,
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly log: Log,
  ) {
    // these configs don't need reload, will be applied for future runs
    const config = vscode.workspace.getConfiguration(configSection);
    this.allowExecutableConcurrentInvocations = config.get<boolean>('allowExecutableConcurrentInvocations', true);
    this._cwd = config.get<string>('cwd');
    this._cmd = config.get<string>('cmd');
    this._args = config.get<string[]>('args');
    this._env = config.get<Record<string, string>>('env');
  }

  allowExecutableConcurrentInvocations: boolean;
  private readonly _cwd?: string;
  private readonly _cmd?: string;
  private readonly _args?: string[];
  private readonly _env?: Record<string, string>;

  async mapTestRunProcessBuilder(builder: TMA.TestMateProcessBuilder): Promise<TMA.TestMateProcessBuilder> {
    const cwd = this._cwd ?? builder.cwd;
    const cmd = this._cmd ?? builder.cmd;
    const args = await resolveVariablesAsync(this._args ?? ['${argsFlat}'], [
      {
        resolve: '${cmd}',
        rule: builder.cmd,
      },
      {
        resolve: '${argsFlat}',
        rule: (): Promise<readonly string[]> => Promise.resolve(builder.args),
        isFlat: true,
      },
    ]);
    const env = { ...builder.env, ...this._env };
    const r = {
      cwd,
      cmd,
      args,
      env,
    };
    this.log.info('custom-adapter', r);
    return r;
  }
}

class TestMateAdapter implements TMA.TestMateTestRunProfileAdapter {
  constructor(private readonly log: Log) {}

  label = label;
  kind = vscode.TestRunProfileKind.Run;
  tag?: vscode.TestTag = undefined;

  createTestRunHandler(
    testRun: TMA.TestMateTestRun,
    workspaceFolder: vscode.WorkspaceFolder,
  ): TMA.TestMateTestRunHandler {
    return new CustomTestMateTestRunHandler(testRun, workspaceFolder, this.log);
  }

  dispose(): void {}
}

/**
 * advanced example
 */
export async function advanced_activate(context: vscode.ExtensionContext) {
  const log = new Log(configSection, undefined, label, { depth: 3 }, false);
  context.subscriptions.push(log);
  const testMateExtension = vscode.extensions.getExtension<TMA.TestMateAPI>(testMateExtensionId);
  if (testMateExtension) {
    let adapter: TestMateAdapter | null = null;
    let profile: TMA.TestMateTestRunProfile | null = null;

    const dispose = () => {
      if (profile) {
        profile.dispose();
        profile = null;
      }
      if (adapter) {
        log.info('disposed profile', adapter.label, adapter.kind, testMateExtensionId);
        adapter.dispose();
        adapter = null;
      }
    };
    context.subscriptions.push({ dispose });

    const create = async () => {
      if (!adapter) {
        const testMate = await testMateExtension.activate();
        adapter = new TestMateAdapter(log);
        profile = testMate.createTestRunProfile(adapter);
        log.info('created profile', adapter?.label, adapter?.kind, testMateExtensionId);
      }
    };

    const applyCfg = async (cfg: vscode.WorkspaceConfiguration) => {
      if (cfg.get('enabled', false)) await create();
      else dispose();

      if (profile) {
        const tag = cfg.get<string>('tag');
        profile.tag = typeof tag === 'string' ? new vscode.TestTag(tag) : undefined;
      }
    };

    vscode.workspace.onDidChangeConfiguration(async event => {
      if (event.affectsConfiguration(configSection)) {
        const cfg = vscode.workspace.getConfiguration(configSection);
        await applyCfg(cfg);
      }
    });

    const cfg = vscode.workspace.getConfiguration(configSection);
    await applyCfg(cfg);
  } else {
    log.info('missing extension', testMateExtensionId);
  }
}
