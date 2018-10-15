const sinon = require('sinon');
const child_process = require('child_process');

// import * as path from 'path';
import * as fs from 'fs-extra';
import * as assert from 'assert';
import {EventEmitter} from 'events';
import * as vscode from 'vscode';
import {TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';
import {Log} from 'vscode-test-adapter-util';

import {C2AllTestSuiteInfo} from '../C2AllTestSuiteInfo';
import * as myExtension from '../C2TestAdapter';
import {C2TestSuiteInfo} from '../C2TestSuiteInfo';

const disposable: vscode.Disposable[] = [];

const workspaceFolderPath = 'out/vscode-catch2-test/';
fs.removeSync(workspaceFolderPath);
fs.ensureDirSync(workspaceFolderPath);

// const setupSettings = function(json: any) {
//   const p = path.join(workspaceFolderPath, '.vscode', 'settings.json');
//   fs.removeSync(p);
//   fs.ensureFileSync(p);
//   fs.writeJSON(p, json);
// };

const workspaceFolderUri = vscode.Uri.file(workspaceFolderPath);
vscode.workspace.updateWorkspaceFolders(
    0, 0, {uri: workspaceFolderUri, name: undefined});
const workspaceFolder =
    vscode.workspace.getWorkspaceFolder(workspaceFolderUri)!;
const logger =
    new Log('Catch2TestAdapter', workspaceFolder, 'Catch2TestAdapter');
const adapter = new myExtension.C2TestAdapter(workspaceFolder, logger);

const testsEvents: (TestLoadStartedEvent|TestLoadFinishedEvent)[] = [];
disposable.push(
    adapter.tests((e: TestLoadStartedEvent|TestLoadFinishedEvent) => {
      testsEvents.push(e);
    }));

const testStatesEvents: (TestRunStartedEvent|TestRunFinishedEvent|
                         TestSuiteEvent|TestEvent)[] = [];
disposable.push(adapter.testStates(
    (e: TestRunStartedEvent|TestRunFinishedEvent|TestSuiteEvent|TestEvent) => {
      testStatesEvents.push(e);
    }));

const setupTemlateTestTree = function() {
  return adapter.load()
      .then(() => {
        const suite = (<TestLoadFinishedEvent>testsEvents[1]).suite;
        assert.notEqual(undefined, suite);
        return suite!;
      })
      .then((suite: TestSuiteInfo) => {
        const allTests = <C2AllTestSuiteInfo>suite;
        const suite1 = allTests.createChildSuite('suite1', 'execPath', {});
        const s1t1 = suite1.createChildTest('test1', 'd', ['t1'], 'file', 1);
        const s1t2 = suite1.createChildTest('test2', 'd', ['t1'], 'file', 1);
        const suite2 = allTests.createChildSuite('suite2', 'execPath', {});
        const s2t1 = suite2.createChildTest('test1', 'd', ['t1'], 'file', 1);
        const s2t2 = suite2.createChildTest('test2', 'd', ['t1'], 'file', 1);

        return {
          allTests: allTests, suite1: suite1, s1t1: s1t1, s1t2: s1t2,
              suite2: suite2, s2t1: s2t1, s2t2: s2t2
        }
      });
};

///

describe('C2TestAdapter', function() {
  beforeEach(function() {
    while (testsEvents.length > 0) testsEvents.pop();
    while (testStatesEvents.length > 0) testStatesEvents.pop();
  });

  after(() => {
    while (disposable.length > 0) disposable.pop()!.dispose();
  })

  it('empty config load', function() {
    return adapter.load().then(() => {
      assert.equal(2, testsEvents.length);
      assert.equal('started', testsEvents[0].type);
      assert.equal('finished', testsEvents[1].type);
      const suite = (<TestLoadFinishedEvent>testsEvents[1]).suite;
      assert.notEqual(undefined, suite);
      assert.equal(0, suite!.children.length);
    });
  });

  it('run1', function() {
    this.timeout(10000);
    return setupTemlateTestTree().then((s) => {
      const spawnEvent: any = new EventEmitter();
      spawnEvent.stdout = new EventEmitter();

      const stub = sinon.stub(child_process, 'spawn');
      stub.throws();
      stub.withArgs(
              s.suite1.execPath,
              [s.s1t1.testNameFull, '--reporter', 'xml', '--durations', 'yes'],
              s.suite1.execOptions)
          .returns(spawnEvent);

      const d = adapter.testStates(
          (e: TestRunStartedEvent|TestRunFinishedEvent|TestSuiteEvent|
           TestEvent) => {
            if (e.type == 'suite' && e.state == 'running' &&
                (<TestSuiteInfo>e.suite) === s.suite1) {
              spawnEvent.stdout.emit(
                  'data',
                  `
							<?xml version="1.0" encoding="UTF-8"?>
							<Catch name="test6">
								<Randomness seed="2"/>
								<Group name="test6">
									<TestCase name="` +
                      s.s1t1.testNameFull + `" filename="test.cpp" line="211">
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
              spawnEvent.emit('close', 1);
            }
          });

      return adapter.run([s.s1t1.id]).then(() => {
        assert.equal(6, testStatesEvents.length);
        assert.equal('started', testStatesEvents[0].type);

        assert.equal('suite', testStatesEvents[1].type);
        assert.equal('running', (<TestSuiteEvent>testStatesEvents[1]).state);
        assert.equal(s.suite1, (<TestSuiteEvent>testStatesEvents[1]).suite);

        assert.equal('test', testStatesEvents[2].type);
        assert.equal('running', (<TestEvent>testStatesEvents[2]).state);
        assert.equal(s.s1t1, (<TestEvent>testStatesEvents[2]).test);

        {
          assert.equal('test', testStatesEvents[3].type);
          const res = (<TestEvent>testStatesEvents[3]);
          assert.equal('failed', res.state);
          assert.equal(s.s1t1, res.test);
          assert.ok(undefined != res.decorations);
          assert.equal(1, res.decorations!.length);
          assert.equal(213, res.decorations![0].line);
          assert.equal('Expanded: 1 == 0', res.decorations![0].message);
        }

        assert.equal('suite', testStatesEvents[4].type);
        assert.equal('completed', (<TestSuiteEvent>testStatesEvents[4]).state);
        assert.equal(s.suite1, (<TestSuiteEvent>testStatesEvents[4]).suite);

        assert.equal('finished', testStatesEvents[5].type);

        d.dispose();
      });
    });
  });
});
