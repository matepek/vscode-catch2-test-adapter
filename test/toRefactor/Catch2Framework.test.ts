import * as path from 'path';
import * as fse from 'fs-extra';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { EOL } from 'os';
import { example1 } from '../example1';
import { TestAdapter, Imitation, settings, ChildProcessStub } from '../Common';

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

  specify('custom4 test case list', async function () {
    this.slow(500);
    await settings.updateConfig('test.executables', example1.suite1.execPath);

    adapter = new TestAdapter();

    const testListOutput = ['', 'Catch v2.12.1', 'usage:', '  Tests [<test name|pattern|tags> ... ] options', '', ''];

    const withArgs = imitation.spawnStub.withArgs(
      example1.suite1.execPath,
      example1.suite1.outputs[0][0],
      sinon.match.any,
    );
    withArgs.onCall(withArgs.callCount).returns(new ChildProcessStub(testListOutput.join(EOL)));

    await adapter.load();

    assert.strictEqual(adapter.root.children.length, 1);
  });
});
