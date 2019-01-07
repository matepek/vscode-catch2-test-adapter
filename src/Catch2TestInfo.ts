//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { TestEvent } from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js';
import { EOL } from 'os';

import { Catch2TestSuiteInfo } from './Catch2TestSuiteInfo';
import { TestInfoBase } from './TestInfoBase';
import { inspect } from 'util';

export class Catch2TestInfo extends TestInfoBase {
	constructor(
		id: string | undefined,
		testNameFull: string,
		description: string,
		tags: string[],
		file: string,
		line: number,
		parent: Catch2TestSuiteInfo,
	) {
		super(id,
			testNameFull,
			testNameFull + (tags.length > 0 ? ' ' + tags.join('') : ''),
			tags.some((v: string) => { return v.startsWith('[.') || v == '[hide]'; }) || testNameFull.startsWith('./'),
			file,
			line,
			parent);
	}

	getEscapedTestName(): string {
		/*',' has special meaning */
		let t = this.testNameFull;
		t = t.replace(/,/g, '\\,')
		t = t.replace(/\[/g, '\\[');
		t = t.replace(/\*/g, '\\*');
		if (t.startsWith(' ')) t = '*' + t.substr(1);
		return t;
	}

	getDebugParams(breakOnFailure: boolean): string[] {
		const debugParams: string[] = [this.getEscapedTestName(), '--reporter', 'console'];
		if (breakOnFailure) debugParams.push('--break');
		return debugParams;
	}

	parseAndProcessTestCase(xmlStr: string, rngSeed: number | undefined):
		TestEvent {
		let res: any = undefined;
		new xml2js.Parser({ explicitArray: true })
			.parseString(xmlStr, (err: any, result: any) => {
				if (err) {
					throw err;
				} else {
					res = result;
				}
			});

		return this._processXmlTagTestCase(res.TestCase, rngSeed);
	}

	private _processXmlTagTestCase(testCase: any, rngSeed: number | undefined):
		TestEvent {
		try {
			const testEvent: TestEvent = {
				type: 'test',
				test: this,
				state: 'failed',
				message: '',
				decorations: []
			};

			if (rngSeed) {
				testEvent.message += 'Randomness seeded to: ' + rngSeed.toString() + '.\n';
			}

			this._processXmlTagTestCaseInner(testCase, testEvent);

			if (testEvent.message === '') testEvent.message = '';
			if (testEvent.decorations!.length == 0) testEvent.decorations = undefined;

			return testEvent;
		} catch (e) {
			throw e;
		}
	}

	private _processXmlTagTestCaseInner(testCase: any, testEvent: TestEvent):
		void {
		const title = '>>> "' + testCase.$.name + '" at line ' + testCase.$.line;

		if (testCase.OverallResult[0].$.hasOwnProperty('durationInSeconds')) {
			testEvent.message += 'Duration: ' + testCase.OverallResult[0].$.durationInSeconds + ' second(s).\n';
		}

		this._processInfoWarningAndFailureTags(testCase, title, testEvent);

		this._processXmlTagExpressions(testCase, title, testEvent);

		this._processXmlTagSections(testCase, title, testEvent);

		this._processXmlTagFatalErrorConditions(testCase, title, testEvent);


		if (testCase.OverallResult[0].hasOwnProperty('StdOut')) {
			testEvent.message += '>>> std::cout:';
			for (let i = 0; i < testCase.OverallResult[0].StdOut.length; i++) {
				const element = testCase.OverallResult[0].StdOut[i];
				testEvent.message += element.trimRight();
			}
			testEvent.message += '\n<<< std::cout\n';
		}

		if (testCase.OverallResult[0].hasOwnProperty('StdErr')) {
			testEvent.message += '>>> std::err:';
			for (let i = 0; i < testCase.OverallResult[0].StdErr.length; i++) {
				const element = testCase.OverallResult[0].StdErr[i];
				testEvent.message += element.trimRight();
			}
			testEvent.message += '\n<<< std::err\n';
		}

		if (testCase.OverallResult[0].$.success === 'true') {
			testEvent.state = 'passed';
		}
	}

	private _processInfoWarningAndFailureTags(xml: any, title: string, testEvent: TestEvent) {
		if (xml.hasOwnProperty('Info')) {
			for (let j = 0; j < xml.Info.length; ++j) {
				const info = xml.Info[j];
				testEvent.message += '>>> Info: ' + info.trim() + ' <<<\n';
			}
		}
		if (xml.hasOwnProperty('Warning')) {
			for (let j = 0; j < xml.Warning.length; ++j) {
				const warning = xml.Warning[j];
				testEvent.message += '>>> Warning: ' + warning.trim() + ' <<<\n';
			}
		}
		if (xml.hasOwnProperty('Failure')) {
			for (let j = 0; j < xml.Failure.length; ++j) {
				const failure = xml.Failure[j];
				testEvent.message += '>>> Failure: ' + failure._.trim() + ' <<<\n';
				testEvent.decorations!.push({
					line: Number(failure.$.line) - 1 /*It looks vscode works like this.*/,
					message: '-> ' + failure._.split(EOL)
						.map((l: string) => l.trim())
						.filter((l: string) => l.length > 0)
						.join('; ')
				});
			}
		}
	}

	private _processXmlTagExpressions(xml: any, title: string, testEvent: TestEvent) {
		if (xml.hasOwnProperty('Expression')) {
			for (let j = 0; j < xml.Expression.length; ++j) {
				const expr = xml.Expression[j];
				try {
					testEvent.message += title + ' -> '
						+ (expr.$.type ? expr.$.type : '<unknown>')
						+ ' at line ' + expr.$.line + ':\n'
						+ '  Original:\n    '
						+ expr.Original.map((x: string) => x.trim()).join('; ') + '\n'
						+ '  Expanded:\n    '
						+ expr.Expanded.map((x: string) => x.trim()).join('; ') + '\n'
						+ '<<<\n\n';
					testEvent.decorations!.push({
						line: Number(expr.$.line) - 1 /*It looks vscode works like this.*/,
						message:
							'-> ' + expr.Expanded.map((x: string) => x.trim()).join('; ')
					});
				} catch (error) {
					this.parent.allTests.log.error(error);
				}
				this._processXmlTagFatalErrorConditions(expr, title, testEvent);
			}
		}
	}

	private _processXmlTagSections(xml: any, title: string, testEvent: TestEvent):
		void {
		if (xml.hasOwnProperty('Section')) {
			for (let j = 0; j < xml.Section.length; ++j) {
				const section = xml.Section[j];
				try {
					title += ' -> "' + section.$.name + '" at line ' + section.$.line;

					this._processInfoWarningAndFailureTags(xml, title, testEvent);

					this._processXmlTagExpressions(section, title, testEvent);

					this._processXmlTagSections(section, title, testEvent);
				} catch (error) {
					this.parent.allTests.log.error(error);
				}
			}
		}
	}

	private _processXmlTagFatalErrorConditions(expr: any, title: string, testEvent: TestEvent):
		void {
		if (expr.hasOwnProperty('FatalErrorCondition')) {
			try {
				for (let j = 0; j < expr.FatalErrorCondition.length; ++j) {
					const fatal = expr.FatalErrorCondition[j];

					testEvent.message += title + ' -> at line ' + expr.$.line + ':\n';
					if (fatal.hasOwnProperty('_')) {
						testEvent.message += '  Fatal error: ' + fatal._.trim() + '\n';
					} else {
						testEvent.message += '  Unknown fatal error: ' + inspect(fatal) + '\n';
					}
					testEvent.message += '<<<\n\n';
				}
			}
			catch (error) {
				this.parent.allTests.log.error(error);
				testEvent.message += 'Unknown fatal error: ' + inspect(error);
			}
		}
	}
}