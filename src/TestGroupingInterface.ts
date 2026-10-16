export interface GroupByLabel extends TestGroupingConfig {
  label?: string;
  description?: string;
  testName?: string;
}

export interface GroupByExecutable extends TestGroupingConfig {
  label?: string;
  description?: string;
  mergeByLabel?: boolean;
}

export interface GroupBySource extends TestGroupingConfig {
  label?: string;
  description?: string;

  groupUngroupedTo?: string;
}

export interface GroupBySplittedTestName extends TestGroupingConfig {
  splitBy?: string;
}

export interface GroupByTags extends TestGroupingConfig {
  tags?: string[][];

  label?: string; // ${tags} will by substituted
  description?: string;

  groupUngroupedTo?: string;
}

export interface GroupByTagRegex extends TestGroupingConfig {
  regexes?: string[];

  label?: string; // ${match}, ${match_lowercased}, ${match_upperfirst} will by substituted
  description?: string;

  groupUngroupedTo?: string;
}

export type GroupByRegex = GroupByTagRegex;

///

export type TestGroupingType =
  | 'groupByLabel'
  | 'groupByExecutable'
  | 'groupBySource'
  | 'groupBySplittedTestName'
  | 'groupByTags'
  | 'groupByTagRegex'
  | 'groupByRegex';

export interface TestGroupingConfig extends Partial<Record<TestGroupingType, TestGroupingConfig>> {
  groupByLabel?: GroupByLabel;

  groupByExecutable?: GroupByExecutable;

  groupBySource?: GroupBySource;

  groupBySplittedTestName?: GroupBySplittedTestName;

  groupByTags?: GroupByTags;

  groupByTagRegex?: GroupByTagRegex;

  groupByRegex?: GroupByRegex;

  tagFormat?: string; // use "[${tag}]"
}

export function* testGroupIterator(
  testGrouping: TestGroupingConfig,
): IterableIterator<[TestGroupingType, TestGroupingConfig]> {
  while (testGrouping) {
    if (testGrouping.groupByLabel) {
      testGrouping = testGrouping.groupByLabel;
      yield ['groupByLabel', testGrouping];
    } else if (testGrouping.groupByExecutable) {
      testGrouping = testGrouping.groupByExecutable;
      yield ['groupByExecutable', testGrouping];
    } else if (testGrouping.groupBySource) {
      testGrouping = testGrouping.groupBySource;
      yield ['groupBySource', testGrouping];
    } else if (testGrouping.groupBySplittedTestName) {
      testGrouping = testGrouping.groupBySplittedTestName;
      yield ['groupBySource', testGrouping];
    } else if (testGrouping.groupByTags) {
      testGrouping = testGrouping.groupByTags;
      yield ['groupByTags', testGrouping];
    } else if (testGrouping.groupByTagRegex) {
      testGrouping = testGrouping.groupByTagRegex;
      yield ['groupByTagRegex', testGrouping];
    } else if (testGrouping.groupByRegex) {
      testGrouping = testGrouping.groupByRegex;
      yield ['groupByRegex', testGrouping];
    } else {
      return;
    }
  }
}

export async function testGroupingForEach(
  testGrouping: TestGroupingConfig,
  callbacks: {
    groupByLabel: (g: GroupByLabel) => Promise<void>;
    groupByExecutable: (g: GroupByExecutable) => Promise<void>;
    groupBySource: (g: GroupBySource) => Promise<void>;
    groupBySplittedTestName: (g: GroupBySplittedTestName) => Promise<void>;
    groupByTags: (g: GroupByTags) => Promise<void>;
    groupByTagRegex: (g: GroupByTagRegex) => Promise<void>;
    groupByRegex: (g: GroupByRegex) => Promise<void>;
  },
): Promise<void> {
  while (testGrouping) {
    if (testGrouping.groupByLabel) {
      testGrouping = testGrouping.groupByLabel;
      await callbacks.groupByLabel(testGrouping);
    } else if (testGrouping.groupByExecutable) {
      testGrouping = testGrouping.groupByExecutable;
      await callbacks.groupByExecutable(testGrouping);
    } else if (testGrouping.groupBySource) {
      testGrouping = testGrouping.groupBySource;
      await callbacks.groupBySource(testGrouping);
    } else if (testGrouping.groupBySplittedTestName) {
      testGrouping = testGrouping.groupBySplittedTestName;
      await callbacks.groupBySplittedTestName(testGrouping);
      return; // because this should be a leaf
    } else if (testGrouping.groupByTags) {
      testGrouping = testGrouping.groupByTags;
      await callbacks.groupByTags(testGrouping);
    } else if (testGrouping.groupByTagRegex) {
      testGrouping = testGrouping.groupByTagRegex;
      await callbacks.groupByTagRegex(testGrouping);
    } else if (testGrouping.groupByRegex) {
      testGrouping = testGrouping.groupByRegex;
      await callbacks.groupByRegex(testGrouping);
    } else {
      return;
    }
  }
}
