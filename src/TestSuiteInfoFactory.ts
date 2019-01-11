//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { Catch2TestSuiteInfo } from './Catch2TestSuiteInfo';
import { GoogleTestSuiteInfo } from './GoogleTestSuiteInfo';
import { SpawnOptions } from 'child_process';
import { SharedVariables } from './SharedVariables';

export class TestSuiteInfoFactory {
	constructor(
		private readonly _shared: SharedVariables,
		private readonly _label: string,
		private readonly _execPath: string,
		private readonly _execOptions: SpawnOptions
	) { }

	create(
		framework: { type: 'catch2' | 'google' | undefined; version: [number, number, number]; }):
		Catch2TestSuiteInfo | GoogleTestSuiteInfo {
		if (framework.type === 'google')
			return new GoogleTestSuiteInfo(this._shared, this._label, this._execPath, this._execOptions);
		else if (framework.type === 'catch2')
			return new Catch2TestSuiteInfo(this._shared, this._label, this._execPath, this._execOptions,
				[framework.version[0], framework.version[1], framework.version[2]]);
		else
			throw Error('createTestSuiteInfo: ' + this._execPath + ': not test executable.');
	}
}