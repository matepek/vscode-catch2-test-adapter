import * as vscode from 'vscode';
import * as TMA from '../TestMateApi';
import * as cp from 'child_process';
import * as fs from 'fs/promises';
import pathlib from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { Log } from 'vscode-test-adapter-util';

const configSection = 'testMate.cpp.test.experimental.gcov';
const label = 'GCov (TestMate C++)';

const execute = async (
  cmd: string,
  args: string[],
  cwd: string,
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
      else rej(Error(`Command '${cmd}' failed with exit code: ${code}; ${stderr.join('')}`));
    });
    proc.on('error', err => rej(err));

    token.onCancellationRequested(() => {
      proc.kill();
      rej(Error('Cancelled by user'));
    });
  });

  await closeP;
  return [stdout.join(''), stderr.join('')];
};

interface GcovBranch {
  count: number;
  throw: boolean;
  fallthrough: boolean;
}

interface GcovLine {
  line_number: number;
  count: number;
  branches: GcovBranch[];
}

interface GcovFunction {
  name: string;
  start_line: number;
  start_column?: number;
  end_line: number;
  end_column?: number;
  execution_count: number;
}

class AggregatedFileCoverage {
  lines = new Map<number, GcovLine>();
  functions = new Map<string, GcovFunction>();

  mergeLine(l: GcovLine) {
    if (!this.lines.has(l.line_number)) {
      this.lines.set(l.line_number, { line_number: l.line_number, count: 0, branches: [] });
    }
    const target = this.lines.get(l.line_number)!;
    target.count += l.count;

    if (l.branches && Array.isArray(l.branches)) {
      for (let i = 0; i < l.branches.length; i++) {
        if (!target.branches[i]) {
          target.branches[i] = { count: 0, fallthrough: l.branches[i].fallthrough, throw: l.branches[i].throw };
        }
        target.branches[i].count += l.branches[i].count;
      }
    }
  }

  mergeFunction(f: GcovFunction) {
    if (!this.functions.has(f.name)) {
      this.functions.set(f.name, { ...f, execution_count: 0 });
    }
    this.functions.get(f.name)!.execution_count += f.execution_count;
  }
}

class FileCoverage extends vscode.FileCoverage {
  constructor(
    uri: vscode.Uri,
    statementCoverage: vscode.TestCoverageCount,
    branchCoverage: vscode.TestCoverageCount,
    declarationCoverage: vscode.TestCoverageCount,
    private readonly log: Log,
    aggregatedData: AggregatedFileCoverage,
  ) {
    super(uri, statementCoverage, branchCoverage, declarationCoverage);
    this.data.aggregatedData = aggregatedData;
  }

  private readonly data: { aggregatedData?: AggregatedFileCoverage; details?: vscode.FileCoverageDetail[] } = {};

  async load(token: vscode.CancellationToken): Promise<vscode.FileCoverageDetail[]> {
    if (!this.data.aggregatedData) return [];
    if (this.data.details) return this.data.details;

    const details: vscode.FileCoverageDetail[] = [];
    try {
      const { lines, functions } = this.data.aggregatedData;

      for (const line of lines.values()) {
        if (token.isCancellationRequested) return details;

        const lineIdx = Math.max(0, line.line_number - 1);
        const range = new vscode.Range(lineIdx, 0, lineIdx, 1);

        const branchCovs: vscode.BranchCoverage[] = [];
        for (const b of line.branches) {
          branchCovs.push(new vscode.BranchCoverage(b.count, range));
        }

        details.push(new vscode.StatementCoverage(line.count, range, branchCovs.length > 0 ? branchCovs : undefined));
      }

      for (const func of functions.values()) {
        if (token.isCancellationRequested) return details;

        const startLine = Math.max(0, func.start_line - 1);
        const startCol = Math.max(0, (func.start_column || 1) - 1);
        const endLine = Math.max(0, func.end_line - 1);
        const endCol = Math.max(0, (func.end_column || 1) - 1);

        const range = new vscode.Range(startLine, startCol, endLine, endCol);
        details.push(new vscode.DeclarationCoverage(func.name || '<unknown>', func.execution_count, range));
      }

      this.data.details = details;
      delete this.data.aggregatedData;
    } catch (e) {
      this.log.error('Error loading detailed coverage in gcov.ts:', e, this.data);
    }
    return details;
  }
}

class GcovTestMateTestRunHandler implements TMA.TestMateTestRunHandler {
  constructor(
    private readonly testRun: TMA.TestMateTestRun,
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly log: Log,
  ) {}

  private data:
    | {
        tmpDir: fs.DisposableTempDir;
        dispose: () => void;
      }
    | undefined = undefined;

  async getGcdaPath() {
    return await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.workspaceFolder, '**/*.gcda'),
      '**/{node_modules,_deps}/**',
    );
  }

  async cleanupGcda() {
    const gcdaFiles = await this.getGcdaPath();
    for (const f of gcdaFiles) {
      await fs.unlink(f.fsPath).catch(e => this.log.error('unlink', e, f.fsPath));
    }
  }

  async init(): Promise<void> {
    if (process.platform !== 'linux') {
      throw new Error('This gcov adapter is configured for Linux environments only.');
    }

    const path = await fs.mkdtemp(pathlib.join(os.tmpdir(), 'gcov-'));
    this.data = {
      tmpDir: {
        path,
        remove: async () => fs.rm(path, { recursive: true, force: true }),
        [Symbol.asyncDispose]: async function () {
          this.remove();
        },
      },
      async dispose() {
        await this.tmpDir.remove();
      },
    };
    this.log.debug('tmpDir', this.data.tmpDir.path);

    await this.cleanupGcda();
  }

  async finalise(): Promise<void> {
    if (!this.data) throw Error('assert:data');

    try {
      const gcdaFiles = await this.getGcdaPath();

      if (gcdaFiles.length === 0) {
        this.log.warn('No .gcda files found. Ensure code is compiled with --coverage and executed successfully.');
        return;
      }

      const fileCoverageMap = new Map<string, AggregatedFileCoverage>();

      for (const file of gcdaFiles) {
        if (this.testRun.token.isCancellationRequested) throw Error('canceled');

        try {
          // TODO: file names can collide
          await execute('gcov', ['--json-format', file.fsPath], this.data.tmpDir.path, this.testRun.token);
        } catch (e) {
          this.log.error(`Failed to execute gcov on ${file.fsPath}`, e);
          continue;
        }
      }

      const gcovOutputFiles = await fs.readdir(this.data.tmpDir.path);
      const jsonGzFiles = gcovOutputFiles.filter(f => f.endsWith('.gcov.json.gz'));

      for (const gzFile of jsonGzFiles) {
        if (this.testRun.token.isCancellationRequested) throw Error('canceled');
        const filePath = pathlib.join(this.data.tmpDir.path, gzFile);

        let jsonStr: string;
        try {
          const buffer = await fs.readFile(filePath);
          jsonStr = zlib.gunzipSync(buffer).toString('utf8');
        } catch (e) {
          this.log.error(`Failed to decompress ${gzFile}`, e);
          continue;
        }

        let coverageJson;
        try {
          coverageJson = JSON.parse(jsonStr);
        } catch (e) {
          this.log.error(`Failed to parse JSON from ${gzFile}`, e);
          continue;
        }

        if (!Array.isArray(coverageJson['files'])) continue;

        const cwd = coverageJson['current_working_directory'] || this.workspaceFolder.uri.fsPath;

        for (const sourceFile of coverageJson['files']) {
          const rawFilePath = sourceFile['file'];
          const absoluteFilePath = pathlib.isAbsolute(rawFilePath) ? rawFilePath : pathlib.resolve(cwd, rawFilePath);

          if (!fileCoverageMap.has(absoluteFilePath)) {
            fileCoverageMap.set(absoluteFilePath, new AggregatedFileCoverage());
          }

          const aggregated = fileCoverageMap.get(absoluteFilePath)!;

          if (Array.isArray(sourceFile['lines'])) {
            for (const line of sourceFile['lines']) {
              aggregated.mergeLine(line as GcovLine);
            }
          }

          if (Array.isArray(sourceFile['functions'])) {
            for (const func of sourceFile['functions']) {
              aggregated.mergeFunction(func as GcovFunction);
            }
          }
        }
      }

      // Convert map to vscode.FileCoverage objects
      for (const [filePath, aggregated] of fileCoverageMap.entries()) {
        let linesTotal = 0,
          linesCovered = 0;
        let branchesTotal = 0,
          branchesCovered = 0;
        let funcsTotal = 0,
          funcsCovered = 0;

        for (const line of aggregated.lines.values()) {
          linesTotal++;
          if (line.count > 0) linesCovered++;

          for (const branch of line.branches) {
            branchesTotal++;
            if (branch.count > 0) branchesCovered++;
          }
        }

        for (const func of aggregated.functions.values()) {
          funcsTotal++;
          if (func.execution_count > 0) funcsCovered++;
        }

        const uri = vscode.Uri.file(filePath);
        const statementCov = new vscode.TestCoverageCount(linesCovered, linesTotal);
        const branchCov = new vscode.TestCoverageCount(branchesCovered, branchesTotal);
        const declCov = new vscode.TestCoverageCount(funcsCovered, funcsTotal);

        this.testRun.addCoverage(new FileCoverage(uri, statementCov, branchCov, declCov, this.log, aggregated));
      }
    } finally {
      await this.data.dispose();
      await this.cleanupGcda();
    }
  }
}

class GcovTestMateAdapter implements TMA.TestMateTestRunProfile {
  constructor(private readonly log: Log) {}

  label = label;
  kind = vscode.TestRunProfileKind.Coverage;

  createTestRunHandler(
    testRun: TMA.TestMateTestRun,
    workspaceFolder: vscode.WorkspaceFolder,
  ): TMA.TestMateTestRunHandler {
    return new GcovTestMateTestRunHandler(testRun, workspaceFolder, this.log);
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
  if (process.platform !== 'linux') return;

  const log = new Log(configSection, undefined, label, { depth: 3 }, false);
  const testMateExtension = vscode.extensions.getExtension<TMA.TestMateAPI>('matepek.vscode-catch2-test-adapter');
  if (testMateExtension) {
    const testMate = testMateExtension.exports;
    testMate.registerTestRunProfile(new GcovTestMateAdapter(log));
  }
}

export function _activate(testMate: { registerTestRunProfile: (adapter: TMA.TestMateTestRunProfile) => void }) {
  if (process.platform === 'linux') {
    const log = new Log(configSection, undefined, label, { depth: 3 }, false);
    testMate.registerTestRunProfile(new GcovTestMateAdapter(log));
  }
}
