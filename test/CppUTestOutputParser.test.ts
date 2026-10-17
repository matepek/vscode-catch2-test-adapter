import * as assert from 'assert';
import * as path from 'path';

import {
  CppUTestEventHandler,
  CppUTestFailureInfo,
  CppUTestRunOutputParser,
  cppUTestHelpRegex,
  parseTestListOutput,
} from '../src/framework/CppUTest/CppUTestOutputParser';

///

class Recorder implements CppUTestEventHandler {
  readonly events: string[] = [];
  readonly failures: CppUTestFailureInfo[] = [];

  testStarted(group: string, name: string, isIgnored: boolean): void {
    this.events.push(`started ${group}.${name}${isIgnored ? ' [ignored]' : ''}`);
  }

  testFailure(failure: CppUTestFailureInfo): void {
    this.failures.push(failure);
    this.events.push(`failure @ ${failure.file}:${failure.line}`);
  }

  testOutput(line: string): void {
    this.events.push(`out ${JSON.stringify(line)}`);
  }

  testFinished(durationMilisec: number, isIgnored: boolean, hasFailure: boolean): void {
    const result = isIgnored ? 'skipped' : hasFailure ? 'failed' : 'passed';
    this.events.push(`finished ${result} in ${durationMilisec}ms`);
  }

  rootOutput(line: string, isUninteresting: boolean): void {
    this.events.push(`root${isUninteresting ? '*' : ''} ${JSON.stringify(line)}`);
  }
}

const feed = async (output: string): Promise<Recorder> => {
  const recorder = new Recorder();
  const parser = new CppUTestRunOutputParser(recorder);
  for (const line of output.split('\n')) await parser.online(line);
  return recorder;
};

// The fixtures below are verbatim `-v` output of `test/cpp/cpputest/cpputest{1,2}.cpp`,
// only the absolute source paths were shortened.
const f1 = '/w/cpputest1.cpp';
const f2 = '/w/cpputest2.cpp';

///

describe(path.basename(__filename), function () {
  context('cppUTestHelpRegex', function () {
    // Verbatim `usage()` text of every CppUTest release, taken from
    // `src/CppUTest/CommandLineArguments.cpp` at each tag. `--help` is answered with exactly this,
    // on stdout; checked against the built v4.0 binary (290 bytes out, 290 chars here).
    const realUsageOutputs: Record<string, string> = {
      'v3.3': ['usage [-v] [-r#] [-g|sg groupName] [-n|sn testName] [-o{normal, junit}]', ''].join('\n'),
      'v3.4': ['usage [-v] [-r#] [-g|sg groupName] [-n|sn testName] [-o{normal, junit}]', ''].join('\n'),
      'v3.5': ['usage [-v] [-r#] [-g|sg groupName] [-n|sn testName] [-o{normal, junit}]', ''].join('\n'),
      'v3.6': [
        'usage [-v] [-c] [-r#] [-g|sg groupName] [-n|sn testName] [-o{normal, junit}] [-k packageName]',
        '',
      ].join('\n'),
      'v3.7': [
        'usage [-v] [-c] [-p] [-lg] [-ln] [-r#] [-g|sg groupName]... [-n|sn testName]... ["TEST(groupName, testName)"]... [-o{normal, junit}] [-k packageName]',
        '',
      ].join('\n'),
      'v3.7.1': [
        'usage [-v] [-c] [-p] [-lg] [-ln] [-r#] [-g|sg groupName]... [-n|sn testName]... ["TEST(groupName, testName)"]... [-o{normal, junit}] [-k packageName]',
        '',
      ].join('\n'),
      '3.7.2': [
        'usage [-v] [-c] [-p] [-lg] [-ln] [-r#] [-g|sg groupName]... [-n|sn testName]... ["TEST(groupName, testName)"]... [-o{normal, junit}] [-k packageName]',
        '',
      ].join('\n'),
      'v3.8': [
        'usage [-v] [-c] [-p] [-lg] [-ln] [-ri] [-r#] [-g|sg|xg|xsg groupName]... [-n|sn|xn|xsn testName]... ["TEST(groupName, testName)"]... [-o{normal, junit, teamcity}] [-k packageName]',
        '',
      ].join('\n'),
      'v4.0': [
        'use -h for more extensive help',
        'usage [-h] [-v] [-vv] [-c] [-p] [-lg] [-ln] [-ri] [-r#]',
        '      [-g|sg|xg|xsg groupName]... [-n|sn|xn|xsn testName]... [-t groupName.testName]...',
        '      [-b] [-s [randomizerSeed>0]] ["TEST(groupName, testName)"]... [-o{normal, junit, teamcity}] [-k packageName]',
        '',
      ].join('\n'),
      master: [
        'use -h for more extensive help',
        'usage [-h] [-v] [-vv] [-c] [-p] [-lg] [-ln] [-ll] [-ri] [-r[<#>]] [-f] [-e] [-ci]',
        '      [-g|sg|xg|xsg <groupName>]... [-n|sn|xn|xsn <testName>]... [-t|st|xt|xst <groupName>.<testName>]...',
        '      [-b] [-s [<seed>]] ["[IGNORE_]TEST(<groupName>, <testName>)"]...',
        '      [-o{normal|eclipse|junit|teamcity}] [-k <packageName>]',
        '',
      ].join('\n'),
    };

    // The factory matches with these flags, so the tests have to use them too.
    const regex = (): RegExp => new RegExp(cppUTestHelpRegex.source, 'su');

    it('recognises the usage output of every CppUTest release', function () {
      for (const [version, usageOutput] of Object.entries(realUsageOutputs)) {
        assert.ok(regex().test(usageOutput), `should have recognised CppUTest ${version}`);
      }
    });

    it('covers the releases which word the test filter differently', function () {
      // v3.3-v3.6 never printed a `TEST(...)` filter form at all and master prints
      // `"[IGNORE_]TEST(<groupName>, <testName>)"`, so keying on that form alone would miss both.
      assert.ok(!realUsageOutputs['v3.3'].includes('TEST(groupName, testName)'));
      assert.ok(!realUsageOutputs['master'].includes('["TEST(groupName, testName)"]'));

      for (const version of ['v3.3', 'v3.6', 'v4.0', 'master']) {
        assert.ok(regex().test(realUsageOutputs[version]), version);
      }
    });

    it('does not recognise the other supported frameworks', function () {
      // Real `--help` excerpts of test/cpp/build/clang/{catch2v3_test1,gtest1,doctest1,gbenchmark}.
      const otherFrameworks: Record<string, string> = {
        catch2: [
          '',
          'Catch2 v3.10.0',
          'usage:',
          '  catch2v3_test1.exe [<test name|pattern|tags> ... ] options',
          '',
          'where options are:',
          '  -?, -h, --help                            display usage information',
          '  --list-tests                              list all/matching test cases',
        ].join('\n'),
        gtest: [
          'This program contains tests written using Google Test. You can use the',
          'following command line flags to control its behavior:',
          '',
          'Test Selection:',
          '  --gtest_list_tests',
          '      List the names of all tests instead of running them. The name of',
          '      TEST(Foo, Bar) is "Foo.Bar".',
        ].join('\n'),
        doctest: [
          '[doctest] doctest version is "2.4.12"',
          '[doctest]',
          '[doctest] boolean values: "1/on/yes/true" or "0/off/no/false"',
          '[doctest] filter  values: "str1,str2,str3" (comma separated strings)',
          '[doctest] filters use wildcards for matching strings',
          ' -ltc, --list-test-cases               lists all matching tests by name',
        ].join('\n'),
        gbenchmark: [
          'benchmark [--benchmark_list_tests={true|false}]',
          '          [--benchmark_filter=<regex>]',
          '          [--benchmark_min_warmup_time=<min_warmup_time>]',
          '          [--benchmark_out=<filename>]',
          '          [--benchmark_out_format=<json|console|csv>]',
        ].join('\n'),
      };

      for (const [framework, helpOutput] of Object.entries(otherFrameworks)) {
        assert.ok(!regex().test(helpOutput), `should not have claimed ${framework}`);
      }
    });

    it('is not fooled by an unrelated usage line', function () {
      assert.ok(!regex().test('usage [-v] [-h] [-o file]'));
      assert.ok(!regex().test('usage [-g|sg groupName] but no output type switch'));
      assert.ok(!regex().test('[-o{normal, junit}] without the group filter'));
      assert.ok(!regex().test(''));
    });
  });

  context('parseTestListOutput', function () {
    it('parses the space separated single line', function () {
      const { tests, malformed } = parseTestListOutput(
        'Plain.ignored_test Plain.fail_explicitly Plain.prints_output Fixture.uses_member_variables',
      );

      assert.deepStrictEqual(malformed, []);
      assert.deepStrictEqual(tests, [
        { group: 'Plain', name: 'ignored_test' },
        { group: 'Plain', name: 'fail_explicitly' },
        { group: 'Plain', name: 'prints_output' },
        { group: 'Fixture', name: 'uses_member_variables' },
      ]);
    });

    it('keeps the same test name in different groups distinct', function () {
      const { tests } = parseTestListOutput('SameNameB.same SameNameA.same');

      assert.deepStrictEqual(tests, [
        { group: 'SameNameB', name: 'same' },
        { group: 'SameNameA', name: 'same' },
      ]);
    });

    it('accepts unusual but valid identifiers', function () {
      const { tests, malformed } = parseTestListOutput(
        'Naming._leading_underscore Naming.With_Capitals_And_123_digits Naming.a',
      );

      assert.deepStrictEqual(malformed, []);
      assert.deepStrictEqual(
        tests.map(t => t.name),
        ['_leading_underscore', 'With_Capitals_And_123_digits', 'a'],
      );
    });

    it('collects malformed entries instead of throwing', function () {
      const { tests, malformed } = parseTestListOutput('Good.one NoDot .leadingDot trailingDot. Good.two');

      assert.deepStrictEqual(malformed, ['NoDot', '.leadingDot', 'trailingDot.']);
      assert.deepStrictEqual(tests, [
        { group: 'Good', name: 'one' },
        { group: 'Good', name: 'two' },
      ]);
    });

    it('returns empty for empty or whitespace only input', function () {
      assert.deepStrictEqual(parseTestListOutput(''), { tests: [], malformed: [] });
      assert.deepStrictEqual(parseTestListOutput('  \n\t '), { tests: [], malformed: [] });
    });

    it('tolerates newlines and repeated whitespace', function () {
      const { tests } = parseTestListOutput('  A.one   B.two\nC.three\t D.four \n');

      assert.deepStrictEqual(
        tests.map(t => `${t.group}.${t.name}`),
        ['A.one', 'B.two', 'C.three', 'D.four'],
      );
    });
  });

  context('CppUTestRunOutputParser', function () {
    it('reports a passing test whose marker and terminator share the line', async function () {
      const r = await feed('TEST(Single, only_test) - 0 ms');

      assert.deepStrictEqual(r.events, ['started Single.only_test', 'finished passed in 0ms']);
    });

    it('reports IGNORE_TEST as skipped', async function () {
      const r = await feed('IGNORE_TEST(Ignored, ignored_two) - 3 ms');

      assert.deepStrictEqual(r.events, ['started Ignored.ignored_two [ignored]', 'finished skipped in 3ms']);
    });

    it('captures stdout glued to the marker with the terminator on its own line', async function () {
      const r = await feed('TEST(Output, long_running)tick 0\ntick 1\ntick 2\n - 0 ms');

      assert.deepStrictEqual(r.events, [
        'started Output.long_running',
        'out "tick 0"',
        'out "tick 1"',
        'out "tick 2"',
        'finished passed in 0ms',
      ]);
    });

    it('keeps special characters in the test output', async function () {
      const r = await feed('TEST(Output, special_characters)<xml>&amp; "quotes" \'single\' \t tab\n - 0 ms');

      assert.deepStrictEqual(r.events, [
        'started Output.special_characters',
        'out "<xml>&amp; \\"quotes\\" \'single\' \\t tab"',
        'finished passed in 0ms',
      ]);
    });

    it('handles a UT_PRINT line which carries the terminator', async function () {
      const r = await feed(`TEST(Output, utprint)\n${f2}:75 printed with UT_PRINT - 0 ms`);

      assert.deepStrictEqual(r.events, [
        'started Output.utprint',
        `out "${f2}:75 printed with UT_PRINT"`,
        'finished passed in 0ms',
      ]);
    });

    it('turns expected/but was into a diff', async function () {
      const r = await feed(
        `TEST(WithBase, fail_sees_base_members)\n` +
          `${f2}:23: error: Failure in TEST(WithBase, fail_sees_base_members)\n` +
          `\tLONGS_EQUAL(11, counter) failed\n` +
          `\texpected <11 (0xb)>\n` +
          `\tbut was  <10 (0xa)>\n` +
          `\n` +
          ` - 0 ms`,
      );

      assert.deepStrictEqual(r.events, [
        'started WithBase.fail_sees_base_members',
        `failure @ ${f2}:23`,
        'finished failed in 0ms',
      ]);
      assert.strictEqual(r.failures.length, 1);
      const failure = r.failures[0];
      assert.deepStrictEqual(failure.message, [
        'LONGS_EQUAL(11, counter) failed',
        'expected <11 (0xb)>',
        'but was  <10 (0xa)>',
      ]);
      assert.deepStrictEqual(failure.diff, { expected: '11 (0xb)', actual: '10 (0xa)', note: undefined, index: 1 });
      assert.strictEqual(failure.testFile, f2);
      assert.strictEqual(failure.testLine, '23');
    });

    it('anchors a teardown failure at the second location but keeps the test location', async function () {
      const r = await feed(
        `TEST(FailingTeardown, test_body_passes_teardown_fails)\n` +
          `${f1}:176: error: Failure in TEST(FailingTeardown, test_body_passes_teardown_fails)\n` +
          `${f1}:173: error:\n` +
          `\tMessage: teardown failed\n` +
          `\tCHECK(false) failed\n` +
          `\n` +
          ` - 0 ms`,
      );

      assert.deepStrictEqual(r.events, [
        'started FailingTeardown.test_body_passes_teardown_fails',
        `failure @ ${f1}:173`,
        'finished failed in 0ms',
      ]);
      const failure = r.failures[0];
      assert.strictEqual(failure.testLine, '176', 'the test location stays the first one');
      assert.strictEqual(failure.line, '173', 'the message is anchored at the assert location');
      assert.deepStrictEqual(failure.message, ['Message: teardown failed', 'CHECK(false) failed']);
      assert.strictEqual(failure.diff, undefined);
    });

    it('keeps a memory leak report including its unindented lines and trailing blanks', async function () {
      const r = await feed(
        `TEST(Leaks, leak_fail)\n` +
          `${f1}:187: error: Failure in TEST(Leaks, leak_fail)\n` +
          `\tMemory leak(s) found.\n` +
          `Alloc num (4) Leak size: 4 Allocated at: ${f1} and line: 188. Type: "new"\n` +
          `\tMemory: <0x105174fe0> Content:\n` +
          `    0000: 01 00 00 00                                      |....|\n` +
          `Total number of leaks:  1\n` +
          `\n` +
          `\n` +
          ` - 0 ms`,
      );

      assert.deepStrictEqual(r.events, [
        'started Leaks.leak_fail',
        `failure @ ${f1}:187`,
        'out ""',
        'finished failed in 0ms',
      ]);
      assert.deepStrictEqual(r.failures[0].message, [
        'Memory leak(s) found.',
        `Alloc num (4) Leak size: 4 Allocated at: ${f1} and line: 188. Type: "new"`,
        'Memory: <0x105174fe0> Content:',
        '    0000: 01 00 00 00                                      |....|',
        'Total number of leaks:  1',
      ]);
    });

    it('keeps the DOUBLES_EQUAL threshold out of the actual value', async function () {
      const r = await feed(
        `TEST(DoubleChecks, doubles_equal_text_fail)\n` +
          `${f1}:105: error: Failure in TEST(DoubleChecks, doubles_equal_text_fail)\n` +
          `\tMessage: too far apart\n` +
          `\texpected <1>\n` +
          `\tbut was  <1.5> threshold used was <0.1>\n` +
          `\n` +
          ` - 0 ms`,
      );

      assert.deepStrictEqual(r.failures[0].diff, {
        expected: '1',
        actual: '1.5',
        note: 'threshold used was <0.1>',
        index: 1,
      });
    });

    it('falls back to a plain message when the compared values span multiple lines', async function () {
      const r = await feed(
        `TEST(StringChecks, multiline_string_fail)\n` +
          `${f1}:97: error: Failure in TEST(StringChecks, multiline_string_fail)\n` +
          `\texpected <line1\n` +
          `line2\n` +
          `line3>\n` +
          `\tbut was  <line1\n` +
          `lineX\n` +
          `line3>\n` +
          ` - 0 ms`,
      );

      const failure = r.failures[0];
      assert.strictEqual(failure.diff, undefined, 'a value broken over lines must not be mistaken for a diff');
      assert.deepStrictEqual(failure.message, [
        'expected <line1',
        'line2',
        'line3>',
        'but was  <line1',
        'lineX',
        'line3>',
      ]);
      assert.deepStrictEqual(r.events, [
        'started StringChecks.multiline_string_fail',
        `failure @ ${f1}:97`,
        'finished failed in 0ms',
      ]);
    });

    it('keeps a multi line mock failure in one message', async function () {
      const r = await feed(
        `TEST(Mocking, ordered_calls_fail)\n` +
          `${f2}:134: error: Failure in TEST(Mocking, ordered_calls_fail)\n` +
          `\tMock Failure: Out of order calls\n` +
          `\tEXPECTED calls that WERE NOT fulfilled:\n` +
          `\t\t<none>\n` +
          `\tEXPECTED calls that WERE fulfilled:\n` +
          `\t\tfirst -> expected call order: <1> -> no parameters (expected 1 call, called 1 time)\n` +
          `\n` +
          ` - 0 ms`,
      );

      assert.deepStrictEqual(r.failures[0].message, [
        'Mock Failure: Out of order calls',
        'EXPECTED calls that WERE NOT fulfilled:',
        '\t<none>',
        'EXPECTED calls that WERE fulfilled:',
        '\tfirst -> expected call order: <1> -> no parameters (expected 1 call, called 1 time)',
      ]);
      assert.strictEqual(r.failures[0].diff, undefined);
    });

    it('reports two failure blocks of one test separately', async function () {
      const r = await feed(
        `TEST(Two, failures)\n` +
          `${f1}:10: error: Failure in TEST(Two, failures)\n` +
          `\tfirst problem\n` +
          `${f1}:20: error: Failure in TEST(Two, failures)\n` +
          `\tsecond problem\n` +
          `\n` +
          ` - 1 ms`,
      );

      assert.deepStrictEqual(r.events, [
        'started Two.failures',
        `failure @ ${f1}:10`,
        `failure @ ${f1}:20`,
        'finished failed in 1ms',
      ]);
      assert.deepStrictEqual(
        r.failures.map(f => f.message),
        [['first problem'], ['second problem']],
      );
    });

    it('parses a windows style absolute path in the failure location', async function () {
      const r = await feed(
        `TEST(Win, path)\n` +
          `C:\\work\\src\\cpputest1.cpp:42: error: Failure in TEST(Win, path)\n` +
          `\tCHECK(false) failed\n` +
          `\n` +
          ` - 0 ms`,
      );

      assert.strictEqual(r.failures[0].file, 'C:\\work\\src\\cpputest1.cpp');
      assert.strictEqual(r.failures[0].line, '42');
    });

    it('handles several tests in a row', async function () {
      const r = await feed(
        `TEST(A, pass) - 0 ms\n` +
          `IGNORE_TEST(A, ignored) - 0 ms\n` +
          `TEST(B, fail)\n` +
          `${f1}:7: error: Failure in TEST(B, fail)\n` +
          `\tboom\n` +
          `\n` +
          ` - 2 ms\n` +
          `TEST(B, pass_after_fail)prints\n` +
          ` - 0 ms`,
      );

      assert.deepStrictEqual(r.events, [
        'started A.pass',
        'finished passed in 0ms',
        'started A.ignored [ignored]',
        'finished skipped in 0ms',
        'started B.fail',
        `failure @ ${f1}:7`,
        'finished failed in 2ms',
        'started B.pass_after_fail',
        'out "prints"',
        'finished passed in 0ms',
      ]);
    });

    it('leaves a test unfinished when the output stops in the middle of it', async function () {
      const recorder = new Recorder();
      const parser = new CppUTestRunOutputParser(recorder);
      for (const line of 'TEST(Crash, segfaults)\nsome output'.split('\n')) await parser.online(line);

      assert.strictEqual(parser.isInsideTest, true);
      assert.deepStrictEqual(recorder.events, ['started Crash.segfaults', 'out "some output"']);
    });

    it('marks blank lines, the summary and framework notices as uninteresting', async function () {
      const r = await feed(
        'Test order shuffling enabled with seed: 42\n' +
          'TEST(A, pass) - 0 ms\n' +
          '\n' +
          'Errors (8 failures, 31 tests, 29 ran, 21 checks, 2 ignored, 0 filtered out, 2 ms)\n' +
          'Note: test run failed because no tests were run or ignored. Assuming something went wrong.\n' +
          'some other line',
      );

      assert.deepStrictEqual(r.events, [
        'root* "Test order shuffling enabled with seed: 42"',
        'started A.pass',
        'finished passed in 0ms',
        'root* ""',
        'root* "Errors (8 failures, 31 tests, 29 ran, 21 checks, 2 ignored, 0 filtered out, 2 ms)"',
        'root* "Note: test run failed because no tests were run or ignored. Assuming something went wrong."',
        'root "some other line"',
      ]);
    });

    it('treats the OK summary as uninteresting too', async function () {
      const r = await feed('OK (31 tests, 1 ran, 0 checks, 0 ignored, 30 filtered out, 1 ms)');

      assert.deepStrictEqual(r.events, ['root* "OK (31 tests, 1 ran, 0 checks, 0 ignored, 30 filtered out, 1 ms)"']);
    });
  });
});
