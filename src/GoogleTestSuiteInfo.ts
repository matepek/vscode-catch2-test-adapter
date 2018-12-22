//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { ChildProcess, SpawnOptions } from 'child_process';
import * as fsx from 'fs-extra';
import { inspect } from 'util';
import { TestEvent } from 'vscode-test-adapter-api';

import { RootTestSuiteInfo } from './RootTestSuiteInfo';
import { TestInfoBase } from './TestInfoBase';
import { GoogleTestInfo } from './GoogleTestInfo';
import * as c2fs from './FsWrapper';
import { TestSuiteInfoBase } from './TestSuiteInfoBase';

export class GoogleTestSuiteInfo extends TestSuiteInfoBase {
	children: GoogleTestInfo[] = [];

	constructor(
		public readonly origLabel: string,
		public readonly allTests: RootTestSuiteInfo,
		public readonly execPath: string,
		public readonly execOptions: SpawnOptions) {
		super(origLabel, allTests, execPath, execOptions);
	}

	reloadChildren(): Promise<void> {
		return TestSuiteInfoBase.determineTestTypeOfExecutable(this.execPath)
			.then((testInfo) => {
				if (testInfo.type === 'google') {
					return this._reloadGoogleTests();
				}
				throw Error('Not a google test executable: ' + this.execPath);
			});
	}

	private _reloadGoogleTests(): Promise<void> {
		const tmpFilePath = (this.execOptions.cwd || '.') + '/tmp_83q5vmip3fm5489w_gtest_output.json.tmp';
		return c2fs
			.spawnAsync(
				this.execPath,
				[
					"--gtest_list_tests",
					"--gtest_output=json:" + tmpFilePath
				],
				this.execOptions)
			.then((googleTestListOutput) => {
				const oldChildren = this.children;
				this.children = [];

				if (googleTestListOutput.stderr) {
					this.allTests.log.warn('reloadChildren -> googleTestListOutput.stderr: ' + inspect(googleTestListOutput));
					this._createGoogleTestInfo(undefined, '!! ' + googleTestListOutput.stderr.split('\n')[0].trim(), undefined, undefined);
					return;
				}
				try {
					const testOutputJson = fsx.readJSONSync(tmpFilePath);

					try { fsx.remove(tmpFilePath); }
					catch (e) { this.allTests.log.error('Couldn\'t remove tmpFilePath: ' + tmpFilePath); }

					for (let i = 0; i < testOutputJson.testsuites.length; ++i) {
						const suiteName = testOutputJson.testsuites[i].name;
						for (let j = 0; j < testOutputJson.testsuites[i].testsuite.length; j++) {
							const test = testOutputJson.testsuites[i].testsuite[j];
							const testNameFull = suiteName + '.' + test.name;

							const index = oldChildren.findIndex(c => c.testNameFull == testNameFull);
							this._createGoogleTestInfo(index != -1 ? oldChildren[index].id : undefined,
								testNameFull, this._findFilePath(test.file), test.line - 1);
						}
					}

				} catch (e) {
					this.children = [];

					let lines = googleTestListOutput.stdout.split(/\r?\n/);

					while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

					if (lines.length == 0) throw Error('Wrong test list.');

					for (let i = 1; i < lines.length;) {
						if (lines[i][0] == ' ')
							this.allTests.log.error(
								'Wrong test list output format: ' + lines.toString());

						const testClassNameFull = lines[i++];

						while (i < lines.length && lines[i].startsWith('  ')) {
							const testNameFull = testClassNameFull + lines[i].trim();

							const index = oldChildren.findIndex(c => c.testNameFull == testNameFull);
							this._createGoogleTestInfo(index != -1 ? oldChildren[index].id : undefined,
								testNameFull, undefined, undefined);
							++i;
						}
					}
				}
			});
	}

	private _createGoogleTestInfo(
		id: string | undefined, testName: string, file: string | undefined, line: number | undefined): GoogleTestInfo {
		const test =
			new GoogleTestInfo(id, testName, file, line, this);

		if (this.children.length == 0) {
			this.file = file;
			this.line = 0;
		} else if (this.file != file) {
			this.file = undefined;
			this.line = undefined;
		}

		let i = this.children.findIndex((v: GoogleTestInfo) => {
			if (test.file && test.line && v.file && v.line) {
				const f = test.file.trim().localeCompare(v.file.trim());
				if (f != 0)
					return f < 0;
				else
					return test.line < v.line;
			} else {
				return false;
			}
		});
		if (i == -1) i = this.children.length;
		this.children.splice(i, 0, test);

		return test;
	}

	protected _getRunParams(childrenToRun: GoogleTestInfo[] | 'all'): string[] {
		const execParams: string[] = ['--gtest_color=no'];

		if (childrenToRun !== 'all') {
			let testNames: string[] = [];
			for (let i = 0; i < childrenToRun.length; i++) {
				const c = childrenToRun[i];
				testNames.push(c.testNameFull);
			}
			execParams.push('--gtest_filter=' + testNames.join(':'));

			execParams.push('--gtest_also_run_disabled_tests');
		}

		if (this.allTests.rngSeed !== null) {
			execParams.push('--gtest_random_seed='
				+ (this.allTests.rngSeed === 'time' ? '0' : this.allTests.rngSeed.toString()));
		}

		return execParams;
	}

	protected _handleProcess(process: ChildProcess, childrenToRun: TestInfoBase[] | 'all'): Promise<void> {
		const data = new class {
			process: ChildProcess | undefined = process;
			buffer: string = '';
			inTestCase: boolean = false;
			currentChild: GoogleTestInfo | undefined = undefined;
			beforeFirstTestCase: boolean = true;
			unprocessedTestCases: string[] = [];
			processedTestCases: GoogleTestInfo[] = [];
		}();

		const testBeginRe = /^\[ RUN      \] (.+)$/m;

		return new Promise<number | string | any>((resolve, reject) => {

			const processChunk = (chunk: string) => {
				data.buffer = data.buffer + chunk;
				let invariant = 99999;
				do {
					if (!data.inTestCase) {
						const m = data.buffer.match(testBeginRe);
						if (m == null) return;

						data.inTestCase = true;

						const testNameFull: string = m[1];

						data.beforeFirstTestCase = false;
						data.currentChild = this.children.find((v: GoogleTestInfo) => {
							return v.testNameFull == testNameFull;
						});

						if (data.currentChild !== undefined) {
							const ev = data.currentChild.getStartEvent();
							this.allTests.testStatesEmitter.fire(ev);
						} else {
							this.allTests.log.warn('TestCase not found in children: ' + testNameFull);
						}

						data.buffer = data.buffer.substr(m.index!);
					} else {
						const testEndRe = /^(\[       OK \]|\[  FAILED  \]) (.+) \(.+\)$/m;
						const m = data.buffer.match(testEndRe);
						if (m == null) return;

						const testCase = data.buffer.substring(0, m.index! + m[0].length);

						if (data.currentChild !== undefined) {
							try {
								const ev: TestEvent = data.currentChild.parseAndProcessTestCase(testCase);
								if (!this.allTests.isEnabledSourceDecoration)
									ev.decorations = undefined;
								this.allTests.testStatesEmitter.fire(ev);
								data.processedTestCases.push(data.currentChild);
							} catch (e) {
								this.allTests.log.error(
									'parsing and processing test: ' + data.currentChild.label);
							}
						} else {
							this.allTests.log.info(
								'Test case found without TestInfo: ' + inspect(this, true, 1) +
								'; ' + testCase);
							data.unprocessedTestCases.push(testCase);
						}

						data.inTestCase = false;
						data.currentChild = undefined;
						data.buffer = data.buffer.substr(m.index! + m[0].length);
					}
				} while (data.buffer.length > 0 && --invariant > 0);
				if (invariant == 0) {
					process.kill();
					reject('Possible infinite loop of this extension');
				}
			};

			process.stdout.on('data', (chunk: Uint8Array) => {
				const xml = chunk.toLocaleString();
				processChunk(xml);
			});

			process.on('error', (err: Error) => {
				reject(err);
			});

			process.on('close', (code: number | null, signal: string | null) => {
				data.process = undefined;

				if (code !== null && code !== undefined)
					resolve(code);
				if (signal !== null && signal !== undefined)
					reject(signal);
				else
					reject('unknown');
			});

		}).catch(
			(reason: any) => {
				process.kill();

				this.allTests.log.warn(inspect([reason, this, data], true, 2));
				return reason;
			}).then((codeOrReason: number | string | any) => {
				if (data.inTestCase) {
					if (data.currentChild !== undefined) {
						this.allTests.log.warn('data.currentChild !== undefined: ' + inspect(data));
						this.allTests.testStatesEmitter.fire({
							type: 'test',
							test: data.currentChild!,
							state: 'failed',
							message: 'Fatal error: Wrong Catch2 xml output. Error: ' + inspect(codeOrReason) + '\n',
						});
					} else {
						this.allTests.log.warn('data.inTestCase: ' + inspect(data));
					}
				}

				const isTestRemoved = (childrenToRun === 'all' &&
					this.children.filter(c => !c.skipped).length >
					data.processedTestCases.length) ||
					(childrenToRun !== 'all' && data.processedTestCases.length == 0);

				if (data.unprocessedTestCases.length > 0 || isTestRemoved) {
					this.allTests
						.sendLoadEvents(() => {
							return this.reloadChildren().catch(e => {
								this.allTests.log.error('reloading-error: ' + inspect(e));
								// Suite possibly deleted: It is a dead suite.
							});
						})
						.then(() => {
							// we have test results for the newly detected tests
							// after reload we can set the results
							const events: TestEvent[] = [];

							for (let i = 0; i < data.unprocessedTestCases.length; i++) {
								const testCase = data.unprocessedTestCases[i];

								const m = testCase.match(testBeginRe);
								if (m == null) break;

								const testNameFull = m[1];

								const currentChild = this.children.find((v: GoogleTestInfo) => {
									return v.testNameFull == testNameFull;
								});
								if (currentChild === undefined) break;
								try {
									const ev = currentChild.parseAndProcessTestCase(testCase);
									events.push(currentChild.getStartEvent());
									events.push(ev);
								} catch (e) {
									this.allTests.log.error('parsing and processing test: ' + testCase);
								}
							}
							events.length && this._sendTestStateEventsWithParent(events);
						});
				}
			});
	}
}
