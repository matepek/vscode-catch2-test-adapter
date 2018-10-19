const sinon = require('sinon');
const child_process = require('child_process');
const deepEqual = require('deep-equal');

import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';
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

const dotVscodePath = path.join(workspaceFolderUri.path, '.vscode');

const sinonSandbox = sinon.createSandbox();

///

describe('C2TestAdapter', function() {
  const config = vscode.workspace.getConfiguration(
      'catch2TestExplorer', workspaceFolderUri);

  const disposable: vscode.Disposable[] = [];

  let adapter: myExtension.C2TestAdapter|undefined;
  let testsEvents: (TestLoadStartedEvent|TestLoadFinishedEvent)[];
  let testStatesEvents: (TestRunStartedEvent|TestRunFinishedEvent|
                         TestSuiteEvent|TestEvent)[];

  let spawnStub: any;
  let execFileStub: any;
  let fsWatchStub: any;
  let fsExistsStub: any;

  const resetConfig = function(): Thenable<void> {
    const packageJson = fse.readJSONSync(
        path.join(workspaceFolderUri.path, '../..', 'package.json'));
    const properties: {[prop: string]: any}[] =
        packageJson['contributes']['configuration']['properties'];
    let t: Thenable<void> = Promise.resolve();
    Object.keys(properties).forEach(key => {
      assert.ok(key.startsWith('catch2TestExplorer.'));
      const k = key.replace('catch2TestExplorer.', '')
      t = t.then(() => {
        return config.update(k, undefined);
      });
    });
    return t;
  };

  const createAdapterAndSubscribe = function() {
    adapter = new myExtension.C2TestAdapter(workspaceFolder, logger);
    testsEvents = [];
    testStatesEvents = [];

    disposable.push(
        adapter.tests((e: TestLoadStartedEvent|TestLoadFinishedEvent) => {
          testsEvents.push(e);
        }));
    disposable.push(adapter.testStates(
        (e: TestRunStartedEvent|TestRunFinishedEvent|TestSuiteEvent|
         TestEvent) => {
          testStatesEvents.push(e);
        }));
    return adapter!;
  };

  beforeEach(() => {
    adapter = undefined;
    fse.removeSync(dotVscodePath);

    spawnStub = sinonSandbox.stub(child_process, 'spawn');
    spawnStub.throws();

    execFileStub = sinonSandbox.stub(child_process, 'execFile');
    execFileStub.throws();

    fsWatchStub = sinonSandbox.stub(fs, 'watch');
    fsWatchStub.throws();

    fsExistsStub = sinonSandbox.stub(fs, 'exists');
    fsExistsStub.throws();

    return resetConfig();
  });

  afterEach(() => {
    while (disposable.length > 0) disposable.pop()!.dispose();
    sinonSandbox.restore();
  });

  describe('detect config change', function() {
    this.timeout(1000);
    const waitForReloadAndAssert = () => {
      const waitForReloadAndAssertInner =
          (tryCount: number = 20): Promise<void> => {
            if (testsEvents.length < 2)
              return new Promise<void>(r => setTimeout(r, 10))
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
      const adapter = createAdapterAndSubscribe();
      assert.deepEqual(testsEvents, []);
      return config.update('enableSourceDecoration', false).then(() => {
        assert.ok(!adapter.getIsEnabledSourceDecoration());
      });
    });

    it('defaultRngSeed', () => {
      const adapter = createAdapterAndSubscribe();
      assert.deepEqual(testsEvents, []);
      return config.update('defaultRngSeed', 987).then(() => {
        assert.equal(adapter.getRngSeed(), 987);
      });
    });
  });
  // describe('detect config change'

  describe('adapter:', () => {
    let adapter: myExtension.C2TestAdapter;

    beforeEach(() => {
      adapter = createAdapterAndSubscribe();
    });

    it('fill with empty config', function() {
      return adapter.load().then(() => {
        assert.equal(testsEvents.length, 2);
        assert.equal(testsEvents[0].type, 'started');
        assert.equal(testsEvents[1].type, 'finished');
        const suite = (<TestLoadFinishedEvent>testsEvents[1]).suite;
        assert.notEqual(suite, undefined);
        assert.equal(suite!.children.length, 0);
      });
    });

    describe('fill with example1', function() {
      let tests: any;

      const randomnessXml = `<Randomness seed="2"/>`;

      const s1t1Xml = `
        <TestCase name="s1t1" description="tag1" filename="suite1.cpp" line="7">
          <OverallResult success="true" durationInSeconds="0.000174"/>
        </TestCase>`;

      const s1t2Xml = `
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
        </TestCase>;`;

      const s1HeaderXml = `<?xml version="1.0" encoding="UTF-8"?>
        <Catch name="suite1">
          <Randomness seed="2"/>
          <Group name="suite1">`;

      const s1Xml = s1HeaderXml + s1t1Xml + s1t2Xml + `
            <OverallResults successes="1" failures="1" expectedFailures="0"/>
          </Group>
          <OverallResults successes="1" failures="1" expectedFailures="0"/>
        </Catch>`;

      const s2t1Xml = `
        <TestCase name="s2t1" description="tag1" filename="suite2.cpp" line="7">
          <OverallResult success="true" durationInSeconds="0.000165"/>
        </TestCase>`;

      const s2t2Xml = `
        <TestCase name="s2t2" description="tag1 " tags="[.]" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="13">
          <OverallResult success="true"/>
        </TestCase>`;

      const s2t3Xml = `
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
        </TestCase>`;

      const s2HeaderXml = `<?xml version="1.0" encoding="UTF-8"?>
        <Catch name="suite2">
          ` +
          randomnessXml + `
          <Group name="suite2">`;

      const s2Xml = s2HeaderXml + s2t1Xml + /* s2t2 is skipped */ s2t3Xml + `
            <OverallResults successes="1" failures="1" expectedFailures="0"/>
          </Group>
          <OverallResults successes="1" failures="1" expectedFailures="0"/>
        </Catch>`;

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
            s1HeaderXml + s1t1Xml +
            `<OverallResults successes="4" failures="0" expectedFailures="0"/>
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
              message: 'Randomness seeded to: 2\nDuration: 0.000174 second(s)\n'
            },
            {type: 'suite', state: 'completed', suite: tests.s1},
            {type: 'finished'},
          ]);
        });
      });
      // it('run: 1 test (succ)'

      it('run: 1 test (missing)', function() {
        const stdout = new Stream.Readable();
        const spawnEvent: any = new EventEmitter();
        spawnEvent.stdout = stdout;
        stdout.on('end', () => {
          spawnEvent.emit('close', 1);
        });
        stdout.push(
            s1HeaderXml +
            `<OverallResults successes="0" failures="0" expectedFailures="0"/>
              </Group>
              <OverallResults successes="0" failures="0" expectedFailures="0"/>
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
            {type: 'suite', state: 'completed', suite: tests.s1},
            {type: 'finished'},
          ]);
        });
      });
      // it('run: 1 test (missing)'

      it('run: 1 test (skipped)', function() {
        const stdout = new Stream.Readable();
        const spawnEvent: any = new EventEmitter();
        spawnEvent.stdout = stdout;
        stdout.on('end', () => {
          spawnEvent.emit('close', 1);
        });
        stdout.push(s2HeaderXml + s2t2Xml + `
                <OverallResults successes="1" failures="0" expectedFailures="0"/>
              </Group>
              <OverallResults successes="1" failures="0" expectedFailures="0"/>
            </Catch>`);
        stdout.push(null);

        spawnStub
            .withArgs(
                tests.s2.execPath,
                [
                  tests.s2t2.testNameFull, '--reporter', 'xml', '--durations',
                  'yes'
                ],
                tests.s2.execOptions)
            .returns(spawnEvent);

        return adapter.run([tests.s2t2.id]).then(() => {
          assert.deepEqual(testStatesEvents, [
            {type: 'started', tests: [tests.s2t2.id]},
            {type: 'suite', state: 'running', suite: tests.s2},
            {type: 'test', state: 'running', test: tests.s2t2},
            {
              type: 'test',
              state: 'passed',
              test: tests.s2t2,
              decorations: undefined,
              message: 'Randomness seeded to: 2\n'
            },
            {type: 'suite', state: 'completed', suite: tests.s2},
            {type: 'finished'},
          ]);
        });
      });
      // it('run: 1 test (skipped)'

      it('run: 1 test (fails)', function() {
        const stdout = new Stream.Readable();
        const spawnEvent: any = new EventEmitter();
        spawnEvent.stdout = stdout;
        stdout.on('end', () => {
          spawnEvent.emit('close', 1);
        });
        stdout.push(
            s2HeaderXml + s2t3Xml +
            ` <OverallResults successes="0" failures="1" expectedFailures="0"/>
                      </Group>
                      <OverallResults successes="0" failures="1" expectedFailures="0"/>
                    </Catch>`);
        stdout.push(null);

        spawnStub
            .withArgs(
                tests.s2.execPath,
                [
                  tests.s2t3.testNameFull, '--reporter', 'xml', '--durations',
                  'yes'
                ],
                tests.s2.execOptions)
            .returns(spawnEvent);

        return adapter.run([tests.s2t3.id]).then(() => {
          assert.deepEqual(testStatesEvents, [
            {type: 'started', tests: [tests.s2t3.id]},
            {type: 'suite', state: 'running', suite: tests.s2},
            {type: 'test', state: 'running', test: tests.s2t3},
            {
              type: 'test',
              state: 'failed',
              test: tests.s2t3,
              decorations: [{line: 20, message: 'Expanded: false'}],
              message:
                  'Randomness seeded to: 2\nDuration: 0.000199 second(s)\n>>> s2t3(line: 19) REQUIRE (line: 21) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
            },
            {type: 'suite', state: 'completed', suite: tests.s2},
            {type: 'finished'},
          ]);
        });
      });
      // it('run: 1 test (fails)'

      it('run: 1 test (fails) with chunks', function() {
        const stdout = new Stream.Readable();
        const spawnEvent: any = new EventEmitter();
        spawnEvent.stdout = stdout;
        stdout.on('end', () => {
          spawnEvent.emit('close', 1);
        });

        spawnStub
            .withArgs(
                tests.s2.execPath,
                [
                  tests.s2t3.testNameFull, '--reporter', 'xml', '--durations',
                  'yes'
                ],
                tests.s1.execOptions)
            .returns(spawnEvent);

        s2HeaderXml.split('\n').forEach((l: string) => {stdout.push(l)});
        s2t3Xml.split('\n').forEach((l: string) => {stdout.push(l)});
        stdout.push(
            '    <OverallResults successes="0" failures="1" expectedFailures="0"/>\n');
        stdout.push('  </Group>\n');
        stdout.push(
            '  <OverallResults successes="0" failures="1" expectedFailures="0"/>\n');
        stdout.push('</Catch>\n');
        stdout.push(null);

        return adapter.run([tests.s2t3.id]).then(() => {
          assert.deepEqual(testStatesEvents, [
            {type: 'started', tests: [tests.s2t3.id]},
            {type: 'suite', state: 'running', suite: tests.s2},
            {type: 'test', state: 'running', test: tests.s2t3},
            {
              type: 'test',
              state: 'failed',
              test: tests.s2t3,
              decorations: [{line: 20, message: 'Expanded: false'}],
              message:
                  'Randomness seeded to: 2\nDuration: 0.000199 second(s)\n>>> s2t3(line: 19) REQUIRE (line: 21) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
            },
            {type: 'suite', state: 'completed', suite: tests.s2},
            {type: 'finished'},
          ]);
        });
      });
      // it('run: 1 test (fails) with chunks'

      it('run: suite1 (1 succ 1 fails)', function() {
        const stdout = new Stream.Readable();
        const spawnEvent: any = new EventEmitter();
        spawnEvent.stdout = stdout;
        stdout.on('end', () => {
          spawnEvent.emit('close', 1);
        });
        stdout.push(s1Xml);
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
      // it('run: suite1 (1 succ 1 fails)'

      it('run: root (at least 2 slots)', function() {
        {
          const stdout = new Stream.Readable();
          const spawnEvent: any = new EventEmitter();
          spawnEvent.stdout = stdout;
          stdout.on('end', () => {
            spawnEvent.emit('close', 1);
          });
          stdout.push(s1Xml);
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
          stdout.push(s2Xml);
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
      // it('run: root (at least 2 slots)'

      it('run: wrong xml 1', function() {
        const stdout = new Stream.Readable();
        const spawnEvent: any = new EventEmitter();
        spawnEvent.stdout = stdout;
        stdout.on('end', () => {
          spawnEvent.emit('close', 1);
        });
        const testCaseBegin = s1t1Xml.split('\n')[1];
        assert.ok(testCaseBegin.indexOf('<TestCase ') != -1);
        stdout.push(s1HeaderXml + testCaseBegin);
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
              message: 'Unexpected test error. (Is Catch2 crashed?)\n'
            },
            {type: 'suite', state: 'completed', suite: tests.s1},
            {type: 'finished'},
          ]);
        });
      });
      // it('run: wrong xml 1'

      it('cancel: empty', function() {
        adapter.cancel();
      });
      // it('cancel: empty'

      it('cancel', function() {
        const suite1Kill = sinon.spy();
        const suite2Kill = sinon.spy();
        {
          const stdout = new Stream.Readable();
          const spawnEvent: any = new EventEmitter();
          spawnEvent.kill = suite1Kill;
          spawnEvent.stdout = stdout;
          stdout.on('end', () => {
            spawnEvent.emit('close', 1);
          });
          stdout.push(s1Xml);
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
          spawnEvent.kill = suite2Kill;
          spawnEvent.stdout = stdout;
          stdout.on('end', () => {
            spawnEvent.emit('close', 1);
          });
          stdout.push(s2Xml);
          stdout.push(null);

          spawnStub
              .withArgs(
                  tests.s2.execPath,
                  ['--reporter', 'xml', '--durations', 'yes'],
                  tests.s2.execOptions)
              .returns(spawnEvent);
        }
        const run = adapter.run([tests.root.id]);
        adapter.cancel();
        run.then(() => {
          assert.deepEqual(
              testStatesEvents,
              [{type: 'started', tests: [tests.root.id]}, {type: 'finished'}]);
          assert.equal(suite1Kill.callCount, 1);
          assert.equal(suite2Kill.callCount, 1);
        });
      });
      // it('cancel'

      it('cancel: after run finished', function() {
        const suite1Kill = sinon.spy();
        const suite2Kill = sinon.spy();
        {
          const stdout = new Stream.Readable();
          const spawnEvent: any = new EventEmitter();
          spawnEvent.kill = suite1Kill;
          spawnEvent.stdout = stdout;
          stdout.on('end', () => {
            spawnEvent.emit('close', 1);
          });
          stdout.push(s1Xml);
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
          spawnEvent.kill = suite2Kill;
          spawnEvent.stdout = stdout;
          stdout.on('end', () => {
            spawnEvent.emit('close', 1);
          });
          stdout.push(s2Xml);
          stdout.push(null);

          spawnStub
              .withArgs(
                  tests.s2.execPath,
                  ['--reporter', 'xml', '--durations', 'yes'],
                  tests.s2.execOptions)
              .returns(spawnEvent);
        }
        const run = adapter.run([tests.root.id]);
        run.then(() => {
          adapter.cancel();
          assert.equal(suite1Kill.callCount, 0);
          assert.equal(suite2Kill.callCount, 0);
        });
      });
      // it('cancel: after run finished'
    });
    // describe('fill with example1'
  });
  // describe('adapter:'

  describe('executables:', function() {
    const cwd = path.join(process.cwd(), 'out', 'test');

    const updateAndVerify = (value: any, expected: any[]) => {
      return config.update('executables', value)
          .then(() => {
            const adapter = createAdapterAndSubscribe();

            const verifyIsCatch2TestExecutable =
                sinonSandbox.stub(adapter, 'verifyIsCatch2TestExecutable');
            verifyIsCatch2TestExecutable.returns(Promise.resolve(true));

            const loadSuiteMock = sinon.expectation.create('loadSuiteMock');
            loadSuiteMock.returns(Promise.resolve()).exactly(expected.length);
            sinonSandbox.replace(adapter, 'loadSuite', loadSuiteMock);

            return adapter.load().then(() => {
              return loadSuiteMock;
            });
          })
          .then((loadSuiteMock) => {
            assert.equal(testsEvents.length, 2);
            loadSuiteMock.verify();
            const calls = loadSuiteMock.getCalls();
            const args = calls.map((call: any) => {
              const arg = call.args[0];
              const filteredKeys =
                  Object.keys(arg.env).filter(k => k.startsWith('C2TEST'));
              const newEnv: {[prop: string]: string} = {};
              filteredKeys.forEach((k: string) => {
                newEnv[k] = args.env[k];
              })
              arg.env = newEnv;
              return arg;
            });
            assert.deepEqual(args, expected);
          });
    };

    it('"exe1.exe"', () => {
      return updateAndVerify('exe1.exe', [{
                               name: 'exe1.exe',
                               path: path.join(cwd, 'exe1.exe'),
                               regex: '',
                               cwd: cwd,
                               env: []
                             }]);
    });

    it('["exe1.exe", "exe2.exe"]', () => {
      return updateAndVerify(['exe1.exe', 'exe2.exe'], [
        {
          name: 'exe1.exe',
          path: path.join(cwd, 'exe1.exe'),
          regex: '',
          cwd: cwd,
          env: []
        },
        {
          name: 'exe2.exe',
          path: path.join(cwd, 'exe2.exe'),
          regex: '',
          cwd: cwd,
          env: []
        }
      ]);
    });

    it('{path: "path1"}', () => {
      return updateAndVerify({path: 'path1'}, [{
                               name: '${dirname} : ${name}',
                               path: path.join(cwd, 'path1'),
                               regex: '',
                               cwd: cwd,
                               env: []
                             }]);
    });
  });
  // describe('executables:'

  describe('load:', function() {
    const cwd = path.join(process.cwd(), 'out', 'test');

    const suite1TestList = `Matching test cases:
  s1t1
    ../vscode-catch2-test-adapter/src/test/suite1.cpp:7
    tag1
  s1t2
    ../vscode-catch2-test-adapter/src/test/suite1.cpp:13
    tag1
2 matching test cases
  
  `;

    const suite2TestList = `Matching test cases:
  s2t1
    ../vscode-catch2-test-adapter/src/test/suite2.cpp:7
    tag1
  s2t2
    ../vscode-catch2-test-adapter/src/test/suite2.cpp:13
    tag1
      [.]
  s2t3
    ../vscode-catch2-test-adapter/src/test/suite2.cpp:19
    tag1
3 matching test cases
  `;

    const updateAndLoad = (value: any) => {
      return config.update('executables', value)
          .then(() => {
            const adapter = createAdapterAndSubscribe();

            const watchEvents: Map<string, EventEmitter> = new Map();
            fsWatchStub.reset();
            fsWatchStub.callsFake((path: string) => {
              const ee = new EventEmitter();
              watchEvents.set(path, ee);
              return ee;
            });

            const verifyIsCatch2TestExecutable =
                sinonSandbox.stub(adapter, 'verifyIsCatch2TestExecutable');
            verifyIsCatch2TestExecutable.returns(Promise.resolve(true));

            return adapter.load().then(() => {
              return watchEvents;
            });
          })
          .then((watchEvents) => {
            assert.equal(testsEvents.length, 2);
            assert.equal(testsEvents[1].type, 'finished');
            assert.notEqual(
                (<TestLoadFinishedEvent>testsEvents[1]).suite, undefined);
            const root = (<TestLoadFinishedEvent>testsEvents[1]).suite!;
            return {root: root, watchEvents: watchEvents};
          });
    };

    function fakeExecFileFunc(pathAndContent: Map<string, string|undefined>) {
      return function(
          path: string, args: string[],
          cb: (err: any, stout: string, stderr: string) => void) {
        const res = pathAndContent.get(path);
        if (res === undefined) {
          cb(new Error('fake file not exists.'), '', '');
        } else if (args.length == 1 && args[0] === '--help') {
          cb(null, 'Catch v2.', '');
        } else if (!deepEqual(args, [
                     '[.],*', '--verbosity', 'high', '--list-tests',
                     '--use-colour', 'no'
                   ])) {
          assert.ok(false, inspect([path, args]));
        } else {
          cb(null, res!, '');
        };
      };
    };

    function fakeExistsFunc(pathAndContent: Map<string, string|undefined>) {
      return function(path: string, cb: (err: any, exists: boolean) => void) {
        cb(undefined, pathAndContent.has(path));
      };
    };

    const fakeFs = (pathAndContent: Iterable<[string, string]>) => {
      const map = new Map(pathAndContent);
      execFileStub.reset();
      execFileStub.callsFake(fakeExecFileFunc(map));
      fsExistsStub.reset();
      fsExistsStub.callsFake(fakeExistsFunc(map));
    };

    it('"path1"', () => {
      this.timeout(99999);
      fakeFs([[path.join(cwd, 'path1'), suite1TestList]]);

      return updateAndLoad('path1').then((param) => {
        assert.equal(param.root.children.length, 1);
      });
    });
  });
});
// describe('C2TestAdapter'

// fswatcher test aztan atiras vscode workspace watcherre
// bonyolultabb teszteset parsoleasa de az mehet kulon fileba c2testinfo
// mock getExecutables regex meg sima minden test
// ExecutableConfig
// execOptions
// writing xml