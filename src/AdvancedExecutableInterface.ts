import { TestGrouping } from './TestGroupingInterface';

///

export type AdvancedExecutableArray = Array<AdvancedExecutable>;

export interface AdvancedExecutable {
  comment?: string;
  pattern?: string;
  name?: string;
  description?: string;
  cwd?: string;
  env?: Record<string, string>;
  envFile?: string;
  dependsOn?: Array<string>;
  runTask?: RunTask;
  parallelizationLimit?: number;
  strictPattern?: boolean;
  catch2?: FrameworkSpecific;
  gtest?: FrameworkSpecific;
  doctest?: FrameworkSpecific;
  gbenchmark?: FrameworkSpecific;
  testGrouping?: TestGrouping;
  executionWrapper?: ExecutionWrapper;
  darwin: AdvancedExecutable;
  linux: AdvancedExecutable;
  win32: AdvancedExecutable;
}

export interface RunTask {
  before?: Array<string>;
  beforeEach?: Array<string>;
  after?: Array<string>;
  afterEach?: Array<string>;
}

export interface ExecutionWrapper {
  path: string;
  args?: Array<string>;
}

export interface FrameworkSpecific {
  testGrouping?: TestGrouping;
  helpRegex?: string;
  prependTestRunningArgs?: Array<string>;
  prependTestListingArgs?: Array<string>;
  ignoreTestEnumerationStdErr?: boolean;
  'debug.enableOutputColouring'?: boolean;
  failIfExceedsLimitNs?: number;
}
