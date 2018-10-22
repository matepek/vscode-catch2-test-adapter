import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';

assert.notEqual(vscode.workspace.workspaceFolders, undefined);
assert.equal(vscode.workspace.workspaceFolders!.length, 1);

const workspaceFolderUri = vscode.workspace.workspaceFolders![0].uri;

export const example1 = new class {
  readonly suite1 = new class {
    readonly execPath = path.join(workspaceFolderUri.path, 'execPath1');

    readonly t1 = new class {
      readonly fullTestName = 's1t1';
      assert(label: string, test: TestInfo, uniqeIdContainer?: Set<string>) {
        assert.equal(test.type, 'test');
        assert.equal(test.label, label);
        assert.equal(
            test.file, path.join(workspaceFolderUri.path, 'suite1.cpp'));
        assert.equal(test.line, 7 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      };

      readonly outputs: [string[], string][] = [
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
            </Catch>`
        ],
        [
          [
            's1t1', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'
          ],
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
            </Catch>`
        ],
      ];
    };

    readonly t2 = new class {
      readonly fullTestName = 's1t2';
      assert(label: string, test: TestInfo, uniqeIdContainer?: Set<string>) {
        assert.equal(test.type, 'test');
        assert.equal(test.label, label);
        assert.equal(
            test.file, path.join(workspaceFolderUri.path, 'suite1.cpp'));
        assert.equal(test.line, 13 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      };

      readonly outputs: [string[], string][] = [
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
            </Catch>`
        ],
        [
          [
            's1t2', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'
          ],
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
            </Catch>`
        ]
      ];
    };

    readonly outputs: [string[], string][] = [
      [['--help'], 'Catch v2.'],
      [
        ['[.],*', '--verbosity', 'high', '--list-tests', '--use-colour', 'no'],
        'Matching test cases:\n' +
            '  s1t1\n' +
            '    suite1.cpp:7\n' +
            '    tag1\n' +
            '  s1t2\n' +
            '    suite1.cpp:13\n' +
            '    tag1\n' +
            '2 matching test cases\n\n'
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
          </Catch>`
      ],
      [
        ['--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'],
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
          </Catch>`
      ],
      ...this.t1.outputs,
      ...this.t2.outputs,
    ];

    assert(
        label: string, childLabels: string[], suite: TestSuiteInfo,
        uniqeIdContainer?: Set<string>) {
      assert.equal(suite.type, 'suite');
      assert.equal(suite.label, label);
      assert.equal(
          suite.file, path.join(workspaceFolderUri.path, 'suite1.cpp'));
      assert.equal(suite.line, 0);
      assert.equal(suite.children.length, 2);
      assert.equal(childLabels.length, suite.children.length);
      this.t1.assert(
          childLabels[0], <TestInfo>suite.children[0], uniqeIdContainer);
      this.t2.assert(
          childLabels[1], <TestInfo>suite.children[1], uniqeIdContainer);
      if (uniqeIdContainer != undefined) {
        assert.ok(!uniqeIdContainer.has(suite.id));
        uniqeIdContainer.add(suite.id);
      }
    }
  };

  readonly suite2 = new class {
    readonly execPath = path.join(workspaceFolderUri.path, 'execPath2');

    readonly t1 = new class {
      readonly fullTestName = 's2t1';
      assert(label: string, test: TestInfo, uniqeIdContainer?: Set<string>) {
        assert.equal(test.type, 'test');
        assert.equal(test.label, label);
        assert.equal(
            test.file, path.join(workspaceFolderUri.path, 'suite2.cpp'));
        assert.equal(test.line, 7 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      }

      readonly outputs: [string[], string][] = [
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
          </Catch>`
        ],
        [
          [
            's2t1', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'
          ],
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
          </Catch>`
        ]
      ];
    };

    readonly t2 = new class {
      readonly fullTestName = 's2t2';
      assert(label: string, test: TestInfo, uniqeIdContainer?: Set<string>) {
        assert.equal(test.type, 'test');
        assert.equal(test.label, label);
        assert.equal(
            test.file, path.join(workspaceFolderUri.path, 'suite2.cpp'));
        assert.equal(test.line, 13 - 1);
        assert.ok(test.skipped === true);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      }

      readonly outputs: [string[], string][] = [
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
            </Catch>`
        ],
        [
          [
            's2t2', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'
          ],
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
            </Catch>`
        ]
      ];
    };

    readonly t3 = new class {
      readonly fullTestName = 's2t3';
      assert(label: string, test: TestInfo, uniqeIdContainer?: Set<string>) {
        assert.equal(test.type, 'test');
        assert.equal(test.label, label);
        assert.equal(
            test.file, path.join(workspaceFolderUri.path, 'suite2.cpp'));
        assert.equal(test.line, 19 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      }

      readonly outputs: [string[], string][] = [
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
            </Catch>`
        ],
        [
          [
            's2t3', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'
          ],
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
            </Catch>`
        ]
      ];
    };

    assert(
        label: string, childLabels: string[], suite: TestSuiteInfo,
        uniqeIdContainer?: Set<string>) {
      assert.equal(suite.type, 'suite');
      assert.equal(suite.label, label);
      assert.equal(
          suite.file, path.join(workspaceFolderUri.path, 'suite2.cpp'));
      assert.equal(suite.line, 0);
      assert.equal(suite.children.length, 3);
      assert.equal(childLabels.length, suite.children.length);
      this.t1.assert(
          childLabels[0], <TestInfo>suite.children[0], uniqeIdContainer);
      this.t2.assert(
          childLabels[1], <TestInfo>suite.children[1], uniqeIdContainer);
      this.t3.assert(
          childLabels[2], <TestInfo>suite.children[2], uniqeIdContainer);
      if (uniqeIdContainer != undefined) {
        assert.ok(!uniqeIdContainer.has(suite.id));
        uniqeIdContainer.add(suite.id);
      }
    }

    readonly outputs: [string[], string][] = [
      [['--help'], 'Catch v2.'],
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
            '3 matching test cases\n\n'
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
          </Catch>`
      ],
      [
        ['--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'],
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
          </Catch>`
      ],
      ...this.t1.outputs, ...this.t2.outputs, ...this.t3.outputs
    ];
  };

  assertWithoutChildren(root: TestSuiteInfo, uniqeIdContainer?: Set<string>) {
    assert.equal(root.type, 'suite');
    assert.equal(root.label, 'AllTests');
    assert.equal(root.file, undefined);
    assert.equal(root.line, undefined);
    if (uniqeIdContainer != undefined) {
      assert.ok(!uniqeIdContainer.has(root.id));
      uniqeIdContainer.add(root.id);
    }
  };

  readonly outputs: [string, [string[], string][]][] = [
    [this.suite1.execPath, this.suite1.outputs],
    [this.suite2.execPath, this.suite2.outputs]
  ];
};