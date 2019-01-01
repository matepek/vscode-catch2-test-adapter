//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { SpawnOptions } from 'child_process';
import { inspect } from 'util';
import { TestEvent } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';

import { RootTestSuiteInfo } from './RootTestSuiteInfo';
import { Catch2TestInfo } from './Catch2TestInfo';
import * as c2fs from './FsWrapper';
import { TestSuiteInfoBase, TestSuiteInfoBaseRunInfo } from './TestSuiteInfoBase';

export class Catch2TestSuiteInfo extends TestSuiteInfoBase {
	children: Catch2TestInfo[] = [];

	constructor(
		origLabel: string,
		allTests: RootTestSuiteInfo,
		execPath: string,
		execOptions: SpawnOptions,
		private _catch2Version: [number, number, number] | undefined) {
		super(origLabel, allTests, execPath, execOptions);
	}

	reloadChildren(): Promise<void> {
		return TestSuiteInfoBase.determineTestTypeOfExecutable(this.execPath)
			.then((testInfo) => {
				if (testInfo.type === 'catch2') {
					this._catch2Version = testInfo.version;
					if (this._catch2Version[0] > 2 || this._catch2Version[0] < 2)
						this.allTests.log.warn('Unsupported Cathc2 version: ' + inspect(this._catch2Version));
					return this._reloadCatch2Tests();
				}
				throw Error('Not a catch2 test executable: ' + this.execPath);
			});
	}

	private _reloadCatch2Tests(): Promise<void> {
		return c2fs
			.spawnAsync(
				this.execPath,
				[
					"[.],*", "--verbosity", "high", "--list-tests",
					"--use-colour", "no"
				],
				this.execOptions)
			.then((catch2TestListOutput) => {
				const oldChildren = this.children;
				this.children = [];

				if (catch2TestListOutput.stderr) {
					this.allTests.log.warn('reloadChildren -> catch2TestListOutput.stderr: ' + inspect(catch2TestListOutput));
					this._createCatch2TestInfo(undefined, '!! ' + catch2TestListOutput.stderr.split('\n')[0].trim(), '', [], '', 0);
					return;
				}

				let lines = catch2TestListOutput.stdout.split(/\r?\n/);

				while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

				if (lines.length == 0) throw Error('Wrong test list.');

				// first line: 'Matching test cases:'
				for (let i = 1; i < lines.length - 1;) {
					if (lines[i][0] != ' ')
						this.allTests.log.error(
							'Wrong test list output format: ' + lines.toString());

					const testNameFull = lines[i++].substr(2);

					let filePath = '';
					let line = 1;
					{
						const fileLine = lines[i++].substr(4);
						const match =
							fileLine.match(/(?:(.+):([0-9]+)|(.+)\(([0-9]+)\))/);

						if (match && match.length == 5) {
							const matchedPath = match[1] ? match[1] : match[3];
							filePath = this._findFilePath(matchedPath);
							line = Number(match[2] ? match[2] : match[4]);
						}
					}

					let description = lines[i++].substr(4);
					if (description.startsWith('(NO DESCRIPTION)'))
						description = '';

					let tags: string[] = [];
					if (lines[i].length > 6 && lines[i][6] === '[') {
						tags = lines[i].trim().split(']');
						tags.pop();
						for (let j = 0; j < tags.length; ++j) tags[j] += ']';
						++i;
					}

					const index = oldChildren.findIndex(c => c.testNameFull == testNameFull);
					this._createCatch2TestInfo(index != -1 ? oldChildren[index].id : undefined,
						testNameFull, description, tags, filePath, line - 1);
				}
			});
	}

	private _createCatch2TestInfo(
		id: string | undefined, testName: string, description: string,
		tags: string[], file: string, line: number): Catch2TestInfo {
		const test =
			new Catch2TestInfo(id, testName, description, tags, file, line, this);

		this._addChild(test);

		return test;
	}

	protected _getRunParams(childrenToRun: Catch2TestInfo[] | 'all'): string[] {
		const execParams: string[] = [];

		if (childrenToRun !== 'all') {
			let testNames: string[] = [];
			for (let i = 0; i < childrenToRun.length; i++) {
				const c = childrenToRun[i];
				testNames.push(c.getEscapedTestName());
			}
			execParams.push(testNames.join(','));
		}

		execParams.push('--reporter');
		execParams.push('xml');
		execParams.push('--durations')
		execParams.push('yes');

		if (this.allTests.isNoThrow) execParams.push('--nothrow');

		if (this.allTests.rngSeed !== null) {
			execParams.push('--rng-seed');
			execParams.push(this.allTests.rngSeed.toString());
		}

		return execParams;
	}

	protected _handleProcess(runInfo: TestSuiteInfoBaseRunInfo): Promise<void> {
		const data = new class {
			buffer: string = '';
			inTestCase: boolean = false;
			currentChild: Catch2TestInfo | undefined = undefined;
			beforeFirstTestCase: boolean = true;
			rngSeed: number | undefined = undefined;
			unprocessedXmlTestCases: string[] = [];
			processedTestCases: Catch2TestInfo[] = [];
		}();

		const testCaseTagRe = /<TestCase(?:\s+[^\n\r]+)?>/;

		return new Promise<number | string | any>((resolve, reject) => {

			const processChunk = (chunk: string) => {
				data.buffer = data.buffer + chunk;
				let invariant = 99999;
				do {
					if (!data.inTestCase) {
						const b = data.buffer.indexOf('<TestCase');
						if (b == -1) return;

						const m = data.buffer.match(testCaseTagRe);
						if (m == null || m.length != 1) return;

						data.inTestCase = true;

						let name: string = '';
						new xml2js.Parser({ explicitArray: true })
							.parseString(m[0] + '</TestCase>', (err: any, result: any) => {
								if (err) {
									this.allTests.log.error(err.toString());
									throw err;
								} else {
									name = result.TestCase.$.name;
								}
							});

						if (data.beforeFirstTestCase) {
							const ri =
								data.buffer.match(/<Randomness\s+seed="([0-9]+)"\s*\/?>/);
							if (ri != null && ri.length == 2) {
								data.rngSeed = Number(ri[1]);
							}
						}

						data.beforeFirstTestCase = false;
						data.currentChild = this.children.find((v: Catch2TestInfo) => {
							// xml output trimmes the name of the test
							return v.testNameFull.trim() == name;
						});

						if (data.currentChild !== undefined) {
							const ev = data.currentChild.getStartEvent();
							this.allTests.testStatesEmitter.fire(ev);
						} else {
							this.allTests.log.error('TestCase not found in children: ' + name);
						}

						data.buffer = data.buffer.substr(b);
					} else {
						const endTestCase = '</TestCase>';
						const b = data.buffer.indexOf(endTestCase);
						if (b == -1) return;

						const testCaseXml = data.buffer.substring(0, b + endTestCase.length);

						if (data.currentChild !== undefined) {
							try {
								const ev: TestEvent = data.currentChild.parseAndProcessTestCase(
									testCaseXml, data.rngSeed);
								if (!this.allTests.isEnabledSourceDecoration)
									ev.decorations = undefined;
								if (runInfo.timeout)
									ev.message = this._getTimeoutMessage(runInfo.timeout);
								this.allTests.testStatesEmitter.fire(ev);
								data.processedTestCases.push(data.currentChild);
							} catch (e) {
								this.allTests.log.error(
									'parsing and processing test: ' + inspect([data.currentChild.label, testCaseXml]));
							}
						} else {
							this.allTests.log.info(
								'<TestCase> found without TestInfo: ' + inspect(this, true, 1) +
								'; ' + testCaseXml);
							data.unprocessedXmlTestCases.push(testCaseXml);
						}

						data.inTestCase = false;
						data.currentChild = undefined;
						data.buffer = data.buffer.substr(b + endTestCase.length);
					}
				} while (data.buffer.length > 0 && --invariant > 0);
				if (invariant == 0) {
					runInfo.process && runInfo.process.kill();
					reject('Possible infinite loop of this extension');
				}
			};

			runInfo.process!.stdout.on('data', (chunk: Uint8Array) => {
				const xml = chunk.toLocaleString();
				processChunk(xml);
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
				this.allTests.log.warn(inspect([runInfo, reason, this, data], true, 2));
				return reason;
			}).then((codeOrReason: number | string | any) => {
				if (data.inTestCase) {
					if (data.currentChild !== undefined) {
						this.allTests.log.warn('data.currentChild !== undefined: ' + inspect(data));
						const ev: TestEvent = {
							type: 'test',
							test: data.currentChild!,
							state: 'failed',
						};
						if (runInfo.timeout !== undefined) {
							ev.message = this._getTimeoutMessage(runInfo.timeout);
						} else {
							ev.message = 'Fatal error: (Wrong Catch2 xml output.)\nError: ' + inspect(codeOrReason) + '\n';
						}
						this.allTests.testStatesEmitter.fire(ev);
					} else {
						this.allTests.log.warn('data.inTestCase: ' + inspect(data));
					}
				}

				const isTestRemoved = (runInfo.childrenToRun === 'all' &&
					this.children.filter(c => !c.skipped).length >
					data.processedTestCases.length) ||
					(runInfo.childrenToRun !== 'all' && data.processedTestCases.length == 0);

				if (data.unprocessedXmlTestCases.length > 0 || isTestRemoved) {
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

							for (let i = 0; i < data.unprocessedXmlTestCases.length; i++) {
								const testCaseXml = data.unprocessedXmlTestCases[i];

								const m = testCaseXml.match(testCaseTagRe);
								if (m == null || m.length != 1) break;

								let name: string | undefined = undefined;
								new xml2js.Parser({ explicitArray: true })
									.parseString(
										m[0] + '</TestCase>', (err: any, result: any) => {
											if (err) {
												this.allTests.log.error(err.toString());
											} else {
												name = result.TestCase.$.name;
											}
										});
								if (name === undefined) break;

								const currentChild = this.children.find((v: Catch2TestInfo) => {
									// xml output trimmes the name of the test
									return v.testNameFull.trim() == name;
								});
								if (currentChild === undefined) break;

								try {
									const ev = currentChild.parseAndProcessTestCase(
										testCaseXml, data.rngSeed);
									events.push(currentChild.getStartEvent());
									events.push(ev);
								} catch (e) {
									this.allTests.log.error('parsing and processing test: ' + testCaseXml);
								}
							}
							events.length && this._sendTestStateEventsWithParent(events);
						});
				}
			});
	}
}
