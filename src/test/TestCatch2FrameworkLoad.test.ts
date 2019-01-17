//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import * as path from 'path';
import * as fse from 'fs-extra';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { TestEvent, TestLoadFinishedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { inspect, promisify } from 'util';
import { EOL } from 'os';
import { example1 } from './example1';
import { TestAdapter, Imitation, waitFor, settings, ChildProcessStub, FileSystemWatcherStub } from './TestCommon';

///

describe('Test Catch2 Framework Load', function () {
	this.slow(1000);

	let imitation: Imitation;
	let adapter: TestAdapter;
	let watchers: Map<string, FileSystemWatcherStub>;
	const uniqueIdC = new Set<string>();

	before(function () {
		imitation = new Imitation();
		fse.removeSync(settings.dotVscodePath);
	})

	after(function () {
		imitation.sinonSandbox.restore();
	})

	beforeEach(async function () {
		this.timeout(8000);

		imitation.reset();
		watchers = example1.initImitation(imitation);

		await settings.resetConfig(); // reset config can cause problem with fse.removeSync(dotVscodePath);
		await settings.updateConfig('workerMaxNumber', 3);

		return promisify(setTimeout)(2000);
	})

	afterEach(async function () {
		this.timeout(8000);

		await adapter.waitAndDispose(this);
		uniqueIdC.clear();

		return promisify(setTimeout)(1000);
	})

	let root: TestSuiteInfo;
	let suite1: TestSuiteInfo | any;
	let s1t1: TestInfo | any;
	let s1t2: TestInfo | any;
	let suite2: TestSuiteInfo | any;
	let s2t1: TestInfo | any;
	let s2t2: TestInfo | any;
	let s2t3: TestInfo | any;

	async function loadAdapter() {
		adapter = new TestAdapter();

		await adapter.load();
		adapter.testLoadsEvents.pop();
		adapter.testLoadsEvents.pop();

		root = adapter.rootSuite;

		suite1 = undefined;
		s1t1 = undefined;
		s1t2 = undefined;
		suite2 = undefined;
		s2t1 = undefined;
		s2t2 = undefined;
		s2t3 = undefined;

		example1.assertWithoutChildren(root, uniqueIdC);
	}

	context('executables="execPath1"', function () {
		beforeEach(function () {
			this.timeout(8000);
			return settings.updateConfig('executables', 'execPath1');
		})

		async function loadAdapterAndAssert() {
			await loadAdapter();
			assert.deepStrictEqual(settings.getConfig().get<any>('executables'), 'execPath1');
			assert.equal(root.children.length, 1);

			suite1 = adapter.suite1;
			example1.suite1.assert('execPath1', ['s1t1', 's1t2'], suite1, uniqueIdC);

			assert.equal(suite1.children.length, 2);
			assert.equal(suite1.children[0].type, 'test');
			s1t1 = <TestInfo>suite1.children[0];
			assert.equal(suite1.children[1].type, 'test');
			s1t2 = <TestInfo>suite1.children[1];
		}

		it('should run with not existing test id', async function () {
			await loadAdapterAndAssert();
			await adapter.run(['not existing id']);

			assert.deepStrictEqual(adapter.testStatesEvents, [
				{ type: 'started', tests: ['not existing id'] }, { type: 'finished' }
			]);
		})

		it('should run s1t1 with success', async function () {
			await loadAdapterAndAssert();
			assert.equal(settings.getConfig().get<any>('executables'), 'execPath1');
			await adapter.run([s1t1.id]);
			const expected = [
				{ type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 },
				{
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000112 second(s).\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' },
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			await adapter.run([s1t1.id]);
			assert.deepStrictEqual(adapter.testStatesEvents, [...expected, ...expected]);
		})

		it('should run suite1', async function () {
			await loadAdapterAndAssert();
			await adapter.run([suite1.id]);
			const expected = [
				{ type: 'started', tests: [suite1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 },
				{
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000132 second(s).\n'
				},
				{ type: 'test', state: 'running', test: s1t2 },
				{
					type: 'test',
					state: 'failed',
					test: s1t2,
					decorations: [{ line: 14, message: '-> false' }],
					message: '⏱ Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' },
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			await adapter.run([suite1.id]);
			assert.deepStrictEqual(adapter.testStatesEvents, [...expected, ...expected]);
		})

		it('should run all', async function () {
			await loadAdapterAndAssert();
			await adapter.run([root.id]);
			const expected = [
				{ type: 'started', tests: [root.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 },
				{
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000132 second(s).\n'
				},
				{ type: 'test', state: 'running', test: s1t2 },
				{
					type: 'test',
					state: 'failed',
					test: s1t2,
					decorations: [{ line: 14, message: '-> false' }],
					message: '⏱ Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' },
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			await adapter.run([root.id]);
			assert.deepStrictEqual(adapter.testStatesEvents, [...expected, ...expected]);
		})

		it('cancels without any problem', async function () {
			await loadAdapterAndAssert();
			adapter.cancel();
			assert.deepStrictEqual(adapter.testLoadsEvents, []);
			assert.deepStrictEqual(adapter.testStatesEvents, []);

			adapter.cancel();
			assert.deepStrictEqual(adapter.testLoadsEvents, []);
			assert.deepStrictEqual(adapter.testStatesEvents, []);

			await adapter.run([s1t1.id]);
			const expected = [
				{ type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 }, {
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000112 second(s).\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' }
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			adapter.cancel();
			assert.deepStrictEqual(adapter.testLoadsEvents, []);
			assert.deepStrictEqual(adapter.testStatesEvents, expected);
		})

		context('with config: defaultRngSeed=2', function () {
			beforeEach(function () {
				this.timeout(8000);
				return settings.updateConfig('defaultRngSeed', 2);
			})

			it('should run s1t1 with success', async function () {
				await loadAdapterAndAssert();
				await adapter.run([s1t1.id]);
				const expected = [
					{ type: 'started', tests: [s1t1.id] },
					{ type: 'suite', state: 'running', suite: suite1 },
					{ type: 'test', state: 'running', test: s1t1 }, {
						type: 'test',
						state: 'passed',
						test: s1t1,
						decorations: [],
						message: '🔀 Randomness seeded to: 2.\n⏱ Duration: 0.000327 second(s).\n'
					},
					{ type: 'suite', state: 'completed', suite: suite1 },
					{ type: 'finished' }
				];
				assert.deepStrictEqual(adapter.testStatesEvents, expected);

				await adapter.run([s1t1.id]);
				assert.deepStrictEqual(
					adapter.testStatesEvents, [...expected, ...expected]);
			})
		})
	})

	context('executables=["execPath1", "execPath2"]', function () {
		let suite1Watcher: FileSystemWatcherStub;

		async function loadAdapterAndAssert() {
			await loadAdapter();
			assert.equal(root.children.length, 2);

			assert.equal(root.children[0].type, 'suite');
			assert.equal(root.children[1].type, 'suite');
			assert.equal(example1.suite1.outputs.length, 4 + 2 * 2);
			assert.equal(example1.suite2.outputs.length, 4 + 2 * 3);
			suite1 = <TestSuiteInfo>root.children[0];
			suite2 = <TestSuiteInfo>root.children[1];
			if (suite2.children.length == 2) {
				suite1 = <TestSuiteInfo>root.children[1];
				suite2 = <TestSuiteInfo>root.children[0];
			}

			assert.equal(suite1.children.length, 2);
			assert.equal(suite1.children[0].type, 'test');
			s1t1 = <TestInfo>suite1.children[0];
			assert.equal(suite1.children[1].type, 'test');
			s1t2 = <TestInfo>suite1.children[1];

			assert.equal(suite2.children.length, 3);
			assert.equal(suite2.children[0].type, 'test');
			s2t1 = <TestInfo>suite2.children[0];
			assert.equal(suite2.children[1].type, 'test');
			s2t2 = <TestInfo>suite2.children[1];
			assert.equal(suite2.children[2].type, 'test');
			s2t3 = <TestInfo>suite2.children[2];

			assert.equal(watchers.size, 2);
			assert.ok(watchers.has(example1.suite1.execPath));
			suite1Watcher = watchers.get(example1.suite1.execPath)!;

			example1.suite1.assert(
				'execPath1', ['s1t1', 's1t2'], suite1, uniqueIdC);

			example1.suite2.assert(
				'execPath2', ['s2t1', 's2t2 [.]', 's2t3'], suite2, uniqueIdC);
		}

		beforeEach(function () {
			this.timeout(10000);
			return settings.updateConfig('executables', ['execPath1', 'execPath2']);
		})

		it('test variables are fine, suite1 and suite1 are loaded',
			async function () {
				await loadAdapterAndAssert();
				assert.equal(root.children.length, 2);
				assert.ok(suite1 != undefined);
				assert.ok(s1t1 != undefined);
				assert.ok(s1t2 != undefined);
				assert.ok(suite2 != undefined);
				assert.ok(s2t1 != undefined);
				assert.ok(s2t2 != undefined);
				assert.ok(s2t3 != undefined);
			})

		it('should run all', async function () {
			await loadAdapterAndAssert();
			assert.equal(root.children.length, 2);
			await adapter.run([root.id]);

			const running: TestRunStartedEvent = { type: 'started', tests: [root.id] };

			const s1running: TestSuiteEvent = { type: 'suite', state: 'running', suite: suite1 };
			const s1finished: TestSuiteEvent = { type: 'suite', state: 'completed', suite: suite1 };
			assert.ok(adapter.getTestStatesEventIndex(running) < adapter.getTestStatesEventIndex(s1running));
			assert.ok(adapter.getTestStatesEventIndex(s1running) < adapter.getTestStatesEventIndex(s1finished));

			const s2running: TestSuiteEvent = { type: 'suite', state: 'running', suite: suite2 };
			const s2finished: TestSuiteEvent = { type: 'suite', state: 'completed', suite: suite2 };
			assert.ok(adapter.getTestStatesEventIndex(running) < adapter.getTestStatesEventIndex(s1running));
			assert.ok(adapter.getTestStatesEventIndex(s2running) < adapter.getTestStatesEventIndex(s2finished));

			const s1t1running: TestEvent = { type: 'test', state: 'running', test: s1t1 };
			assert.ok(adapter.getTestStatesEventIndex(s1running) < adapter.getTestStatesEventIndex(s1t1running));

			const s1t1finished: TestEvent = {
				type: 'test',
				state: 'passed',
				test: s1t1,
				decorations: [],
				message: '⏱ Duration: 0.000132 second(s).\n'
			};
			assert.ok(adapter.getTestStatesEventIndex(s1t1running) < adapter.getTestStatesEventIndex(s1t1finished));
			assert.ok(adapter.getTestStatesEventIndex(s1t1finished) < adapter.getTestStatesEventIndex(s1finished));

			const s1t2running: TestEvent = { type: 'test', state: 'running', test: s1t2 };
			assert.ok(adapter.getTestStatesEventIndex(s1running) < adapter.getTestStatesEventIndex(s1t2running));

			const s1t2finished: TestEvent = {
				type: 'test',
				state: 'failed',
				test: s1t2,
				decorations: [{ line: 14, message: '-> false' }],
				message: '⏱ Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
			};
			assert.ok(adapter.getTestStatesEventIndex(s1t2running) < adapter.getTestStatesEventIndex(s1t2finished));
			assert.ok(adapter.getTestStatesEventIndex(s1t2finished) < adapter.getTestStatesEventIndex(s1finished));

			const s2t1running: TestEvent = { type: 'test', state: 'running', test: s2t1 };
			assert.ok(adapter.getTestStatesEventIndex(s2running) < adapter.getTestStatesEventIndex(s2t1running));

			const s2t1finished: TestEvent = {
				type: 'test',
				state: 'passed',
				test: s2t1,
				decorations: [],
				message: '⏱ Duration: 0.00037 second(s).\n'
			};
			assert.ok(adapter.getTestStatesEventIndex(s2t1running) < adapter.getTestStatesEventIndex(s2t1finished));
			assert.ok(adapter.getTestStatesEventIndex(s2t1finished) < adapter.getTestStatesEventIndex(s2finished));

			const s2t2running: TestEvent = { type: 'test', state: 'running', test: s2t2 };
			assert.ok(adapter.getTestStatesEventIndex(s2running) < adapter.getTestStatesEventIndex(s2t2running));

			const s2t2finished: TestEvent = { type: 'test', state: 'skipped', test: s2t2 };
			assert.ok(adapter.getTestStatesEventIndex(s2t2running) < adapter.getTestStatesEventIndex(s2t2finished));
			assert.ok(adapter.getTestStatesEventIndex(s2t2finished) < adapter.getTestStatesEventIndex(s2finished));

			const s2t3running: TestEvent = { type: 'test', state: 'running', test: s2t3 };
			assert.ok(adapter.getTestStatesEventIndex(s2running) < adapter.getTestStatesEventIndex(s2t3running));

			const s2t3finished: TestEvent = {
				type: 'test',
				state: 'failed',
				test: s2t3,
				decorations: [{ line: 20, message: '-> false' }],
				message: '⏱ Duration: 0.000178 second(s).\n>>> "s2t3" at line 19 -> REQUIRE at line 21:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
			};
			assert.ok(adapter.getTestStatesEventIndex(s2t3running) < adapter.getTestStatesEventIndex(s2t3finished));
			assert.ok(adapter.getTestStatesEventIndex(s2t3finished) < adapter.getTestStatesEventIndex(s2finished));

			const finished: TestRunFinishedEvent = { type: 'finished' };
			assert.ok(adapter.getTestStatesEventIndex(s1finished) < adapter.getTestStatesEventIndex(finished));
			assert.ok(adapter.getTestStatesEventIndex(s2finished) < adapter.getTestStatesEventIndex(finished));

			assert.equal(adapter.testStatesEvents.length, 16, inspect(adapter.testStatesEvents));
		})

		it('should run with not existing test id', async function () {
			await loadAdapterAndAssert();
			await adapter.run(['not existing id']);

			assert.deepStrictEqual(adapter.testStatesEvents, [
				{ type: 'started', tests: ['not existing id'] }, { type: 'finished' }
			]);
		})

		it('should run s1t1', async function () {
			await loadAdapterAndAssert();
			await adapter.run([s1t1.id]);
			const expected = [
				{ type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 }, {
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000112 second(s).\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' }
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			await adapter.run([s1t1.id]);
			assert.deepStrictEqual(adapter.testStatesEvents, [...expected, ...expected]);
		})

		it('should run skipped s2t2', async function () {
			await loadAdapterAndAssert();
			await adapter.run([s2t2.id]);
			const expected = [
				{ type: 'started', tests: [s2t2.id] },
				{ type: 'suite', state: 'running', suite: suite2 },
				{ type: 'test', state: 'running', test: s2t2 }, {
					type: 'test',
					state: 'passed',
					test: s2t2,
					decorations: [],
					message: '⏱ Duration: 0.001294 second(s).\n'
				},
				{ type: 'suite', state: 'completed', suite: suite2 },
				{ type: 'finished' }
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			await adapter.run([s2t2.id]);
			assert.deepStrictEqual(adapter.testStatesEvents, [...expected, ...expected]);
		})

		it('should run failing test s2t3', async function () {
			await loadAdapterAndAssert();
			await adapter.run([s2t3.id]);
			const expected = [
				{ type: 'started', tests: [s2t3.id] },
				{ type: 'suite', state: 'running', suite: suite2 },
				{ type: 'test', state: 'running', test: s2t3 }, {
					type: 'test',
					state: 'failed',
					test: s2t3,
					decorations: [{ line: 20, message: '-> false' }],
					message: '⏱ Duration: 0.000596 second(s).\n>>> "s2t3" at line 19 -> REQUIRE at line 21:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
				},
				{ type: 'suite', state: 'completed', suite: suite2 },
				{ type: 'finished' }
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			await adapter.run([s2t3.id]);
			assert.deepStrictEqual(adapter.testStatesEvents, [...expected, ...expected]);
		})

		it('should run failing test s2t3 with chunks', async function () {
			await loadAdapterAndAssert();
			const withArgs = imitation.spawnStub.withArgs(
				example1.suite2.execPath, example1.suite2.t3.outputs[0][0]);
			withArgs.onCall(withArgs.callCount)
				.returns(new ChildProcessStub(example1.suite2.t3.outputs[0][1]));

			await adapter.run([s2t3.id]);
			const expected = [
				{ type: 'started', tests: [s2t3.id] },
				{ type: 'suite', state: 'running', suite: suite2 },
				{ type: 'test', state: 'running', test: s2t3 }, {
					type: 'test',
					state: 'failed',
					test: s2t3,
					decorations: [{ line: 20, message: '-> false' }],
					message: '⏱ Duration: 0.000596 second(s).\n>>> "s2t3" at line 19 -> REQUIRE at line 21:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
				},
				{ type: 'suite', state: 'completed', suite: suite2 },
				{ type: 'finished' }
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			await adapter.run([s2t3.id]);
			assert.deepStrictEqual(adapter.testStatesEvents, [...expected, ...expected]);
		})

		it('should run suite1', async function () {
			await loadAdapterAndAssert();
			await adapter.run([suite1.id]);
			const expected = [
				{ type: 'started', tests: [suite1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 }, {
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000132 second(s).\n'
				},
				{ type: 'test', state: 'running', test: s1t2 }, {
					type: 'test',
					state: 'failed',
					test: s1t2,
					decorations: [{ line: 14, message: '-> false' }],
					message: '⏱ Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' }
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			await adapter.run([suite1.id]);
			assert.deepStrictEqual(adapter.testStatesEvents, [...expected, ...expected]);
		})

		it('should run with [suite1.id,s2t2.id]', async function () {
			await settings.updateConfig('workerMaxNumber', 1);
			await loadAdapterAndAssert();
			await adapter.run([suite1.id, s2t2.id]);
			const expected = [
				{ type: 'started', tests: [suite1.id, s2t2.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 }, {
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000132 second(s).\n'
				},
				{ type: 'test', state: 'running', test: s1t2 }, {
					type: 'test',
					state: 'failed',
					test: s1t2,
					decorations: [{ line: 14, message: '-> false' }],
					message: '⏱ Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'suite', state: 'running', suite: suite2 },
				{ type: 'test', state: 'running', test: s2t2 }, {
					type: 'test',
					state: 'passed',
					test: s2t2,
					decorations: [],
					message: '⏱ Duration: 0.001294 second(s).\n'
				},
				{ type: 'suite', state: 'completed', suite: suite2 },
				{ type: 'finished' }
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);
		})

		it('should run with wrong xml with exit code', async function () {
			await loadAdapterAndAssert();
			const m = example1.suite1.t1.outputs[0][1].match('<TestCase[^>]+>');
			assert.notStrictEqual(m, undefined);
			assert.notStrictEqual(m!.input, undefined);
			assert.notStrictEqual(m!.index, undefined);
			const part = m!.input!.substr(0, m!.index! + m![0].length);
			const withArgs = imitation.spawnStub.withArgs(
				example1.suite1.execPath, example1.suite1.t1.outputs[0][0]);
			withArgs.onCall(withArgs.callCount)
				.returns(new ChildProcessStub(part));

			await adapter.run([s1t1.id]);

			const expected = [
				{ type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 }, {
					type: 'test',
					state: 'failed',
					test: s1t1,
					decorations: [],
					message: '😱 Fatal error: (Wrong Catch2 xml output.)\nError: 1\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' }
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			// this tests the sinon stubs too
			await adapter.run([s1t1.id]);
			assert.deepStrictEqual(adapter.testStatesEvents, [
				...expected, { type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 }, {
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000112 second(s).\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' }
			]);
		})

		it('should run with wrong xml with signal', async function () {
			await loadAdapterAndAssert();
			const m = example1.suite1.t1.outputs[0][1].match('<TestCase[^>]+>');
			assert.notStrictEqual(m, undefined);
			assert.notStrictEqual(m!.input, undefined);
			assert.notStrictEqual(m!.index, undefined);
			const part = m!.input!.substr(0, m!.index! + m![0].length);
			const withArgs = imitation.spawnStub.withArgs(
				example1.suite1.execPath, example1.suite1.t1.outputs[0][0]);
			withArgs.onCall(withArgs.callCount)
				.returns(new ChildProcessStub(part, 'SIGTERM'));

			await adapter.run([s1t1.id]);

			const expected = [
				{ type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 }, {
					type: 'test',
					state: 'failed',
					test: s1t1,
					decorations: [],
					message: '😱 Fatal error: (Wrong Catch2 xml output.)\nError: \'SIGTERM\'\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' }
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			// this tests the sinon stubs too
			await adapter.run([s1t1.id]);

			assert.deepStrictEqual(adapter.testStatesEvents, [
				...expected, { type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 }, {
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000112 second(s).\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' }
			]);
		})

		it('should timeout not inside a test case', async function () {
			this.timeout(8000);
			this.slow(4000);
			await settings.updateConfig('defaultRunningTimeoutSec', 3);
			await loadAdapterAndAssert();
			const withArgs = imitation.spawnStub.withArgs(
				example1.suite1.execPath, example1.suite1.t1.outputs[0][0]);
			const cp = new ChildProcessStub(undefined, 'SIGTERM');
			const spyKill = <sinon.SinonSpy<never, void>>sinon.spy(cp, 'kill');
			cp.write('<?xml version="1.0" encoding="UTF-8"?><Catch name="suite1">'); // no close
			withArgs.onCall(withArgs.callCount).returns(cp);

			const start = Date.now();
			await adapter.run([s1t1.id]);
			const elapsed = Date.now() - start;
			assert.ok(3000 <= elapsed && elapsed <= 5000, elapsed.toString());
			assert.strictEqual(spyKill.callCount, 2);

			cp.close();

			await waitFor(this, () => {
				return adapter.testStatesEvents.length >= 4;
			});

			assert.deepStrictEqual(adapter.testStatesEvents, [
				{ type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' }
			]);
		})

		it('should timeout inside a test case', async function () {
			this.timeout(8000);
			this.slow(4000);
			await settings.updateConfig('defaultRunningTimeoutSec', 3);
			await loadAdapterAndAssert();
			const withArgs = imitation.spawnStub.withArgs(
				example1.suite1.execPath, example1.suite1.t1.outputs[0][0]);
			const cp = new ChildProcessStub(undefined, 'SIGTERM');
			const spyKill = <sinon.SinonSpy<never, void>>sinon.spy(cp, 'kill');
			cp.write(['<?xml version="1.0" encoding="UTF-8"?>',
				'<Catch name="suite1">',
				'  <Group name="suite1">',
				'    <TestCase name="s1t1" description="tag1" filename="suite1.cpp" line="7">',
			].join(EOL)); // no close
			withArgs.onCall(withArgs.callCount).returns(cp);

			const start = Date.now();
			await adapter.run([s1t1.id]);
			const elapsed = Date.now() - start;
			assert.ok(3000 <= elapsed && elapsed <= 5000, elapsed.toString());
			assert.strictEqual(spyKill.callCount, 2);

			cp.close();

			await waitFor(this, () => {
				return adapter.testStatesEvents.length >= 6;
			});

			assert.deepStrictEqual(adapter.testStatesEvents, [
				{ type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 },
				{
					type: 'test',
					state: 'failed',
					test: s1t1,
					decorations: [],
					message: '⌛️ Timed out: "catch2TestExplorer.defaultRunningTimeoutSec": 3 second(s).\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' }
			]);
		})

		it('should cancel without error', async function () {
			await loadAdapterAndAssert();
			adapter.cancel();
		})

		it('cancels', async function () {
			// since taskQueue/allTasks has benn added it works differently, so it
			// wont test anything really, but i dont want to delete it either
			await loadAdapterAndAssert();
			let spyKill1: sinon.SinonSpy<never, void>;
			let spyKill2: sinon.SinonSpy<never, void>;
			{
				const spawnEvent =
					new ChildProcessStub(example1.suite1.outputs[2][1]);
				spyKill1 =
					<sinon.SinonSpy<never, void>>sinon.spy(spawnEvent, 'kill');
				const withArgs = imitation.spawnStub.withArgs(
					example1.suite1.execPath, example1.suite1.outputs[2][0]);
				withArgs.onCall(withArgs.callCount).returns(spawnEvent);
			}
			{
				const spawnEvent =
					new ChildProcessStub(example1.suite2.outputs[2][1]);
				spyKill2 =
					<sinon.SinonSpy<never, void>>sinon.spy(spawnEvent, 'kill');
				const withArgs = imitation.spawnStub.withArgs(
					example1.suite2.execPath, example1.suite2.outputs[2][0]);
				withArgs.onCall(withArgs.callCount).returns(spawnEvent);
			}
			const run = adapter.run([root.id]);
			adapter.cancel();
			await run;

			assert.equal(spyKill1.callCount, 0);
			assert.equal(spyKill2.callCount, 0);

			const running: TestRunStartedEvent = { type: 'started', tests: [root.id] };

			const s1running: TestSuiteEvent = { type: 'suite', state: 'running', suite: suite1 };
			const s1finished: TestSuiteEvent = { type: 'suite', state: 'completed', suite: suite1 };
			assert.ok(adapter.getTestStatesEventIndex(running) < adapter.getTestStatesEventIndex(s1running));
			assert.ok(adapter.getTestStatesEventIndex(s1running) < adapter.getTestStatesEventIndex(s1finished));

			const s2running: TestSuiteEvent = { type: 'suite', state: 'running', suite: suite2 };
			const s2finished: TestSuiteEvent = { type: 'suite', state: 'completed', suite: suite2 };
			assert.ok(adapter.getTestStatesEventIndex(running) < adapter.getTestStatesEventIndex(s1running));
			assert.ok(adapter.getTestStatesEventIndex(s2running) < adapter.getTestStatesEventIndex(s2finished));

			const s2t2running: TestEvent = { type: 'test', state: 'running', test: s2t2 };
			assert.ok(adapter.getTestStatesEventIndex(s2running) < adapter.getTestStatesEventIndex(s2t2running));

			const s2t2finished: TestEvent = { type: 'test', state: 'skipped', test: s2t2 };
			assert.ok(adapter.getTestStatesEventIndex(s2t2running) < adapter.getTestStatesEventIndex(s2t2finished));
			assert.ok(adapter.getTestStatesEventIndex(s2t2finished) < adapter.getTestStatesEventIndex(s2finished));

			const finished: TestRunFinishedEvent = { type: 'finished' };
			assert.ok(adapter.getTestStatesEventIndex(s1finished) < adapter.getTestStatesEventIndex(finished));
			assert.ok(adapter.getTestStatesEventIndex(s2finished) < adapter.getTestStatesEventIndex(finished));

			assert.equal(adapter.testStatesEvents.length, 16, inspect(adapter.testStatesEvents));
		})

		it('cancels after run finished', async function () {
			await loadAdapterAndAssert();
			let spyKill1: sinon.SinonSpy<never, void>;
			let spyKill2: sinon.SinonSpy<never, void>;
			{
				const spawnEvent =
					new ChildProcessStub(example1.suite1.outputs[2][1]);
				spyKill1 =
					<sinon.SinonSpy<never, void>>sinon.spy(spawnEvent, 'kill');
				const withArgs = imitation.spawnStub.withArgs(
					example1.suite1.execPath, example1.suite1.outputs[2][0]);
				withArgs.onCall(withArgs.callCount).returns(spawnEvent);
			}
			{
				const spawnEvent =
					new ChildProcessStub(example1.suite2.outputs[2][1]);
				spyKill2 =
					<sinon.SinonSpy<never, void>>sinon.spy(spawnEvent, 'kill');
				const withArgs = imitation.spawnStub.withArgs(
					example1.suite2.execPath, example1.suite2.outputs[2][0]);
				withArgs.onCall(withArgs.callCount).returns(spawnEvent);
			}
			await adapter.run([root.id]);
			adapter.cancel();
			assert.equal(spyKill1.callCount, 0);
			assert.equal(spyKill2.callCount, 0);
		})

		it('reloads because of fswatcher event: touch(changed)',
			async function () {
				await loadAdapterAndAssert();
				const newRoot = await adapter.doAndWaitForReloadEvent(this, () => {
					suite1Watcher.sendChange();
				});
				assert.deepStrictEqual(newRoot, root);
				assert.deepStrictEqual(
					adapter.testLoadsEvents,
					[{ type: 'started' }, { type: 'finished', suite: root }]);
			});

		it('reloads because of fswatcher event: double touch(changed)',
			async function () {
				await loadAdapterAndAssert();
				const oldRoot = root;
				suite1Watcher.sendChange();
				suite1Watcher.sendChange();
				await waitFor(this, async () => {
					return adapter.testLoadsEvents.length >= 2;
				});
				await promisify(setTimeout)(100);
				assert.deepStrictEqual(
					adapter.testLoadsEvents,
					[{ type: 'started' }, { type: 'finished', suite: oldRoot }]);
				adapter.testLoadsEvents.pop();
				adapter.testLoadsEvents.pop();
			});

		it('reloads because of fswatcher event: double touch(changed) with delay',
			async function () {
				await loadAdapterAndAssert();
				const oldRoot = root;
				suite1Watcher.sendChange();
				setTimeout(() => {
					suite1Watcher.sendChange();
				}, 20);
				await waitFor(this, async () => {
					return adapter.testLoadsEvents.length >= 2;
				});
				await promisify(setTimeout)(100);
				assert.deepStrictEqual(
					adapter.testLoadsEvents,
					[{ type: 'started' }, { type: 'finished', suite: oldRoot }]);
				adapter.testLoadsEvents.pop();
				adapter.testLoadsEvents.pop();
			});

		it('reloads because of fswatcher event: touch(delete,create)',
			async function () {
				await loadAdapterAndAssert();
				const newRoot = await adapter.doAndWaitForReloadEvent(this, () => {
					suite1Watcher.sendDelete();
					suite1Watcher.sendCreate();
				});
				assert.deepStrictEqual(newRoot, root);
				assert.deepStrictEqual(
					adapter.testLoadsEvents,
					[{ type: 'started' }, { type: 'finished', suite: root }]);
			});

		it('reloads because of fswatcher event: double touch(delete,create)',
			async function () {
				await loadAdapterAndAssert();
				const oldRoot = root;
				suite1Watcher.sendChange();
				suite1Watcher.sendChange();
				await waitFor(this, async () => {
					return adapter.testLoadsEvents.length >= 2;
				});
				await promisify(setTimeout)(100);
				assert.deepStrictEqual(
					adapter.testLoadsEvents,
					[{ type: 'started' }, { type: 'finished', suite: oldRoot }]);
				adapter.testLoadsEvents.pop();
				adapter.testLoadsEvents.pop();
			});

		it('reloads because of fswatcher event: double touch(delete,create) with delay',
			async function () {
				await loadAdapterAndAssert();
				const oldRoot = root;
				suite1Watcher.sendChange();
				setTimeout(() => {
					suite1Watcher.sendChange();
				}, 20);
				await waitFor(this, async () => {
					return adapter.testLoadsEvents.length >= 2;
				});
				await promisify(setTimeout)(100);
				assert.deepStrictEqual(
					adapter.testLoadsEvents,
					[{ type: 'started' }, { type: 'finished', suite: oldRoot }]);
				adapter.testLoadsEvents.pop();
				adapter.testLoadsEvents.pop();
			});

		it('reloads because of fswatcher event: test added', async function () {
			await loadAdapterAndAssert();
			const testListOutput = example1.suite1.outputs[1][1].split('\n');
			assert.equal(testListOutput.length, 10);
			testListOutput.splice(1, 0, '  s1t0', '    suite1.cpp:6', '    tag1');
			const withArgs = imitation.spawnStub.withArgs(
				example1.suite1.execPath, example1.suite1.outputs[1][0]);
			withArgs.onCall(withArgs.callCount)
				.returns(new ChildProcessStub(testListOutput.join(EOL)));

			const oldRootChildren = [...root.children];
			const oldSuite1Children = [...suite1.children];
			const oldSuite2Children = [...suite2.children];

			const newRoot = await adapter.doAndWaitForReloadEvent(this, () => {
				suite1Watcher.sendDelete();
				suite1Watcher.sendCreate();
			});

			assert.equal(newRoot, root);
			assert.equal(root.children.length, oldRootChildren.length);
			for (let i = 0; i < oldRootChildren.length; i++) {
				assert.equal(root.children[i], oldRootChildren[i]);
			}

			assert.equal(suite1.children.length, oldSuite1Children.length + 1);
			for (let i = 0; i < oldSuite1Children.length; i++) {
				const c1 = <TestInfo>suite1.children[i + 1];
				const c2 = <TestInfo>oldSuite1Children[i];
				assert.deepStrictEqual(
					[c1.file, c1.id, c1.label, c1.line, c1.skipped, c1.type],
					[c2.file, c2.id, c2.label, c2.line, c2.skipped, c2.type],
					inspect(i));
			}
			const newTest = suite1.children[0];
			assert.ok(!uniqueIdC.has(newTest.id));
			assert.equal(newTest.label, 's1t0');

			assert.equal(suite2.children.length, oldSuite2Children.length);
			for (let i = 0; i < suite2.children.length; i++) {
				assert.equal(suite2.children[i], oldSuite2Children[i]);
			}
		})

		it('reloads because new tests found under run', async function () {
			await loadAdapterAndAssert();
			const testListOutput = example1.suite1.outputs[1][1].split('\n');
			assert.equal(testListOutput.length, 10);
			testListOutput.splice(1, 6);
			imitation.spawnStub
				.withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0])
				.returns(new ChildProcessStub(testListOutput.join(EOL)));

			assert.strictEqual(suite1.children.length, 2);

			await adapter.load();

			assert.equal(adapter.testLoadsEvents.length, 2);
			root = (<TestLoadFinishedEvent>adapter.testLoadsEvents[adapter.testLoadsEvents.length - 1])
				.suite!;
			assert.equal(root.children.length, 2);
			suite1 = <TestSuiteInfo>root.children[0];

			assert.strictEqual(suite1.children.length, 0);

			imitation.spawnStub
				.withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0])
				.returns(new ChildProcessStub(example1.suite1.outputs[1][1]));

			const testLoadEventCount = adapter.testLoadsEvents.length;
			await adapter.run([suite1.id]);

			const expected = [
				{ type: 'started', tests: [suite1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' }
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);

			await waitFor(this, function () {
				return suite1.children.length == 2 &&
					adapter.testStatesEvents.length >= 4 + 8;
			});

			assert.strictEqual(adapter.testLoadsEvents.length, testLoadEventCount + 2);
			assert.strictEqual(suite1.children.length, 2);
			s1t1 = suite1.children[0];
			assert.strictEqual(s1t1.label, 's1t1');
			s1t2 = suite1.children[1];
			assert.strictEqual(s1t2.label, 's1t2');

			assert.deepStrictEqual(adapter.testStatesEvents, [
				...expected,
				{ type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 },
				{
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000132 second(s).\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' },
				{ type: 'started', tests: [s1t2.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t2 },
				{
					type: 'test',
					state: 'failed',
					test: s1t2,
					decorations: [{ line: 14, message: '-> false' }],
					message: '⏱ Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' },
			]);
		})

		it('reloads because removed test found under running suite',
			async function () {
				await loadAdapterAndAssert();
				const testListOutput = example1.suite1.outputs[1][1].split('\n');
				assert.equal(testListOutput.length, 10);
				testListOutput.splice(1, 3);
				imitation.spawnStub
					.withArgs(
						example1.suite1.execPath, example1.suite1.outputs[1][0])
					.returns(new ChildProcessStub(testListOutput.join(EOL)));
				const testOutput = example1.suite1.outputs[2][1].split('\n');
				assert.equal(testOutput.length, 21);
				testOutput.splice(3, 3);
				imitation.spawnStub
					.withArgs(
						example1.suite1.execPath, example1.suite1.outputs[2][0])
					.returns(new ChildProcessStub(testOutput.join(EOL)));

				assert.strictEqual(suite1.children.length, 2);

				const testLoadEventCount = adapter.testLoadsEvents.length;
				await adapter.run([suite1.id]);

				suite1.children.shift();
				const expected = [
					{ type: 'started', tests: [suite1.id] },
					{ type: 'suite', state: 'running', suite: suite1 },
					{ type: 'test', state: 'running', test: s1t2 },
					{
						type: 'test',
						state: 'failed',
						test: s1t2,
						decorations: [{ line: 14, message: '-> false' }],
						message: '⏱ Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
					},
					{ type: 'suite', state: 'completed', suite: suite1 },
					{ type: 'finished' },
				];
				assert.deepStrictEqual(adapter.testStatesEvents, expected);

				await waitFor(this, function () {
					return suite1.children.length == 1 &&
						adapter.testLoadsEvents.length == testLoadEventCount + 2;
				}, 2000);

				assert.strictEqual(adapter.testLoadsEvents.length, testLoadEventCount + 2);
				assert.strictEqual(suite1.children.length, 1);
			})

		it('reloads because removed test found under running the removed one',
			async function () {
				await loadAdapterAndAssert();
				const testListOutput = example1.suite1.outputs[1][1].split('\n');
				assert.equal(testListOutput.length, 10);
				testListOutput.splice(1, 3);
				imitation.spawnStub
					.withArgs(
						example1.suite1.execPath, example1.suite1.outputs[1][0])
					.returns(new ChildProcessStub(testListOutput.join(EOL)));
				const testOutput = example1.suite1.t1.outputs[0][1].split('\n');
				assert.equal(testOutput.length, 10);
				testOutput.splice(3, 3);
				imitation.spawnStub
					.withArgs(
						example1.suite1.execPath, example1.suite1.t1.outputs[0][0])
					.returns(new ChildProcessStub(testOutput.join(EOL)));

				assert.strictEqual(suite1.children.length, 2);

				const testLoadEventCount = adapter.testLoadsEvents.length;
				await adapter.run([s1t1.id]);

				suite1.children.shift();
				const expected = [
					{ type: 'started', tests: [s1t1.id] },
					{ type: 'suite', state: 'running', suite: suite1 },
					{ type: 'suite', state: 'completed', suite: suite1 },
					{ type: 'finished' },
				];
				assert.deepStrictEqual(adapter.testStatesEvents, expected);

				await waitFor(this, function () {
					return suite1.children.length == 1 &&
						adapter.testLoadsEvents.length == testLoadEventCount + 2;
				}, 2000);

				assert.strictEqual(adapter.testLoadsEvents.length, testLoadEventCount + 2);
				assert.strictEqual(suite1.children.length, 1);
			})

		it('reloads because of fswatcher event: test deleted',
			async function () {
				await loadAdapterAndAssert();
				const testListOutput = example1.suite1.outputs[1][1].split('\n');
				assert.equal(testListOutput.length, 10);
				testListOutput.splice(1, 3);
				const withArgs = imitation.spawnStub.withArgs(
					example1.suite1.execPath, example1.suite1.outputs[1][0]);
				withArgs.onCall(withArgs.callCount)
					.returns(new ChildProcessStub(testListOutput.join(EOL)));

				const oldRootChildren = [...root.children];
				const oldSuite1Children = [...suite1.children];
				const oldSuite2Children = [...suite2.children];

				const newRoot = await adapter.doAndWaitForReloadEvent(this, () => {
					suite1Watcher.sendDelete();
					suite1Watcher.sendCreate();
				});

				assert.equal(newRoot, root);
				assert.equal(root.children.length, oldRootChildren.length);
				for (let i = 0; i < oldRootChildren.length; i++) {
					assert.equal(root.children[i], oldRootChildren[i]);
				}

				assert.equal(suite1.children.length + 1, oldSuite1Children.length);
				for (let i = 0; i < suite1.children.length; i++) {
					const c1 = <TestInfo>suite1.children[i];
					const c2 = <TestInfo>oldSuite1Children[i + 1];
					assert.deepStrictEqual(
						[c1.file, c1.id, c1.label, c1.line, c1.skipped, c1.type],
						[c2.file, c2.id, c2.label, c2.line, c2.skipped, c2.type]);
				}

				assert.equal(suite2.children.length, oldSuite2Children.length);
				for (let i = 0; i < suite2.children.length; i++) {
					assert.equal(suite2.children[i], oldSuite2Children[i]);
				}
			})

		it('reloads because test was renamed', async function () {
			await loadAdapterAndAssert();
			assert.ok(example1.suite1.outputs[1][1].indexOf('s1t1') != -1);
			const testListOutput =
				example1.suite1.outputs[1][1].replace('s1t1', 's1-t1');
			imitation.spawnStub
				.withArgs(example1.suite1.execPath, example1.suite1.outputs[1][0])
				.returns(new ChildProcessStub(testListOutput));
			assert.ok(example1.suite1.outputs[2][1].indexOf('s1t1') != -1);
			const testOutput =
				example1.suite1.outputs[2][1].replace('s1t1', 's1-t1');
			imitation.spawnStub
				.withArgs(example1.suite1.execPath, example1.suite1.outputs[2][0])
				.returns(new ChildProcessStub(testOutput));

			assert.strictEqual(suite1.children.length, 2);

			await adapter.run([suite1.id]);

			await waitFor(this, function () {
				return adapter.testStatesEvents.length >= 6 + 6 && adapter.testLoadsEvents.length == 2;
			}, 2000);

			assert.strictEqual(suite1.children.length, 2);
			assert.strictEqual(suite1.children[0].label, 's1-t1');
			s1t1 = suite1.children[0];

			const expected = [
				{ type: 'started', tests: [suite1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t2 },
				{
					type: 'test',
					state: 'failed',
					test: s1t2,
					decorations: [{ line: 14, message: '-> false' }],
					message: '⏱ Duration: 0.000204 second(s).\n>>> "s1t2" at line 13 -> REQUIRE at line 15:\n  Original:\n    std::false_type::value\n  Expanded:\n    false\n<<<\n\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' },
				{ type: 'started', tests: [s1t1.id] },
				{ type: 'suite', state: 'running', suite: suite1 },
				{ type: 'test', state: 'running', test: s1t1 },
				{
					type: 'test',
					state: 'passed',
					test: s1t1,
					decorations: [],
					message: '⏱ Duration: 0.000132 second(s).\n'
				},
				{ type: 'suite', state: 'completed', suite: suite1 },
				{ type: 'finished' },
			];
			assert.deepStrictEqual(adapter.testStatesEvents, expected);
		})

		it('data arrives in pieces', async function () {
			await loadAdapterAndAssert();
			const testListOutput = example1.suite1.outputs[2][1].split('\n');
			assert.equal(testListOutput.length, 21);
			const newOutput: string[] = [
				testListOutput[0] + EOL + testListOutput[1].substr(10) + EOL,
				testListOutput[2].substr(10) + EOL,
				testListOutput[3].substr(10) + EOL,
				testListOutput
					.filter((v: string, i: number) => {
						return i > 3;
					})
					.map((v: string) => {
						return v.substr(10);
					})
					.join(EOL) +
				EOL + EOL,
			];
			const withArgs = imitation.spawnStub.withArgs(
				example1.suite1.execPath, example1.suite1.outputs[2][0]);
			withArgs.onCall(withArgs.callCount)
				.returns(new ChildProcessStub(newOutput));

			await adapter.run([suite1.id]);
		})
	})

	context('executables=[{<regex>}] and env={...}', function () {
		beforeEach(async function () {
			this.timeout(8000);
			await settings.updateConfig(
				'executables', [{
					name: '${relDirpath}/${filename} (${absDirpath})',
					path: 'execPath{1,2}',
					cwd: '${workspaceFolder}/cwd',
					env: {
						C2LOCALTESTENV: 'c2localtestenv',
						C2OVERRIDETESTENV: 'c2overridetestenv-l'
					}
				}]);
			await settings.updateConfig('defaultEnv', {
				'C2GLOBALTESTENV': 'c2globaltestenv',
				'C2OVERRIDETESTENV': 'c2overridetestenv-g',
			});

			imitation.vsfsWatchStub
				.withArgs(imitation.createAbsVscodeRelativePatternMatcher(
					path.join(settings.workspaceFolderUri.fsPath, 'execPath{1,2}')))
				.callsFake(imitation.createCreateFSWatcherHandler(watchers));

			imitation.vsFindFilesStub
				.withArgs(imitation.createAbsVscodeRelativePatternMatcher(
					path.join(settings.workspaceFolderUri.fsPath, 'execPath{1,2}')))
				.resolves([
					vscode.Uri.file(example1.suite1.execPath),
					vscode.Uri.file(example1.suite2.execPath),
				]);
		})

		it('should get execution options', async function () {
			{
				await loadAdapter();
				const withArgs = imitation.spawnStub.withArgs(
					example1.suite1.execPath, example1.suite1.outputs[2][0]);
				withArgs.onCall(withArgs.callCount)
					.callsFake((p: string, args: string[], ops: any) => {
						assert.equal(
							ops.cwd, path.join(settings.workspaceFolderUri.fsPath, 'cwd'));
						assert.equal(ops.env.C2LOCALTESTENV, 'c2localtestenv');
						assert.ok(!ops.env.hasOwnProperty('C2GLOBALTESTENV'));
						assert.equal(
							ops.env.C2OVERRIDETESTENV, 'c2overridetestenv-l');
						return new ChildProcessStub(example1.suite1.outputs[2][1]);
					});

				const cc = withArgs.callCount;
				await adapter.run([root.id]);
				assert.equal(withArgs.callCount, cc + 1);
			}
			{
				const withArgs = imitation.spawnStub.withArgs(
					example1.suite2.execPath, example1.suite2.outputs[2][0]);
				withArgs.onCall(withArgs.callCount)
					.callsFake((p: string, args: string[], ops: any) => {
						assert.equal(
							ops.cwd, path.join(settings.workspaceFolderUri.fsPath, 'cwd'));
						assert.equal(ops.env.C2LOCALTESTENV, 'c2localtestenv');
						assert.ok(!ops.env.hasOwnProperty('C2GLOBALTESTENV'));
						assert.equal(
							ops.env.C2OVERRIDETESTENV, 'c2overridetestenv-l');
						return new ChildProcessStub(example1.suite2.outputs[2][1]);
					});
				const cc = withArgs.callCount;
				await adapter.run([root.id]);
				assert.equal(withArgs.callCount, cc + 1);
			}
		})
	})

	context(
		'executables=["execPath1", "execPath2", "execPath3"]',
		async function () {
			beforeEach(function () {
				this.timeout(8000);
				return settings.updateConfig(
					'executables', ['execPath1', 'execPath2', 'execPath3']);
			})

			it('run suite3 one-by-one', async function () {
				await loadAdapter();
				assert.equal(root.children.length, 3);
				assert.equal(root.children[0].type, 'suite');
				const suite3 = <TestSuiteInfo>root.children[2];
				assert.equal(suite3.children.length, 33);

				imitation.spawnStub.withArgs(example1.suite3.execPath).throwsArg(1);

				const runAndCheckEvents = async (test: TestInfo) => {
					assert.equal(adapter.testStatesEvents.length, 0);

					await adapter.run([test.id]);

					assert.equal(adapter.testStatesEvents.length, 6, inspect(test));

					assert.deepStrictEqual(
						{ type: 'started', tests: [test.id] }, adapter.testStatesEvents[0]);
					assert.deepStrictEqual(
						{ type: 'suite', state: 'running', suite: suite3 },
						adapter.testStatesEvents[1]);

					assert.equal(adapter.testStatesEvents[2].type, 'test');
					assert.equal((<TestEvent>adapter.testStatesEvents[2]).state, 'running');
					assert.equal((<TestEvent>adapter.testStatesEvents[2]).test, test);

					assert.equal(adapter.testStatesEvents[3].type, 'test');
					assert.ok(
						(<TestEvent>adapter.testStatesEvents[3]).state == 'passed' ||
						(<TestEvent>adapter.testStatesEvents[3]).state == 'skipped' ||
						(<TestEvent>adapter.testStatesEvents[3]).state == 'failed');
					assert.equal((<TestEvent>adapter.testStatesEvents[3]).test, test);

					assert.deepStrictEqual(
						{ type: 'suite', state: 'completed', suite: suite3 },
						adapter.testStatesEvents[4]);
					assert.deepStrictEqual({ type: 'finished' }, adapter.testStatesEvents[5]);

					while (adapter.testStatesEvents.length) adapter.testStatesEvents.pop();
				};

				for (let test of suite3.children) {
					assert.equal(test.type, 'test');
					await runAndCheckEvents(<TestInfo>test);
				}
			})
		})
})
