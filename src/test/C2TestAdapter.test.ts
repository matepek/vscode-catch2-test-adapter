const sinon = require('sinon');
const child_process = require('child_process');
const deepEqual = require('deep-equal');

import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as assert from 'assert';
import {EventEmitter} from 'events';
import * as vscode from 'vscode';
import {TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo, TestInfo, TestAdapter} from 'vscode-test-adapter-api';
import {Log} from 'vscode-test-adapter-util';

import {C2AllTestSuiteInfo} from '../C2AllTestSuiteInfo';
import {C2TestAdapter} from '../C2TestAdapter';
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

const example1 = new class {
  readonly suite1 = new class {
    readonly execPath = path.join(workspaceFolderUri.path, 'execPath1');
    readonly testList = 'Matching test cases:\n' +
        '  s1t1\n' +
        '    suite1.cpp:7\n' +
        '    tag1\n' +
        '  s1t2\n' +
        '    suite1.cpp:13\n' +
        '    tag1\n' +
        '2 matching test cases\n' +
        '\n';

    readonly t1 = new class {
      readonly fullTestName = 's1t1';
      assert(test: TestInfo, uniqeIdContainer?: Set<string>) {
        assert.equal(test.type, 'test');
        assert.equal(test.label, 's1t1');
        assert.equal(
            test.file, path.join(workspaceFolderUri.path, 'suite1.cpp'));
        assert.equal(test.line, 7 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      };

      readonly xml = `
        <TestCase name="s1t1" description="tag1" filename="suite1.cpp" line="7">
          <OverallResult success="true" durationInSeconds="0.000174"/>
        </TestCase>`;
    };

    readonly t2 = new class {
      readonly fullTestName = 's1t2';
      assert(test: TestInfo, uniqeIdContainer?: Set<string>) {
        assert.equal(test.type, 'test');
        assert.equal(test.label, 's1t2');
        assert.equal(
            test.file, path.join(workspaceFolderUri.path, 'suite1.cpp'));
        assert.equal(test.line, 13 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      };

      readonly xml = `
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
        </TestCase>`;
    };

    assert(suite: TestSuiteInfo, uniqeIdContainer?: Set<string>) {
      assert.equal(suite.type, 'suite');
      assert.equal(suite.label, 'execPath1');
      assert.equal(
          suite.file, path.join(workspaceFolderUri.path, 'suite1.cpp'));
      assert.equal(suite.line, 0);
      assert.equal(suite.children.length, 2);
      this.t1.assert(<TestInfo>suite.children[0], uniqeIdContainer);
      this.t2.assert(<TestInfo>suite.children[1], uniqeIdContainer);
      if (uniqeIdContainer != undefined) {
        assert.ok(!uniqeIdContainer.has(suite.id));
        uniqeIdContainer.add(suite.id);
      }
    }

    readonly xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
      <Catch name="suite1">
        <Randomness seed="2"/>
        <Group name="suite1">`;

    readonly xmlFull = this.xmlHeader + this.t1.xml + this.t2.xml + `
          <OverallResults successes="1" failures="1" expectedFailures="0"/>
        </Group>
        <OverallResults successes="1" failures="1" expectedFailures="0"/>
      </Catch>`;
  };

  readonly suite2 = new class {
    readonly execPath = path.join(workspaceFolderUri.path, 'execPath2');
    readonly testList = 'Matching test cases:\n' +
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
        '3 matching test cases\n' +
        '\n';

    readonly t1 = new class {
      readonly fullTestName = 's2t1';
      assert(test: TestInfo, uniqeIdContainer?: Set<string>) {
        assert.equal(test.type, 'test');
        assert.equal(test.label, 's2t1');
        assert.equal(
            test.file, path.join(workspaceFolderUri.path, 'suite2.cpp'));
        assert.equal(test.line, 7 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      };

      readonly xml = `
        <TestCase name="s2t1" description="tag1" filename="suite2.cpp" line="7">
          <OverallResult success="true" durationInSeconds="0.000165"/>
        </TestCase>`;
    };

    readonly t2 = new class {
      readonly fullTestName = 's2t2';
      assert(test: TestInfo, uniqeIdContainer?: Set<string>) {
        assert.equal(test.type, 'test');
        assert.equal(test.label, 's2t2 [.]');
        assert.equal(
            test.file, path.join(workspaceFolderUri.path, 'suite2.cpp'));
        assert.equal(test.line, 13 - 1);
        assert.ok(test.skipped === true);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      };

      readonly xml = `
        <TestCase name="s2t2" description="tag1 " tags="[.]" filename="../vscode-catch2-test-adapter/src/test/suite2.cpp" line="13">
          <OverallResult success="true"/>
        </TestCase>`;
    };

    readonly t3 = new class {
      readonly fullTestName = 's2t3';
      assert(test: TestInfo, uniqeIdContainer?: Set<string>) {
        assert.equal(test.type, 'test');
        assert.equal(test.label, 's2t3');
        assert.equal(
            test.file, path.join(workspaceFolderUri.path, 'suite2.cpp'));
        assert.equal(test.line, 19 - 1);
        assert.ok(test.skipped == undefined || test.skipped === false);
        if (uniqeIdContainer != undefined) {
          assert.ok(!uniqeIdContainer.has(test.id));
          uniqeIdContainer.add(test.id);
        }
      };

      readonly xml = `
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
    };

    assert(suite: TestSuiteInfo, uniqeIdContainer?: Set<string>) {
      assert.equal(suite.type, 'suite');
      assert.equal(suite.label, 'execPath2');
      assert.equal(
          suite.file, path.join(workspaceFolderUri.path, 'suite2.cpp'));
      assert.equal(suite.line, 0);
      assert.equal(suite.children.length, 3);
      this.t1.assert(<TestInfo>suite.children[0], uniqeIdContainer);
      this.t2.assert(<TestInfo>suite.children[1], uniqeIdContainer);
      this.t3.assert(<TestInfo>suite.children[2], uniqeIdContainer);
      if (uniqeIdContainer != undefined) {
        assert.ok(!uniqeIdContainer.has(suite.id));
        uniqeIdContainer.add(suite.id);
      }
    }

    readonly xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
      <Catch name="suite2">
        <Randomness seed="2"/>
        <Group name="suite2">`;

    readonly xmlFull = this.xmlHeader + this.t1.xml +
        /* this.t2.xml is skipped */ this.t3.xml + `
            <OverallResults successes="1" failures="1" expectedFailures="0"/>
          </Group>
          <OverallResults successes="1" failures="1" expectedFailures="0"/>
        </Catch>`;
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
};

class ChildProcessStub extends EventEmitter {
  readonly stdout = new Stream.Readable();

  constructor(data?: string) {
    super();
    this.stdout.on('end', () => {
      this.emit('close', 1);
    });
    if (data != undefined) this.writeAndClose(data);
  }

  writeAndClose(data: string): void {
    this.stdout.push(data);
    this.stdout.push(null);
  }

  writeLineByLineAndClose(data: string): void {
    const lines = data.split('\n');
    lines.forEach((l) => {
      this.stdout.push(l);
    });
    this.stdout.push(null);
  }
};

///

describe('C2TestAdapter', function() {
  const config = vscode.workspace.getConfiguration(
      'catch2TestExplorer', workspaceFolderUri);

  let adapter: C2TestAdapter|undefined;
  let testsEvents: (TestLoadStartedEvent|TestLoadFinishedEvent)[];
  let testsEventsConnection: vscode.Disposable;
  let testStatesEvents: (TestRunStartedEvent|TestRunFinishedEvent|
                         TestSuiteEvent|TestEvent)[];
  let testStatesEventsConnection: vscode.Disposable;

  let spawnStub: any;
  let execFileStub: any;
  let fsWatchStub: any;
  let fsExistsStub: any;

  function resetConfig(): Thenable<void> {
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
  }

  function createAdapterAndSubscribe() {
    adapter = new C2TestAdapter(workspaceFolder, logger);

    testsEvents = [];
    testsEventsConnection =
        adapter.tests((e: TestLoadStartedEvent|TestLoadFinishedEvent) => {
          testsEvents.push(e);
        });

    testStatesEvents = [];
    testStatesEventsConnection = adapter.testStates(
        (e: TestRunStartedEvent|TestRunFinishedEvent|TestSuiteEvent|
         TestEvent) => {
          testStatesEvents.push(e);
        });

    return adapter!;
  }

  function disposeAdapterAndSubscribers() {
    testsEventsConnection.dispose();
    testStatesEventsConnection.dispose();
    testsEvents = [];
    testStatesEvents = [];
  }

  before(() => {
    fse.removeSync(dotVscodePath);
    adapter = undefined;

    spawnStub = sinonSandbox.stub(child_process, 'spawn');
    execFileStub = sinonSandbox.stub(child_process, 'execFile');
    fsWatchStub = sinonSandbox.stub(fs, 'watch');
    fsExistsStub = sinonSandbox.stub(fs, 'exists');

    // reset config can cause problem with fse.removeSync(dotVscodePath);
    return resetConfig();
  });

  function resetStubs() {
    spawnStub.reset();
    spawnStub.throws();
    execFileStub.reset();
    execFileStub.throws();
    fsWatchStub.reset();
    fsWatchStub.throws();
    fsExistsStub.reset();
    fsExistsStub.throws();
  }

  after(() => {
    disposeAdapterAndSubscribers();
    sinonSandbox.restore();
  });

  describe('detect config change', function() {
    this.slow(150);

    const waitForReloadAndAssert = (): Promise<void> => {
      const waitForReloadAndAssertInner = (tryCount: number): Promise<void> => {
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
      return waitForReloadAndAssertInner(20);
    };

    afterEach(() => {
      disposeAdapterAndSubscribers();
      return resetConfig();
    });

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
    let adapter: C2TestAdapter;

    beforeEach(() => {
      adapter = createAdapterAndSubscribe();
    });

    afterEach(() => {
      disposeAdapterAndSubscribers();
      resetStubs();
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

    describe('example1', function() {
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
            example1.suite1.xmlHeader + example1.suite1.t1.xml +
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
            example1.suite1.xmlHeader +
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
        stdout.push(example1.suite1.xmlHeader + example1.suite2.t2.xml + `
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
            example1.suite1.xmlHeader + example1.suite2.t3.xml +
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

        example1.suite1.xmlHeader.split('\n').forEach(
            (l: string) => {stdout.push(l)});
        example1.suite2.t3.xml.split('\n').forEach(
            (l: string) => {stdout.push(l)});
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
        stdout.push(example1.suite1.xmlFull);
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
          stdout.push(example1.suite1.xmlFull);
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
          stdout.push(example1.suite2.xmlFull);
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
        const testCaseBegin = example1.suite1.t1.xml.split('\n')[1];
        assert.ok(testCaseBegin.indexOf('<TestCase ') != -1);
        stdout.push(example1.suite1.xmlHeader + testCaseBegin);
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
          stdout.push(example1.suite1.xmlFull);
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
          stdout.push(example1.suite2.xmlFull);
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
          stdout.push(example1.suite1.xmlFull);
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
          stdout.push(example1.suite2.xmlFull);
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
    // describe('example1'
  });
  // describe('adapter:'

  describe('executables:', function() {
    this.slow(150);
    const cwd = path.join(process.cwd(), 'out', 'test');

    afterEach(() => {
      disposeAdapterAndSubscribers();
      resetStubs();
      return resetConfig();
    });

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

  context('example1', function() {
    function fakeExecFileFunc(pathAndContent: Map<string, string>) {
      return function(
          path: string, args: string[],
          cb: (err: any, stout: string, stderr: string) => void) {
        const res = pathAndContent.get(path);
        if (res === undefined) {
          cb(new Error('fake file not exists.'), '', '');
        } else if (args.length == 1 && args[0] === '--help') {
          cb(null, 'Catch v2.', '');
        } else if (deepEqual(args, [
                     '[.],*', '--verbosity', 'high', '--list-tests',
                     '--use-colour', 'no'
                   ])) {
          cb(null, res!, '');
        } else {
          assert.ok(false, inspect([path, args]));
        };
      };
    };

    function fakeExistsFunc(pathAndContent: Map<string, string>) {
      return function(path: string, cb: (err: any, exists: boolean) => void) {
        cb(undefined, pathAndContent.has(path));
      };
    };

    function fakeSpawn() {
      const testTestParams = ['--reporter', 'xml', '--durations', 'yes'];

      spawnStub
          .withArgs(
              example1.suite1.execPath,
              [example1.suite1.t1.fullTestName, ...testTestParams])
          .callsFake(() => {
            return new ChildProcessStub(
                example1.suite1.xmlHeader + example1.suite1.t1.xml +
                '</Group></Catch>');
          });
      spawnStub
          .withArgs(
              example1.suite1.execPath,
              [example1.suite1.t2.fullTestName, ...testTestParams])
          .callsFake(() => {
            return new ChildProcessStub(
                example1.suite1.xmlHeader + example1.suite1.t2.xml +
                '</Group></Catch>');
          });
      spawnStub.withArgs(example1.suite1.execPath, testTestParams)
          .callsFake(() => {
            return new ChildProcessStub(example1.suite1.xmlFull);
          });

      spawnStub
          .withArgs(
              example1.suite2.execPath,
              [example1.suite2.t1.fullTestName, ...testTestParams])
          .callsFake(() => {
            return new ChildProcessStub(
                example1.suite2.xmlHeader + example1.suite2.t1.xml +
                '</Group></Catch>');
          });
      spawnStub
          .withArgs(
              example1.suite2.execPath,
              [example1.suite2.t2.fullTestName, ...testTestParams])
          .callsFake(() => {
            return new ChildProcessStub(
                example1.suite2.xmlHeader + example1.suite2.t2.xml +
                '</Group></Catch>');
          });
      spawnStub
          .withArgs(
              example1.suite2.execPath,
              [example1.suite2.t3.fullTestName, ...testTestParams])
          .callsFake(() => {
            return new ChildProcessStub(
                example1.suite2.xmlHeader + example1.suite2.t3.xml +
                '</Group></Catch>');
          });
      spawnStub.withArgs(example1.suite2.execPath, testTestParams)
          .callsFake(() => {
            return new ChildProcessStub(example1.suite2.xmlFull);
          });
    }

    function fakeFs(pathAndContent: Iterable<[string, string]>) {
      const map = new Map(pathAndContent);
      execFileStub.reset();
      execFileStub.callsFake(fakeExecFileFunc(map));

      fsExistsStub.reset();
      fsExistsStub.callsFake(fakeExistsFunc(map));

      fsWatchStub.reset();
      fsWatchStub.callsFake((path: string) => {
        if (map.has(path)) {
          const ee = new class extends EventEmitter {
            close() {}
          };
          watchEvents.set(path, ee);
          return ee;
        } else {
          throw Error('File not found?');
        }
      });

      fakeSpawn();
    };

    const uniqueIdC = new Set<string>();
    const watchEvents: Map<string, EventEmitter> = new Map();

    before(() => {
      fakeFs([
        [example1.suite1.execPath, example1.suite1.testList],
        [example1.suite2.execPath, example1.suite2.testList]
      ]);
    });

    beforeEach(() => {
      watchEvents.clear();
      uniqueIdC.clear();
    })

    after(() => {
      resetStubs();
    });

    context.only('load with config: executables="execPath1"', function() {
      let adapter: TestAdapter;
      let root: TestSuiteInfo;

      before(() => {
        return config.update('executables', 'execPath1');
      });

      beforeEach(async function() {
        adapter = createAdapterAndSubscribe();
        await adapter.load();

        assert.equal(testsEvents.length, 2, inspect(testsEvents));
        assert.equal(testsEvents[1].type, 'finished');
        assert.ok((<TestLoadFinishedEvent>testsEvents[1]).suite);
        root = (<TestLoadFinishedEvent>testsEvents[1]).suite!;

        example1.assertWithoutChildren(root, uniqueIdC);
        assert.equal(root.children.length, 1);
        example1.suite1.assert(<TestSuiteInfo>root.children[0], uniqueIdC);
      });

      afterEach(() => {
        disposeAdapterAndSubscribers();
      });

      after(() => {
        return resetConfig();
      });

      it('should run with not existing test id', async function() {
        await adapter.run(['not existing id']);

        assert.deepEqual(testStatesEvents, [
          {type: 'started', tests: ['not existing id']},
          {type: 'finished'},
        ]);
      });

      it('should run s1t1 with success', async function() {
        const suite1 = <TestSuiteInfo>root.children[0];
        const s1t1 = <TestInfo>suite1.children[0];

        await adapter.run([s1t1.id]);
        const expected = [
          {type: 'started', tests: [s1t1.id]},
          {type: 'suite', state: 'running', suite: suite1},
          {type: 'test', state: 'running', test: s1t1},
          {
            type: 'test',
            state: 'passed',
            test: s1t1,
            decorations: undefined,
            message: 'Randomness seeded to: 2\nDuration: 0.000174 second(s)\n'
          },
          {type: 'suite', state: 'completed', suite: suite1},
          {type: 'finished'},
        ];
        assert.deepEqual(testStatesEvents, expected);

        await adapter.run([s1t1.id]);
        assert.deepEqual(testStatesEvents, [...expected, ...expected]);
      });

      it('should run suite1', async function() {
        const suite1 = <TestSuiteInfo>root.children[0];
        const s1t1 = <TestInfo>suite1.children[0];
        const s1t2 = <TestInfo>suite1.children[1];

        await adapter.run([suite1.id]);
        const expected = [
          {type: 'started', tests: [suite1.id]},
          {type: 'suite', state: 'running', suite: suite1},
          {type: 'test', state: 'running', test: s1t1},
          {
            type: 'test',
            state: 'passed',
            test: s1t1,
            decorations: undefined,
            message: 'Randomness seeded to: 2\nDuration: 0.000174 second(s)\n'
          },
          {type: 'test', state: 'running', test: s1t2},
          {
            type: 'test',
            state: 'failed',
            test: s1t2,
            decorations: [{line: 14, message: 'Expanded: false'}],
            message:
                'Randomness seeded to: 2\nDuration: 0.000255 second(s)\n>>> s1t2(line: 13) REQUIRE (line: 15) \n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n'
          },
          {type: 'suite', state: 'completed', suite: suite1},
          {type: 'finished'},
        ];
        assert.deepEqual(testStatesEvents, expected);

        await adapter.run([suite1.id]);
        assert.deepEqual(testStatesEvents, [...expected, ...expected]);
      });
    });
  });  // descibe('example1'
});
// describe('C2TestAdapter'

describe.skip('a', function() {
  this.timeout(99999);

  before(() => {
    debugger;
  });
  beforeEach(() => {
    debugger;
  });

  after(() => {
    debugger;
  });
  afterEach(() => {
    debugger;
  });

  it('a-it', () => {
    debugger;
  });

  describe('b', () => {
    before(() => {
      debugger;
    });
    beforeEach(() => {
      debugger;
    });

    after(() => {
      debugger;
    });
    afterEach(() => {
      debugger;
    });

    it('b-it1', () => {
      debugger;
    });

    it('b-it2', () => {
      debugger;
    });
  });
});
// fswatcher test aztan atiras vscode workspace watcherre
// bonyolultabb teszteset parsoleasa de az mehet kulon fileba c2testinfo
// mock getExecutables regex meg sima minden test
// ExecutableConfig
// execOptions
// writing xml
// re-load soame object
// deepstrictequal