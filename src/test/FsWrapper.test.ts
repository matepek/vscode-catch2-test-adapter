import * as assert from 'assert';
import {spawnAsync} from '../FsWrapper';

describe('FsWrapper.spawnAsync', function() {
  it('echoes', async function() {
    const r = await spawnAsync('echo', ['apple']);
    assert.equal(r.stdout, 'apple\n');
    assert.equal(r.output.length, 2);
    assert.equal(r.output[0], 'apple\n');
    assert.equal(r.status, 0);
  })

  it.skip('sleeps', async function() {
    this.timeout(1100);
    this.slow(1050);
    if (process.platform === 'darwin') {
      const r = await spawnAsync('sleep', ['1']);
      assert.equal(r.stdout, '');
      assert.equal(r.output.length, 0);
      assert.equal(r.status, 0);
    }
  })
});