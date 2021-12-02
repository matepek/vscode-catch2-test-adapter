import * as c2fs from './util/FSWrapper';
import { RunnableProperties } from './RunnableProperties';
import { AbstractExecutable } from './AbstractExecutable';
import { Catch2Executable } from './framework/Catch2Executable';
import { GoogleTestExecutable } from './framework/GoogleTestExecutable';
import { DOCExecutable } from './framework/DOCExecutable';
import { FrameworkSpecific, RunTask } from './AdvancedExecutableInterface';
import { Version } from './Util';
import { Spawner, SpawnOptionsWithoutStdio } from './Spawner';
import { GoogleBenchmarkExecutable } from './framework/GoogleBenchmarkExecutable';
import { ResolveRuleAsync } from './util/ResolveRule';
import { WorkspaceShared } from './WorkspaceShared';
import { Framework, FrameworkId, FrameworkType } from './framework/Framework';

export class ExecutableFactory {
  public constructor(
    private readonly _shared: WorkspaceShared,
    private readonly _execName: string | undefined,
    private readonly _execDescription: string | undefined,
    private readonly _execPath: string,
    private readonly _execOptions: SpawnOptionsWithoutStdio,
    private readonly _varToValue: ResolveRuleAsync[],
    private readonly _parallelizationLimit: number,
    private readonly _markAsSkipped: boolean,
    private readonly _runTask: RunTask,
    private readonly _spawner: Spawner,
    private readonly _sourceFileMap: Record<string, string>,
    private readonly _frameworkSpecific: Record<FrameworkType, FrameworkSpecific>,
  ) {}

  public async create(checkIsNativeExecutable: boolean): Promise<AbstractExecutable | undefined> {
    const runWithHelpRes = await this._shared.taskPool.scheduleTask(async () => {
      if (checkIsNativeExecutable) await c2fs.isNativeExecutableAsync(this._execPath);

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
        const properties = new RunnableProperties(
          this._execName,
          this._execDescription,
          this._varToValue,
          this._execPath,
          this._execOptions,
          frameworkSpecific,
          this._parallelizationLimit,
          this._markAsSkipped,
          this._runTask,
          this._spawner,
          this._sourceFileMap,
        );

        return frameworkData.create(this._shared, properties, match);
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
    create: (shared: WorkspaceShared, prop: RunnableProperties, match: RegExpMatchArray) => AbstractExecutable;
  }>
> = {
  catch2: {
    priority: 10,
    regex: /Catch v(\d+)\.(\d+)\.(\d+)\s?/,
    create: (shared: WorkspaceShared, prop: RunnableProperties, match: RegExpMatchArray) =>
      new Catch2Executable(shared, prop, parseVersion123(match)),
  },
  gtest: {
    priority: 20,
    regex:
      /This program contains tests written using .*--(\w+)list_tests.*List the names of all tests instead of running them/s,
    create: (shared: WorkspaceShared, prop: RunnableProperties, match: RegExpMatchArray) =>
      new GoogleTestExecutable(shared, prop, match[1] ?? 'gtest_'),
  },
  doctest: {
    priority: 30,
    regex: /doctest version is "(\d+)\.(\d+)\.(\d+)"/,
    create: (shared: WorkspaceShared, prop: RunnableProperties, match: RegExpMatchArray) =>
      new DOCExecutable(shared, prop, parseVersion123(match)),
  },
  gbenchmark: {
    priority: 40,
    regex: /benchmark \[--benchmark_list_tests=\{true\|false\}\]/,
    create: (shared: WorkspaceShared, prop: RunnableProperties) => new GoogleBenchmarkExecutable(shared, prop),
  },
  'google-insider': {
    priority: 50,
    regex: /Try --helpfull to get a list of all flags./,
    create: (shared: WorkspaceShared, prop: RunnableProperties) => new GoogleTestExecutable(shared, prop, 'gunit_'),
  },
};

const frameworkIdsSorted = Object.keys(frameworkDatas).sort(
  (a: string, b: string) => frameworkDatas[a as FrameworkId].priority - frameworkDatas[b as FrameworkId].priority,
) as ReadonlyArray<FrameworkId>;

function parseVersion123(match: RegExpMatchArray): Version | undefined {
  if (match && match.length === 4 && Number(match[1]) !== NaN && Number(match[2]) !== NaN && Number(match[3]) !== NaN) {
    return new Version(Number(match[1]), Number(match[2]), Number(match[3]));
  } else {
    return undefined;
  }
}
