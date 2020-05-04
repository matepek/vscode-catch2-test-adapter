import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import {
  TestAdapter,
  Imitation,
  settings,
  ChildProcessStub,
  FileSystemWatcherStub,
  expectedLoggedErrorLine,
  isWin,
  waitFor,
} from './Common';
import { example1 } from './example1';
import { inspect } from 'util';

///

describe(path.basename(__filename), function () {
  this.timeout(5000);
  this.slow(1000);

  let imitation: Imitation;
  let adapter: TestAdapter;
  let watchers: Map<string, FileSystemWatcherStub>;

  before(async function () {
    imitation = new Imitation();
    await settings.resetConfig();
  });

  beforeEach(function () {
    watchers = example1.initImitation(imitation);
  });

  afterEach(async function () {
    imitation.resetToCallThrough();
    if (adapter) {
      await adapter.waitAndDispose(this);
      adapter = (undefined as unknown) as TestAdapter;
    }
    return settings.resetConfig();
  });

  after(function () {
    imitation.restore();
  });

  context('with default TestAdapter', function () {
    beforeEach(function () {
      adapter = new TestAdapter();
    });

    specify('empty config', async function () {
      await adapter.load();
      assert.equal(adapter.root.children.length, 0);
    });

    specify('../a/first', async function () {
      await settings.updateConfig('test.executables', '../a/first');
      const withArgs = imitation.vsFindFilesStub.withArgs(imitation.createVscodeRelativePatternMatcher('first'));
      await adapter.load();
      assert.ok(!withArgs.called);
    });

    specify('../<workspaceFolder>/second', async function () {
      await settings.updateConfig(
        'test.executables',
        '../' + path.basename(settings.workspaceFolderUri.fsPath) + '/second',
      );
      const withArgs = imitation.vsFindFilesStub.withArgs(imitation.createVscodeRelativePatternMatcher('second'));
      await adapter.load();
      assert.ok(withArgs.called);
    });

    specify('./third', async function () {
      await settings.updateConfig('test.executables', './third');
      const withArgs = imitation.vsFindFilesStub.withArgs(imitation.createVscodeRelativePatternMatcher('third'));
      await adapter.load();
      assert.ok(withArgs.called);
    });

    specify('./a/b/../../fourth', async function () {
      await settings.updateConfig('test.executables', './a/b/../../fourth');
      const withArgs = imitation.vsFindFilesStub.withArgs(imitation.createVscodeRelativePatternMatcher('fourth'));
      await adapter.load();
      assert.ok(withArgs.called);
    });

    specify('cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*', async function () {
      await settings.updateConfig('test.executables', 'cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*');
      const withArgs = imitation.vsFindFilesStub.withArgs(
        imitation.createVscodeRelativePatternMatcher('cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*'),
      );
      await adapter.load();
      assert.ok(withArgs.called);
    });
  });

  specify('resolving relative defaultCwd', async function () {
    this.slow(1000);
    this.timeout(10000);
    await settings.updateConfig('test.executables', example1.suite1.execPath);
    await settings.updateConfig('test.workingDirectory', 'defaultCwdStr');

    adapter = new TestAdapter();

    const spawnWithArgs = imitation.spawnStub
      .withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0], sinon.match.any)
      .returns(new ChildProcessStub(example1.suite1.outputs[1][1]));

    await adapter.load();

    assert.ok(spawnWithArgs.calledOnce, spawnWithArgs.args.toString());
    assert.strictEqual(
      spawnWithArgs.firstCall.args[2].cwd,
      path.join(settings.workspaceFolderUri.fsPath, 'defaultCwdStr'),
    );
  });

  specify('resolving absolute defaultCwd', async function () {
    this.slow(500);
    await settings.updateConfig('test.executables', example1.suite1.execPath);

    if (isWin) await settings.updateConfig('test.workingDirectory', 'C:\\defaultCwdStr');
    else await settings.updateConfig('test.workingDirectory', '/defaultCwdStr');

    adapter = new TestAdapter();

    const spawnWithArgs = imitation.spawnStub
      .withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0], sinon.match.any)
      .returns(new ChildProcessStub(example1.suite1.outputs[1][1]));

    await adapter.load();

    assert.ok(spawnWithArgs.calledOnce, spawnWithArgs.args.toString());
    if (isWin) assert.strictEqual(spawnWithArgs.firstCall.args[2].cwd, 'C:\\defaultCwdStr');
    else assert.strictEqual(spawnWithArgs.firstCall.args[2].cwd, '/defaultCwdStr');
  });

  specify('load executables=<full path of execPath1>', async function () {
    this.slow(500);
    await settings.updateConfig('test.executables', example1.suite1.execPath);
    adapter = new TestAdapter();

    await adapter.load();
    assert.strictEqual(adapter.root.children.length, 1);
  });

  specify('load executables=["execPath1.exe", "./execPath2.exe"] with error', async function () {
    this.slow(500);
    await settings.updateConfig('test.advancedExecutables', ['execPath1.exe', './execPath2.exe']);
    adapter = new TestAdapter();

    const withArgs = imitation.spawnStub.withArgs(
      example1.suite2.execPath,
      example1.suite2.outputs[1][0],
      sinon.match.any,
    );
    withArgs.onCall(withArgs.callCount).throws('dummy error for testing (should be handled)');

    await adapter.load();
    assert.strictEqual(adapter.root.children.length, 1);
  });

  specify('load executables=["execPath1.exe", "execPath2Copy.exe"]; delete; sleep 1; re-create', async function () {
    const watchTimeout = 6;
    await settings.updateConfig('discovery.gracePeriodForMissing', watchTimeout);
    this.timeout(watchTimeout * 1000 + 2500 /* because of 'delay' */);
    this.slow(watchTimeout * 1000 + 2500 /* because of 'delay' */);
    const execPath2CopyPath = path.join(settings.workspaceFolderUri.fsPath, 'execPath2Copy.exe');

    for (const scenario of example1.suite2.outputs) {
      imitation.spawnStub
        .withArgs(execPath2CopyPath, scenario[0], sinon.match.any)
        .callsFake(() => new ChildProcessStub(scenario[1]));
    }

    imitation.fsAccessStub
      .withArgs(execPath2CopyPath, sinon.match.any, sinon.match.any)
      .callsFake(imitation.handleAccessFileExists);

    imitation.vsfsWatchStub
      .withArgs(imitation.createAbsVscodeRelativePatternMatcher(execPath2CopyPath))
      .callsFake(imitation.createCreateFSWatcherHandler(watchers));

    imitation.vsFindFilesStub
      .withArgs(imitation.createAbsVscodeRelativePatternMatcher(execPath2CopyPath))
      .resolves([vscode.Uri.file(execPath2CopyPath)]);

    await settings.updateConfig('test.advancedExecutables', ['execPath1.exe', 'execPath2Copy.exe']);
    adapter = new TestAdapter();

    await adapter.load();
    assert.equal(adapter.testLoadsEvents.length, 2);
    assert.strictEqual(adapter.root.children.length, 2);

    assert.ok(watchers.has(execPath2CopyPath));
    const watcher = watchers.get(execPath2CopyPath)!;

    const start = Date.now();

    imitation.fsAccessStub
      .withArgs(execPath2CopyPath, sinon.match.any, sinon.match.any)
      .callsFake(imitation.handleAccessFileNotExists);
    watcher.sendDelete();

    await waitFor(this, () => Date.now() - start > 1000);

    assert.equal(adapter!.testLoadsEvents.length, 2);

    imitation.fsAccessStub
      .withArgs(execPath2CopyPath, sinon.match.any, sinon.match.any)
      .callsFake(imitation.handleAccessFileExists);

    await adapter.doAndWaitForReloadEvent(this, () => {
      watcher.sendCreate();
    });

    const elapsed = Date.now() - start;

    assert.equal(adapter.testLoadsEvents.length, 4);

    assert.equal(adapter.root.children.length, 2);
    assert.ok(900 < elapsed, inspect(elapsed));
    assert.ok(elapsed < watchTimeout * 1000 + 2400, inspect(elapsed));
  });

  specify('load executables=["execPath1.exe", "execPath2Copy.exe"]; delete second', async function () {
    const watchTimeout = 2;
    await settings.updateConfig('discovery.gracePeriodForMissing', watchTimeout);
    this.timeout(watchTimeout * 1000 + 7500 /* because of 'delay' */);
    this.slow(watchTimeout * 1000 + 5500 /* because of 'delay' */);
    const execPath2CopyPath = path.join(settings.workspaceFolderUri.fsPath, 'execPath2Copy.exe');

    for (const scenario of example1.suite2.outputs) {
      imitation.spawnStub
        .withArgs(execPath2CopyPath, scenario[0], sinon.match.any)
        .callsFake(() => new ChildProcessStub(scenario[1]));
    }

    imitation.fsAccessStub
      .withArgs(execPath2CopyPath, sinon.match.any, sinon.match.any)
      .callsFake(imitation.handleAccessFileExists);

    imitation.vsfsWatchStub
      .withArgs(imitation.createAbsVscodeRelativePatternMatcher(execPath2CopyPath))
      .callsFake(imitation.createCreateFSWatcherHandler(watchers));

    imitation.vsFindFilesStub
      .withArgs(imitation.createAbsVscodeRelativePatternMatcher(execPath2CopyPath))
      .resolves([vscode.Uri.file(execPath2CopyPath)]);

    await settings.updateConfig('test.advancedExecutables', ['execPath1.exe', 'execPath2Copy.exe']);
    adapter = new TestAdapter();

    await adapter.load();

    assert.strictEqual(adapter.root.children.length, 2);

    assert.ok(watchers.has(execPath2CopyPath));
    const watcher = watchers.get(execPath2CopyPath)!;

    let start = 0;
    await adapter.doAndWaitForReloadEvent(this, async () => {
      imitation.fsAccessStub
        .withArgs(execPath2CopyPath, sinon.match.any, sinon.match.any)
        .callsFake(imitation.handleAccessFileNotExists);
      start = Date.now();
      watcher.sendDelete();
    });
    const elapsed = Date.now() - start;

    assert.equal(adapter.root.children.length, 1);
    assert.ok(watchTimeout * 1000 < elapsed, inspect(elapsed));
    assert.ok(elapsed < watchTimeout * 1000 + 2400, inspect(elapsed));
  });

  specify('wrong executables format', async function () {
    expectedLoggedErrorLine('[Error: pattern property is required.');

    this.slow(5000);
    await settings.updateConfig('test.advancedExecutables', [{ name: '' }]);

    adapter = new TestAdapter();

    adapter.load();

    assert.strictEqual(adapter.root.children.length, 0);
  });

  specify('variable substitution with executables={...}', async function () {
    this.slow(500);

    const wsPath = settings.workspaceFolderUri.fsPath;
    const execRelPath = 'a/b/c/d/1.2.3.exe';
    const execAbsPath = path.join(wsPath, execRelPath);

    const toResolveAndExpectedResolvedValue: [string, string][] = [
      ['${absPath}', execAbsPath],
      ['${relPath}', path.normalize(execRelPath)],
      ['${absDirpath}', path.join(wsPath, 'a/b/c/d')],
      ['${relDirpath}', path.normalize('a/b/c/d')],
      ['${relDirpath[0:0]}', path.normalize('.')],
      ['${relDirpath[9:9]}', path.normalize('.')],
      ['${relDirpath[:]}', path.normalize('a/b/c/d')],
      ['${relDirpath[0:9]}', path.normalize('a/b/c/d')],
      ['${relDirpath[0:1]}', path.normalize('a')],
      ['${relDirpath[1:2]}', path.normalize('b')],
      ['${relDirpath[:1]}', path.normalize('a')],
      ['${relDirpath[1:]}', path.normalize('b/c/d')],
      ['${relDirpath[2:]}', path.normalize('c/d')],
      ['${filename}', '1.2.3.exe'],
      ['${baseFilename}', '1.2.3'],
      ['${extFilename}', '.exe'],
      ['${filename[:]}', '1.2.3.exe'],
      ['${filename[-1:]}', 'exe'],
      ['${filename[:-2]}', '1.2'],
      ['${filename[-2:-1]}', '3'],
      ['${filename[:-3]}', '1'],
      ['${filename[-3:-2]}', '2'],
      ['${workspaceDirectory}', wsPath],
      ['${workspaceFolder}', wsPath],
    ];

    const envsStr = toResolveAndExpectedResolvedValue.map(v => v[0]).join(' | ');
    const expectStr = toResolveAndExpectedResolvedValue.map(v => v[1]).join(' | ');

    const executables = [
      {
        name: envsStr,
        pattern: execRelPath,
        cwd: envsStr,
        env: { C2TESTVARS: envsStr },
      },
    ];
    await settings.updateConfig('test.advancedExecutables', executables);

    for (const scenario of example1.suite2.outputs) {
      imitation.spawnStub
        .withArgs(execAbsPath, scenario[0], sinon.match.any)
        .callsFake(() => new ChildProcessStub(scenario[1]));
    }

    const spawnWithArgs = imitation.spawnStub.withArgs(execAbsPath, example1.suite2.t1.outputs[0][0], sinon.match.any);

    spawnWithArgs.returns(new ChildProcessStub(example1.suite2.t1.outputs[0][1]));

    imitation.fsAccessStub
      .withArgs(execAbsPath, sinon.match.any, sinon.match.any)
      .callsFake(imitation.handleAccessFileExists);

    imitation.vsfsWatchStub
      .withArgs(imitation.createVscodeRelativePatternMatcher(execRelPath))
      .callsFake(imitation.createCreateFSWatcherHandler(watchers));

    imitation.vsFindFilesStub
      .withArgs(imitation.createVscodeRelativePatternMatcher(execRelPath))
      .resolves([vscode.Uri.file(execAbsPath)]);

    adapter = new TestAdapter();

    await adapter.load();

    assert.equal(adapter.root.children.length, 1);
    assert.equal(adapter.root.children[0].type, 'suite');

    const actual = adapter.group1.label.split(' | ');
    const expected = toResolveAndExpectedResolvedValue.map(v => v[1]);
    assert.deepStrictEqual(actual, expected);
    assert.equal(adapter.group1.children.length, 3);

    await adapter.run([adapter.group1.children[0].id]);

    assert.ok(spawnWithArgs.calledOnce, spawnWithArgs.args.toString());
    assert.equal(spawnWithArgs.firstCall.args[2].cwd, expectStr);
    assert.ok(spawnWithArgs.firstCall.args[2].env && spawnWithArgs.firstCall.args[2].env.C2TESTVARS);
    assert.equal(spawnWithArgs.firstCall.args[2].env!.C2TESTVARS!, expectStr);
  });

  context('from different pattern', function () {
    specify('duplicated suite names', async function () {
      this.slow(500);
      await settings.updateConfig('test.advancedExecutables', [
        { name: 'dup', pattern: example1.suite1.execPath },
        { name: 'dup', pattern: example1.suite2.execPath },
      ]);

      adapter = new TestAdapter();

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 1);
      assert.strictEqual(adapter.group1.label, 'dup');

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 1);
      assert.strictEqual(adapter.group1.label, 'dup');
    });

    specify('duplicated suite names with different desciption', async function () {
      this.slow(500);
      await settings.updateConfig('test.advancedExecutables', [
        { name: 'dup', description: 'a', pattern: example1.suite1.execPath },
        { name: 'dup', description: 'b', pattern: example1.suite2.execPath },
      ]);

      adapter = new TestAdapter();

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(adapter.group1.label, 'dup');
      assert.strictEqual(adapter.group1.description, 'a');
      assert.strictEqual(adapter.group2.label, 'dup');
      assert.strictEqual(adapter.group2.description, 'b');

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(adapter.group1.label, 'dup');
      assert.strictEqual(adapter.group1.description, 'a');
      assert.strictEqual(adapter.group2.label, 'dup');
      assert.strictEqual(adapter.group2.description, 'b');
    });

    specify('duplicated executable', async function () {
      this.slow(500);
      await settings.updateConfig('test.advancedExecutables', [
        { name: 'name1 ${relPath}', pattern: 'dummy1' },
        { name: 'name2', pattern: 'dummy2' },
      ]);

      imitation.vsFindFilesStub
        .withArgs(imitation.createVscodeRelativePatternMatcher('dummy1'))
        .resolves([vscode.Uri.file(example1.suite1.execPath), vscode.Uri.file(example1.suite1.execPath)]);

      imitation.vsFindFilesStub
        .withArgs(imitation.createVscodeRelativePatternMatcher('dummy2'))
        .resolves([vscode.Uri.file(example1.suite1.execPath)]);

      adapter = new TestAdapter();

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 2); //TODO make  eq 1 one day
      assert.strictEqual(adapter.group1.label, 'name1 execPath1.exe');
      assert.strictEqual(adapter.group2.label, 'name2');

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(adapter.group1.label, 'name1 execPath1.exe');
      assert.strictEqual(adapter.group2.label, 'name2');
    });
  });

  context('from same pattern', function () {
    specify('duplicated suite names', async function () {
      this.slow(500);
      await settings.updateConfig('test.advancedExecutables', [{ name: 'dup', pattern: 'dummy' }]);

      imitation.vsFindFilesStub
        .withArgs(imitation.createVscodeRelativePatternMatcher('dummy'))
        .resolves([vscode.Uri.file(example1.suite1.execPath), vscode.Uri.file(example1.suite2.execPath)]);

      adapter = new TestAdapter();

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 1);
      assert.strictEqual(adapter.group1.label, 'dup');

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 1);
      assert.strictEqual(adapter.group1.label, 'dup');
    });

    specify('duplicated suite names but different description', async function () {
      this.slow(500);
      await settings.updateConfig('test.advancedExecutables', [
        { name: 'dup', description: '${absPath}', pattern: 'dummy' },
      ]);

      imitation.vsFindFilesStub
        .withArgs(imitation.createVscodeRelativePatternMatcher('dummy'))
        .resolves([vscode.Uri.file(example1.suite1.execPath), vscode.Uri.file(example1.suite2.execPath)]);

      adapter = new TestAdapter();

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(adapter.group1.label, 'dup');
      assert.strictEqual(adapter.group1.description, example1.suite1.execPath);
      assert.strictEqual(adapter.group2.label, 'dup');
      assert.strictEqual(adapter.group2.description, example1.suite2.execPath);

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 2);
      assert.strictEqual(adapter.group1.label, 'dup');
      assert.strictEqual(adapter.group1.description, example1.suite1.execPath);
      assert.strictEqual(adapter.group2.label, 'dup');
      assert.strictEqual(adapter.group2.description, example1.suite2.execPath);
    });
  });

  context('from different and same pattern', function () {
    specify('duplicated suite names', async function () {
      this.slow(500);
      await settings.updateConfig('test.advancedExecutables', [
        { name: 'dup', pattern: 'dummy' },
        { name: 'dup', pattern: example1.suite3.execPath },
      ]);

      imitation.vsFindFilesStub
        .withArgs(imitation.createVscodeRelativePatternMatcher('dummy'))
        .resolves([vscode.Uri.file(example1.suite1.execPath), vscode.Uri.file(example1.suite2.execPath)]);

      adapter = new TestAdapter();

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 1);
      assert.strictEqual(adapter.group1.label, 'dup');

      await adapter.load();

      assert.strictEqual(adapter.root.children.length, 1);
      assert.strictEqual(adapter.group1.label, 'dup');
    });
  });
});
