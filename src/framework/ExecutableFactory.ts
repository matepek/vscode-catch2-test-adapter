import * as c2fs from '../util/FSWrapper';
import { SharedVarOfExec } from './SharedVarOfExec';
import { AbstractExecutable } from './AbstractExecutable';
import { Catch2Executable } from './Catch2/Catch2Executable';
import { GoogleTestExecutable } from './GoogleTest/GoogleTestExecutable';
import { DOCExecutable } from './doctest/DOCExecutable';
import { FrameworkSpecificConfig, RunTaskConfig } from '../AdvancedExecutableInterface';
import { Version } from '../Util';
import { Spawner, SpawnOptionsWithoutStdio } from '../Spawner';
import { GoogleBenchmarkExecutable } from './GoogleBenchmark/GoogleBenchmarkExecutable';
import { ResolveRuleAsync } from '../util/ResolveRule';
import { WorkspaceShared } from '../WorkspaceShared';
import { Framework, FrameworkId, FrameworkType } from './Framework';

export class ExecutableFactory {
  constructor(
    private readonly _shared: WorkspaceShared,
    private readonly _execName: string | undefined,
    private readonly _execDescription: string | undefined,
    private readonly _execPath: string,
    private readonly _execOptions: SpawnOptionsWithoutStdio,
    private readonly _varToValue: ResolveRuleAsync[],
    private readonly _parallelizationLimit: number,
    private readonly _markAsSkipped: boolean,
    private readonly _executableCloning: boolean,
    private readonly _executableSuffixToInclude: Set<string> | undefined,
    private readonly _executableSuffixToExclude: Set<string> | undefined,
    private readonly _runTask: RunTaskConfig,
    private readonly _spawner: Spawner,
    private readonly _resolvedSourceFileMap: Record<string, string>,
    private readonly _frameworkSpecific: Record<FrameworkType, FrameworkSpecificConfig>,
  ) {}

  async create(checkIsNativeExecutable: boolean): Promise<AbstractExecutable | undefined> {
    const runWithHelpRes = await this._shared.taskPool.scheduleTask(async () => {
      if (checkIsNativeExecutable)
        await c2fs.isNativeExecutableAsync(
          this._execPath,
          this._executableSuffixToInclude,
          this._executableSuffixToExclude,
        );

      return this._spawner.spawnAsync(this._execPath, ['--help'], this._execOptions, this._shared.execParsingTimeout);
    });
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
    // s: dotAll
    // u: unicode
    const regexFlags = 'su';

    for (const frameworkId of frameworkIdsSorted) {
      const frameworkData = frameworkDatas[frameworkId];
      const framework = Framework.map[frameworkId];
      const frameworkSpecific = this._frameworkSpecific[framework.type];
      let regex: RegExp;

      if (frameworkSpecific.helpRegex) {
        this._shared.log.info('Custom regex', framework.id, framework.type, frameworkSpecific.helpRegex);
        regex = new RegExp(frameworkSpecific.helpRegex!, regexFlags);
      } else {
        regex = frameworkData.regex;
      }

      const match = runWithHelpRes.stdout.match(regex);

      if (match) {
        const sharedVarOfExec = new SharedVarOfExec(
          this._shared,
          this._execName,
          this._execDescription,
          this._varToValue,
          this._execPath,
          this._execOptions,
          frameworkSpecific,
          this._parallelizationLimit,
          this._markAsSkipped,
          this._executableCloning,
          this._runTask,
          this._spawner,
          this._resolvedSourceFileMap,
        );

        return frameworkData.create(sharedVarOfExec, match);
      }
    }

    this._shared.log.debug('Not a supported test executable', {
      spawner: this._spawner,
      execPath: this._execPath,
      stdout: runWithHelpRes.stdout,
      stderr: runWithHelpRes.stderr,
    });
    return undefined;
  }
}

const frameworkDatas: Record<
  FrameworkId,
  Readonly<{
    priority: number;
    regex: RegExp;
    create: (sharedVarOfExec: SharedVarOfExec, match: RegExpMatchArray) => AbstractExecutable;
  }>
> = {
  catch2: {
    priority: 10,
    regex: /Catch2? v(\d+)\.(\d+)\.(\d+)\s?/,
    create: (sharedVarOfExec: SharedVarOfExec, match: RegExpMatchArray) =>
      new Catch2Executable(sharedVarOfExec, parseVersion123(match)),
  },
  gtest: {
    priority: 20,
    regex:
      /This program contains tests written using .*--(\w+)list_tests.*List the names of all tests instead of running them/s,
    create: (sharedVarOfExec: SharedVarOfExec, match: RegExpMatchArray) =>
      new GoogleTestExecutable(sharedVarOfExec, match[1] ?? 'gtest_'),
  },
  doctest: {
    priority: 30,
    regex: /doctest version is "(\d+)\.(\d+)\.(\d+)"/,
    create: (sharedVarOfExec: SharedVarOfExec, match: RegExpMatchArray) =>
      new DOCExecutable(sharedVarOfExec, parseVersion123(match)),
  },
  gbenchmark: {
    priority: 40,
    regex: /benchmark \[--benchmark_list_tests=\{true\|false\}\]/,
    create: (sharedVarOfExec: SharedVarOfExec) => new GoogleBenchmarkExecutable(sharedVarOfExec),
  },
  'google-insider': {
    priority: 50,
    regex: /Try --helpfull to get a list of all flags./,
    create: (sharedVarOfExec: SharedVarOfExec) => new GoogleTestExecutable(sharedVarOfExec, 'gunit_'),
  },
};

const frameworkIdsSorted = Object.keys(frameworkDatas).sort(
  (a: string, b: string) => frameworkDatas[a as FrameworkId].priority - frameworkDatas[b as FrameworkId].priority,
) as ReadonlyArray<FrameworkId>;

function parseVersion123(match: RegExpMatchArray): Version | undefined {
  const major = parseInt(match[1]);
  const minor = parseInt(match[2]);
  const patch = parseInt(match[3]);
  if (match && match.length === 4 && !Number.isNaN(major) && !Number.isNaN(minor) && !Number.isNaN(patch)) {
    return new Version(major, minor, patch);
  } else {
    return undefined;
  }
}
