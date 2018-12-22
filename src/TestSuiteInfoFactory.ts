//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { Catch2TestSuiteInfo } from './Catch2TestSuiteInfo';
import { GoogleTestSuiteInfo } from './GoogleTestSuiteInfo';
import { RootTestSuiteInfo } from './RootTestSuiteInfo';
import { SpawnOptions } from 'child_process';

export class TestSuiteInfoFactory {
	constructor(
		private readonly _label: string,
		private readonly _allTests: RootTestSuiteInfo,
		private readonly _execPath: string,
		private readonly _execOptions: SpawnOptions
	) { }

	create(
		framework: { type: 'catch2' | 'google' | undefined; version: [number, number, number]; }):
		Catch2TestSuiteInfo | GoogleTestSuiteInfo {
		if (framework.type === 'google')
			return new GoogleTestSuiteInfo(this._label, this._allTests, this._execPath, this._execOptions);
		else if (framework.type === 'catch2')
			return new Catch2TestSuiteInfo(this._label, this._allTests, this._execPath, this._execOptions,
				[framework.version[0], framework.version[1], framework.version[2]]);
		else
			throw Error('createTestSuiteInfo: ' + this._execPath + ': not test executable.');
	}
}