//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { TestEvent } from 'vscode-test-adapter-api';

import { GoogleTestSuiteInfo } from './GoogleTestSuiteInfo';
import { TestInfoBase } from './TestInfoBase';

export class GoogleTestInfo extends TestInfoBase {
	constructor(
		id: string | undefined,
		testNameFull: string,
		file: string | undefined,
		line: number | undefined,
		parent: GoogleTestSuiteInfo,
	) {
		super(id,
			testNameFull,
			testNameFull,
			testNameFull.startsWith('DISABLED_') || testNameFull.indexOf('.DISABLED_') != -1,
			file,
			line,
			parent);
	}

	getDebugParams(breakOnFailure: boolean): string[] {
		const debugParams: string[] = ['--gtest_color=no', '--gtest_filter=' + this.testNameFull];
		if (breakOnFailure) debugParams.push('--gtest_break_on_failure');
		return debugParams;
	}

	parseAndProcessTestCase(output: string): TestEvent {
		const ev: TestEvent = {
			type: 'test',
			test: this,
			state: 'failed',
			decorations: [],
			message: output,
		};

		const lines = output.split(/\r?\n/);

		if (lines.length < 2) throw Error('unexpected');

		if (lines[lines.length - 1].startsWith('[       OK ]'))
			ev.state = 'passed';

		const failure = /^(.+):([0-9]+): Failure$/;

		for (let i = 1; i < lines.length - 1; ++i) {
			const m = lines[i].match(failure);
			if (m !== null) {
				const lineNumber = Number(m[2]) - 1/*It looks vscode works like this.*/;
				if (i + 2 < lines.length - 1
					&& lines[i + 1].startsWith('Expected: ')
					&& lines[i + 2].startsWith('  Actual: ')) {
					ev.decorations!.push({ line: lineNumber, message: lines[i + 1] + ';  ' + lines[i + 2] });
				} else if (i + 1 < lines.length - 1
					&& lines[i + 1].startsWith('Expected: ')) {
					ev.decorations!.push({ line: lineNumber, message: lines[i + 1] });
				} else if (i + 3 < lines.length - 1
					&& lines[i + 1].startsWith('Value of: ')
					&& lines[i + 2].startsWith('  Actual: ')
					&& lines[i + 3].startsWith('Expected: ')) {
					ev.decorations!.push({ line: lineNumber, message: lines[i + 2].trim() + ';  ' + lines[i + 3].trim() + ';' });
				} else {
					ev.decorations!.push({ line: lineNumber, message: '<-- failure' });
				}
			}
		}

		if (ev.decorations!.length == 0) delete ev.decorations;
		return ev;
	}
}