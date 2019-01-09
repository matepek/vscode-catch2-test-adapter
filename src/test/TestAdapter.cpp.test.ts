//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fse from 'fs-extra';
import * as path from 'path';
import { inspect, promisify } from 'util';
import * as vscode from 'vscode';
import { TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo } from 'vscode-test-adapter-api';

import { TestAdapter } from '../TestAdapter';
import * as c2fs from '../FsWrapper';

assert.notStrictEqual(vscode.workspace.workspaceFolders, undefined);
assert.equal(vscode.workspace.workspaceFolders!.length, 1);

const workspaceFolderUri = vscode.workspace.workspaceFolders![0].uri;

const workspaceFolder =
  vscode.workspace.getWorkspaceFolder(workspaceFolderUri)!;

const cppUri = vscode.Uri.file(path.join(workspaceFolderUri.fsPath, 'cpp'));

function inCpp(relPath: string) {
  return vscode.Uri.file(path.join(cppUri.fsPath, relPath));
}

const isWin = process.platform === 'win32';

///

describe('TestAdapter.cpp', function () {
  async function compile(source: vscode.Uri, output: vscode.Uri) {
    if (isWin) {
      let vcvarsall: vscode.Uri | undefined;
      if (process.env['C2AVCVA']) {
        vcvarsall = vscode.Uri.file(process.env['C2AVCVA']!);
      } else if (
        process.env['APPVEYOR_BUILD_WORKER_IMAGE'] == 'Visual Studio 2017')
        vcvarsall = vscode.Uri.file(
          'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Community\\VC\\Auxiliary\\Build\\vcvarsall.bat');

      assert.notStrictEqual(vcvarsall, undefined, inspect(process.env));
      const command = '"' + vcvarsall!.fsPath + '" x86 && ' + [
        'cl.exe',
        '/EHsc',
        '/I"' + path.dirname(source.fsPath) + '"',
        '/Fe"' + output.fsPath + '"',
        '"' + source.fsPath + '"',
      ].join(' ');
      await promisify(cp.exec)(command);
    } else {
      await promisify(cp.exec)('"' + [
        'c++',
        '-x',
        'c++',
        '-std=c++11',
        '-o',
        output.fsPath,
        source.fsPath,
      ].join('" "') + '"');
      await promisify(cp.exec)('"' + [
        'chmod',
        '+x',
        output.fsPath,
      ].join('" "') + '"');
    }
    await promisify(setTimeout)(500);
    assert.ok(await c2fs.existsAsync(output.fsPath));
  }

  before(async function () {
    this.timeout(82000);

    if (!await c2fs.existsAsync(inCpp('../suite1.exe').fsPath))
      await compile(
        inCpp('../../../src/test/cpp/suite1.cpp'), inCpp('../suite1.exe'));

    if (!await c2fs.existsAsync(inCpp('../suite2.exe').fsPath))
      await compile(
        inCpp('../../../src/test/cpp/suite2.cpp'), inCpp('../suite2.exe'));

    if (!await c2fs.existsAsync(inCpp('../suite3.exe').fsPath))
      await compile(
        inCpp('../../../src/test/cpp/suite3.cpp'), inCpp('../suite3.exe'));
  })

  beforeEach(async function () {
    await fse.remove(cppUri.fsPath);
    await fse.mkdirp(cppUri.fsPath);
  })

  afterEach(async function () {
    disposeAdapterAndSubscribers();
    await updateConfig('defaultWatchTimeoutSec', undefined);
    await updateConfig('executables', undefined);
  })

  after(async function () {
    await fse.remove(cppUri.fsPath);
  })

  async function waitFor(
    context: Mocha.Context, condition: Function,
    timeout?: number): Promise<void> {
    if (timeout === undefined) timeout = context.timeout();
    const start = Date.now();
    let c: boolean;
    while (!(c = await condition()) &&
      (Date.now() - start < timeout || !context.enableTimeouts()))
      await promisify(setTimeout)(10);
    assert.ok(c, condition.toString());
  }

  function copy(from: string, to: string) {
    return fse.copy(
      vscode.Uri.file(path.join(cppUri.fsPath, from)).fsPath,
      vscode.Uri.file(path.join(cppUri.fsPath, to)).fsPath);
  }

  let adapter: TestAdapter | undefined;
  let testsEventsConnection: vscode.Disposable | undefined;
  let testStatesEventsConnection: vscode.Disposable | undefined;
  let testsEvents: (TestLoadStartedEvent | TestLoadFinishedEvent)[] = [];
  let testStatesEvents: (TestRunStartedEvent | TestRunFinishedEvent |
    TestSuiteEvent | TestEvent)[] = [];

  function createAdapterAndSubscribe() {
    adapter = new TestAdapter(workspaceFolder);

    testsEvents = [];
    testsEventsConnection =
      adapter.tests((e: TestLoadStartedEvent | TestLoadFinishedEvent) => {
        if (testsEvents.length % 2 == 1 && e.type == 'started') {
          const i = 0;
          i;
        }
        testsEvents.push(e);
      });

    testStatesEvents = [];
    testStatesEventsConnection = adapter.testStates(
      (e: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent |
        TestEvent) => {
        testStatesEvents.push(e);
      });

    return adapter!;
  }

  async function load(adapter: TestAdapter): Promise<TestSuiteInfo> {
    const eventCount = testsEvents.length;
    await adapter.load();
    if (testsEvents.length != eventCount + 2) debugger;
    assert.strictEqual(
      testsEvents.length, eventCount + 2, inspect(testsEvents));
    const finished = testsEvents.pop()!;
    assert.strictEqual(finished.type, 'finished');
    assert.strictEqual(testsEvents.pop()!.type, 'started');
    assert.notStrictEqual((<TestLoadFinishedEvent>finished).suite, undefined);
    return <TestSuiteInfo>(<TestLoadFinishedEvent>finished).suite!;
  }

  function disposeAdapterAndSubscribers(check: boolean = true) {
    adapter && adapter.dispose();
    testsEventsConnection && testsEventsConnection.dispose();
    testStatesEventsConnection && testStatesEventsConnection.dispose();
    testStatesEvents = [];
    if (check) {
      for (let i = 0; i < testsEvents.length; i++) {
        assert.deepStrictEqual(
          { type: 'started' }, testsEvents[i],
          inspect({ index: i, testsEvents: testsEvents }));
        i++;
        assert.ok(
          i < testsEvents.length,
          inspect({ index: i, testsEvents: testsEvents }));
        assert.equal(
          testsEvents[i].type, 'finished',
          inspect({ index: i, testsEvents: testsEvents }));
        assert.ok(
          (<TestLoadFinishedEvent>testsEvents[i]).suite,
          inspect({ index: i, testsEvents: testsEvents }));
      }
    }
    testsEvents = [];
  }

  function getConfig() {
    return vscode.workspace.getConfiguration(
      'catch2TestExplorer', workspaceFolderUri);
  }

  async function updateConfig(key: string, value: any) {
    let count = testsEvents.length;
    await getConfig().update(key, value);
    // cleanup
    while (testsEvents.length < count--) testsEvents.pop();
  }

  context('example1', function () {
    it('should be found and run withouth error', async function () {
      if (process.env['TRAVIS'] == 'true') this.skip();
      this.timeout(8000);
      this.slow(2000);
      await updateConfig(
        'executables', [{
          'name': '${baseFilename}',
          'pattern': 'cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*',
          'cwd': '${workspaceFolder}/cpp',
        }]);

      await copy('../suite1.exe', 'out/suite1.exe');
      await copy('../suite2.exe', 'out/suite2.exe');
      await copy('../suite3.exe', 'out/suite3.exe');

      adapter = createAdapterAndSubscribe();
      const root = await load(adapter);
      assert.strictEqual(root.children.length, 3);

      const eventCount = testStatesEvents.length;
      await adapter.run([root.id]);
      assert.strictEqual(
        testStatesEvents.length, eventCount + 86, inspect(testStatesEvents));
    })

    it('should be notified by watcher', async function () {
      if (process.env['TRAVIS'] == 'true') this.skip();
      this.timeout(8000);
      this.slow(4000);
      await updateConfig(
        'executables', [{
          'name': '${baseFilename}',
          'pattern': 'cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*',
          'cwd': '${workspaceFolder}/cpp',
        }]);

      adapter = createAdapterAndSubscribe();
      let autorunCounter = 0;
      adapter.autorun(() => {
        ++autorunCounter;
      });
      const root = await load(adapter);
      assert.strictEqual(root.children.length, 0);
      assert.strictEqual(autorunCounter, 0);

      await copy('../suite1.exe', 'out/suite1.exe');

      await waitFor(this, () => {
        return root.children.length > 0;
      });
      assert.strictEqual(root.children.length, 1);

      await waitFor(this, () => {
        return autorunCounter == 0;
      });

      await copy('../suite2.exe', 'out/sub/suite2X.exe');

      await waitFor(this, () => {
        return root.children.length == 2;
      });
      await waitFor(this, () => {
        return autorunCounter == 0;
      });

      await copy('../suite2.exe', 'out/sub/suite2.exe');

      await waitFor(this, () => {
        return root.children.length == 3;
      });
      await waitFor(this, () => {
        return autorunCounter == 0;
      });

      await updateConfig('defaultWatchTimeoutSec', 1);

      await fse.unlink(inCpp('out/sub/suite2X.exe').fsPath);

      await waitFor(this, () => {
        return root.children.length == 2;
      }, 3100);
      assert.strictEqual(autorunCounter, 0);

      const eventCount = testStatesEvents.length;
      await adapter.run([root.id]);
      assert.strictEqual(testStatesEvents.length, eventCount + 16);
      assert.strictEqual(autorunCounter, 0);
    })

    it.skip('should be debugged', async function () {
      if (process.env['TRAVIS'] == 'true') this.skip();
      this.timeout(8000);
      this.slow(2000);
      await updateConfig(
        'executables', [{
          'name': '${baseFilename}',
          'pattern': 'cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*',
          'cwd': '${workspaceFolder}/cpp',
        }]);

      await copy('../suite1.exe', 'out/suite1.exe');

      adapter = createAdapterAndSubscribe();
      const root = await load(adapter);
      assert.strictEqual(root.children.length, 1);
      const suite = <TestSuiteInfo>root.children[0];
      assert.ok(suite.children.length > 0);

      await adapter.debug([suite.children[0].id]);
    })
  })
})