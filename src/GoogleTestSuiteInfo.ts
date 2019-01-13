//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { SpawnOptions } from 'child_process';
import * as fs from 'fs';
import { inspect } from 'util';
import { TestEvent } from 'vscode-test-adapter-api';

import { GoogleTestInfo } from './GoogleTestInfo';
import * as c2fs from './FsWrapper';
import { TestSuiteInfoBase, TestSuiteInfoBaseRunInfo } from './TestSuiteInfoBase';
import { Parser } from 'xml2js';
import { SharedVariables } from './SharedVariables';

export class GoogleTestSuiteInfo extends TestSuiteInfoBase {
	children: GoogleTestInfo[] = [];

	constructor(
		shared: SharedVariables,
		origLabel: string,
		execPath: string,
		execOptions: SpawnOptions) {
		super(shared, origLabel, execPath, execOptions);
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
		const tmpFilePath = (this.execOptions.cwd || '.')
			+ '/tmp_gtest_output_' + Math.random().toString(36) + '_.xml.tmp';
		return c2fs
			.spawnAsync(
				this.execPath,
				[
					"--gtest_list_tests",
					"--gtest_output=xml:" + tmpFilePath
				],
				this.execOptions)
			.then((googleTestListOutput) => {
				const oldChildren = this.children;
				this.children = [];

				if (googleTestListOutput.stderr) {
					this._shared.log.warn('reloadChildren -> googleTestListOutput.stderr: ', googleTestListOutput);
					this._createGoogleTestInfo(undefined, '⚠️ ' + googleTestListOutput.stderr.split('\n')[0].trim(),
						undefined, undefined, undefined);
					return;
				}
				try {
					const testOutputStr = fs.readFileSync(tmpFilePath, 'utf8');
					let xml: any = undefined;
					new Parser({ explicitArray: true }).parseString(testOutputStr, (err: any, result: any) => {
						if (err) {
							this._shared.log.error(err.toString());
							throw err;
						} else {
							xml = result;
						}
					});

					fs.unlink(tmpFilePath, (err: any) => {
						if (err)
							this._shared.log.error('Couldn\'t remove tmpFilePath: ' + tmpFilePath, err);
					});

					for (let i = 0; i < xml.testsuites.testsuite.length; ++i) {
						const suiteName = xml.testsuites.testsuite[i].$.name;
						for (let j = 0; j < xml.testsuites.testsuite[i].testcase.length; j++) {
							const test = xml.testsuites.testsuite[i].testcase[j];
							const testNameFull = suiteName + '.' + test.$.name;
							let valueParam: string | undefined = undefined;
							if (test.$.hasOwnProperty('value_param'))
								valueParam = test.$.value_param;

							const index = oldChildren.findIndex(c => c.testNameFull == testNameFull);
							this._createGoogleTestInfo(index != -1 ? oldChildren[index].id : undefined,
								testNameFull, valueParam, this._findFilePath(test.$.file), test.$.line - 1);
						}
					}

				} catch (e) {
					this._shared.log.error('Couldn\'t parse output file. It is trying to parse the output: ', googleTestListOutput);

					this.children = [];

					let lines = googleTestListOutput.stdout.split(/\r?\n/);

					while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

					if (lines.length == 0) throw Error('Wrong test list.');

					for (let i = 0; i < lines.length;) {
						if (lines[i][0] == ' ')
							this._shared.log.error(
								'Wrong test list output format: ' + lines.toString());

						const testClassNameFull = lines[i++];

						while (i < lines.length && lines[i].startsWith('  ')) {
							let testNameFull = testClassNameFull + lines[i].trim();
							let valueParam: string | undefined = undefined;
							const getParamStr = '# GetParam() =';
							const hash = testNameFull.indexOf(getParamStr);
							if (hash != -1) {
								valueParam = testNameFull.substr(hash + getParamStr.length).trim();
								testNameFull = testNameFull.substr(0, hash).trim();
							}

							const index = oldChildren.findIndex(c => c.testNameFull == testNameFull);
							this._createGoogleTestInfo(index != -1 ? oldChildren[index].id : undefined,
								testNameFull, valueParam, undefined, undefined);
							++i;
						}
					}
				}
			});
	}

	private _createGoogleTestInfo(
		id: string | undefined, testName: string,
		valueParam: string | undefined,
		file: string | undefined, line: number | undefined): GoogleTestInfo {
		const test = new GoogleTestInfo(this._shared, id, testName, valueParam, file, line, this.execPath, this.execOptions);

		this._addChild(test);

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

		if (this._shared.rngSeed !== null) {
			execParams.push('--gtest_random_seed='
				+ (this._shared.rngSeed === 'time' ? '0' : this._shared.rngSeed.toString()));
		}

		return execParams;
	}

	protected _handleProcess(runInfo: TestSuiteInfoBaseRunInfo): Promise<void> {
		const data = new class {
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
							this._shared.log.info('Test', data.currentChild.testNameFull, 'has started.');
							const ev = data.currentChild.getStartEvent();
							this._shared.testStatesEmitter.fire(ev);
						} else {
							this._shared.log.warn('TestCase not found in children: ' + testNameFull);
						}

						data.buffer = data.buffer.substr(m.index!);
					} else {
						const testEndRe = /^(?:\[       OK \]|\[  FAILED  \]) .+$/m;
						const m = data.buffer.match(testEndRe);
						if (m == null) return;

						const testCase = data.buffer.substring(0, m.index! + m[0].length);

						if (data.currentChild !== undefined) {
							this._shared.log.info('Test ', data.currentChild.testNameFull, 'has finished.');
							try {
								const ev: TestEvent = data.currentChild.parseAndProcessTestCase(testCase);
								if (!this._shared.isEnabledSourceDecoration)
									ev.decorations = undefined;
								if (runInfo.timeout)
									ev.message = this._getTimeoutMessage(runInfo.timeout);
								this._shared.testStatesEmitter.fire(ev);
								data.processedTestCases.push(data.currentChild);
							} catch (e) {
								this._shared.log.error(
									'parsing and processing test: ' + data.currentChild.label);
							}
						} else {
							this._shared.log.info(
								'Test case found without TestInfo: ', this, '; ' + testCase);
							data.unprocessedTestCases.push(testCase);
						}

						data.inTestCase = false;
						data.currentChild = undefined;
						data.buffer = data.buffer.substr(m.index! + m[0].length);
					}
				} while (data.buffer.length > 0 && --invariant > 0);
				if (invariant == 0) {
					runInfo.process && runInfo.process.kill();
					reject('Possible infinite loop of this extension');
				}
			};

			runInfo.process!.stdout.on('data', (chunk: Uint8Array) => {
				processChunk(chunk.toLocaleString());
			});

			runInfo.process!.on('error', (err: Error) => {
				reject(err);
			});

			runInfo.process!.on('close', (code: number | null, signal: string | null) => {
				if (code !== null && code !== undefined)
					resolve(code);
				if (signal !== null && signal !== undefined)
					reject(signal);
				else
					reject('unknown');
			});

		}).catch(
			(reason: any) => {
				runInfo.process && runInfo.process.kill();
				this._shared.log.warn(runInfo, reason, this, data);
				return reason;
			}).then((codeOrReason: number | string | any) => {
				if (data.inTestCase) {
					if (data.currentChild !== undefined) {
						this._shared.log.warn('data.currentChild !== undefined: ', data);
						const ev: TestEvent = {
							type: 'test',
							test: data.currentChild!,
							state: 'failed',
						};
						if (runInfo.timeout != undefined) {
							ev.message = this._getTimeoutMessage(runInfo.timeout);
						} else {
							ev.message = 'Fatal error: (Wrong Google Test output.)\nError: ' + inspect(codeOrReason) + '\n';
						}
						this._shared.testStatesEmitter.fire(ev);
					} else {
						this._shared.log.warn('data.inTestCase: ', data);
					}
				}

				const isTestRemoved = (runInfo.timeout == undefined)
					&& ((runInfo.childrenToRun === 'all'
						&& this.children.filter(c => !c.skipped).length > data.processedTestCases.length)
						|| (runInfo.childrenToRun !== 'all' && data.processedTestCases.length == 0));

				if (data.unprocessedTestCases.length > 0 || isTestRemoved) {
					new Promise<void>((resolve, reject) => {
						this._shared.loadWithTaskEmitter.fire(() => {
							return this.reloadChildren().then(resolve, reject);
						});
					}).then(() => {
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
								events.push(ev);
							} catch (e) {
								this._shared.log.error('parsing and processing test: ' + testCase);
							}
						}
						events.length && this._shared.sendTestEventEmitter.fire(events);
					}, (reason: any) => {
						// Suite possibly deleted: It is a dead suite.
						this._shared.log.error('reloading-error: ', reason);
					});
				}
			});
	}
}
