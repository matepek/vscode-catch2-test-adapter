///
// Parsers for CppUTest's console output. Deliberately free of any `vscode` dependency so they can
// be unit tested: see `test/CppUTestOutputParser.test.ts`.
///

/**
 * Recognises CppUTest from the output of `--help`.
 *
 * `--help` is not a known option, so CppUTest answers it with its usage line on stdout
 * (`CommandLineTestRunner.cpp`: `output_->print(... arguments_->usage())`, a `ConsoleTestOutput`).
 * The word "CppUTest" appears only in the extended `-h` text, so the usage line is all there is.
 *
 * Its wording moved a lot between releases, so match only on what all of them share:
 * - v3.3-v3.5: `usage [-v] [-r#] [-g|sg groupName] [-n|sn testName] [-o{normal, junit}]`
 * - v3.6: gained `[-c]` and `[-k packageName]`
 * - v3.7-3.7.2: gained `[-p] [-lg] [-ln]` and `["TEST(groupName, testName)"]...`
 * - v3.8: gained `[-ri]`, `xg|xsg`, `teamcity`
 * - v4.0: wrapped over several lines, gained `[-h] [-vv] [-t] [-b] [-s]`
 * - master: `["[IGNORE_]TEST(<groupName>, <testName>)"]`, `<>` around the placeholders,
 *   `[-o{normal|eclipse|junit|teamcity}]`
 *
 * `-g|sg ... groupName` and `-o{normal` are present in every one of them and in none of the other
 * supported frameworks' help output. Note that the factory applies the `su` flags.
 */
export const cppUTestHelpRegex = /usage \[-.*\[-g\|sg[^\]]*groupName[^\]]*\].*\[-o\{normal/;

///

export interface CppUTestId {
  group: string;
  name: string;
}

/**
 * `-ln` prints every test as `Group.Name`, space separated, on a single line and without a trailing
 * newline. It carries no file/line and it cannot tell `IGNORE_TEST` apart from `TEST`.
 * Group and test name are both C identifiers, so splitting at the first '.' is unambiguous.
 */
export const parseTestListOutput = (stdout: string): { tests: CppUTestId[]; malformed: string[] } => {
  const tests: CppUTestId[] = [];
  const malformed: string[] = [];

  for (const entry of stdout.split(/\s+/)) {
    if (entry.length === 0) continue;

    const separatorIndex = entry.indexOf('.');
    if (separatorIndex < 1 || separatorIndex === entry.length - 1) {
      malformed.push(entry);
      continue;
    }

    tests.push({ group: entry.substring(0, separatorIndex), name: entry.substring(separatorIndex + 1) });
  }

  return { tests, malformed };
};

///

export interface CppUTestDiff {
  expected: string;
  actual: string;
  /** `DOUBLES_EQUAL` appends `threshold used was <0.1>` after the value. */
  note: string | undefined;
  /** Index of the `expected <...>` line inside `CppUTestFailureInfo.message`. */
  index: number;
}

export interface CppUTestFailureInfo {
  /** Location of the test itself: the first `error:` line. */
  testFile: string;
  testLine: string;
  /** Where the message belongs: the second `error:` line when CppUTest prints one, else the first. */
  file: string;
  line: string;
  /** The message as printed, with the single leading tab of each line removed. */
  message: string[];
  diff: CppUTestDiff | undefined;
}

export interface CppUTestEventHandler {
  testStarted(group: string, name: string, isIgnored: boolean): Promise<void> | void;
  testFailure(failure: CppUTestFailureInfo): Promise<void> | void;
  /** A line the running test wrote to stdout. */
  testOutput(line: string): void;
  testFinished(durationMilisec: number, isIgnored: boolean, hasFailure: boolean): Promise<void> | void;
  /** A line outside of any test. `isUninteresting` marks blanks, the summary and framework notices. */
  rootOutput(line: string, isUninteresting: boolean): void;
}

///

// `TEST(Group, name)` or `IGNORE_TEST(Group, name)`. Anything the test writes to stdout is glued
// to the end of this very line, so the remainder has to be processed too.
const testBeginRe = /^(TEST|IGNORE_TEST)\(([a-zA-Z_]\w*), ([a-zA-Z_]\w*)\)(.*)$/;
// ` - 12 ms` terminates a test. It can share the line with the begin marker, with the test's own
// output or with a `UT_PRINT`, hence the greedy prefix.
const testEndRe = /^(.*) - (\d+) ms$/;
// `/path/to/file.cpp:23: error: Failure in TEST(Group, name)`
const failureRe = /^(.+):(\d+): error: Failure in (?:IGNORE_)?TEST\([a-zA-Z_]\w*, [a-zA-Z_]\w*\)$/;
// Failures in `setup`, `teardown` or in a helper function add a second location line which is the
// actual assert location, the first one being the test's location.
const failureLocationRe = /^(.+):(\d+): error:$/;
const expectedRe = /^expected <(.*)>$/;
const butWasRe = /^but was\s+<(.*)>$/;
// Requiring a space after the closing '>' keeps values which contain a '>' on the greedy branch.
const butWasWithNoteRe = /^but was\s+<(.*?)> (.+)$/;
const summaryRe = /^(OK|Errors) \(.*\)$/;

const parseButWas = (line: string): { actual: string; note: string | undefined } | undefined => {
  const withNote = butWasWithNoteRe.exec(line);
  if (withNote) return { actual: withNote[1], note: withNote[2] };
  const plain = butWasRe.exec(line);
  if (plain) return { actual: plain[1], note: undefined };
  return undefined;
};

export const isUninterestingLine = (line: string): boolean =>
  line.length === 0 ||
  summaryRe.test(line) ||
  line.startsWith('Note: test run failed because no tests were run or ignored.') ||
  line.startsWith('Test order shuffling enabled with seed:');

interface CurrentTest {
  isIgnored: boolean;
  failure: CppUTestFailureInfo | undefined;
  hasFailure: boolean;
}

/**
 * Line oriented state machine for the output of `-v`. A test begins with a `TEST(...)` marker and
 * ends with ` - N ms`, but both can share their line with the test's own stdout, so the terminator
 * may arrive in the middle of a failure block.
 */
export class CppUTestRunOutputParser {
  constructor(private readonly handler: CppUTestEventHandler) {}

  private _current: CurrentTest | undefined = undefined;

  get isInsideTest(): boolean {
    return this._current !== undefined;
  }

  async online(line: string): Promise<void> {
    if (this._current === undefined) {
      const beginMatch = testBeginRe.exec(line);

      if (beginMatch === null) {
        this.handler.rootOutput(line, isUninterestingLine(line));
        return;
      }

      const isIgnored = beginMatch[1] === 'IGNORE_TEST';
      this._current = { isIgnored, failure: undefined, hasFailure: false };
      await this.handler.testStarted(beginMatch[2], beginMatch[3], isIgnored);

      if (beginMatch[4].length > 0) await this._processLine(beginMatch[4]);
    } else {
      await this._processLine(line);
    }
  }

  private async _processLine(line: string): Promise<void> {
    const current = this._current!;
    const endMatch = testEndRe.exec(line);

    if (endMatch) {
      if (endMatch[1].length > 0) await this._processContentLine(endMatch[1]);
      await this._flushFailure();

      const hasFailure = current.hasFailure;
      this._current = undefined;
      await this.handler.testFinished(Number(endMatch[2]), current.isIgnored, hasFailure);
    } else {
      await this._processContentLine(line);
    }
  }

  private async _processContentLine(line: string): Promise<void> {
    const current = this._current!;
    const failureMatch = failureRe.exec(line);

    if (failureMatch) {
      await this._flushFailure();
      current.failure = {
        testFile: failureMatch[1],
        testLine: failureMatch[2],
        file: failureMatch[1],
        line: failureMatch[2],
        message: [],
        diff: undefined,
      };
      return;
    }

    const failure = current.failure;

    if (failure) {
      if (failure.message.length === 0) {
        const locationMatch = failureLocationRe.exec(line);
        if (locationMatch) {
          failure.file = locationMatch[1];
          failure.line = locationMatch[2];
          return;
        }
      }

      if (line.length === 0) {
        await this._flushFailure();
        return;
      }

      failure.message.push(line.startsWith('\t') ? line.substring(1) : line);
      return;
    }

    this.handler.testOutput(line);
  }

  private async _flushFailure(): Promise<void> {
    const current = this._current;
    if (current === undefined || current.failure === undefined) return;

    const failure = current.failure;
    current.failure = undefined;
    current.hasFailure = true;

    const message = failure.message;
    const index = message.findIndex(
      (l, i) => expectedRe.test(l) && i + 1 < message.length && parseButWas(message[i + 1]) !== undefined,
    );

    if (index !== -1) {
      const butWas = parseButWas(message[index + 1])!;
      failure.diff = {
        expected: expectedRe.exec(message[index])![1],
        actual: butWas.actual,
        note: butWas.note,
        index,
      };
    }

    await this.handler.testFailure(failure);
  }
}
