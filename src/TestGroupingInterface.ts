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

  label?: string;
  description?: string;

  groupUngroupedTo?: string;
}

export interface GroupByRegex extends TestGrouping {
  regexes?: string[];

  label?: string;
  description?: string;

  groupUngroupedTo?: string;
}

///

export interface TestGrouping {
  groupByExecutable?: GroupByExecutable;

  groupBySource?: GroupBySource;

  groupByTags?: GroupByTags;

  groupByRegex?: GroupByRegex;
}
