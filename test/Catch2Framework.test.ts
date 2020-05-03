import * as path from 'path';
import * as fse from 'fs-extra';
import * as assert from 'assert';
import { inspect } from 'util';
import * as sinon from 'sinon';
import { EOL } from 'os';
import { example1 } from './example1';
import { TestAdapter, Imitation, waitFor, settings, ChildProcessStub } from './Common';

///

describe(path.basename(__filename), function () {
  let imitation: Imitation;
  let adapter: TestAdapter | undefined = undefined;

  this.timeout(8000);
  this.slow(1000);

  before(function () {
    imitation = new Imitation();
    fse.removeSync(settings.dotVscodePath);
  });

  after(function () {
    imitation.restore();
    return settings.resetConfig();
  });

  beforeEach(async function () {
    adapter = undefined;

    imitation.resetToCallThrough();
    example1.initImitation(imitation);

    // reset config can cause problem with fse.removeSync(dotVscodePath);
    await settings.resetConfig();
  });

  afterEach(async function () {
    if (adapter) await adapter.waitAndDispose(this);
  });

  specify('test list error: duplicated test name', async function () {
    this.slow(500);
    await settings.updateConfig('test.executables', example1.suite1.execPath);

    adapter = new TestAdapter();

    const testListErrOutput = [
      'error: TEST_CASE( "biggest rectangle" ) already defined.',
      '  First seen at ../Task/biggest_rectangle.cpp:46',
      '  Redefined at ../Task/biggest_rectangle.cpp:102',
      '',
    ];
    const withArgs = imitation.spawnStub.withArgs(
      example1.suite1.execPath,
      example1.suite1.outputs[1][0],
      sinon.match.any,
    );
    withArgs
      .onCall(withArgs.callCount)
      .returns(new ChildProcessStub('Matching test cases:' + EOL, undefined, testListErrOutput.join(EOL)));

    await adapter.load();

    assert.equal(adapter.root.children.length, 1);

    const suite1 = adapter.suite1;
    assert.equal(suite1.children.length, 1, inspect([testListErrOutput, adapter.testLoadsEvents]));

    assert.strictEqual(suite1.label, 'execPath1.exe');
    assert.strictEqual(suite1.children[0].label, '⚡️ Unexpected ERROR while parsing');

    await waitFor(this, () => {
      return adapter!.testStatesEvents.length == 6;
    });

    assert.strictEqual('test', adapter.testStatesEvents[3].type);
    if (adapter.testStatesEvents[3].type === 'test') {
      assert.strictEqual('errored', adapter.testStatesEvents[3].state);
      assert.strictEqual(suite1.children[0], adapter.testStatesEvents[3].test);
      assert.ok(adapter.testStatesEvents[3].message?.indexOf(testListErrOutput.join(EOL)));
    }
  });

  specify('custom1 test case list', async function () {
    this.slow(500);
    await settings.updateConfig('test.executables', example1.suite1.execPath);

    adapter = new TestAdapter();

    const testListOutput = [
      'Matching test cases:',
      '  first',
      '    /mnt/c/Users/a.cpp:12',
      '    (NO DESCRIPTION)',
      '      [a]',
      '  second',
      '    /mnt/c/Users/b.cpp:42',
      '    (NO DESCRIPTION)',
      '      [b]',
      '2 matching test cases',
    ];

    const withArgs = imitation.spawnStub.withArgs(
      example1.suite1.execPath,
      example1.suite1.outputs[1][0],
      sinon.match.any,
    );
    withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(testListOutput.join(EOL)));

    await adapter.load();

    assert.equal(adapter.root.children.length, 1);

    const suite1 = adapter.suite1;
    assert.equal(suite1.children.length, 2, inspect([testListOutput, adapter.testLoadsEvents]));

    assert.strictEqual(suite1.label, 'execPath1.exe');
    assert.strictEqual(suite1.children[0].label, 'first');
    assert.strictEqual(suite1.children[1].label, 'second');
  });

  specify('custom2 test case list', async function () {
    this.slow(500);
    await settings.updateConfig('test.executables', example1.suite1.execPath);

    adapter = new TestAdapter();

    const testListOutput = [
      'Matching test cases:',
      '  first',
      '    /mnt/c/Users/a.cpp:12',
      '    (NO DESCRIPTION)',
      '      [a]',
      '1 matching test case',
    ];

    const withArgs = imitation.spawnStub.withArgs(
      example1.suite1.execPath,
      example1.suite1.outputs[1][0],
      sinon.match.any,
    );
    withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(testListOutput.join(EOL)));

    await adapter.load();

    assert.equal(adapter.root.children.length, 1);

    const suite1 = adapter.suite1;
    assert.equal(suite1.children.length, 1, inspect([testListOutput, adapter.testLoadsEvents]));

    assert.strictEqual(suite1.label, 'execPath1.exe');
    assert.strictEqual(suite1.children[0].label, 'first');
  });

  specify('custom3 test case list: extra lines before and after', async function () {
    this.slow(500);
    await settings.updateConfig('test.executables', example1.suite1.execPath);

    adapter = new TestAdapter();

    const testListOutput = [
      'some random unrelated text....',
      'Matching test cases:',
      '  first',
      '    /mnt/c/Users/a.cpp:12',
      '    (NO DESCRIPTION)',
      '      [a]',
      '1 matching test case',
      'bla bla bla',
      '',
    ];

    const withArgs = imitation.spawnStub.withArgs(
      example1.suite1.execPath,
      example1.suite1.outputs[1][0],
      sinon.match.any,
    );
    withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(testListOutput.join(EOL)));

    await adapter.load();

    assert.equal(adapter.root.children.length, 1);

    const suite1 = adapter.suite1;
    assert.equal(suite1.children.length, 1, inspect([testListOutput, adapter.testLoadsEvents]));

    assert.strictEqual(suite1.label, 'execPath1.exe');
    assert.strictEqual(suite1.children[0].label, 'first');
  });

  specify('too long filename', async function () {
    this.slow(500);
    await settings.updateConfig('test.executables', example1.suite1.execPath);

    adapter = new TestAdapter();

    const testListOutput = [
      'Matching test cases:',
      '  nnnnnnnnnnnnnnnnnnnnn1',
      '    ../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/',
      '    fffffffffffffffffffffffffffffffffffffffff.cpp:11',
      '    (NO DESCRIPTION)',
      '  nnnnnnnnnnnnnnnnnnnnn2',
      '    ../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/fffffffffffffffffff.cpp:14',
      '    (NO DESCRIPTION)',
      '  nnnnnnnnnnnnnnnnnnnnn3',
      '    ../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.cpp:',
      '    19',
      '    (NO DESCRIPTION)',
      '  nnnnnnnnnnnnnnnnnnnnn4',
      '    ../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.',
      '    cpp:14',
      '    (NO DESCRIPTION)',
      '  nnnnnnnnnnnnnnnnnnnnn5',
      '    ../ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff/',
      '    ddddddd1/dddd1/dddd1/dddd1/dddd1/dddddd1/ffffffffffffffffffffffffffffff.',
      '    cpp:14',
      '    (NO DESCRIPTION)',
      '5 matching test cases',
      '',
      '',
    ];

    const withArgs = imitation.spawnStub.withArgs(
      example1.suite1.execPath,
      example1.suite1.outputs[1][0],
      sinon.match.any,
    );
    withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(testListOutput.join(EOL)));

    await adapter.load();

    assert.equal(adapter.root.children.length, 1);

    const suite1 = adapter.suite1;
    assert.strictEqual(suite1.label, 'execPath1.exe');
    assert.equal(suite1.children.length, 5, inspect([testListOutput, adapter.testLoadsEvents]));
  });
});
