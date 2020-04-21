//TODO add to json
//TODO add labels adn descriptions to json
export interface GroupByExecutable extends TestGrouping {
  sourceIndex?: string;

  label?: string;
  descrption?: string;
}

export interface GroupBySource extends TestGrouping {
  sourceIndex?: string;

  label?: string;
  descrption?: string;

  groupUngroupedTo?: string;
}

export interface GroupByTags extends TestGrouping {
  tags?: string[];

  label?: string;
  descrption?: string;

  groupUngroupedTo?: string;
}

export interface GroupByRegex extends TestGrouping {
  regexes?: string[];

  label?: string;
  descrption?: string;

  groupUngroupedTo?: string;
}

///

export interface TestGrouping {
  groupByExecutable?: GroupByExecutable;

  groupBySource?: GroupBySource;

  groupByTags?: GroupByTags;

  groupByRegex?: GroupByRegex;
}
