import * as assert from 'assert';
import { promisify } from 'util';
import * as path from 'path';

import { TaskQueue } from '../src/TaskQueue';

describe(path.basename(__filename), function() {
  async function waitFor(test: Mocha.Context, condition: Function, timeout: number = 1000): Promise<void> {
    const start = Date.now();
    let c = await condition();
    while (!c && (Date.now() - start < timeout || !test.enableTimeouts())) {
      await promisify(setTimeout)(10);
      c = await condition();
    }
    return c;
  }

  context('a<--b<--c', function() {
    const a = new TaskQueue(undefined, 'a');
    const b = new TaskQueue([a], 'b');
    const c = new TaskQueue([b], 'c');

    it('a<--c', function() {
      c.dependsOn([a]);
    });

    it('$x<--$x throws', function() {
      assert.throws(() => {
        a.dependsOn([a]);
      });
      assert.throws(() => {
        b.dependsOn([b]);
      });
      assert.throws(() => {
        c.dependsOn([c]);
      });
    });

    it('c<--b throws', function() {
      assert.throws(() => {
        b.dependsOn([c]);
      });
    });

    it('c<--a throws', function() {
      assert.throws(() => {
        a.dependsOn([c]);
      });
    });
  });

  it('promise practice 1', async function() {
    let resolve: Function;
    let second = false;
    new Promise(r => {
      resolve = r;
    }).then(() => {
      second = true;
    });
    assert.ok(!second);

    resolve!();
    await waitFor(this, () => {
      return second;
    });
    assert.ok(second);
  });

  it('promise practice 2', async function() {
    let resolve: Function;
    let second = false;
    const p = new Promise(r => {
      resolve = r;
    });
    assert.ok(!second);

    p.then(() => {
      second = true;
    });
    assert.ok(!second);

    resolve!();
    await waitFor(this, () => {
      return second;
    });
    assert.ok(second);
  });

  context('example 1', function() {
    /**
     *  node1 <___ nodeD
     *  node2 <___/
     */
    const node1 = new TaskQueue([], 'node1');
    const node2 = new TaskQueue([], 'node2');
    const nodeD = new TaskQueue([node1, node2], 'nodeD');

    it('add:depends before', async function() {
      this.slow(300);
      let startD: Function;
      let hasRunDatOnce = false;
      nodeD.then(() => {
        return new Promise(r => {
          startD = r;
          hasRunDatOnce = true;
        });
      });
      assert.equal(nodeD.size, 1);

      let start1: Function;
      let hasRun1atOnce = false;
      let hasRun1afterStart = false;
      node1.then(() => {
        return new Promise(r => {
          start1 = r;
          hasRun1atOnce = true;
        });
      });
      assert.equal(node1.size, 1);
      node1.then(() => {
        hasRun1afterStart = true;
      });
      assert.equal(node1.size, 2);

      let start2: Function;
      let hasRun2atOnce = false;
      let hasRun2afterStart = false;
      node2.then(() => {
        return new Promise(r => {
          start2 = r;
          hasRun2atOnce = true;
        });
      });
      assert.equal(node2.size, 1);
      node2.then(() => {
        hasRun2afterStart = true;
      });
      assert.equal(node2.size, 2);

      assert.ok(!hasRunDatOnce);
      assert.ok(!hasRun1atOnce);
      assert.ok(!hasRun2atOnce);

      await promisify(setTimeout)(40);

      assert.ok(
        await waitFor(this, async () => {
          return hasRunDatOnce;
        }),
      );
      assert.equal(nodeD.size, 1);
      assert.ok(
        await waitFor(this, async () => {
          return hasRun1atOnce;
        }),
      );
      assert.equal(node1.size, 2);
      assert.ok(
        await waitFor(this, async () => {
          return hasRun2atOnce;
        }),
      );
      assert.equal(node2.size, 2);

      let hasRunD2second = false;
      nodeD.then(() => {
        assert.ok(hasRun1afterStart);
        assert.ok(hasRun2afterStart);
        hasRunD2second = true;
      });
      assert.equal(nodeD.size, 2);

      startD!();
      await promisify(setTimeout)(20);

      assert.ok(!hasRun1afterStart);
      assert.ok(!hasRun2afterStart);
      assert.ok(!hasRunD2second);

      start1!();
      await promisify(setTimeout)(20);
      assert.ok(
        await waitFor(this, async () => {
          return hasRun1afterStart;
        }),
      );
      assert.equal(node1.size, 0);
      assert.equal(node2.size, 2);
      assert.equal(nodeD.size, 1);
      assert.ok(!hasRun2afterStart);
      assert.ok(!hasRunD2second);

      start2!();
      await promisify(setTimeout)(20);
      assert.ok(
        await waitFor(this, async () => {
          return hasRun2afterStart;
        }),
      );
      assert.equal(node2.size, 0);

      assert.ok(
        await waitFor(this, async () => {
          return hasRunD2second;
        }),
      );
      assert.equal(nodeD.size, 0);
    });
  });
});
