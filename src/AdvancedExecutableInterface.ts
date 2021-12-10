import { TestGroupingConfig } from './TestGroupingInterface';
import { FrameworkType } from './framework/Framework';

///

export type AdvancedExecutableConfigArray = Array<AdvancedExecutableConfig>;

export type AdvancedExecutableConfig = {
  comment?: string;
  pattern?: string;
  name?: string;
  description?: string;
  cwd?: string;
  env?: Record<string, string>;
  envFile?: string;
  dependsOn?: Array<string>;
  runTask?: RunTaskConfig;
  parallelizationLimit?: number;
  strictPattern?: boolean;
  markAsSkipped?: boolean;
  waitForBuildProcess?: boolean;
  catch2?: FrameworkSpecificConfig;
  gtest?: FrameworkSpecificConfig;
  doctest?: FrameworkSpecificConfig;
  gbenchmark?: FrameworkSpecificConfig;
  testGrouping?: TestGroupingConfig;
  executionWrapper?: ExecutionWrapperConfig;
  sourceFileMap?: Record<string, string>;
  darwin?: AdvancedExecutableConfig;
  linux?: AdvancedExecutableConfig;
  win32?: AdvancedExecutableConfig;
} & Record<FrameworkType, FrameworkSpecificConfig>;

export interface RunTaskConfig {
  before?: Array<string>;
  beforeEach?: Array<string>;
  after?: Array<string>;
  afterEach?: Array<string>;
}

export interface ExecutionWrapperConfig {
  path: string;
  args?: Array<string>;
}

export interface FrameworkSpecificConfig {
  testGrouping?: TestGroupingConfig;
  helpRegex?: string;
  prependTestRunningArgs?: Array<string>;
  prependTestListingArgs?: Array<string>;
  ignoreTestEnumerationStdErr?: boolean;
  'debug.enableOutputColouring'?: boolean;
  failIfExceedsLimitNs?: number;
  'test.enabledSubTestListing'?: boolean;
}
