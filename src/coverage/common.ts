import * as vscode from 'vscode';
import * as cp from 'child_process';
import { Log } from 'vscode-test-adapter-util';
import * as TMA from '../TestMateApi';

export const testMateExtensionId = 'matepek.vscode-catch2-test-adapter';

export const execute = async (
  cmd: string,
  args: string[],
  cwd: string | undefined,
  token: vscode.CancellationToken,
): Promise<[string, string]> => {
  const proc = cp.spawn(cmd, args, { stdio: 'pipe', cwd });
  const stdout: string[] = [];
  const stderr: string[] = [];

  proc.stdout.on('data', o => stdout.push(o.toString('utf8')));
  proc.stderr.on('data', o => stderr.push(o.toString('utf8')));

  const closeP = new Promise<void>((res, rej) => {
    proc.on('close', (code: number) => {
      if (code === 0) res();
      else rej(new Error(`Command '${cmd}' failed with exit code: ${code}; ${stderr.join('')}`));
    });
    proc.on('error', err => rej(err));

    token.onCancellationRequested(() => {
      proc.kill();
      rej(new Error('Cancelled by user'));
    });
  });

  await closeP;
  return [stdout.join(''), stderr.join('')];
};

export const executeWithPlatformToolchain = async (
  cmd: string,
  args: string[],
  cwd: string | undefined,
  token: vscode.CancellationToken,
): Promise<[string, string]> => {
  if (process.platform === 'darwin') {
    return await execute('xcrun', [cmd, ...args], cwd, token);
  } else if (process.platform === 'linux' || process.platform === 'win32') {
    return await execute(cmd, args, cwd, token);
  } else {
    throw Error('assert platform toolchain');
  }
};

/**
 * advanced example
 */
export const create_advanced_activate =
  <TestMateAdapterT extends TMA.TestMateTestRunProfileAdapter>(
    configSection: string,
    label: string,
    factory: (log: Log) => TestMateAdapterT,
  ) =>
  async (context: vscode.ExtensionContext) => {
    const log = new Log(configSection, undefined, label, { depth: 3 }, false);
    context.subscriptions.push(log);
    const testMateExtension = vscode.extensions.getExtension<TMA.TestMateAPI>(testMateExtensionId);
    if (testMateExtension) {
      let adapter: TestMateAdapterT | null = null;
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
          adapter = factory(log);
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
  };
