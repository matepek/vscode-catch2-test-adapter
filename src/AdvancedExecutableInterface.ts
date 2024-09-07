import { DebugConfig } from './DebugConfigType';
import { TestGroupingConfig } from './TestGroupingInterface';

///

export type AdvancedExecutableConfigArray = Array<AdvancedExecutableConfig>;

export type AdvancedExecutableConfig = {
  pattern: ResolvableString;
  patternAsAbsPath?: boolean;
  exclude: string;
  name?: ResolvableString;
  description?: ResolvableString;
  comment?: string;
  cwd?: ResolvableString;
  env?: Record<string, ResolvableString>;
  envFile?: ResolvableString;
  dependsOn?: Array<ResolvableString>;
  runTask?: RunTaskConfig;
  parallelizationLimit?: number;
  strictPattern?: boolean;
  markAsSkipped?: boolean;
  executableCloning?: boolean;
  executableSuffixToInclude?: string[];
  waitForBuildProcess?: boolean | string;
  'debug.configTemplate': DebugConfig;
  catch2?: FrameworkSpecificConfig;
  gtest?: FrameworkSpecificConfig;
  doctest?: FrameworkSpecificConfig;
  gbenchmark?: FrameworkSpecificConfig;
  testGrouping?: TestGroupingConfig;
  executionWrapper?: ExecutionWrapperConfig;
  sourceFileMap?: Record<string, ResolvableString>;
  darwin?: AdvancedExecutableConfig;
  linux?: AdvancedExecutableConfig;
  win32?: AdvancedExecutableConfig;
};

export interface RunTaskConfig {
  before?: Array<TaskName>;
  beforeEach?: Array<TaskName>;
  after?: Array<TaskName>;
  afterEach?: Array<TaskName>;
}

export interface ExecutionWrapperConfig {
  path: ResolvableString;
  args?: Array<ResolvableString>;
}

export interface FrameworkSpecificConfig {
  testGrouping?: TestGroupingConfig;
  helpRegex?: string;
  prependTestRunningArgs?: Array<string>;
  prependTestListingArgs?: Array<string>;
  ignoreTestEnumerationStdErr?: boolean;
  'debug.enableOutputColouring'?: boolean;
  failIfExceedsLimitNs?: number;
}

type ResolvableString = string;
type TaskName = string;
