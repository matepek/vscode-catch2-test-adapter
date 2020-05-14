import * as assert from 'assert';

import * as path from 'path';
import { TestAdapter, settings } from './Common';

describe(path.basename(__filename), function () {
  this.timeout(5000);
  this.slow(300);

  context('change detection', function () {
    let adapter: TestAdapter;

    beforeEach(async function () {
      await settings.resetConfig();
      adapter = new TestAdapter();
    });

    afterEach(async function () {
      this.timeout(8000);
      await adapter.waitAndDispose(this);
      await settings.resetConfig();
    });

    after(function () {
      this.timeout(8000);
      return settings.resetConfig();
    });

    it('test.workingDirectory', function () {
      this.slow(2600);
      return adapter.doAndWaitForReloadEvent(this, () => {
        return settings.updateConfig('test.workingDirectory', 'apple/peach');
      });
    });

    it('test.randomGeneratorSeed', function () {
      return settings.updateConfig('test.randomGeneratorSeed', 987).then(function () {
        assert.equal((adapter as any) /* eslint-disable-line */._shared.rngSeed, 987);
      });
    });

    it('discovery.gracePeriodForMissing', function () {
      this.timeout(10000);
      return settings.updateConfig('discovery.gracePeriodForMissing', 9876).then(function () {
        assert.equal((adapter as any) /* eslint-disable-line */._shared.execWatchTimeout, 9876000);
      });
    });

    it('test.runtimeLimit', function () {
      return settings.updateConfig('test.runtimeLimit', 8765).then(function () {
        assert.equal((adapter as any) /* eslint-disable-line */._shared.execRunningTimeout, 8765000);
      });
    });

    it('debug.noThrow', function () {
      return settings.updateConfig('debug.noThrow', true).then(function () {
        assert.equal((adapter as any) /* eslint-disable-line */._shared.isNoThrow, true);
      });
    });
  });
});
