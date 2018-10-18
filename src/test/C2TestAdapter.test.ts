const sinon = require('sinon');
const child_process = require('child_process');
const deepEqual = require('deep-equal');

import * as path from 'path';
import * as fs from 'fs-extra';
import * as assert from 'assert';
import {EventEmitter} from 'events';
import * as vscode from 'vscode';
import {TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';
import {Log} from 'vscode-test-adapter-util';

import {C2AllTestSuiteInfo} from '../C2AllTestSuiteInfo';
import * as myExtension from '../C2TestAdapter';
import {Stream} from 'stream';
import {inspect} from 'util';

assert.notEqual(vscode.workspace.workspaceFolders, undefined);
assert.equal(vscode.workspace.workspaceFolders!.length, 1);

const workspaceFolderUri = vscode.workspace.workspaceFolders![0].uri;

const workspaceFolder =
    vscode.workspace.getWorkspaceFolder(workspaceFolderUri)!;
const logger =
    new Log('Catch2TestAdapter', workspaceFolder, 'Catch2TestAdapter');

const spawnStub = sinon.stub(child_process, 'spawn');

const dotVscodePath = path.join(workspaceFolderUri.path, '.vscode');

///

describe('C2TestAdapter', function() {
  const config = vscode.workspace.getConfiguration(
      'catch2TestExplorer', workspaceFolderUri);

  const disposable: vscode.Disposable[] = [];

  let adapter: myExtension.C2TestAdapter;
  let testsEvents: (TestLoadStartedEvent|TestLoadFinishedEvent)[];
  let testStatesEvents: (TestRunStartedEvent|TestRunFinishedEvent|
                         TestSuiteEvent|TestEvent)[];

  const createAdapterAndSubscribe = function() {
    adapter = new myExtension.C2TestAdapter(workspaceFolder, logger);
    testsEvents = [];
    testStatesEvents = [];

    spawnStub.throws();

    disposable.push(
        adapter.tests((e: TestLoadStartedEvent|TestLoadFinishedEvent) => {
          testsEvents.push(e);
        }));
    disposable.push(adapter.testStates(
        (e: TestRunStartedEvent|TestRunFinishedEvent|TestSuiteEvent|
         TestEvent) => {
          testStatesEvents.push(e);
        }));
  };

  beforeEach(() => {
    fs.removeSync(dotVscodePath);
    return config.update('defaultRngSeed', undefined);
  });

  afterEach(() => {
    while (disposable.length > 0) disposable.pop()!.dispose();
  });

  describe('detect config change', function() {
    const waitForReloadAndAssert = () => {
      const waitForReloadAndAssertInner =
          (tryCount: number = 20): Promise<void> => {
            if (testsEvents.length < 2)
              return new Promise<void>(r => setTimeout(r, 20))
                  .then(() => {waitForReloadAndAssertInner(tryCount - 1)});
            else {
              assert.equal(testsEvents.length, 2);
              assert.equal(testsEvents[0].type, 'started');
              assert.equal(testsEvents[1].type, 'finished');
              const suite = (<TestLoadFinishedEvent>testsEvents[1]).suite;
              assert.notEqual(suite, undefined);
              assert.equal(suite!.children.length, 0);
              return Promise.resolve();
            }
          };
      return waitForReloadAndAssertInner();
    };

    it('workerMaxNumber', () => {
      createAdapterAndSubscribe();
      assert.deepEqual(testsEvents, []);
      return config.update('workerMaxNumber', 42).then(waitForReloadAndAssert);
    });

    it('defaultEnv', () => {
      createAdapterAndSubscribe();
      assert.deepEqual(testsEvents, []);
      return config.update('defaultEnv', {'APPLE': 'apple'})
          .then(waitForReloadAndAssert);
    });

    it('defaultCwd', () => {
      createAdapterAndSubscribe();
      assert.deepEqual(testsEvents, []);
      return config.update('defaultCwd', 'apple/peach')
          .then(waitForReloadAndAssert);
    });

    it('enableSourceDecoration', () => {
      createAdapterAndSubscribe();
      assert.deepEqual(testsEvents, []);
      return config.update('enableSourceDecoration', false).then(() => {
        assert.ok(!adapter.getIsEnabledSourceDecoration());
      });
    });

    it('defaultRngSeed', () => {
      createAdapterAndSubscribe();
      assert.deepEqual(testsEvents, []);
      return config.update('defaultRngSeed', 987).then(() => {
        assert.equal(adapter.getRngSeed(), 987);
      });
    });
  });

  describe('adapter:', () => {
    beforeEach(() => {
      createAdapterAndSubscribe();
    });

    it('load: empty config', function() {
      return adapter.load().then(() => {
        assert.equal(testsEvents.length, 2);
        assert.equal(testsEvents[0].type, 'started');
        assert.equal(testsEvents[1].type, 'finished');
        const suite = (<TestLoadFinishedEvent>testsEvents[1]).suite;
        assert.notEqual(suite, undefined);
        assert.equal(suite!.children.length, 0);
      });
    });

    describe('load: example1', function() {
      let tests: any;

      beforeEach(() => {
        return adapter.load()
            .then(() => {
              const root = (<TestLoadFinishedEvent>testsEvents[1]).suite;
              assert.notEqual(undefined, root);
              return root!;
            })
            .then((suite: TestSuiteInfo) => {
              const root = <C2AllTestSuiteInfo>suite;
              const s1 = root.createChildSuite('s1', 'execPath1', {});
              const s1t1 =
                  s1.createChildTest('s1t1', 'd', ['tag1'], 'suite1.cpp', 1);
              const s1t2 =
                  s1.createChildTest('s1t2', 'd', ['tag1'], 'suite1.cpp', 2);
              const s2 = root.createChildSuite('s2', 'execPath2', {});
              const s2t1 =
                  s2.createChildTest('s2t1', 'd', ['tag1'], 'suite2.cpp', 1);
              const s2t2 =
                  s2.createChildTest('s2t2', 'd', ['[.]'], 'suite2.cpp', 2);
              const s2t3 =
                  s2.createChildTest('s2t3', 'd', ['tag1'], 'suite2.cpp', 3);

              tests = {
                root: root,
                s1: s1,
                s1t1: s1t1,
                s1t2: s1t2,
                s2: s2,
                s2t1: s2t1,
                s2t2: s2t2,
                s2t3: s2t3
              }
            });
      });

      it('run: 1 test (succ)', function() {
        const stdout = new Stream.Readable();
        const spawnEvent: any = new EventEmitter();
        spawnEvent.stdout = stdout;
        stdout.on('end', () => {
          spawnEvent.emit('close', 1);
        });
        stdout.push(
            `<?xml version="1.0" encoding="UTF-8"?>
      <Catch name="suite1">
        <Randomness seed="2"/>
        <Group name="suite1">
          <TestCase name="` +
            tests.s1t1.testNameFull +
            `" description="1-tag" filename="test.cpp" line="15">
            <OverallResult success="true"/>
          </TestCase>
          <OverallResults successes="4" failures="0" expectedFailures="0"/>
        </Group>
        <OverallResults successes="4" failures="0" expectedFailures="0"/>
      </Catch>`);
        stdout.push(null);

        spawnStub
            .withArgs(
                tests.s1.execPath,
                [
                  tests.s1t1.testNameFull, '--reporter', 'xml', '--durations',
                  'yes'
                ],
                tests.s1.execOptions)
            .returns(spawnEvent);

        return adapter.run([tests.s1t1.id]).then(() => {
          assert.deepEqual(testStatesEvents, [
            {type: 'started', tests: [tests.s1t1.id]},
            {type: 'suite', state: 'running', suite: tests.s1},
            {type: 'test', state: 'running', test: tests.s1t1},
            {
              type: 'test',
              state: 'passed',
              test: tests.s1t1,
              decorations: undefined,
              message: 'Randomness seeded to: 2\n'
            },
            {type: 'suite', state: 'completed', suite: tests.s1},
            {type: 'finished'},
          ]);
        });
      });

      it('run: 1 test (fails)', function() {
        const stdout = new Stream.Readable();
        const spawnEvent: any = new EventEmitter();
        spawnEvent.stdout = stdout;
        stdout.on('end', () => {
          spawnEvent.emit('close', 1);
        });
        stdout.push(
            `<?xml version="1.0" encoding="UTF-8"?>
                    <Catch name="suite1">
                      <Randomness seed="2"/>
                      <Group name="suite1">
                        <TestCase name="` +
            tests.s1t1.testNameFull + `" filename="test.cpp" line="211">
                          <Expression success="false" type="REQUIRE" filename="test.cpp" line="214">
                            <Original>
                              1 == x % 2
                            </Original>
                            <Expanded>
                              1 == 0
                            </Expanded>
                          </Expression>
                          <OverallResult success="false"/>
                        </TestCase>
                        <OverallResults successes="0" failures="1" expectedFailures="0"/>
                      </Group>
                      <OverallResults successes="0" failures="1" expectedFailures="0"/>
                    </Catch>`);
        stdout.push(null);

        spawnStub
            .withArgs(
                tests.s1.execPath,
                [
                  tests.s1t1.testNameFull, '--reporter', 'xml', '--durations',
                  'yes'
                ],
                tests.s1.execOptions)
            .returns(spawnEvent);

        return adapter.run([tests.s1t1.id]).then(() => {
          assert.deepEqual(testStatesEvents, [
            {type: 'started', tests: [tests.s1t1.id]},
            {type: 'suite', state: 'running', suite: tests.s1},
            {type: 'test', state: 'running', test: tests.s1t1},
            {
              type: 'test',
              state: 'failed',
              test: tests.s1t1,
              decorations: [{line: 213, message: 'Expanded: 1 == 0'}],
              message:
                  'Randomness seeded to: 2\n>>> s1t1(line: 211) REQUIRE (line: 214) \n  Original:\n    1 == x % 2\n  Expanded:\n    1 == 0\n<<<\n'
            },
            {type: 'suite', state: 'completed', suite: tests.s1},
            {type: 'finished'},
          ]);
        });
      });

      it('run: 1 test (fails) with chunks', function() {
        const stdout = new Stream.Readable();
        const spawnEvent: any = new EventEmitter();
        spawnEvent.stdout = stdout;
        stdout.on('end', () => {
          spawnEvent.emit('close', 1);
        });

        spawnStub
            .withArgs(
                tests.s1.execPath,
                [
                  tests.s1t1.testNameFull, '--reporter', 'xml', '--durations',
                  'yes'
                ],
                tests.s1.execOptions)
            .returns(spawnEvent);

        stdout.push('<?xml version="1.0" encoding="UTF-8"?>\n');
        stdout.push('<Catch name="suite1">\n');
        stdout.push('  <Randomness seed="2"/>\n');
        stdout.push('  <Group name="suite1">\n');
        stdout.push(
            '    <TestCase name="' + tests.s1t1.testNameFull +
            '" filename="test.cpp" line="211">\n');
        stdout.push(
            '      <Expression success="false" type="REQUIRE" filename="test.cpp" line="214">\n');
        stdout.push('        <Original>\n');
        stdout.push('          1 == x % 2\n');
        stdout.push('        </Original>\n');
        stdout.push('        <Expanded>\n');
        stdout.push('          1 == 0\n');
        stdout.push('        </Expanded>\n');
        stdout.push('      </Expression>\n');
        stdout.push('      <OverallResult success="false"/>\n');
        stdout.push('    </TestCase>\n');
        stdout.push(
            '    <OverallResults successes="0" failures="1" expectedFailures="0"/>\n');
        stdout.push('  </Group>\n');
        stdout.push(
            '  <OverallResults successes="0" failures="1" expectedFailures="0"/>\n');
        stdout.push('</Catch>\n');
        stdout.push(null);

        return adapter.run([tests.s1t1.id]).then(() => {
          assert.deepEqual(testStatesEvents, [
            {type: 'started', tests: [tests.s1t1.id]},
            {type: 'suite', state: 'running', suite: tests.s1},
            {type: 'test', state: 'running', test: tests.s1t1},
            {
              type: 'test',
              state: 'failed',
              test: tests.s1t1,
              decorations: [{line: 213, message: 'Expanded: 1 == 0'}],
              message:
                  'Randomness seeded to: 2\n>>> s1t1(line: 211) REQUIRE (line: 214) \n  Original:\n    1 == x % 2\n  Expanded:\n    1 == 0\n<<<\n'
            },
            {type: 'suite', state: 'completed', suite: tests.s1},
            {type: 'finished'},
          ]);
        });
      });

      it('run: 1 suite (1 succ 1 fails)', function() {
        const stdout = new Stream.Readable();
        const spawnEvent: any = new EventEmitter();
        spawnEvent.stdout = stdout;
        stdout.on('end', () => {
          spawnEvent.emit('close', 1);
        });
        stdout.push(`<?xml version="1.0" encoding="UTF-8"?>
          <Catch name="suite1">
            <Randomness seed="2"/>
            <Group name="suite1">
              <TestCase name="s1t1" description="tag1" filename="suite1.cpp" line="7">
                <OverallResult success="true" durationInSeconds="0.000174"/>
              </TestCase>
              <TestCase name="s1t2" description="tag1" filename="suite1.cpp" line="13">
                <Expression success="false" type="REQUIRE" filename="suite1.cpp" line="15">
                  <Original>
                    std::false_type::value
                  </Original>
                  <Expanded>
                    false
                  </Expanded>
                </Expression>
                <OverallResult success="false" durationInSeconds="0.000255"/>
              </TestCase>
              <OverallResults successes="1" failures="1" expectedFailures="0"/>
            </Group>
            <OverallResults successes="1" failures="1" expectedFailures="0"/>
          </Catch>`);
        stdout.push(null);

        spawnStub
            .withArgs(
                tests.s1.execPath, ['--reporter', 'xml', '--durations', 'yes'],
                tests.s1.execOptions)
            .returns(spawnEvent);

        return adapter.run([tests.s1.id]).then(() => {
          assert.deepEqual(testStatesEvents, [
            {type: 'started', tests: [tests.s1.id]},
            {type: 'suite', state: 'running', suite: tests.s1},
            {type: 'test', state: 'running', test: tests.s1t1},
            {
              type: 'test',
              state: 'passed',
              test: tests.s1t1,
              decorations: undefined,
              message: 'Randomness seeded to: 2\nDuration: 0.000174 second(s)\n'
            },
            {type: 'test', state: 'running', test: tests.s1t2},
            {
              type: 'test',
              state: 'failed',
              test: tests.s1t2,
              decorations: [{line: 14, message: 'Expanded: false'}],
              message:
                  'Randomness seeded to: 2\nDuration: 0.000255 second(s)\n>>> s1t2(line: 13) REQUIRE (line: 15) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
            },
            {type: 'suite', state: 'completed', suite: tests.s1},
            {type: 'finished'},
          ]);
        });
      });

      it('run: tests (1 succ 1 skipps 1 fails) [at least 2 slots]', function() {
        {
          const stdout = new Stream.Readable();
          const spawnEvent: any = new EventEmitter();
          spawnEvent.stdout = stdout;
          stdout.on('end', () => {
            spawnEvent.emit('close', 1);
          });
          stdout.push(`<?xml version="1.0" encoding="UTF-8"?>
          <Catch name="suite1">
            <Randomness seed="2"/>
            <Group name="suite1">
              <TestCase name="s1t1" description="tag1" filename="suite1.cpp" line="7">
                <OverallResult success="true" durationInSeconds="0.000174"/>
              </TestCase>
              <TestCase name="s1t2" description="tag1" filename="suite1.cpp" line="13">
                <Expression success="false" type="REQUIRE" filename="suite1.cpp" line="15">
                  <Original>
                    std::false_type::value
                  </Original>
                  <Expanded>
                    false
                  </Expanded>
                </Expression>
                <OverallResult success="false" durationInSeconds="0.000255"/>
              </TestCase>
              <OverallResults successes="1" failures="1" expectedFailures="0"/>
            </Group>
            <OverallResults successes="1" failures="1" expectedFailures="0"/>
          </Catch>`);
          stdout.push(null);

          spawnStub
              .withArgs(
                  tests.s1.execPath,
                  ['--reporter', 'xml', '--durations', 'yes'],
                  tests.s1.execOptions)
              .returns(spawnEvent);
        }
        {
          const stdout = new Stream.Readable();
          const spawnEvent: any = new EventEmitter();
          spawnEvent.stdout = stdout;
          stdout.on('end', () => {
            spawnEvent.emit('close', 1);
          });
          stdout.push(`<?xml version="1.0" encoding="UTF-8"?>
        <Catch name="suite2">
          <Randomness seed="2"/>
          <Group name="suite2">
            <TestCase name="s2t1" description="tag1" filename="suite2.cpp" line="7">
              <OverallResult success="true" durationInSeconds="0.000165"/>
            </TestCase>
            <TestCase name="s2t3" description="tag1" filename="suite2.cpp" line="19">
              <Expression success="false" type="REQUIRE" filename="suite2.cpp" line="21">
                <Original>
                  std::false_type::value
                </Original>
                <Expanded>
                  false
                </Expanded>
              </Expression>
              <OverallResult success="false" durationInSeconds="0.000199"/>
            </TestCase>
            <OverallResults successes="1" failures="1" expectedFailures="0"/>
          </Group>
          <OverallResults successes="1" failures="1" expectedFailures="0"/>
        </Catch>`);
          stdout.push(null);

          spawnStub
              .withArgs(
                  tests.s2.execPath,
                  ['--reporter', 'xml', '--durations', 'yes'],
                  tests.s2.execOptions)
              .returns(spawnEvent);
        }

        return adapter.run([tests.root.id]).then(() => {
          assert.deepEqual(
              {type: 'started', tests: [tests.root.id]}, testStatesEvents[0]);
          assert.deepEqual(
              {type: 'finished'},
              testStatesEvents[testStatesEvents.length - 1]);

          const findIndex = function(o: any) {
            const i = testStatesEvents.findIndex((v) => {
              return deepEqual(o, v);
            });
            assert.notEqual(i, -1, 'findIndex failed to find: ' + inspect(o));
            return i;
          };

          const s1running = {type: 'suite', state: 'running', suite: tests.s1};
          const s1finished = {
            type: 'suite',
            state: 'completed',
            suite: tests.s1
          };
          assert.ok(findIndex(s1running) < findIndex(s1finished));

          const s2running = {type: 'suite', state: 'running', suite: tests.s2};
          const s2finished = {
            type: 'suite',
            state: 'completed',
            suite: tests.s2
          };
          assert.ok(findIndex(s2running) < findIndex(s2finished));

          const s1t1running = {
            type: 'test',
            state: 'running',
            test: tests.s1t1
          };
          assert.ok(findIndex(s1running) < findIndex(s1t1running));

          const s1t1finished = {
            type: 'test',
            state: 'passed',
            test: tests.s1t1,
            decorations: undefined,
            message: 'Randomness seeded to: 2\nDuration: 0.000174 second(s)\n'
          };
          assert.ok(findIndex(s1t1running) < findIndex(s1t1finished));
          assert.ok(findIndex(s1t1finished) < findIndex(s1finished));

          const s1t2running = {
            type: 'test',
            state: 'running',
            test: tests.s1t2
          };
          assert.ok(findIndex(s1running) < findIndex(s1t2running));

          const s1t2finished = {
            type: 'test',
            state: 'failed',
            test: tests.s1t2,
            decorations: [{line: 14, message: 'Expanded: false'}],
            message:
                'Randomness seeded to: 2\nDuration: 0.000255 second(s)\n>>> s1t2(line: 13) REQUIRE (line: 15) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
          };
          assert.ok(findIndex(s1t2running) < findIndex(s1t2finished));
          assert.ok(findIndex(s1t2finished) < findIndex(s1finished));

          const s2t1running = {
            type: 'test',
            state: 'running',
            test: tests.s2t1
          };
          assert.ok(findIndex(s2running) < findIndex(s2t1running));

          const s2t1finished = {
            type: 'test',
            state: 'passed',
            test: tests.s2t1,
            decorations: undefined,
            message: 'Randomness seeded to: 2\nDuration: 0.000165 second(s)\n'
          };
          assert.ok(findIndex(s2t1running) < findIndex(s2t1finished));
          assert.ok(findIndex(s2t1finished) < findIndex(s2finished));

          const s2t2running = {
            type: 'test',
            state: 'running',
            test: tests.s2t2
          };
          assert.ok(findIndex(s2running) < findIndex(s2t2running));

          const s2t2finished = {
            type: 'test',
            state: 'skipped',
            test: tests.s2t2
          };
          assert.ok(findIndex(s2t2running) < findIndex(s2t2finished));
          assert.ok(findIndex(s2t2finished) < findIndex(s2finished));

          const s2t3running = {
            type: 'test',
            state: 'running',
            test: tests.s2t3
          };
          assert.ok(findIndex(s2running) < findIndex(s2t3running));

          const s2t3finished = {
            type: 'test',
            state: 'failed',
            test: tests.s2t3,
            decorations: [{line: 20, message: 'Expanded: false'}],
            message:
                'Randomness seeded to: 2\nDuration: 0.000199 second(s)\n>>> s2t3(line: 19) REQUIRE (line: 21) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
          };
          assert.ok(findIndex(s2t3running) < findIndex(s2t3finished));
          assert.ok(findIndex(s2t3finished) < findIndex(s2finished));

          assert.equal(testStatesEvents.length, 16, inspect(testStatesEvents));
        });
      });
    });
  });
});