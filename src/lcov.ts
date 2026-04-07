import * as vscode from 'vscode';
import * as TMA from './TestMateApi';
import * as cp from 'child_process';
import * as fs from 'fs/promises';

const ENV_LLVM_PROFILE_FILE = 'LLVM_PROFILE_FILE';
let index = 0;

///

class FileCoverage extends vscode.FileCoverage {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly coverageJson: any,
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

  async load(_token: vscode.CancellationToken): Promise<vscode.FileCoverageDetail[]> {
    const cov: vscode.FileCoverageDetail[] = [];

    for (const data of this.coverageJson['data']) {
      for (const file of data['files']) {
        if (file['filename'] !== this.uri.fsPath) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const segments: any[] = file['segments'] || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const branches: any[] = file['branches'] || [];

        // 1. Group branches by their start line for precise statement attachment
        const branchesByLine = new Map<number, vscode.BranchCoverage[]>();

        for (const b of branches) {
          const startLine = b[0] - 1;
          const range = new vscode.Range(startLine, b[1] - 1, b[2] - 1, b[3] - 1);
          const trueExecCount = b[4];
          const falseExecCount = b[5];

          if (!branchesByLine.has(startLine)) {
            branchesByLine.set(startLine, []);
          }

          branchesByLine
            .get(startLine)!
            .push(new vscode.BranchCoverage(trueExecCount, range), new vscode.BranchCoverage(falseExecCount, range));
        }

        // 2. Parse segments to form continuous statement coverage ranges
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const line = seg[0] - 1;
          const col = seg[1] - 1;
          const count = seg[2];
          const hasCount = seg[3];
          const isGapRegion = seg[5];

          // Filter out blocks lacking executable counts or explicitly marked as gap regions
          if (!hasCount || isGapRegion) continue;

          let endLine = line;
          let endCol = col;

          if (i + 1 < segments.length) {
            const nextSeg = segments[i + 1];
            endLine = nextSeg[0] - 1;
            endCol = nextSeg[1] - 1;
          } else {
            // Terminal segment mapping
            endLine = line + 1;
            endCol = 0;
          }

          const range = new vscode.Range(line, col, endLine, endCol);

          // Attach associated branches to this statement block
          let statementBranches: vscode.BranchCoverage[] | undefined = undefined;
          if (branchesByLine.has(line)) {
            statementBranches = branchesByLine.get(line);
            branchesByLine.delete(line); // Consume branches to prevent duplication
          }

          cov.push(new vscode.StatementCoverage(count, range, statementBranches));
        }

        // 3. Resolve orphaned branches (edge cases where branch start line lacks a matching segment)
        for (const [line, unattachedBranches] of branchesByLine.entries()) {
          const totalExecCount = unattachedBranches.reduce(
            (sum, b) => sum + (typeof b.executed === 'number' ? b.executed : 0),
            0,
          );
          const fallbackRange = new vscode.Range(line, 0, line, 0);
          cov.push(new vscode.StatementCoverage(totalExecCount, fallbackRange, unattachedBranches));
        }
      }
    }

    return cov;
  }
}

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

class LcovTestMateTestRunHandler implements TMA.TestMateTestRunHandler {
  constructor(
    private readonly testRun: TMA.TestMateTestRun,
    private readonly workspaceFolder: vscode.WorkspaceFolder,
  ) {}

  private readonly exec = new Map<string, string[]>();

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
    const profdataPath = exec[0] + `.test_${index++}.profdata`;
    const profraws = [...this.exec.values()].flat();
    const mergeArgs = ['llvm-profdata', 'merge', '-sparse', ...profraws, '-o', profdataPath];
    await execute('xcrun', mergeArgs, this.testRun.token);
    for (const p of profraws) await fs.unlink(p);
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
    const outputStr = await execute('xcrun', exportArgs, this.testRun.token);
    await fs.unlink(profdataPath);
    const coverageJson = JSON.parse(outputStr);

    for (const data of coverageJson['data']) {
      if (this.testRun.token.isCancellationRequested) throw Error('canceled');
      for (const file of data['files']) {
        if (this.testRun.token.isCancellationRequested) throw Error('canceled');
        this.testRun.addCoverage(new FileCoverage(coverageJson, file));
      }
    }
  }

  async mapTestRunProcessBuilder(builder: TMA.TestMateProcessBuilder): Promise<TMA.TestMateProcessBuilder> {
    return {
      ...builder,
      env: { ...builder.env, [ENV_LLVM_PROFILE_FILE]: builder.cmd + `.${index++}` + '.profraw' },
    };
  }
}

class LcovTestMateAdapter implements TMA.TestMateTestRunProfile {
  label: string = 'lcov';
  kind: vscode.TestRunProfileKind = vscode.TestRunProfileKind.Coverage;

  private readonly runData = new WeakMap<TMA.TestMateTestRun, LcovTestMateTestRunHandler>();

  createTestRunHandler(
    testRun: TMA.TestMateTestRun,
    workspaceFolder: vscode.WorkspaceFolder,
  ): TMA.TestMateTestRunHandler {
    const handler = new LcovTestMateTestRunHandler(testRun, workspaceFolder);
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
  const testMateExtension = vscode.extensions.getExtension<TMA.TestMateAPI>('matepek.vscode-catch2-test-adapter');
  if (testMateExtension) {
    const testMate = testMateExtension.exports;
    testMate.registerTestRunProfile(new LcovTestMateAdapter());
  }
}

export function _activate(testMate: { registerTestRunProfile: (adapter: TMA.TestMateTestRunProfile) => void }) {
  if (process.platform === 'darwin') {
    testMate.registerTestRunProfile(new LcovTestMateAdapter());
  }
}
