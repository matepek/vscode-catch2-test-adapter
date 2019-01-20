//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as assert from 'assert';

import * as path from 'path';
import { TestAdapter, settings } from './TestCommon';

describe(path.basename(__filename), function () {
	this.timeout(5000);
	this.slow(300);

	let adapter: TestAdapter;

	before(async function () {
		await settings.resetConfig();
	})

	beforeEach(function () {
		adapter = new TestAdapter();
	})

	afterEach(async function () {
		this.timeout(8000);
		await adapter.waitAndDispose(this);
		await settings.resetConfig();
	})

	it('defaultEnv', function () {
		this.slow(1000);
		return adapter.doAndWaitForReloadEvent(this, () => {
			return settings.updateConfig('defaultEnv', { 'APPLE': 'apple' });
		});
	})

	it('defaultCwd', function () {
		this.slow(600);
		return adapter.doAndWaitForReloadEvent(this, () => {
			return settings.updateConfig('defaultCwd', 'apple/peach');
		});
	})

	it('enableSourceDecoration', function () {
		return settings.updateConfig('enableSourceDecoration', false).then(function () {
			assert.ok(!(<any>adapter)._shared.isEnabledSourceDecoration);
		});
	})

	it('defaultRngSeed', function () {
		return settings.updateConfig('defaultRngSeed', 987).then(function () {
			assert.equal((<any>adapter)._shared.rngSeed, 987);
		});
	})

	it('defaultWatchTimeoutSec', function () {
		return settings.updateConfig('defaultWatchTimeoutSec', 9876).then(function () {
			assert.equal((<any>adapter)._shared.execWatchTimeout, 9876000);
		});
	})

	it('defaultRunningTimeoutSec', function () {
		return settings.updateConfig('defaultRunningTimeoutSec', 8765).then(function () {
			assert.equal((<any>adapter)._shared.execRunningTimeout, 8765000);
		});
	})

	it('defaultNoThrow', function () {
		return settings.updateConfig('defaultNoThrow', true).then(function () {
			assert.equal((<any>adapter)._shared.isNoThrow, true);
		});
	})
})