import * as vscode from 'vscode';

//////////////////////////////////
/* Guide:
 * Be aware that an executable can be run parallel so the coverage information might be generated parallel. Are the sharing some resources?
 * Use the token and check cancellation!
 * Check `endProcess` for `result` status, maybe only successful run should be handled. Depends on your case and intetions.
 * Use `finalise` and/or `onDidDispose` to clean things up / free up memory.
 */
///////////////////////////////////

export interface TestMateTestRun {
  /**
   * A cancellation token which will be triggered when the test run is
   * canceled from the UI.
   */
  readonly token: vscode.CancellationToken;

  /**
   * Adds coverage for a file in the run.
   */
  addCoverage(fileCoverage: vscode.FileCoverage): void;

  /**
   * Probably don't need to use it but just in case...
   * Appends raw output from the test runner. On the user's request, the
   * output will be displayed in a terminal. ANSI escape sequences,
   * such as colors and text styles, are supported. New lines must be given
   * as CRLF (`\r\n`) rather than LF (`\n`).
   *
   * @param output Output text to append.
   */
  appendOutput(output: string): void;

  /**
   * An event fired when the editor is no longer interested in data
   * associated with the test run.
   */
  onDidDispose: vscode.Event<void>;
}

///

export interface TestMateProcessBuilder {
  cmd: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
}

export interface TestMateTestRunHandler {
  /**
   * During this callback, one can do the global init part.
   * Use `testRun.token` !!!
   */
  init?: () => void | Promise<void>;

  /**
   * Called before the executable's process is spawned.
   * Use `testRun.token` !!!
   * @param builder if `mapTestRunProcessBuilder` is defined the the its result value
   */
  beginProcess?: (builder: TestMateProcessBuilder) => void | Promise<void>;

  /**
   * Called after the executable's process is spawned.
   * Use `testRun.token` !!!
   * @param builder if `mapTestRunProcessBuilder` is defined the the its result value
   */
  endProcess?: (
    builder: TestMateProcessBuilder,
    result: 'OK' | 'CancelledByUser' | 'TimeoutByUser' | 'Errored',
  ) => void | Promise<void>;

  /**
   * Will be called after all the tests (TestRun) are finished. Can do some cleanup and/or summing up the results.
   * Use `testRun.addCoverage` to add/update/overwrite coverage info. https://code.visualstudio.com/api/extension-guides/testing#test-coverage
   * Use `testRun.token` !!!
   *
   * Note: Do not dispose your detailed coverage, `loadDetailedCoverage` still can be called.
   *       Can use WeakMap<vscode.FileCoverage, MyCoverageDetails> or subclassing. See vscode api docs
   */
  finalise?: () => void | Promise<void>;

  /**
   * If you need to change something for the call of the exec, return with the modifed.
   * IMPORTANT: Whatever is the result of this mapping the process's output should not change to remain parsable!!
   * IMPORTANT: ONLY test run will apply the mapped value, discover and test listing WONT.
   * Example:
   * ```
   *   return {
   *     ...builder,
   *     cmd: 'coverage.exe',
   *     args: ['--exec', builder.cmd, '--exec_args', ...builder.args],
   *     env: { ...builder.env, OVERRIDE_THIS: 'new value' },
   *   }
   * ```
   *
   * @param builder Executable would be called with this normally
   * @returns Executable will be called with this.
   */
  mapTestRunProcessBuilder?: (
    builder: TestMateProcessBuilder,
  ) => TestMateProcessBuilder | Promise<TestMateProcessBuilder>;
}

export interface TestMateTestRunProfile {
  /**
   * Will be used to create coverage profile. Example: "gcov (by ...)"
   */
  label: string;

  /**
   * You probably want to use `vscode.TestRunProfileKind.Coverage`
   */
  readonly kind: vscode.TestRunProfileKind;
  /**
   * The same executable can be run parallel so the coverage information might be generated parallel.
   * Or they might sharing some resources exclusively? In that case: `false`
   * Can be dynamic:
   * ```
   * get allowExecutableConcurrentInvocations() { return vscode.workspace.getConfiguration(configSection).get<boolean>('allowExecutableConcurrentInvocations', false); }
   * ```
   * Limitation applies for `TestMateTestRunProfile` instance, so other profile/Coverage tool can be run parallel with this.
   */
  readonly allowExecutableConcurrentInvocations: boolean;

  /**
   * TestMate will call this when user initiates a test run
   */
  createTestRunHandler(testRun: TestMateTestRun, workspaceFolder: vscode.WorkspaceFolder): TestMateTestRunHandler;

  /**
   * See: https://code.visualstudio.com/api/extension-guides/testing#test-coverage
   * @param fileCoverage same as were added by testRun.addCoverage(...)
   * @param token Must be used!
   */
  loadDetailedCoverage?: (
    fileCoverage: vscode.FileCoverage,
    token: vscode.CancellationToken,
  ) => Promise<vscode.FileCoverageDetail[]>;

  dispose(): void;
}

export interface TestMateAPI {
  /**
   * Call this to register your Coverage Adapter. Can be called multiple times if has multiple profiles. (See vscode api for more info)
   */
  registerTestRunProfile(adapter: TestMateTestRunProfile): void;
}
