import { TestGrouping } from './TestGroupingInterface';

///

export interface AdvancedExecutableWithScope extends AdvancedExecutable, OSScope {}

///

interface AdvancedExecutable {
  comment?: string;
  pattern?: string;
  name?: string;
  description?: string;
  cwd?: string;
  env?: { [key: string]: string };
  envFile?: string;
  dependsOn?: string[];
  runTask?: RunTask;
  parallelizationLimit?: number;
  strictPattern?: boolean;
  catch2?: FrameworkSpecific;
  gtest?: FrameworkSpecific;
  doctest?: FrameworkSpecific;
  testGrouping?: TestGrouping;
  executionWrapper?: ExecutionWrapper;
}

export interface RunTask {
  before?: string[];
  beforeEach?: string[];
  after?: string[];
  afterEach?: string[];
}

export interface ExecutionWrapper {
  path: string;
  args?: string[];
}

export interface FrameworkSpecific {
  testGrouping?: TestGrouping;
  helpRegex?: string;
  prependTestRunningArgs?: string[];
  prependTestListingArgs?: string[];
  ignoreTestEnumerationStdErr?: boolean;
  'debug.enableOutputColouring'?: boolean;
}

type OSScope = { [scope in NodeJS.Platform]?: AdvancedExecutable };
