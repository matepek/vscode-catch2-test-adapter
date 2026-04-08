import * as vscode from 'vscode';
import * as TMA from './TestMateApi';
import * as cp from 'child_process';
import * as fs from 'fs/promises';
import pathlib from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { Log } from 'vscode-test-adapter-util';

const ENV_LLVM_PROFILE_FILE = 'LLVM_PROFILE_FILE';

///

const execute = async (cmd: string, args: string[], token: vscode.CancellationToken): Promise<string> => {
  const proc = cp.spawn(cmd, args, { stdio: 'pipe' });
  const outputArr: string[] = [];
  proc.stdout.on('data', o => outputArr.push(o));
  const closeP = new Promise<void>((res, rej) => {
    proc.on('close', (code: number) => {
      if (code === 0) res();
      else rej(Error('proc exit code:' + code));
    });
    token.onCancellationRequested(() => {
      rej();
      proc.kill();
    });
  });
  await closeP;
  return outputArr.join('');
};

///

class SharedData {
  constructor(
    readonly log: Log,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly coverageJson: any,
  ) {}
}

class FileCoverage extends vscode.FileCoverage {
  constructor(
    private readonly shared: SharedData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fileJson: any,
  ) {
    super(
      vscode.Uri.file(fileJson['filename']),
      new vscode.TestCoverageCount(fileJson['summary']['lines']['covered'], fileJson['summary']['lines']['count']),
      new vscode.TestCoverageCount(
        fileJson['summary']['branches']['covered'],
        fileJson['summary']['branches']['count'],
      ),
      new vscode.TestCoverageCount(
        fileJson['summary']['functions']['covered'],
        fileJson['summary']['functions']['count'],
      ),
    );
  }

  /**
   * !! God knows it's actually give a good result or not, stands here only as proof of concept. !!
   */
  async load(token: vscode.CancellationToken): Promise<vscode.FileCoverageDetail[]> {
    const cov: vscode.FileCoverageDetail[] = [];
    if (!this.shared.coverageJson || !Array.isArray(this.shared.coverageJson['data'])) {
      return cov;
    }
    try {
      for (const data of this.shared.coverageJson['data']) {
        if (token.isCancellationRequested) break;
        if (!Array.isArray(data['files'])) continue;

        for (const file of data['files']) {
          if (token.isCancellationRequested) break;
          if (file['filename'] !== this.uri.fsPath) continue;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const segments: any[] = Array.isArray(file['segments']) ? file['segments'] : [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const branches: any[] = Array.isArray(file['branches']) ? file['branches'] : [];

          // 1. Convert branches to vscode.BranchCoverage and keep track of unassigned branches
          const unassignedBranches = new Set<{ branch: vscode.BranchCoverage; startPos: vscode.Position }>();

          for (const b of branches) {
            if (b.length < 6) continue;
            const startLine = Math.max(0, b[0] - 1);
            const startCol = Math.max(0, b[1] - 1);
            const endLine = Math.max(0, b[2] - 1);
            const endCol = Math.max(0, b[3] - 1);
            const range = new vscode.Range(startLine, startCol, endLine, endCol);
            const trueExecCount = b[4];
            const falseExecCount = b[5];

            const startPos = new vscode.Position(startLine, startCol);
            unassignedBranches.add({
              branch: new vscode.BranchCoverage(trueExecCount, range),
              startPos,
            });
            unassignedBranches.add({
              branch: new vscode.BranchCoverage(falseExecCount, range),
              startPos,
            });
          }

          // 2. Parse segments to form continuous statement coverage ranges
          for (let i = 0; i < segments.length - 1; i++) {
            if (token.isCancellationRequested) break;
            const seg = segments[i];
            const nextSeg = segments[i + 1];

            if (seg.length < 6 || nextSeg.length < 2) continue;

            const line = Math.max(0, seg[0] - 1);
            const col = Math.max(0, seg[1] - 1);
            const count = seg[2];
            const hasCount = seg[3];
            const isGapRegion = seg[5];

            // Filter out blocks lacking executable counts or explicitly marked as gap regions
            if (!hasCount || isGapRegion) continue;

            const endLine = Math.max(0, nextSeg[0] - 1);
            const endCol = Math.max(0, nextSeg[1] - 1);

            // Skip invalid ranges (e.g. backward segments)
            if (line > endLine || (line === endLine && col >= endCol)) {
              continue;
            }

            const range = new vscode.Range(line, col, endLine, endCol);

            // Attach associated branches to this statement block
            const statementBranches: vscode.BranchCoverage[] = [];
            for (const item of unassignedBranches) {
              if (range.contains(item.startPos)) {
                statementBranches.push(item.branch);
                unassignedBranches.delete(item);
              }
            }

            cov.push(
              new vscode.StatementCoverage(count, range, statementBranches.length > 0 ? statementBranches : undefined),
            );
          }

          // 3. Resolve orphaned branches
          const orphanedByLine = new Map<number, vscode.BranchCoverage[]>();
          for (const item of unassignedBranches) {
            const line = item.startPos.line;
            if (!orphanedByLine.has(line)) {
              orphanedByLine.set(line, []);
            }
            orphanedByLine.get(line)!.push(item.branch);
          }

          for (const [line, brs] of orphanedByLine.entries()) {
            const totalExecCount = brs.reduce((sum, b) => sum + (typeof b.executed === 'number' ? b.executed : 0), 0);
            const fallbackRange = new vscode.Range(line, 0, line, 0);
            cov.push(new vscode.StatementCoverage(totalExecCount, fallbackRange, brs));
          }
        }

        // 4. Try to compute DeclarationCoverage from functions in the same file
        if (Array.isArray(data['functions'])) {
          for (const func of data['functions']) {
            if (token.isCancellationRequested) break;
            if (!func || !Array.isArray(func['filenames']) || !Array.isArray(func['regions'])) continue;

            for (const region of func['regions']) {
              if (region.length < 6) continue;
              const fileIndex = region[5];
              const fileName = func['filenames'][fileIndex];

              if (fileName === this.uri.fsPath) {
                const startLine = Math.max(0, region[0] - 1);
                const startCol = Math.max(0, region[1] - 1);
                const endLine = Math.max(0, region[2] - 1);
                const endCol = Math.max(0, region[3] - 1);
                const count = region[4];

                const range = new vscode.Range(startLine, startCol, endLine, endCol);
                cov.push(new vscode.DeclarationCoverage(func['name'] || '<unknown>', count, range));
                break; // One declaration coverage per function mapping to this file
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Error loading detailed coverage in lcov.ts:', e);
    }

    return cov;
  }
}

class LcovTestMateTestRunHandler implements TMA.TestMateTestRunHandler {
  constructor(
    private readonly testRun: TMA.TestMateTestRun,
    _workspaceFolder: vscode.WorkspaceFolder,
    private readonly log: Log,
  ) {}

  private readonly exec = new Map<string, string[]>();
  private tmpDir: fs.DisposableTempDir | undefined = undefined;

  async init(): Promise<void> {
    const path = await fs.mkdtemp(pathlib.join(os.tmpdir(), 'lcov-'));
    // it only node 22 but for mkdtempDisposable needs 24
    const remove = async () => fs.rm(path, { recursive: true, force: true });
    this.tmpDir = {
      path,
      remove,
      [Symbol.asyncDispose]: remove,
    };
    this.log.debug('tmpDir', this.tmpDir.path);
  }

  async endProcess(
    builder: TMA.TestMateProcessBuilder,
    result: 'OK' | 'CancelledByUser' | 'TimeoutByUser' | 'Errored',
  ): Promise<void> {
    if (result === 'OK') {
      let exec = this.exec.get(builder.cmd);
      if (exec === undefined) {
        exec = [];
        this.exec.set(builder.cmd, exec);
      }
      exec.push(builder.env[ENV_LLVM_PROFILE_FILE]!);
    }
  }

  async finalise(): Promise<void> {
    const exec = [...this.exec.keys()];
    if (exec.length === 0) return;

    const profdataPath = pathlib.join(this.tmpDir!.path, crypto.randomBytes(16).toString('hex') + '.profdata');
    const profraws = [...this.exec.values()].flat();
    // TODO: argument limit
    const mergeArgs = ['llvm-profdata', 'merge', '-sparse', ...profraws, '-o', profdataPath];

    try {
      await execute('xcrun', mergeArgs, this.testRun.token);
    } catch (e) {
      console.error('Failed to merge profdata:', e);
      await this.tmpDir!.remove().catch(e => this.log.error('tmpDir.remove', e));
      return;
    }

    // TODO: argument limit
    // TODO: collect object files
    const exportArgs = [
      'llvm-cov',
      'export',
      exec[0],
      ...exec
        .slice(1)
        .map(x => ['-object', x])
        .flat(),
      '-instr-profile',
      profdataPath,
      '-format=text',
    ];
    let outputStr: string;
    try {
      outputStr = await execute('xcrun', exportArgs, this.testRun.token);
    } catch (e) {
      this.log.error('Failed to export coverage:', e);
      return;
    } finally {
      await this.tmpDir!.remove().catch(e => this.log.error('tmpDir.remove', e));
    }

    let coverageJson;
    try {
      this.log.debug('parsing size', outputStr.length);
      coverageJson = JSON.parse(outputStr);
    } catch (e) {
      this.log.error('Failed to parse coverage JSON:', e);
      return;
    }

    const shared = new SharedData(this.log, coverageJson);

    try {
      if (Array.isArray(coverageJson['data'])) {
        for (const data of coverageJson['data']) {
          if (this.testRun.token.isCancellationRequested) throw Error('canceled');
          if (!Array.isArray(data['files'])) continue;
          for (const file of data['files']) {
            if (this.testRun.token.isCancellationRequested) throw Error('canceled');
            this.testRun.addCoverage(new FileCoverage(shared, file));
          }
        }
      }
    } catch (e) {
      this.log.error('Failed to process coverage data:', e);
    }
  }

  async mapTestRunProcessBuilder(builder: TMA.TestMateProcessBuilder): Promise<TMA.TestMateProcessBuilder> {
    const profrawPath = pathlib.join(this.tmpDir!.path, crypto.randomBytes(16).toString('hex') + '.profraw');
    return {
      ...builder,
      env: { ...builder.env, [ENV_LLVM_PROFILE_FILE]: profrawPath },
    };
  }
}

const label = 'LCov (TestMate C++)';
const configSection = 'testMate.cpp.test.experimental.lcov';

class LcovTestMateAdapter implements TMA.TestMateTestRunProfile {
  constructor(private readonly log: Log) {}

  label: string = label;
  kind: vscode.TestRunProfileKind = vscode.TestRunProfileKind.Coverage;

  private readonly runData = new WeakMap<TMA.TestMateTestRun, LcovTestMateTestRunHandler>();

  createTestRunHandler(
    testRun: TMA.TestMateTestRun,
    workspaceFolder: vscode.WorkspaceFolder,
  ): TMA.TestMateTestRunHandler {
    const handler = new LcovTestMateTestRunHandler(testRun, workspaceFolder, this.log);
    this.runData.set(testRun, handler);
    return handler;
  }

  loadDetailedCoverage(
    fileCoverage: vscode.FileCoverage,
    token: vscode.CancellationToken,
  ): Promise<vscode.FileCoverageDetail[]> {
    if (fileCoverage instanceof FileCoverage) return fileCoverage.load(token);
    else throw Error('expected FileCoverage');
  }

  dispose(): void {}
}

export function activate(_context: vscode.ExtensionContext) {
  const log = new Log(configSection, undefined, label, { depth: 3 }, false);
  const testMateExtension = vscode.extensions.getExtension<TMA.TestMateAPI>('matepek.vscode-catch2-test-adapter');
  if (testMateExtension) {
    const testMate = testMateExtension.exports;
    testMate.registerTestRunProfile(new LcovTestMateAdapter(log));
  }
}

export function _activate(testMate: { registerTestRunProfile: (adapter: TMA.TestMateTestRunProfile) => void }) {
  if (process.platform === 'darwin') {
    const log = new Log(configSection, undefined, label, { depth: 3 }, false);
    testMate.registerTestRunProfile(new LcovTestMateAdapter(log));
  }
}
