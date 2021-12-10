export interface GroupByExecutable extends TestGrouping {
  label?: string;
  description?: string;
}

export interface GroupBySource extends TestGrouping {
  label?: string;
  description?: string;

  groupUngroupedTo?: string;
}

export interface GroupByTags extends TestGrouping {
  tags?: string[][];

  label?: string; // ${tags} will by substituted
  description?: string;

  groupUngroupedTo?: string;
}

export interface GroupByTagRegex extends TestGrouping {
  regexes?: string[];

  label?: string; // ${match}, ${match_lowercased}, ${match_upperfirst} will by substituted
  description?: string;

  groupUngroupedTo?: string;
}

export type GroupByRegex = GroupByTagRegex;

///

export type TestGroupingType =
  | 'groupByExecutable'
  | 'groupBySource'
  | 'groupByTags'
  | 'groupByTagRegex'
  | 'groupByRegex';

export interface TestGrouping extends Partial<Record<TestGroupingType, TestGrouping>> {
  groupByExecutable?: GroupByExecutable;

  groupBySource?: GroupBySource;

  groupByTags?: GroupByTags;

  groupByTagRegex?: GroupByTagRegex;

  groupByRegex?: GroupByRegex;

  tagFormat?: string; // use "[${tag}]"
}

export function* testGroupIterator(testGrouping: TestGrouping): IterableIterator<[TestGroupingType, TestGrouping]> {
  while (testGrouping) {
    if (testGrouping.groupByExecutable) {
      testGrouping = testGrouping.groupByExecutable;
      yield ['groupByExecutable', testGrouping];
    } else if (testGrouping.groupBySource) {
      testGrouping = testGrouping.groupBySource;
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
  testGrouping: TestGrouping,
  callbacks: {
    groupByExecutable: (g: GroupByExecutable) => Promise<void>;
    groupBySource: (g: GroupBySource) => Promise<void>;
    groupByTags: (g: GroupByTags) => Promise<void>;
    groupByTagRegex: (g: GroupByTagRegex) => Promise<void>;
    groupByRegex: (g: GroupByRegex) => Promise<void>;
  },
): Promise<void> {
  while (testGrouping) {
    if (testGrouping.groupByExecutable) {
      testGrouping = testGrouping.groupByExecutable;
      await callbacks.groupByExecutable(testGrouping);
    } else if (testGrouping.groupBySource) {
      testGrouping = testGrouping.groupBySource;
      await callbacks.groupBySource(testGrouping);
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
