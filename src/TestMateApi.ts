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
  cwd: string;
  cmd: string;
  args: string[];
  env: Record<string, string | undefined>;
}

export interface TestMateTestRunHandler {
  /**
   * The same executable can be run parallel so the coverage information might be generated parallel.
   * Or they might sharing some resources exclusively? In that case: `false`
   * Can be dynamic:
   * ```
   * get allowExecutableConcurrentInvocations() { return vscode.workspace.getConfiguration(configSection).get<boolean>('allowExecutableConcurrentInvocations', false); }
   * ```
   * Limitation applies for `TestMateTestRunProfile` instance, so other profile/Coverage tool can be run parallel with this.
   */
  readonly allowExecutableConcurrentInvocations?: boolean;

  /**
   * During this callback, one can do the global init part.
   * Use `testRun.token` !!!
   * @param progress Same as in case of {@linkcode vscode.window.withProgress}
   */
  init?: (progress: vscode.Progress<{ message?: string; increment?: number }>) => void | Promise<void>;

  /**
   * Called before the executable's process is spawned.
   * Use `testRun.token` !!!
   * @param builder if `mapTestRunProcessBuilder` is defined the the its result value
   */
  beginProcess?: (builder: TestMateProcessBuilder) => void | Promise<void>;

  /**
   * Called after the executable's process is spawned.
   * Use `testRun.token` !!!
   * @param builder if {@linkcode mapTestRunProcessBuilder} is defined the the its result value
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
   * @param progress Same as in case of {@linkcode vscode.window.withProgress}
   */
  finalise?: (progress: vscode.Progress<{ message?: string; increment?: number }>) => void | Promise<void>;

  /**
   * If you need to change something for the call of the exec, return with the modifed.
   * IMPORTANT: Whatever is the result of this mapping the spawned process's output should not be change, it should remain parsable!!
   * IMPORTANT: ONLY test-run will use this mapped values, discover and test listing WON'T.
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

export interface TestMateTestRunProfileAdapter {
  /**
   * Will be used to create coverage profile. Example: "gcov (by ...)"
   */
  readonly label: string;

  /**
   * You probably want to use `vscode.TestRunProfileKind.Coverage`
   */
  readonly kind: vscode.TestRunProfileKind;

  /**
   * Profile test tag. If specified, only the tests having the same tag can be used with this profile.
   * Best practice to give an option to your users to set this tag and they can also set `testMate.cpp.test.advancedExecutables[].testTags` as well.
   * This way it Coverage will only on those executables.
   */
  readonly tag?: vscode.TestTag;

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
    testRun: TestMateTestRun,
    fileCoverage: vscode.FileCoverage,
    token: vscode.CancellationToken,
  ) => Promise<vscode.FileCoverageDetail[]>;

  /**
   * If this method is present, a configuration gear will be present in the
   * UI, and this method will be invoked when it's clicked. When called,
   * you can take other editor actions, such as showing a quick pick or
   * opening a configuration file.
   */
  configureHandler?: () => void;

  dispose(): void;
}

export interface TestMateTestRunProfile {
  /**
   * Label shown to the user in the UI.
   *
   * Note that the label has some significance if the user requests that
   * tests be re-run in a certain way. For example, if tests were run
   * normally and the user requests to re-run them in debug mode, the editor
   * will attempt use a configuration with the same label of the `Debug`
   * kind. If there is no such configuration, the default will be used.
   */
  label: string;

  /**
   * Associated tag for the profile. If this is set, only {@link vscode.TestItem}
   * instances with the same tag will be eligible to execute in this profile.
   */
  tag: vscode.TestTag | undefined;

  dispose(): void;
}

export interface TestMateAPI {
  /**
   * Call this to register your (Coverage) Profile Adapter.
   * To change / refresh an existing profile: dispose and recreate.
   * User is responsible to dispose the `adapter` and the `profile`: `context.subscriptions.push(adapter, profile)`
   * Profile will depend on the adapter so first the profile should be disposed then the adapter.
   */
  createTestRunProfile(adapter: TestMateTestRunProfileAdapter): TestMateTestRunProfile;
}
