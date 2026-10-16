import * as vscode from 'vscode';
import * as TMA from '../TestMateApi';
import * as fs from 'fs/promises';
import pathlib from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { Log } from 'vscode-test-adapter-util';
import { create_advanced_activate, executeWithPlatformToolchain, markAsErroredFromError } from './common';

const testMateExtensionId = 'matepek.vscode-catch2-test-adapter';
const configSection = 'testMate.cpp.experimental.llvm-cov';
const label = 'llvm-cov by TestMate C++';
const ENV_LLVM_PROFILE_FILE = 'LLVM_PROFILE_FILE';

///

class LlvmCovFileCoverage extends vscode.FileCoverage {
  constructor(
    uri: vscode.Uri,
    statementCoverage: vscode.TestCoverageCount,
    branchCoverage: vscode.TestCoverageCount,
    declarationCoverage: vscode.TestCoverageCount,
    private readonly log: Log,
    fileDetailsJson: unknown,
    fileFunctionsJson: unknown[],
  ) {
    super(uri, statementCoverage, branchCoverage, declarationCoverage);
    this.data.fileDetailsJson = fileDetailsJson;
    this.data.fileFunctionsJson = fileFunctionsJson;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly data: { fileDetailsJson?: any; fileFunctionsJson?: any[]; details?: vscode.FileCoverageDetail[] } =
    {};

  async load(token: vscode.CancellationToken): Promise<vscode.FileCoverageDetail[]> {
    if (!this.data.fileDetailsJson) return [];
    // seems it is called only once but API doesn't say any guarantee so prepard for multiple calls
    if (this.data.details) return this.data.details;

    const details: vscode.FileCoverageDetail[] = [];
    try {
      const segments = Array.isArray(this.data.fileDetailsJson['segments'])
        ? this.data.fileDetailsJson['segments']
        : [];
      const branches = Array.isArray(this.data.fileDetailsJson['branches'])
        ? this.data.fileDetailsJson['branches']
        : [];

      // 1. Convert branches to vscode.BranchCoverage and keep track of unassigned branches
      const unassignedBranches = new Set<{ branch: vscode.BranchCoverage; startPos: vscode.Position }>();

      for (const b of branches) {
        if (token.isCancellationRequested) return details;
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
        if (token.isCancellationRequested) return details;
        const seg = segments[i];
        const nextSeg = segments[i + 1];

        if (seg.length < 6 || nextSeg.length < 2) continue;

        const line = Math.max(0, seg[0] - 1);
        const col = Math.max(0, seg[1] - 1);
        const count = seg[2];
        const hasCount = seg[3];
        const isGapRegion = seg[5];

        if (!hasCount || isGapRegion) continue;

        const endLine = Math.max(0, nextSeg[0] - 1);
        const endCol = Math.max(0, nextSeg[1] - 1);

        if (line > endLine || (line === endLine && col >= endCol)) continue;

        const range = new vscode.Range(line, col, endLine, endCol);

        const statementBranches: vscode.BranchCoverage[] = [];
        for (const item of unassignedBranches) {
          if (token.isCancellationRequested) return details;
          if (range.contains(item.startPos)) {
            statementBranches.push(item.branch);
            unassignedBranches.delete(item);
          }
        }

        details.push(
          new vscode.StatementCoverage(count, range, statementBranches.length > 0 ? statementBranches : undefined),
        );
      }

      // 3. Resolve orphaned branches
      const orphanedByLine = new Map<number, vscode.BranchCoverage[]>();
      for (const item of unassignedBranches) {
        if (token.isCancellationRequested) return details;
        const line = item.startPos.line;
        if (!orphanedByLine.has(line)) {
          orphanedByLine.set(line, []);
        }
        orphanedByLine.get(line)!.push(item.branch);
      }

      for (const [line, brs] of orphanedByLine.entries()) {
        if (token.isCancellationRequested) return details;
        const totalExecCount = brs.reduce((sum, b) => sum + (typeof b.executed === 'number' ? b.executed : 0), 0);
        const fallbackRange = new vscode.Range(line, 0, line, 1);
        details.push(new vscode.StatementCoverage(totalExecCount, fallbackRange, brs));
      }

      // 4. Try to compute DeclarationCoverage from functions in the same file
      if (this.data.fileFunctionsJson) {
        for (const func of this.data.fileFunctionsJson) {
          if (token.isCancellationRequested) return details;
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
              details.push(new vscode.DeclarationCoverage(func['name'] || '<unknown>', count, range));
              break;
            }
          }
        }
      }
      this.data.details = details;
      delete this.data.fileDetailsJson;
      delete this.data.fileFunctionsJson;
    } catch (e) {
      this.log.error('Error loading detailed coverage:', e, this.data);
    }
    return details;
  }
}

interface TestRunData {
  tmpDir: {
    path: string;
    remove(): Promise<void>;
  };
  argsProfrawsPath: string;
  argsProfrawsFile: fs.FileHandle;
  argsObjectsPath: string;
  argsObjectsFile: fs.FileHandle;
  argsObjectsFileFirst: boolean;
  dispose: () => void;
}

class LlvmCovTestMateTestRunHandler implements TMA.TestMateTestRunHandler {
  constructor(
    private readonly testRun: TMA.TestMateTestRun,
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly log: Log,
  ) {
    // these configs don't need reload, will be applied for future runs
    const config = vscode.workspace.getConfiguration(configSection);
    this.allowExecutableConcurrentInvocations = config.get<boolean>('allowExecutableConcurrentInvocations', true);
    this.objectsPattern = config.get<string[]>('objects', ['**/*.{dylib,so,dll}']);
    this.extraExportArgs = config.get<string[]>('exportArgs', []);
  }

  allowExecutableConcurrentInvocations: boolean;
  private readonly objectsPattern: string[];
  private readonly extraExportArgs: string[];
  private data: TestRunData | undefined = undefined;
  private readonly tests: ReadonlyArray<vscode.TestItem>[] = [];

  private markAllTestsAsErrored(message: string, error: Error): void {
    markAsErroredFromError(this.testRun, this.tests, message, this.log, error);
  }

  private warnUser(message: string, details: string): void {
    this.log.warn(message, details);
    this.testRun.appendOutput(`\x1b[33mWarning: ${message} Coverage may be partial.\x1b[0m\r\n`);
    if (details) this.testRun.appendOutput(details.replace(/\r?\n/g, '\r\n') + '\r\n');
  }

  async init(): Promise<void> {
    const tmpDirPath = await fs.mkdtemp(pathlib.join(os.tmpdir(), 'llvm-cov_'));
    const argsProfrawsPath = pathlib.join(tmpDirPath, 'profraws.args.txt');
    const argsProfrawsFile = await fs.open(argsProfrawsPath, 'w');
    const argsObjectsPath = pathlib.join(tmpDirPath, 'objects.args.txt');
    const argsObjectsFile = await fs.open(argsObjectsPath, 'w');

    this.data = {
      tmpDir: {
        path: tmpDirPath,
        remove: async function () {
          await fs.rm(this.path, { recursive: true, force: true });
        },
      },
      argsProfrawsPath,
      argsProfrawsFile,
      argsObjectsPath,
      argsObjectsFile,
      argsObjectsFileFirst: true,
      async dispose() {
        await this.argsProfrawsFile.close();
        await this.argsObjectsFile.close();
        await this.tmpDir.remove();
      },
    };
    this.log.debug('tmpDir', this.data.tmpDir.path);
  }

  async endProcess(
    builder: TMA.TestMateProcessBuilder,
    result: 'OK' | 'CancelledByUser' | 'TimeoutByUser' | 'Errored',
    tests: readonly vscode.TestItem[],
    _process: { pid?: number },
  ): Promise<void> {
    if (result === 'OK') {
      if (!this.data) throw Error('assert:data');
      this.tests.push(tests);

      // %p resolves to the PID(s) at runtime, discover the actual files
      const template = builder.env[ENV_LLVM_PROFILE_FILE]!;
      const dir = pathlib.dirname(template);
      const [prefix, suffix] = pathlib.basename(template).split('%p');
      let profrawFiles: string[] | undefined;
      try {
        // plain readdir: the tmp dir is outside the workspace, so `findFiles` (and `files.exclude`) must not be involved
        profrawFiles = (await fs.readdir(dir))
          .filter(f => f.startsWith(prefix) && f.endsWith(suffix) && f.length > prefix.length + suffix.length)
          .map(f => pathlib.join(dir, f));
      } catch (e) {
        this.markAllTestsAsErrored('Failed to list profraw files for ' + template, e);
      }
      if (profrawFiles?.length === 0) {
        this.warnUser(`No profraw file was produced for ${builder.cmd}.`, '');
      }
      for (const p of profrawFiles ?? []) {
        await this.data.argsProfrawsFile.writeFile(p + '\n');
      }

      if (this.data.argsObjectsFileFirst) {
        this.data.argsObjectsFileFirst = false;
        await this.data.argsObjectsFile.writeFile(builder.cmd + '\n');
      } else await this.data.argsObjectsFile.writeFile('-object\n' + builder.cmd + '\n');
    }
  }

  async finalise(progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
    if (!this.data) throw Error('assert:data');
    try {
      if (!this.testRun.token.isCancellationRequested) {
        await this.finaliseInner(progress);
      }
    } finally {
      await this.data.dispose();
    }
  }

  private async finaliseInner(progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
    if (!this.data) throw Error('assert:data');

    progress.report({ message: 'llvm-profdata' });
    const mergedProfdataPath = pathlib.join(this.data.tmpDir.path, 'merged.profdata');
    await this.data.argsProfrawsFile.close().catch(e => {
      this.markAllTestsAsErrored('Error while closing file', e);
    });
    // Use LLVM Response files to bypass OS ARG_MAX limits for profdata
    const mergeArgs = [
      'merge',
      '-sparse',
      // don't abort the whole merge if one profraw is truncated (e.g. a killed death-test child)
      '--failure-mode=all',
      `@${this.data.argsProfrawsPath}`,
      '-o',
      mergedProfdataPath,
    ];
    try {
      this.log.debug('llvm-profdata', mergeArgs);
      const [, mergeStderr] = await executeWithPlatformToolchain(
        'llvm-profdata',
        mergeArgs,
        this.data.tmpDir.path,
        this.testRun.token,
      );
      // with '--failure-mode=all', a bad/truncated input is a warning here rather than a thrown
      // error, so it has to be surfaced to the user or the partial result looks complete.
      if (mergeStderr.trim())
        this.warnUser('llvm-profdata reported problems while merging profiles.', mergeStderr.trim());
    } catch (e) {
      this.markAllTestsAsErrored('Failed to merge profdata. Ensure llvm-profdata is in PATH.', e);
      return;
    }

    progress.report({ message: 'collecting object files' });
    try {
      for (const pattern of this.objectsPattern) {
        // `null` here (not a string) is required to bypass VS Code's `files.exclude`: a string
        // exclude is applied in ADDITION to it, not instead of it, so files hidden from the
        // Explorer (very commonly build/output dirs in C++ workspaces) would otherwise never be
        // found at all - which is exactly the kind of silent coverage gap this glob exists to
        // avoid.
        const sharedLibs = await vscode.workspace.findFiles(
          new vscode.RelativePattern(this.workspaceFolder, pattern),
          null,
        );
        for (const l of sharedLibs) {
          if (this.data.argsObjectsFileFirst) throw Error('assert argsObjectsFileFirst');
          await this.data.argsObjectsFile.writeFile('-object\n' + l.fsPath + '\n');
        }
      }
    } finally {
      await this.data.argsObjectsFile.close().catch(e => {
        this.markAllTestsAsErrored('Error while closing file', e);
      });
    }

    progress.report({ message: 'llvm-cov' });
    const exportArgs = [
      'export',
      `@${this.data.argsObjectsPath}`,
      '-instr-profile',
      mergedProfdataPath,
      '-format=text',
      // macro-expansion regions aren't read anywhere in this extension - free to always skip.
      '-skip-expansions',
      // user-supplied, e.g. `-skip-functions` on a codebase whose export would otherwise be too
      // large (see `exportArgs` markdownDescription)
      ...this.extraExportArgs,
    ];
    let dataArr;
    try {
      this.log.debug('llvm-cov', exportArgs);
      const [outputStr, exportStderr] = await executeWithPlatformToolchain(
        'llvm-cov',
        exportArgs,
        this.data.tmpDir.path,
        this.testRun.token,
      );
      // e.g. "profile data may be out of date" for a stale object vs. a rebuilt binary - exactly
      // the kind of thing a user needs to see when coverage looks wrong or stale.
      if (exportStderr.trim()) this.warnUser('llvm-cov reported problems while exporting.', exportStderr.trim());
      try {
        const coverageJson = JSON.parse(outputStr);
        const covType = coverageJson['type'] as string;
        const covVersion = coverageJson['version'] as string;
        if (covType !== 'llvm.coverage.json.export') throw Error(`wrong type: ${covType}`);
        if (!covVersion.startsWith('2.') && !covVersion.startsWith('3.')) throw Error(`wrong version: ${covVersion}`);
        if (!Array.isArray(coverageJson['data'])) throw Error(`assert: data json array`);
        else dataArr = coverageJson['data'];
      } catch (e) {
        this.markAllTestsAsErrored('Failed to parse coverage JSON', e);
        return;
      }
    } catch (e) {
      this.markAllTestsAsErrored('Failed to export coverage. Ensure llvm-cov is in PATH.', e);
      return;
    }

    progress.report({ message: 'reporting' });
    for (const data of dataArr) {
      if (this.testRun.token.isCancellationRequested) throw Error('canceled');
      if (!Array.isArray(data['files'])) continue;

      const functionsList = Array.isArray(data['functions']) ? data['functions'] : [];

      for (const file of data['files']) {
        if (this.testRun.token.isCancellationRequested) throw Error('canceled');

        const uri = vscode.Uri.file(file['filename']);
        const statementCov = new vscode.TestCoverageCount(
          file['summary']['lines']['covered'],
          file['summary']['lines']['count'],
        );
        const branchCov = new vscode.TestCoverageCount(
          file['summary']['branches']['covered'],
          file['summary']['branches']['count'],
        );
        const declCov = new vscode.TestCoverageCount(
          file['summary']['functions']['covered'],
          file['summary']['functions']['count'],
        );

        this.testRun.addCoverage(
          new LlvmCovFileCoverage(uri, statementCov, branchCov, declCov, this.log, file, functionsList),
        );
      }
    }
  }

  async mapTestRunProcessBuilder(builder: TMA.TestMateProcessBuilder): Promise<TMA.TestMateProcessBuilder> {
    if (!this.data) throw Error('assert:data');
    // every process will have different file so they can run parallel.
    // Relates:
    // - `testMate.cpp.test.parallelExecutionOfExecutableLimit` > 1
    // - `allowExecutableConcurrentInvocations`
    // LLVM profiling runtime replaces %p with the PID, avoiding forked children clobbering it
    const profrawPath = pathlib.join(this.data.tmpDir.path, crypto.randomBytes(16).toString('hex') + '.%p.profraw');
    return {
      ...builder,
      env: { ...builder.env, [ENV_LLVM_PROFILE_FILE]: profrawPath },
    };
  }
}

class TestMateAdapter implements TMA.TestMateTestRunProfileAdapter {
  constructor(private readonly log: Log) {}

  label = label;
  kind = vscode.TestRunProfileKind.Coverage;
  tag?: vscode.TestTag = undefined;

  createTestRunHandler(
    testRun: TMA.TestMateTestRun,
    workspaceFolder: vscode.WorkspaceFolder,
  ): TMA.TestMateTestRunHandler {
    return new LlvmCovTestMateTestRunHandler(testRun, workspaceFolder, this.log);
  }

  async loadDetailedCoverage(
    _testRun: TMA.TestMateTestRun,
    fileCoverage: vscode.FileCoverage,
    token: vscode.CancellationToken,
  ): Promise<vscode.FileCoverageDetail[]> {
    if (fileCoverage instanceof LlvmCovFileCoverage) {
      try {
        return await fileCoverage.load(token);
      } catch (e) {
        this.log.error('loadDetailedCoverage', e, fileCoverage.uri);
        return [];
      }
    } else throw Error('expected FileCoverage');
  }

  dispose(): void {}
}

/**
 * this is how your main.ts could look like
 */
export async function activate(context: vscode.ExtensionContext) {
  const log = new Log(configSection, undefined, label, { depth: 3 }, false);
  context.subscriptions.push(log);

  const testMateExtension = vscode.extensions.getExtension<TMA.TestMateAPI>(testMateExtensionId);
  if (testMateExtension) {
    const testMate = await testMateExtension.activate();
    const adapter = new TestMateAdapter(log);
    const profile = testMate.createTestRunProfile(adapter);
    context.subscriptions.push(adapter, profile);
    log.info('created adapter', adapter.label, adapter.kind, testMateExtensionId);
  } else {
    log.info('missing extension', testMateExtensionId);
  }
}

/**
 * advanced example
 */
export const advanced_activate = create_advanced_activate(configSection, label, log => new TestMateAdapter(log));
