//TODO add to json
//TODO add labels adn descriptions to json
export interface GroupByExecutable extends TestGrouping {
  sourceIndex?: string;

  label?: string;
  description?: string;
  tooltip?: string;
}

export interface GroupBySource extends TestGrouping {
  sourceIndex?: string;

  label?: string;
  description?: string;

  groupUngroupedTo?: string;
}

export interface GroupByTags extends TestGrouping {
  tags?: string[];

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
