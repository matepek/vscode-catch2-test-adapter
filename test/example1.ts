import * as assert from 'assert';
import { EOL } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { Imitation, settings, FileSystemWatcherStub, ChildProcessStub } from './Common';
import * as sinon from 'sinon';

///

export const example1 = new (class {
  public readonly suite1 = new (class {
    public readonly execPath = vscode.Uri.file(path.join(settings.workspaceFolderUri.path, 'execPath1.exe')).fsPath;

    public readonly t1 = new (class {
      public readonly fullTestName = 's1t1';
      public assert(label: string, test: TestInfo, uniqeIdContainer?: Set<string>): void {
        assert.equal(test.type, 'test');
        assert.equal(test.label, label);
        assert.equal(test.file, 'suite1.cpp');
        assert.equal(test.line, 7 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      }

      public readonly outputs: [string[], string][] = [
        [
          ['s1t1', '--reporter', 'xml', '--durations', 'yes'],
          `<?xml version="1.0" encoding="UTF-8"?>
            <Catch name="suite1">
              <Group name="suite1">
                <TestCase name="s1t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="7">
                  <OverallResult success="true" durationInSeconds="0.000112"/>
                </TestCase>
                <OverallResults successes="1" failures="0" expectedFailures="0"/>
              </Group>
              <OverallResults successes="1" failures="0" expectedFailures="0"/>
            </Catch>`,
        ],
        [
          ['s1t1', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
          `<?xml version="1.0" encoding="UTF-8"?>
            <Catch name="suite1">
              <Randomness seed="2"/>
              <Group name="suite1">
                <TestCase name="s1t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="7">
                  <OverallResult success="true" durationInSeconds="0.000327"/>
                </TestCase>
                <OverallResults successes="1" failures="0" expectedFailures="0"/>
              </Group>
              <OverallResults successes="1" failures="0" expectedFailures="0"/>
            </Catch>`,
        ],
      ];
    })();

    public readonly t2 = new (class {
      public readonly fullTestName = 's1t2';
      public assert(label: string, test: TestInfo, uniqeIdContainer?: Set<string>): void {
        assert.equal(test.type, 'test');
        assert.equal(test.label, label);
        assert.equal(test.file, 'suite1.cpp');
        assert.equal(test.line, 13 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      }

      public readonly outputs: [string[], string][] = [
        [
          ['s1t2', '--reporter', 'xml', '--durations', 'yes'],
          `<?xml version="1.0" encoding="UTF-8"?>
            <Catch name="suite1">
              <Group name="suite1">
                <TestCase name="s1t2" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="13">
                  <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="15">
                    <Original>
                      std::false_type::value
                    </Original>
                    <Expanded>
                      false
                    </Expanded>
                  </Expression>
                  <OverallResult success="false" durationInSeconds="0.00075"/>
                </TestCase>
                <OverallResults successes="0" failures="1" expectedFailures="0"/>
              </Group>
              <OverallResults successes="0" failures="1" expectedFailures="0"/>
            </Catch>`,
        ],
        [
          ['s1t2', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
          `<?xml version="1.0" encoding="UTF-8"?>
            <Catch name="suite1">
              <Randomness seed="2"/>
              <Group name="suite1">
                <TestCase name="s1t2" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="13">
                  <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="15">
                    <Original>
                      std::false_type::value
                    </Original>
                    <Expanded>
                      false
                    </Expanded>
                  </Expression>
                  <OverallResult success="false" durationInSeconds="0.000339"/>
                </TestCase>
                <OverallResults successes="0" failures="1" expectedFailures="0"/>
              </Group>
              <OverallResults successes="0" failures="1" expectedFailures="0"/>
            </Catch>`,
        ],
      ];
    })();

    public readonly outputs: [string[], string][] = [
      [['--help'], 'Catch v2.4.1'],
      [
        ['[.],*', '--verbosity', 'high', '--list-tests', '--use-colour', 'no'],
        'Matching test cases:\n' +
          '  s1t1\n' +
          '    suite1.cpp:7\n' +
          '    tag1\n' +
          '  s1t2\n' +
          '    suite1.cpp:13\n' +
          '    tag1\n' +
          '2 matching test cases\n\n',
      ],
      [
        ['--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
          <Catch name="suite1">
            <Group name="suite1">
              <TestCase name="s1t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="7">
                <OverallResult success="true" durationInSeconds="0.000132"/>
              </TestCase>
              <TestCase name="s1t2" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="13">
                <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="15">
                  <Original>
                    std::false_type::value
                  </Original>
                  <Expanded>
                    false
                  </Expanded>
                </Expression>
                <OverallResult success="false" durationInSeconds="0.000204"/>
              </TestCase>
              <OverallResults successes="1" failures="1" expectedFailures="0"/>
            </Group>
            <OverallResults successes="1" failures="1" expectedFailures="0"/>
          </Catch>`,
      ],
      [
        ['--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
          <Catch name="suite1">
            <Randomness seed="2"/>
            <Group name="suite1">
              <TestCase name="s1t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="7">
                <OverallResult success="true" durationInSeconds="0.001045"/>
              </TestCase>
              <TestCase name="s1t2" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="13">
                <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="15">
                  <Original>
                    std::false_type::value
                  </Original>
                  <Expanded>
                    false
                  </Expanded>
                </Expression>
                <OverallResult success="false" durationInSeconds="0.000382"/>
              </TestCase>
              <OverallResults successes="1" failures="1" expectedFailures="0"/>
            </Group>
            <OverallResults successes="1" failures="1" expectedFailures="0"/>
          </Catch>`,
      ],
      ...this.t1.outputs,
      ...this.t2.outputs,
    ];

    public assert(label: string, childLabels: string[], suite: TestSuiteInfo, uniqeIdContainer?: Set<string>): void {
      assert.equal(suite.type, 'suite');
      assert.equal(suite.label, label);
      assert.equal(suite.file, 'suite1.cpp');
      assert.equal(suite.line, 0);
      assert.equal(suite.children.length, 2);
      assert.equal(childLabels.length, suite.children.length);
      this.t1.assert(childLabels[0], suite.children[0] as TestInfo, uniqeIdContainer);
      this.t2.assert(childLabels[1], suite.children[1] as TestInfo, uniqeIdContainer);
      if (uniqeIdContainer != undefined) {
        assert.ok(!uniqeIdContainer.has(suite.id));
        uniqeIdContainer.add(suite.id);
      }
    }
  })();

  public readonly suite2 = new (class {
    public readonly execPath = vscode.Uri.file(path.join(settings.workspaceFolderUri.path, 'execPath2.exe')).fsPath;

    public readonly t1 = new (class {
      public readonly fullTestName = 's2t1';
      public assert(label: string, description: string, test: TestInfo, uniqeIdContainer?: Set<string>): void {
        assert.equal(test.type, 'test');
        assert.equal(test.label, label);
        assert.equal(test.description, description);
        assert.equal(test.file, 'suite2.cpp');
        assert.equal(test.line, 7 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      }

      public readonly outputs: [string[], string][] = [
        [
          ['s2t1', '--reporter', 'xml', '--durations', 'yes'],
          `<?xml version="1.0" encoding="UTF-8"?>
          <Catch name="suite2">
            <Group name="suite2">
              <TestCase name="s2t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="7">
                <OverallResult success="true" durationInSeconds="0.000392"/>
              </TestCase>
              <OverallResults successes="1" failures="0" expectedFailures="0"/>
            </Group>
            <OverallResults successes="1" failures="0" expectedFailures="0"/>
          </Catch>`,
        ],
        [
          ['s2t1', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
          `<?xml version="1.0" encoding="UTF-8"?>
          <Catch name="suite2">
            <Randomness seed="2"/>
            <Group name="suite2">
              <TestCase name="s2t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="7">
                <OverallResult success="true" durationInSeconds="0.000392"/>
              </TestCase>
              <OverallResults successes="1" failures="0" expectedFailures="0"/>
            </Group>
            <OverallResults successes="1" failures="0" expectedFailures="0"/>
          </Catch>`,
        ],
      ];
    })();

    public readonly t2 = new (class {
      public readonly fullTestName = 's2t2';
      public assert(label: string, description: string, test: TestInfo, uniqeIdContainer?: Set<string>): void {
        assert.equal(test.type, 'test');
        assert.equal(test.label, label);
        assert.equal(test.description, description);
        assert.equal(test.file, 'suite2.cpp');
        assert.equal(test.line, 13 - 1);
        assert.ok(test.skipped === true);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      }

      public readonly outputs: [string[], string][] = [
        [
          ['s2t2', '--reporter', 'xml', '--durations', 'yes'],
          `<?xml version="1.0" encoding="UTF-8"?>
            <Catch name="suite2">
              <Group name="suite2">
                <TestCase name="s2t2" description="tag1 " tags="[.]" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="13">
                  <OverallResult success="true" durationInSeconds="0.001294"/>
                </TestCase>
                <OverallResults successes="1" failures="0" expectedFailures="0"/>
              </Group>
              <OverallResults successes="1" failures="0" expectedFailures="0"/>
            </Catch>`,
        ],
        [
          ['s2t2', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
          `<?xml version="1.0" encoding="UTF-8"?>
            <Catch name="suite2">
              <Randomness seed="2"/>
              <Group name="suite2">
                <TestCase name="s2t2" description="tag1 " tags="[.]" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="13">
                  <OverallResult success="true" durationInSeconds="0.001294"/>
                </TestCase>
                <OverallResults successes="1" failures="0" expectedFailures="0"/>
              </Group>
              <OverallResults successes="1" failures="0" expectedFailures="0"/>
            </Catch>`,
        ],
      ];
    })();

    public readonly t3 = new (class {
      public readonly fullTestName = 's2t3';
      public assert(label: string, description: string, test: TestInfo, uniqeIdContainer?: Set<string>): void {
        assert.equal(test.type, 'test');
        assert.equal(test.label, label);
        assert.equal(test.description, description);
        assert.equal(test.file, 'suite2.cpp');
        assert.equal(test.line, 19 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      }

      public readonly outputs: [string[], string][] = [
        [
          ['s2t3', '--reporter', 'xml', '--durations', 'yes'],
          `<?xml version="1.0" encoding="UTF-8"?>
            <Catch name="suite2">
              <Group name="suite2">
                <TestCase name="s2t3" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="19">
                  <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="21">
                    <Original>
                      std::false_type::value
                    </Original>
                    <Expanded>
                      false
                    </Expanded>
                  </Expression>
                  <OverallResult success="false" durationInSeconds="0.000596"/>
                </TestCase>
                <OverallResults successes="0" failures="1" expectedFailures="0"/>
              </Group>
              <OverallResults successes="0" failures="1" expectedFailures="0"/>
            </Catch>`,
        ],
        [
          ['s2t3', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
          `<?xml version="1.0" encoding="UTF-8"?>
            <Catch name="suite2">
              <Randomness seed="2"/>
              <Group name="suite2">
                <TestCase name="s2t3" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="19">
                  <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="21">
                    <Original>
                      std::false_type::value
                    </Original>
                    <Expanded>
                      false
                    </Expanded>
                  </Expression>
                  <OverallResult success="false" durationInSeconds="0.000596"/>
                </TestCase>
                <OverallResults successes="0" failures="1" expectedFailures="0"/>
              </Group>
              <OverallResults successes="0" failures="1" expectedFailures="0"/>
            </Catch>`,
        ],
      ];
    })();

    public assert(
      label: string,
      childLabels: string[],
      childDescs: string[],
      suite: TestSuiteInfo,
      uniqeIdContainer?: Set<string>,
    ): void {
      assert.equal(suite.type, 'suite');
      assert.equal(suite.label, label);
      assert.equal(suite.file, 'suite2.cpp');
      assert.equal(suite.line, 0);
      assert.equal(suite.children.length, 3);
      assert.equal(childLabels.length, suite.children.length);
      this.t1.assert(childLabels[0], childDescs[0], suite.children[0] as TestInfo, uniqeIdContainer);
      this.t2.assert(childLabels[1], childDescs[1], suite.children[1] as TestInfo, uniqeIdContainer);
      this.t3.assert(childLabels[2], childDescs[2], suite.children[2] as TestInfo, uniqeIdContainer);
      if (uniqeIdContainer != undefined) {
        assert.ok(!uniqeIdContainer.has(suite.id));
        uniqeIdContainer.add(suite.id);
      }
    }

    public readonly outputs: [string[], string][] = [
      [['--help'], 'Catch v2.4.1'],
      [
        ['[.],*', '--verbosity', 'high', '--list-tests', '--use-colour', 'no'],
        'Matching test cases:\n' +
          '  s2t1\n' +
          '    suite2.cpp:7\n' +
          '    tag1\n' +
          '  s2t2\n' +
          '    suite2.cpp:13\n' +
          '    tag1\n' +
          '      [.]\n' +
          '  s2t3\n' +
          '    suite2.cpp:19\n' +
          '    tag1\n' +
          '3 matching test cases\n\n',
      ],
      [
        ['--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
          <Catch name="suite2">
            <Group name="suite2">
              <TestCase name="s2t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="7">
                <OverallResult success="true" durationInSeconds="0.00037"/>
              </TestCase>
              <TestCase name="s2t3" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="19">
                <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="21">
                  <Original>
                    std::false_type::value
                  </Original>
                  <Expanded>
                    false
                  </Expanded>
                </Expression>
                <OverallResult success="false" durationInSeconds="0.000178"/>
              </TestCase>
              <OverallResults successes="1" failures="1" expectedFailures="0"/>
            </Group>
            <OverallResults successes="1" failures="1" expectedFailures="0"/>
          </Catch>`,
      ],
      [
        ['--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
          <Catch name="suite2">
            <Randomness seed="2"/>
            <Group name="suite2">
              <TestCase name="s2t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="7">
                <OverallResult success="true" durationInSeconds="0.000113"/>
              </TestCase>
              <TestCase name="s2t3" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="19">
                <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="21">
                  <Original>
                    std::false_type::value
                  </Original>
                  <Expanded>
                    false
                  </Expanded>
                </Expression>
                <OverallResult success="false" durationInSeconds="0.000205"/>
              </TestCase>
              <OverallResults successes="1" failures="1" expectedFailures="0"/>
            </Group>
            <OverallResults successes="1" failures="1" expectedFailures="0"/>
          </Catch>`,
      ],
      ...this.t1.outputs,
      ...this.t2.outputs,
      ...this.t3.outputs,
    ];
  })();

  public readonly suite3 = new (class {
    public readonly execPath = vscode.Uri.file(path.join(settings.workspaceFolderUri.path, 'execPath3.exe')).fsPath;

    public readonly outputs: [string[], string][] = [
      [
        ['--help'],
        `
Catch v2.4.1
usage:
  suite3 [<test name|pattern|tags> ... ] options

where options are:
  -?, -h, --help                            display usage information
  -l, --list-tests                          list all/matching test cases
  -t, --list-tags                           list all/matching tags
  -s, --success                             include successful tests in
                                            output
  -b, --break                               break into debugger on failure
  -e, --nothrow                             skip exception tests
  -i, --invisibles                          show invisibles (tabs, newlines)
  -o, --out <filename>                      output filename
  -r, --reporter <name>                     reporter to use (defaults to
                                            console)
  -n, --name <name>                         suite name
  -a, --abort                               abort at first failure
  -x, --abortx <no. failures>               abort after x failures
  -w, --warn <warning name>                 enable warnings
  -d, --durations <yes|no>                  show test durations
  -f, --input-file <filename>               load test names to run from a
                                            file
  -#, --filenames-as-tags                   adds a tag for the filename
  -c, --section <section name>              specify section to run
  -v, --verbosity <quiet|normal|high>       set output verbosity
  --list-test-names-only                    list all/matching test cases
                                            names only
  --list-reporters                          list all reporters
  --order <decl|lex|rand>                   test case order (defaults to
                                            decl)
  --rng-seed <'time'|number>                set a specific seed for random
                                            numbers
  --use-colour <yes|no>                     should output be colourised
  --libidentify                             report name and version according
                                            to libidentify standard
  --wait-for-keypress <start|exit|both>     waits for a keypress before
                                            exiting
  --benchmark-resolution-multiple           multiple of clock resolution to
  <multiplier>                              run benchmarks

For more detailed usage please see the project docs

`,
      ],
      [
        ['[.],*', '--verbosity', 'high', '--list-tests', '--use-colour', 'no'],
        `Matching test cases:
  test name,with,colon
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:8
    tag1
   test name with space 
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:14
    (NO DESCRIPTION)
  SECTION tree
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:20
    (NO DESCRIPTION)
  spec ! char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:36
    (NO DESCRIPTION)
  spec @ char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:37
    (NO DESCRIPTION)
  spec # char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:38
    (NO DESCRIPTION)
  spec $ char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:39
    (NO DESCRIPTION)
  spec % char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:40
    (NO DESCRIPTION)
  spec ^ char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:41
    (NO DESCRIPTION)
  spec & char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:42
    (NO DESCRIPTION)
  spec * char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:43
    (NO DESCRIPTION)
  spec (a) char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:44
    (NO DESCRIPTION)
  spec {a} char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:45
    (NO DESCRIPTION)
  spec [a] char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:46
    (NO DESCRIPTION)
  spec ; char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:47
    (NO DESCRIPTION)
  spec ' char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:48
    (NO DESCRIPTION)
  spec \\ char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:49
    (NO DESCRIPTION)
  spec , char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:50
    (NO DESCRIPTION)
  spec . char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:51
    (NO DESCRIPTION)
  spec / char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:52
    (NO DESCRIPTION)
  spec < char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:53
    (NO DESCRIPTION)
  spec > char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:54
    (NO DESCRIPTION)
  spec ? char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:55
    (NO DESCRIPTION)
  spec - char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:56
    (NO DESCRIPTION)
  spec = char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:57
    (NO DESCRIPTION)
  spec _ char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:58
    (NO DESCRIPTION)
  spec + char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:59
    (NO DESCRIPTION)
  spec ~ char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:60
    (NO DESCRIPTION)
  spec \` char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:61
    (NO DESCRIPTION)
  spec § char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:62
    (NO DESCRIPTION)
  spec ± char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:63
    (NO DESCRIPTION)
  spec " char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:64
    (NO DESCRIPTION)
  spec | char
    ../vscode-catch2-test-adapter/src/test/suite3.cpp:65
    (NO DESCRIPTION)
34 matching test cases

`,
      ],
      [
        ['--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="test name,with,colon" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="8">
      <OverallResult success="true" durationInSeconds="0.000122"/>
    </TestCase>
    <TestCase name="test name with space" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="14">
      <OverallResult success="true" durationInSeconds="3e-05"/>
    </TestCase>
    <TestCase name="SECTION tree" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="20">
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="22">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="23">
            <Section name="4" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="24">
              <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="24">
                <Original>
                  std::false_type::value
                </Original>
                <Expanded>
                  false
                </Expanded>
              </Expression>
              <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000195"/>
            </Section>
            <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.00017"/>
          </Section>
          <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000148"/>
        </Section>
        <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000122"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="22">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="23">
            <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="1e-06"/>
          </Section>
          <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="3.6e-05"/>
        </Section>
        <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="7.4e-05"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2-2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="27">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="28">
            <Section name="4" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="29">
              <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="29">
                <Original>
                  std::false_type::value
                </Original>
                <Expanded>
                  false
                </Expanded>
              </Expression>
              <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.00012"/>
            </Section>
            <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000102"/>
          </Section>
          <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="8.4e-05"/>
        </Section>
        <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="6.6e-05"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2-2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="27">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="28">
            <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="1e-06"/>
          </Section>
          <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="3.4e-05"/>
        </Section>
        <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="7.8e-05"/>
      </Section>
      <OverallResult success="false" durationInSeconds="0.00086"/>
    </TestCase>
    <TestCase name="spec ! char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="36">
      <OverallResult success="true" durationInSeconds="2.2e-05"/>
    </TestCase>
    <TestCase name="spec @ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="37">
      <OverallResult success="true" durationInSeconds="2.2e-05"/>
    </TestCase>
    <TestCase name="spec # char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="38">
      <OverallResult success="true" durationInSeconds="2.2e-05"/>
    </TestCase>
    <TestCase name="spec $ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="39">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec % char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="40">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec ^ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="41">
      <OverallResult success="true" durationInSeconds="2.2e-05"/>
    </TestCase>
    <TestCase name="spec &amp; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="42">
      <OverallResult success="true" durationInSeconds="2.2e-05"/>
    </TestCase>
    <TestCase name="spec * char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="43">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec (a) char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="44">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec {a} char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="45">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec [a] char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="46">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec ; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="47">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec ' char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="48">
      <OverallResult success="true" durationInSeconds="2.2e-05"/>
    </TestCase>
    <TestCase name="spec \ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="49">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec , char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="50">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec . char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="51">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec / char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="52">
      <OverallResult success="true" durationInSeconds="2.2e-05"/>
    </TestCase>
    <TestCase name="spec &lt; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="53">
      <OverallResult success="true" durationInSeconds="2.2e-05"/>
    </TestCase>
    <TestCase name="spec > char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="54">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec ? char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="55">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec - char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="56">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec = char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="57">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec _ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="58">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec + char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="59">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec ~ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="60">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec \` char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="61">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <TestCase name="spec § char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="62">
      <OverallResult success="true" durationInSeconds="3.3e-05"/>
    </TestCase>
    <TestCase name="spec ± char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="63">
      <OverallResult success="true" durationInSeconds="2.2e-05"/>
    </TestCase>
    <TestCase name="spec &quot; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="64">
      <OverallResult success="true" durationInSeconds="2.2e-05"/>
    </TestCase>
    <TestCase name="spec | char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="65">
      <OverallResult success="true" durationInSeconds="2.1e-05"/>
    </TestCase>
    <OverallResults successes="2" failures="2" expectedFailures="0"/>
  </Group>
  <OverallResults successes="2" failures="2" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="test name,with,colon" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="8">
      <OverallResult success="true" durationInSeconds="8.3e-05"/>
    </TestCase>
    <TestCase name="test name with space" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="14">
      <OverallResult success="true" durationInSeconds="3.2e-05"/>
    </TestCase>
    <TestCase name="SECTION tree" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="20">
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="22">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="23">
            <Section name="4" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="24">
              <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="24">
                <Original>
                  std::false_type::value
                </Original>
                <Expanded>
                  false
                </Expanded>
              </Expression>
              <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000184"/>
            </Section>
            <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.00016"/>
          </Section>
          <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000139"/>
        </Section>
        <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000113"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="22">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="23">
            <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="1e-06"/>
          </Section>
          <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="4.2e-05"/>
        </Section>
        <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="8.5e-05"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2-2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="27">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="28">
            <Section name="4" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="29">
              <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="29">
                <Original>
                  std::false_type::value
                </Original>
                <Expanded>
                  false
                </Expanded>
              </Expression>
              <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000154"/>
            </Section>
            <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000134"/>
          </Section>
          <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000114"/>
        </Section>
        <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="9.4e-05"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2-2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="27">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="28">
            <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="1e-06"/>
          </Section>
          <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="3.4e-05"/>
        </Section>
        <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="6.9e-05"/>
      </Section>
      <OverallResult success="false" durationInSeconds="0.000889"/>
    </TestCase>
    <TestCase name="spec ! char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="36">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec @ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="37">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec # char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="38">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec $ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="39">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec % char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="40">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec ^ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="41">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec &amp; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="42">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec * char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="43">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec (a) char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="44">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec {a} char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="45">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec [a] char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="46">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec ; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="47">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec ' char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="48">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec \ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="49">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec , char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="50">
      <OverallResult success="true" durationInSeconds="2.7e-05"/>
    </TestCase>
    <TestCase name="spec . char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="51">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec / char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="52">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec &lt; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="53">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec > char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="54">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec ? char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="55">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec - char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="56">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec = char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="57">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec _ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="58">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec + char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="59">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec ~ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="60">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec \` char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="61">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec § char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="62">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec ± char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="63">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec &quot; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="64">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <TestCase name="spec | char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="65">
      <OverallResult success="true" durationInSeconds="2.5e-05"/>
    </TestCase>
    <OverallResults successes="2" failures="2" expectedFailures="0"/>
  </Group>
  <OverallResults successes="2" failures="2" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['test name\\,with\\,colon', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="test name,with,colon" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="8">
      <OverallResult success="true" durationInSeconds="8e-05"/>
    </TestCase>
    <OverallResults successes="1" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="1" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['*test name with space ', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="test name with space" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="14">
      <OverallResult success="true" durationInSeconds="7.7e-05"/>
    </TestCase>
    <OverallResults successes="1" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="1" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['SECTION tree', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="SECTION tree" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="20">
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="22">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="23">
            <Section name="4" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="24">
              <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="24">
                <Original>
                  std::false_type::value
                </Original>
                <Expanded>
                  false
                </Expanded>
              </Expression>
              <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000209"/>
            </Section>
            <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000183"/>
          </Section>
          <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000159"/>
        </Section>
        <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000129"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="22">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="23">
            <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="1e-06"/>
          </Section>
          <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="4.5e-05"/>
        </Section>
        <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="9.4e-05"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2-2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="27">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="28">
            <Section name="4" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="29">
              <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="29">
                <Original>
                  std::false_type::value
                </Original>
                <Expanded>
                  false
                </Expanded>
              </Expression>
              <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000144"/>
            </Section>
            <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000124"/>
          </Section>
          <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000104"/>
        </Section>
        <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="8.4e-05"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2-2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="27">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="28">
            <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="1e-06"/>
          </Section>
          <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="4.1e-05"/>
        </Section>
        <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="8.3e-05"/>
      </Section>
      <OverallResult success="false" durationInSeconds="0.001147"/>
    </TestCase>
    <OverallResults successes="0" failures="2" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="2" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ! char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec ! char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="36">
      <OverallResult success="true" durationInSeconds="7.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec @ char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec @ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="37">
      <OverallResult success="true" durationInSeconds="8.5e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec # char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec # char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="38">
      <OverallResult success="true" durationInSeconds="7.4e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec $ char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec $ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="39">
      <OverallResult success="true" durationInSeconds="7.4e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec % char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec % char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="40">
      <OverallResult success="true" durationInSeconds="7.4e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ^ char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec ^ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="41">
      <OverallResult success="true" durationInSeconds="7.6e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec & char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec &amp; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="42">
      <OverallResult success="true" durationInSeconds="7.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec \\* char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec * char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="43">
      <OverallResult success="true" durationInSeconds="7.5e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec (a) char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec (a) char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="44">
      <OverallResult success="true" durationInSeconds="7.6e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec {a} char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec {a} char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="45">
      <OverallResult success="true" durationInSeconds="0.000136"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec \\[a] char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec [a] char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="46">
      <OverallResult success="true" durationInSeconds="7.4e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ; char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec ; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="47">
      <OverallResult success="true" durationInSeconds="9.5e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ["spec ' char", '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec ' char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="48">
      <OverallResult success="true" durationInSeconds="7.8e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec \\ char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec \\ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="49">
      <OverallResult success="true" durationInSeconds="7.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec \\, char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec , char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="50">
      <OverallResult success="true" durationInSeconds="7.4e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec . char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec . char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="51">
      <OverallResult success="true" durationInSeconds="7.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec / char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec / char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="52">
      <OverallResult success="true" durationInSeconds="7.4e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec < char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec &lt; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="53">
      <OverallResult success="true" durationInSeconds="7.1e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec > char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec > char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="54">
      <OverallResult success="true" durationInSeconds="7.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ? char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec ? char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="55">
      <OverallResult success="true" durationInSeconds="7.2e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec - char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec - char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="56">
      <OverallResult success="true" durationInSeconds="7.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec = char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec = char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="57">
      <OverallResult success="true" durationInSeconds="7.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec _ char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec _ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="58">
      <OverallResult success="true" durationInSeconds="7.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec + char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec + char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="59">
      <OverallResult success="true" durationInSeconds="0.000145"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ~ char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec ~ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="60">
      <OverallResult success="true" durationInSeconds="0.000148"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec \\` char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec \` char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="61">
      <OverallResult success="true" durationInSeconds="0.000134"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec § char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec § char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="62">
      <OverallResult success="true" durationInSeconds="7.6e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ± char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec ± char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="63">
      <OverallResult success="true" durationInSeconds="7.4e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec " char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec &quot; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="64">
      <OverallResult success="true" durationInSeconds="7.5e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec | char', '--reporter', 'xml', '--durations', 'yes'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Group name="suite3">
    <TestCase name="spec | char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="65">
      <OverallResult success="true" durationInSeconds="7.4e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['test name,with,colon', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="test name,with,colon" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="8">
      <OverallResult success="true" durationInSeconds="9.8e-05"/>
    </TestCase>
    <OverallResults successes="1" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="1" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['*test name with space ', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="test name with space" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="14">
      <OverallResult success="true" durationInSeconds="8.1e-05"/>
    </TestCase>
    <OverallResults successes="1" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="1" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['SECTION tree', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="SECTION tree" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="20">
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="22">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="23">
            <Section name="4" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="24">
              <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="24">
                <Original>
                  std::false_type::value
                </Original>
                <Expanded>
                  false
                </Expanded>
              </Expression>
              <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000193"/>
            </Section>
            <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000169"/>
          </Section>
          <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000148"/>
        </Section>
        <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.00012"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="22">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="23">
            <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="1e-06"/>
          </Section>
          <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="4.2e-05"/>
        </Section>
        <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="8.6e-05"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2-2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="27">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="28">
            <Section name="4" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="29">
              <Expression success="false" type="REQUIRE" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="29">
                <Original>
                  std::false_type::value
                </Original>
                <Expanded>
                  false
                </Expanded>
              </Expression>
              <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000144"/>
            </Section>
            <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000124"/>
          </Section>
          <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="0.000104"/>
        </Section>
        <OverallResults successes="0" failures="1" expectedFailures="0" durationInSeconds="8.4e-05"/>
      </Section>
      <Section name="1" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="21">
        <Section name="2-2" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="27">
          <Section name="3" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="28">
            <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="1e-06"/>
          </Section>
          <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="4.1e-05"/>
        </Section>
        <OverallResults successes="0" failures="0" expectedFailures="0" durationInSeconds="8.3e-05"/>
      </Section>
      <OverallResult success="false" durationInSeconds="0.000986"/>
    </TestCase>
    <OverallResults successes="0" failures="2" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="2" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ! char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec ! char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="36">
      <OverallResult success="true" durationInSeconds="7.7e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec @ char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec @ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="37">
      <OverallResult success="true" durationInSeconds="7.6e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec # char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec # char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="38">
      <OverallResult success="true" durationInSeconds="7.8e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec $ char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec $ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="39">
      <OverallResult success="true" durationInSeconds="7.8e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec % char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec % char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="40">
      <OverallResult success="true" durationInSeconds="8.9e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ^ char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec ^ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="41">
      <OverallResult success="true" durationInSeconds="7.6e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec & char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec &amp; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="42">
      <OverallResult success="true" durationInSeconds="8.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec \\* char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec * char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="43">
      <OverallResult success="true" durationInSeconds="7.4e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec (a) char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec (a) char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="44">
      <OverallResult success="true" durationInSeconds="8.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec {a} char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec {a} char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="45">
      <OverallResult success="true" durationInSeconds="7.6e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec \\[a] char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec [a] char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="46">
      <OverallResult success="true" durationInSeconds="8.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ; char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec ; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="47">
      <OverallResult success="true" durationInSeconds="7.6e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ["spec ' char", '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec ' char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="48">
      <OverallResult success="true" durationInSeconds="8.8e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec \\\\ char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec \ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="49">
      <OverallResult success="true" durationInSeconds="7.5e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec \\, char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec , char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="50">
      <OverallResult success="true" durationInSeconds="8.1e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec . char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec . char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="51">
      <OverallResult success="true" durationInSeconds="7.6e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec / char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec / char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="52">
      <OverallResult success="true" durationInSeconds="9.3e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec < char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec &lt; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="53">
      <OverallResult success="true" durationInSeconds="7.5e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec > char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec > char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="54">
      <OverallResult success="true" durationInSeconds="0.000117"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ? char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec ? char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="55">
      <OverallResult success="true" durationInSeconds="7.8e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec - char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec - char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="56">
      <OverallResult success="true" durationInSeconds="7.7e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec = char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec = char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="57">
      <OverallResult success="true" durationInSeconds="7.5e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec _ char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec _ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="58">
      <OverallResult success="true" durationInSeconds="7.6e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec + char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec + char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="59">
      <OverallResult success="true" durationInSeconds="7.5e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ~ char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec ~ char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="60">
      <OverallResult success="true" durationInSeconds="8.7e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ` char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec \` char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="61">
      <OverallResult success="true" durationInSeconds="7.8e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec § char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec § char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="62">
      <OverallResult success="true" durationInSeconds="0.000132"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec ± char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec ± char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="63">
      <OverallResult success="true" durationInSeconds="9.2e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec " char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec &quot; char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="64">
      <OverallResult success="true" durationInSeconds="8e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
      [
        ['spec | char', '--reporter', 'xml', '--durations', 'yes', '--order', 'rand', '--rng-seed', '2'],
        `<?xml version="1.0" encoding="UTF-8"?>
<Catch name="suite3">
  <Randomness seed="2"/>
  <Group name="suite3">
    <TestCase name="spec | char" filename="../vscode-catch2-test-adapter/src/test/suite3.cpp" line="65">
      <OverallResult success="true" durationInSeconds="7.6e-05"/>
    </TestCase>
    <OverallResults successes="0" failures="0" expectedFailures="0"/>
  </Group>
  <OverallResults successes="0" failures="0" expectedFailures="0"/>
</Catch>
`,
      ],
    ];
  })();

  public assertWithoutChildren(root: TestSuiteInfo, uniqeIdContainer?: Set<string>): void {
    assert.strictEqual(root.type, 'suite');
    assert.strictEqual(root.label, 'Catch2 and Google tests');
    assert.strictEqual(root.file, undefined);
    assert.strictEqual(root.line, undefined);
    if (uniqeIdContainer != undefined) {
      assert.ok(!uniqeIdContainer.has(root.id));
      uniqeIdContainer.add(root.id);
    }
  }

  public readonly gtest1 = new (class {
    public readonly execPath = vscode.Uri.file(path.join(settings.workspaceFolderUri.path, 'gtest1.exe')).fsPath;

    public readonly gtest_list_tests_output = [
      'Running main() from ...',
      'TestCas1.',
      '  test1',
      '  test2',
      'TestCas2.',
      '  test1',
      '  test2',
      'MockTestCase.',
      '  expect1',
      '  expect2',
      'PrintingFailingParams1/FailingParamTest.',
      '  Fails1/0  # GetParam() = 2',
      '  Fails1/1  # GetParam() = 3',
      '  Fails2/0  # GetParam() = 2',
      '  Fails2/1  # GetParam() = 3',
      'PrintingFailingParams2/FailingParamTest.',
      '  Fails1/0  # GetParam() = 3',
      '  Fails2/0  # GetParam() = 3',
      'TestThreeParams/0.  # TypeParam = std::tuple<float, double, short>',
      '  MaximumTest',
      'TestThreeParams/1.  # TypeParam = std::tuple<long long, signed char, float>',
      '  MaximumTest',
      '',
    ].join(EOL);

    public readonly gtest_list_tests_output_xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<testsuites tests="12" name="AllTests">',
      '  <testsuite name="TestCas1" tests="2">',
      '    <testcase name="test1" file="gtest.cpp" line="11" />',
      '    <testcase name="test2" file="gtest.cpp" line="16" />',
      '  </testsuite>',
      '  <testsuite name="TestCas2" tests="2">',
      '    <testcase name="test1" file="gtest.cpp" line="22" />',
      '    <testcase name="test2" file="gtest.cpp" line="34" />',
      '  </testsuite>',
      '  <testsuite name="MockTestCase" tests="2">',
      '    <testcase name="expect1" file="gtest.cpp" line="67" />',
      '    <testcase name="expect2" file="gtest.cpp" line="75" />',
      '  </testsuite>',
      '  <testsuite name="PrintingFailingParams1/FailingParamTest" tests="4">',
      '    <testcase name="Fails1/0" value_param="2" file="gtest.cpp" line="41" />',
      '    <testcase name="Fails1/1" value_param="3" file="gtest.cpp" line="41" />',
      '    <testcase name="Fails2/0" value_param="2" file="gtest.cpp" line="41" />',
      '    <testcase name="Fails2/1" value_param="3" file="gtest.cpp" line="41" />',
      '  </testsuite>',
      '  <testsuite name="PrintingFailingParams2/FailingParamTest" tests="2">',
      '    <testcase name="Fails1/0" value_param="3" file="gtest.cpp" line="41" />',
      '    <testcase name="Fails2/0" value_param="3" file="gtest.cpp" line="41" />',
      '  </testsuite>',
      '  <testsuite name="TestThreeParams/0" tests="1">',
      '    <testcase name="MaximumTest" type_param="std::tuple&lt;float, double, short&gt;" file="gtest.cpp" line="106" />',
      '  </testsuite>',
      '  <testsuite name="TestThreeParams/1" tests="1">',
      '    <testcase name="MaximumTest" type_param="std::tuple&lt;long long, signed char, float&gt;" file="gtest.cpp" line="106" />',
      '  </testsuite>',
      '</testsuites>',
    ].join(EOL);

    public readonly outputs: [string[], string][] = [
      [['--help'], 'This program contains tests written using Google Test. Yo'],
      [
        ['--gtest_color=no'],
        [
          '[==========] Running 12 tests from 5 test cases.',
          '[----------] Global test environment set-up.',
          '[----------] 2 tests from TestCas1',
          '[ RUN      ] TestCas1.test1',
          '[       OK ] TestCas1.test1 (0 ms)',
          '[ RUN      ] TestCas1.test2',
          'gtest.cpp:19: Failure',
          'Value of: 1 == 2',
          '  Actual: false',
          'Expected: true',
          '[  FAILED  ] TestCas1.test2 (0 ms)',
          '[----------] 2 tests from TestCas1 (0 ms total)',
          '',
          '[----------] 2 tests from TestCas2',
          '[ RUN      ] TestCas2.test1',
          'gtest.cpp:24: Failure',
          'Value of: 1 != 1',
          '  Actual: false',
          'Expected: true',
          'gtest.cpp:25: Failure',
          'Value of: 1 == 1',
          '  Actual: true',
          'Expected: false',
          'gtest.cpp:26: Failure',
          'Expected equality of these values:',
          '  1',
          '  2',
          'gtest.cpp:27: Failure',
          'Expected: (1) != (1), actual: 1 vs 1',
          'gtest.cpp:28: Failure',
          'Expected: (1) < (1), actual: 1 vs 1',
          'gtest.cpp:29: Failure',
          'Expected: (1) > (1), actual: 1 vs 1',
          '[  FAILED  ] TestCas2.test1 (1 ms)',
          '[ RUN      ] TestCas2.test2',
          'gtest.cpp:32: Failure',
          'Value of: false',
          '  Actual: false',
          'Expected: true',
          'gtest.cpp:36: Failure',
          "Expected: magic_func() doesn't generate new fatal failures in the current thread.",
          '  Actual: it does.',
          '[  FAILED  ] TestCas2.test2 (0 ms)',
          '[----------] 2 tests from TestCas2 (1 ms total)',
          '',
          '[----------] 2 tests from MockTestCase',
          '[ RUN      ] MockTestCase.expect1',
          'gtest.cpp:70: Failure',
          "Actual function call count doesn't match EXPECT_CALL(foo, GetSize())...",
          '         Expected: to be called once',
          '           Actual: never called - unsatisfied and active',
          '[  FAILED  ] MockTestCase.expect1 (0 ms)',
          '[ RUN      ] MockTestCase.expect2',
          'unknown file: Failure',
          '',
          'Unexpected mock function call - returning directly.',
          '    Function call: Describe(3)',
          "Google Mock tried the following 1 expectation, but it didn't match: ",
          '',
          'gtest.cpp:78: EXPECT_CALL(foo, Describe(4))...',
          '  Expected arg #0: is equal to 4',
          '           Actual: 3',
          '         Expected: to be called once',
          '           Actual: never called - unsatisfied and active',
          'gtest.cpp:78: Failure',
          "Actual function call count doesn't match EXPECT_CALL(foo, Describe(4))...",
          '         Expected: to be called once',
          '           Actual: never called - unsatisfied and active',
          '[  FAILED  ] MockTestCase.expect2 (0 ms)',
          '[----------] 2 tests from MockTestCase (0 ms total)',
          '',
          '[----------] 4 tests from PrintingFailingParams1/FailingParamTest',
          '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails1/0',
          'gtest.cpp:41: Failure',
          'Expected equality of these values:',
          '  1',
          '  GetParam()',
          '    Which is: 2',
          '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/0, where GetParam() = 2 (0 ms)',
          '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails1/1',
          'gtest.cpp:41: Failure',
          'Expected equality of these values:',
          '  1',
          '  GetParam()',
          '    Which is: 3',
          '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/1, where GetParam() = 3 (0 ms)',
          '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails2/0',
          'gtest.cpp:42: Failure',
          'Expected equality of these values:',
          '  1',
          '  GetParam()',
          '    Which is: 2',
          '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails2/0, where GetParam() = 2 (1 ms)',
          '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails2/1',
          'gtest.cpp:42: Failure',
          'Expected equality of these values:',
          '  1',
          '  GetParam()',
          '    Which is: 3',
          '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails2/1, where GetParam() = 3 (0 ms)',
          '[----------] 4 tests from PrintingFailingParams1/FailingParamTest (1 ms total)',
          '',
          '[----------] 2 tests from PrintingFailingParams2/FailingParamTest',
          '[ RUN      ] PrintingFailingParams2/FailingParamTest.Fails1/0',
          'gtest.cpp:41: Failure',
          'Expected equality of these values:',
          '  1',
          '  GetParam()',
          '    Which is: 3',
          '[  FAILED  ] PrintingFailingParams2/FailingParamTest.Fails1/0, where GetParam() = 3 (0 ms)',
          '[ RUN      ] PrintingFailingParams2/FailingParamTest.Fails2/0',
          'gtest.cpp:42: Failure',
          'Expected equality of these values:',
          '  1',
          '  GetParam()',
          '    Which is: 3',
          '[  FAILED  ] PrintingFailingParams2/FailingParamTest.Fails2/0, where GetParam() = 3 (0 ms)',
          '[----------] 2 tests from PrintingFailingParams2/FailingParamTest (0 ms total)',
          '',
          '[----------] 1 test from TestThreeParams/0, where TypeParam = std::tuple<float, double, short>',
          '[ RUN      ] TestThreeParams/0.MaximumTest',
          'gtest.cpp:111: Failure',
          'Value of: std::max<A>(A(-5), B(2)) == 5',
          '  Actual: false',
          'Expected: true',
          '[  FAILED  ] TestThreeParams/0.MaximumTest, where TypeParam = std::tuple<float, double, short> (1 ms)',
          '[----------] 1 test from TestThreeParams/0 (1 ms total)',
          '',
          '[----------] 1 test from TestThreeParams/1, where TypeParam = std::tuple<long long, signed char, float>',
          '[ RUN      ] TestThreeParams/1.MaximumTest',
          'gtest.cpp:111: Failure',
          'Value of: std::max<A>(A(-5), B(2)) == 5',
          '  Actual: false',
          'Expected: true',
          '[  FAILED  ] TestThreeParams/1.MaximumTest, where TypeParam = std::tuple<long long, signed char, float> (0 ms)',
          '[----------] 1 test from TestThreeParams/1 (0 ms total)',
          '',
          '[----------] Global test environment tear-down',
          '[==========] 12 tests from 5 test cases ran. (2 ms total)',
          '[  PASSED  ] 1 test.',
          '[  FAILED  ] 11 tests, listed below:',
          '[  FAILED  ] TestCas1.test2',
          '[  FAILED  ] TestCas2.test1',
          '[  FAILED  ] TestCas2.test2',
          '[  FAILED  ] MockTestCase.expect1',
          '[  FAILED  ] MockTestCase.expect2',
          '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/0, where GetParam() = 2',
          '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/1, where GetParam() = 3',
          '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails2/0, where GetParam() = 2',
          '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails2/1, where GetParam() = 3',
          '[  FAILED  ] PrintingFailingParams2/FailingParamTest.Fails1/0, where GetParam() = 3',
          '[  FAILED  ] PrintingFailingParams2/FailingParamTest.Fails2/0, where GetParam() = 3',
          '[  FAILED  ] TestThreeParams/0.MaximumTest, where TypeParam = std::tuple<float, double, short>',
          '[  FAILED  ] TestThreeParams/1.MaximumTest, where TypeParam = std::tuple<long long, signed char, float>',
          '',
          '13 FAILED TESTS',
          '  YOU HAVE 1 DISABLED TEST',
          '',
        ].join(EOL),
      ],
      [
        ['--gtest_color=no', '--gtest_filter=TestCas1.test1', '--gtest_also_run_disabled_tests'],
        [
          'Note: Google Test filter = TestCas1.test1',
          '[==========] Running 1 test from 1 test case.',
          '[----------] Global test environment set-up.',
          '[----------] 1 test from TestCas1',
          '[ RUN      ] TestCas1.test1',
          '[       OK ] TestCas1.test1 (0 ms)',
          '[----------] 1 test from TestCas1 (0 ms total)',
          '',
          '[----------] Global test environment tear-down',
          '[==========] 1 test from 1 test case ran. (1 ms total)',
          '[  PASSED  ] 1 test.',
          '',
        ].join(EOL),
      ],
      [
        [
          '--gtest_color=no',
          '--gtest_filter=PrintingFailingParams1/FailingParamTest.Fails1/0',
          '--gtest_also_run_disabled_tests',
        ],
        [
          'Note: Google Test filter = PrintingFailingParams1/FailingParamTest.Fails1/0',
          '[==========] Running 1 test from 1 test case.',
          '[----------] Global test environment set-up.',
          '[----------] 1 test from PrintingFailingParams1/FailingParamTest',
          '[ RUN      ] PrintingFailingParams1/FailingParamTest.Fails1/0',
          'gtest.cpp:41: Failure',
          'Expected equality of these values:',
          '  1',
          '  GetParam()',
          '    Which is: 2',
          '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/0, where GetParam() = 2 (0 ms)',
          '[----------] 1 test from PrintingFailingParams1/FailingParamTest (0 ms total)',
          '',
          '[----------] Global test environment tear-down',
          '[==========] 1 test from 1 test case ran. (1 ms total)',
          '[  PASSED  ] 0 tests.',
          '[  FAILED  ] 1 test, listed below:',
          '[  FAILED  ] PrintingFailingParams1/FailingParamTest.Fails1/0, where GetParam() = 2',
          '',
          ' 1 FAILED TEST',
          '',
        ].join(EOL),
      ],
    ];
  })();

  public readonly outputs: [string, [string[], string][]][] = [
    [this.suite1.execPath, this.suite1.outputs],
    [this.suite2.execPath, this.suite2.outputs],
    [this.suite3.execPath, this.suite3.outputs],
    [this.gtest1.execPath, this.gtest1.outputs],
  ];

  public initImitation(imitation: Imitation): Map<string, FileSystemWatcherStub> {
    const watchers: Map<string, FileSystemWatcherStub> = new Map();

    for (let suite of this.outputs) {
      for (let scenario of suite[1]) {
        imitation.spawnStub.withArgs(suite[0], scenario[0], sinon.match.any).callsFake(function() {
          return new ChildProcessStub(scenario[1]);
        });
      }

      imitation.fsAccessStub
        .withArgs(suite[0], sinon.match.any, sinon.match.any)
        .callsFake(imitation.handleAccessFileExists);

      imitation.vsfsWatchStub
        .withArgs(imitation.createAbsVscodeRelativePatternMatcher(suite[0]))
        .callsFake(imitation.createCreateFSWatcherHandler(watchers));
    }

    const dirContent: Map<string, vscode.Uri[]> = new Map();
    for (let p of this.outputs) {
      const parent = vscode.Uri.file(path.dirname(p[0])).fsPath;
      let children: vscode.Uri[] = [];
      if (dirContent.has(parent)) children = dirContent.get(parent)!;
      else {
        dirContent.set(parent, children);
      }
      children.push(vscode.Uri.file(p[0]));
    }

    dirContent.forEach((v: vscode.Uri[], k: string) => {
      assert.equal(settings.workspaceFolderUri.fsPath, k);
      imitation.vsFindFilesStub.withArgs(imitation.createAbsVscodeRelativePatternMatcher(k)).resolves(v);
      for (const p of v) {
        imitation.vsFindFilesStub.withArgs(imitation.createAbsVscodeRelativePatternMatcher(p.fsPath)).resolves([p]);
      }
    });

    return watchers;
  }
})();
