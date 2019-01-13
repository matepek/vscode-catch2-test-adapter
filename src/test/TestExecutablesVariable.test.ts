// -----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as path from 'path';
import * as assert from 'assert';
import { TestAdapter, Imitation, settings } from './TestCommon';
import { TestLoadFinishedEvent } from 'vscode-test-adapter-api';
import { promisify } from 'util';

///

describe('Load Executables With Value', function () {
	this.slow(500);

	let imitation: Imitation;
	let adapter: TestAdapter;

	before(function () {
		imitation = new Imitation();
	})

	beforeEach(function () {
		adapter = new TestAdapter();
		return promisify(setTimeout)(1000);
	})

	afterEach(function () {
		return adapter.waitAndDispose(this);
	})

	after(function () {
		imitation.sinonSandbox.restore();
	})

	specify('empty config', async function () {
		await adapter.load();
		assert.equal(adapter.testLoadsEvents.length, 2);
		assert.equal(adapter.testLoadsEvents[0].type, 'started');
		assert.equal(adapter.testLoadsEvents[1].type, 'finished');
		const suite = (<TestLoadFinishedEvent>adapter.testLoadsEvents[1]).suite;
		assert.notStrictEqual(suite, undefined);
		assert.equal(suite!.children.length, 0);
	})

	specify('../a/first', async function () {
		await settings.updateConfig('executables', '../a/first');
		const withArgs = imitation.vsFindFilesStub.withArgs(imitation.createVscodeRelativePatternMatcher('first'));
		const count = withArgs.callCount;
		await adapter.load();
		assert.strictEqual(withArgs.callCount, count);
	})

	specify('../<workspaceFolder>/first', async function () {
		await settings.updateConfig('executables', '../' + path.basename(settings.workspaceFolderUri.fsPath) + '/first');
		const withArgs = imitation.vsFindFilesStub.withArgs(imitation.createVscodeRelativePatternMatcher('first'));
		const count = withArgs.callCount;
		await adapter.load();
		assert.strictEqual(withArgs.callCount, count + 1);
	})

	specify('./first', async function () {
		await settings.updateConfig('executables', './first');
		const withArgs = imitation.vsFindFilesStub.withArgs(imitation.createVscodeRelativePatternMatcher('first'));
		const count = withArgs.callCount;
		await adapter.load();
		assert.strictEqual(withArgs.callCount, count + 1);
	})

	specify('./a/b/../../first', async function () {
		await settings.updateConfig('executables', './a/b/../../first');
		const withArgs = imitation.vsFindFilesStub.withArgs(imitation.createVscodeRelativePatternMatcher('first'));
		const count = withArgs.callCount;
		await adapter.load();
		assert.strictEqual(withArgs.callCount, count + 1);
	})

	specify('cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*', async function () {
		await settings.updateConfig('executables', 'cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*');
		const withArgs = imitation.vsFindFilesStub.withArgs(imitation.createVscodeRelativePatternMatcher('cpp/{build,Build,BUILD,out,Out,OUT}/**/*suite[0-9]*'));
		const count = withArgs.callCount;
		await adapter.load();
		assert.strictEqual(withArgs.callCount, count + 1);
	})
})