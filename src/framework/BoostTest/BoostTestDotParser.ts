export interface BoostTestCaseInfo {
  path: string[]; // without the master test suite
  file: string | undefined;
  line: string | undefined;
  enabled: boolean;
  labels: string[]; // own and inherited from the parent suites
  expectedFailures: number;
  timeoutSec: number | undefined;
}

interface DotNode {
  id: number;
  name: string;
  file: string | undefined;
  line: string | undefined;
  enabled: boolean;
  labels: string[];
  expectedFailures: number;
  timeoutSec: number | undefined;
  parent: DotNode | undefined;
}

const nodeRe = /^tu(\d+)\[shape=\w+,.*?color=(\w+),label="(.*)"\];$/;
const parentChildEdgeRe = /^tu(\d+) -> tu(\d+);$/;
const fileLineRe = /^(.*)\((\d+)\)$/;

// Boost.Test sets the upper bits of the id for test cases (see test_id_2_unit_type)
const isTestCaseId = (id: number): boolean => id >= 0x10000;

/**
 * Parses the output of `--list_content=DOT`.
 * Example node: `tu65579[shape=Mrecord,fontname=Helvetica,color=green,label="combined|/a.cpp(270)|timeout=10|expected failures=1|labels: @a"];`
 */
export function parseBoostTestDot(dot: string): BoostTestCaseInfo[] {
  const nodes = new Map<number, DotNode>();
  let master: DotNode | undefined = undefined;

  for (const rawLine of dot.split(/\r?\n/)) {
    const line = rawLine.trim();

    const nodeMatch = line.match(nodeRe);
    if (nodeMatch) {
      const id = parseInt(nodeMatch[1]);
      const [name, fileLine, ...extras] = nodeMatch[3].split('|');
      const node: DotNode = {
        id,
        name,
        file: undefined,
        line: undefined,
        enabled: nodeMatch[2] === 'green',
        labels: [],
        expectedFailures: 0,
        timeoutSec: undefined,
        parent: undefined,
      };

      const fl = fileLine?.match(fileLineRe);
      if (fl) {
        node.file = fl[1];
        node.line = fl[2];
      }

      for (const extra of extras) {
        if (extra.startsWith('timeout=')) {
          node.timeoutSec = parseInt(extra.substring('timeout='.length));
        } else if (extra.startsWith('expected failures=')) {
          node.expectedFailures = parseInt(extra.substring('expected failures='.length));
        } else if (extra.startsWith('labels:')) {
          node.labels = extra
            .substring('labels:'.length)
            .split(' ')
            .filter(l => l.startsWith('@'))
            .map(l => l.substring(1));
        }
      }

      if (master === undefined) master = node;
      nodes.set(id, node);
      continue;
    }

    // dependency edges have attributes (`[color=red,style=dotted,...]`) so they don't match
    const edgeMatch = line.match(parentChildEdgeRe);
    if (edgeMatch) {
      const parent = nodes.get(parseInt(edgeMatch[1]));
      const child = nodes.get(parseInt(edgeMatch[2]));
      if (parent && child) child.parent = parent;
    }
  }

  const result: BoostTestCaseInfo[] = [];

  for (const node of nodes.values()) {
    if (node === master || !isTestCaseId(node.id)) continue;

    const path: string[] = [];
    const labels = [...node.labels];
    for (let p: DotNode | undefined = node; p !== undefined && p !== master; p = p.parent) {
      path.unshift(p.name);
      if (p !== node) labels.push(...p.labels.filter(l => labels.indexOf(l) === -1));
    }
    if (master) labels.push(...master.labels.filter(l => labels.indexOf(l) === -1));

    result.push({
      path,
      file: node.file,
      line: node.line,
      enabled: node.enabled,
      labels,
      expectedFailures: node.expectedFailures,
      timeoutSec: node.timeoutSec,
    });
  }

  return result;
}
