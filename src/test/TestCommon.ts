//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

const deepStrictEqual = require('deep-equal');
import * as assert from 'assert';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as fse from 'fs-extra';
import { inspect, promisify } from 'util';
import { EventEmitter } from 'events';
import { Readable } from 'stream';

import {
	TestEvent,
	TestLoadFinishedEvent,
	TestLoadStartedEvent,
	TestRunFinishedEvent,
	TestRunStartedEvent,
	TestSuiteEvent,
	TestSuiteInfo,
} from 'vscode-test-adapter-api';

import * as my from '../TestAdapter';

///

export const isWin = process.platform === 'win32';

///

export namespace settings {
	assert.notStrictEqual(vscode.workspace.workspaceFolders, undefined);
	assert.equal(vscode.workspace.workspaceFolders!.length, 1);

	export const workspaceFolderUri = vscode.workspace.workspaceFolders![0].uri;
	export const workspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceFolderUri)!;
	export const dotVscodePath = path.join(workspaceFolderUri.fsPath, '.vscode');

	export function getConfig() {
		return vscode.workspace.getConfiguration(
			'catch2TestExplorer', workspaceFolderUri);
	}

	export function updateConfig(key: string, value: any) {
		return getConfig().update(key, value);
	}

	export function resetConfig(): Thenable<void> {
		const packageJson = fse.readJSONSync(
			path.join(workspaceFolderUri.fsPath, '../..', 'package.json'));
		const properties: { [prop: string]: any }[] =
			packageJson['contributes']['configuration']['properties'];
		let t: Thenable<void> = Promise.resolve();
		Object.keys(properties).forEach(key => {
			assert.ok(key.startsWith('catch2TestExplorer.'));
			const k = key.substr('catch2TestExplorer.'.length);
			if (k == 'logfile') return;
			t = t.then(function () {
				return getConfig().update(k, undefined);
			});
		});
		return t;
	}
}

export async function waitFor(
	context: Mocha.Context, condition: Function,
	timeout?: number): Promise<void> {
	if (timeout === undefined) timeout = context.timeout();
	const start = Date.now();
	let c = await condition();
	while (!(c = await condition()) &&
		(Date.now() - start < timeout || !context.enableTimeouts()))
		await promisify(setTimeout)(32);
	assert.ok(c, 'title: ' + (context.test ? context.test.title : '?')
		+ '\ncondition: ' + condition.toString());
}

///

export class Imitation {
	readonly sinonSandbox = sinon.createSandbox();

	readonly spawnStub: sinon.SinonStub<any[], any> = <any>this.sinonSandbox.stub(child_process, 'spawn').named('spawnStub');
	readonly vsfsWatchStub: sinon.SinonStub<any[], any> = <any>this.sinonSandbox.stub(vscode.workspace, 'createFileSystemWatcher').named('vscode.createFileSystemWatcher');
	readonly fsStatStub: sinon.SinonStub<any[], any> = <any>this.sinonSandbox.stub(fs, 'stat').named('fsStat');
	readonly fsReadFileSyncStub: sinon.SinonStub<any[], any> = <any>this.sinonSandbox.stub(fs, 'readFileSync').named('fsReadFileSync');
	readonly vsFindFilesStub: sinon.SinonStub<[vscode.GlobPattern | sinon.SinonMatcher], Thenable<vscode.Uri[]>> = <sinon.SinonStub<[vscode.GlobPattern], Thenable<vscode.Uri[]>>>this.sinonSandbox.stub(vscode.workspace, 'findFiles').named('vsFindFilesStub');

	constructor() { this.reset(); }

	restore() { this.sinonSandbox.restore(); }

	reset() {
		this.sinonSandbox.reset();
		this.spawnStub.callThrough();
		this.vsfsWatchStub.callThrough();
		this.fsStatStub.callThrough();
		this.fsReadFileSyncStub.callThrough();
		this.vsFindFilesStub.callThrough();
	}

	createVscodeRelativePatternMatcher(p: string) {
		return sinon.match((actual: vscode.RelativePattern) => {
			const required = new vscode.RelativePattern(settings.workspaceFolder, p);
			return required.base == actual.base && required.pattern == actual.pattern;
		});
	}

	createAbsVscodeRelativePatternMatcher(p: string) {
		return this.createVscodeRelativePatternMatcher(
			path.relative(settings.workspaceFolderUri.fsPath, p));
	}

	handleStatFileExists(
		path: string,
		cb: (err: NodeJS.ErrnoException | null, stats: fs.Stats | undefined) =>
			void) {
		cb(null, <fs.Stats>{
			isFile() {
				return true;
			},
			isDirectory() {
				return false;
			}
		});
	}

	handleStatFileNotExists(
		path: string,
		cb: (err: NodeJS.ErrnoException | null | any, stats: fs.Stats | undefined) =>
			void) {
		cb({
			code: 'ENOENT',
			errno: -2,
			message: 'ENOENT',
			path: path,
			syscall: 'stat'
		},
			undefined);
	}

	createCreateFSWatcherHandler(watchers: Map<string, FileSystemWatcherStub>) {
		return (p: vscode.RelativePattern, ignoreCreateEvents: boolean,
			ignoreChangeEvents: boolean, ignoreDeleteEvents: boolean) => {
			const pp = path.join(p.base, p.pattern);
			const e = new FileSystemWatcherStub(
				vscode.Uri.file(pp), ignoreCreateEvents, ignoreChangeEvents,
				ignoreDeleteEvents);
			watchers.set(pp, e);
			return e;
		};
	}
}

///

export class TestAdapter extends my.TestAdapter {
	public readonly testLoadsEvents: (TestLoadStartedEvent | TestLoadFinishedEvent)[] = [];
	private readonly testLoadsEventsConnection: vscode.Disposable;

	public readonly testStatesEvents: (TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent)[] = [];
	private readonly testStatesEventsConnection: vscode.Disposable;

	constructor() {
		super(settings.workspaceFolder);

		this.testLoadsEventsConnection =
			this.tests((e: TestLoadStartedEvent | TestLoadFinishedEvent) => {
				this.testLoadsEvents.push(e);
			});

		this.testStatesEventsConnection = this.testStates(
			(e: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent) => {
				this.testStatesEvents.push(e);
			});
	}

	dispose() { throw Error('should have called waitAndDispose'); }

	async waitAndDispose(context: Mocha.Context) {

		await waitFor(context, () => {
			return (<any>this)._mainTaskQueue._count == 0;
		});

		super.dispose();

		this.testLoadsEventsConnection.dispose();
		this.testStatesEventsConnection.dispose();

		// check
		for (let i = 0; i < this.testLoadsEvents.length; i++) {
			assert.deepStrictEqual(
				this.testLoadsEvents[i], { type: 'started' },
				inspect({ index: i, testsEvents: this.testLoadsEvents }));
			i++;
			assert.ok(
				i < this.testLoadsEvents.length,
				inspect({ index: i, testLoadsEvents: this.testLoadsEvents }));
			assert.equal(
				this.testLoadsEvents[i].type, 'finished',
				inspect({ index: i, testsEvents: this.testLoadsEvents }));
		}
	}

	get rootSuite(): TestSuiteInfo { return (<any>this)._rootSuite; }

	getSuite(index: number) {
		assert.ok(this.rootSuite.children.length > index);
		assert.strictEqual(this.rootSuite.children[index].type, 'suite');
		return <TestSuiteInfo>this.rootSuite.children[index];
	}

	get suite1() { return this.getSuite(0); }
	get suite2() { return this.getSuite(1); }
	get suite3() { return this.getSuite(2); }
	get suite4() { return this.getSuite(3); }

	getTestStatesEventIndex(searchFor: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent) {
		const i = this.testStatesEvents.findIndex(
			(v: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent) => {
				return deepStrictEqual(searchFor, v);
			});
		assert.notStrictEqual(
			i, -1,
			'getTestStatesEventIndex failed to find: ' + inspect(searchFor) + '\n\nin\n\n' +
			inspect(this.testStatesEvents));
		return i;
	}

	async doAndWaitForReloadEvent(context: Mocha.Context, action: Function): Promise<TestSuiteInfo> {
		const origCount = this.testLoadsEvents.length;
		await action();
		await waitFor(context, () => {
			return this.testLoadsEvents.length >= origCount + 2;
		});
		assert.equal(this.testLoadsEvents.length, origCount + 2, action.toString());
		assert.equal(this.testLoadsEvents[this.testLoadsEvents.length - 1].type, 'finished');
		const e = <TestLoadFinishedEvent>this.testLoadsEvents[this.testLoadsEvents.length - 1];
		assert.ok(e.suite !== undefined);
		assert.strictEqual(e.suite, this.rootSuite);
		return e.suite!;
	}
}

///

export class ChildProcessStub extends EventEmitter {
	readonly stdout: Readable;
	readonly stderr: Readable;
	public closed: boolean = false;

	private _read() {
		//this.stdout.push(null);
	}

	constructor(stdout?: string | Iterable<string>, close?: number | string, stderr?: string) {
		super();
		this.stdout = new Readable({ 'read': () => { this._read(); } });
		this.stderr = new Readable({ 'read': () => { this._read(); } });
		this.stdout.on('end', () => {
			this.closed = true;
			if (close === undefined)
				this.emit('close', 1, null);
			else if (typeof close === 'string')
				this.emit('close', null, close);
			else
				this.emit('close', close, null);
		});
		if (stderr !== undefined) {
			this.stderr.push(stderr);
			this.stderr.push(null);
		}
		if (stdout !== undefined) {
			if (typeof stdout !== 'string') {
				for (let line of stdout) {
					this.write(line);
				}
				this.close();
			} else {
				this.writeAndClose(stdout);
			}
		}
	}

	kill() {
		this.stdout.push(null);
		this.stderr.push(null);
	}

	write(data: string): void {
		this.stdout.push(data);
	}

	close(): void {
		this.stdout.push(null);
		this.stderr.push(null);
	}

	writeAndClose(data: string): void {
		this.write(data);
		this.close();
	}

	writeLineByLineAndClose(data: string): void {
		const lines = data.split('\n');
		lines.forEach((l) => {
			this.write(l);
		});
		this.close();
	}
}

///

export class FileSystemWatcherStub implements vscode.FileSystemWatcher {
	constructor(
		private readonly path: vscode.Uri,
		readonly ignoreCreateEvents: boolean = false,
		readonly ignoreChangeEvents: boolean = false,
		readonly ignoreDeleteEvents: boolean = false) { }

	private readonly _onDidCreateEmitter = new vscode.EventEmitter<vscode.Uri>();
	private readonly _onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private readonly _onDidDeleteEmitter = new vscode.EventEmitter<vscode.Uri>();

	sendCreate() {
		this._onDidCreateEmitter.fire(this.path);
	}
	sendChange() {
		this._onDidChangeEmitter.fire(this.path);
	}
	sendDelete() {
		this._onDidDeleteEmitter.fire(this.path);
	}

	get onDidCreate(): vscode.Event<vscode.Uri> {
		return this._onDidCreateEmitter.event;
	}
	get onDidChange(): vscode.Event<vscode.Uri> {
		return this._onDidChangeEmitter.event;
	}
	get onDidDelete(): vscode.Event<vscode.Uri> {
		return this._onDidDeleteEmitter.event;
	}

	dispose() {
		this._onDidCreateEmitter.dispose();
		this._onDidChangeEmitter.dispose();
		this._onDidDeleteEmitter.dispose();
	}
}