import * as vscode from 'vscode';

///

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
  kind: vscode.TestRunProfileKind;

  /**
   * TestMate will call this when user initiates a test run
   */
  createTestRunHandler(testRun: TestMateTestRun): TestMateTestRunHandler;

  /**
   * See: https://code.visualstudio.com/api/extension-guides/testing#test-coverage
   * @param fileCoverage same as the one returned by `TestMateTestRunCoverageExecutableRunHandler.after`
   * @param token Must be used!
   */
  loadDetailedCoverage?: (
    fileCoverage: vscode.FileCoverage,
    token: vscode.CancellationToken,
  ) => Thenable<vscode.FileCoverageDetail[]>;

  dispose(): void;
}

export interface TestMateAPI {
  /**
   * Call this to register your Coverage Adapter. Can be called multiple times if has multiple profiles. (See vscode api for more info)
   */
  registerTestRunProfile(adapter: TestMateTestRunProfile): void;
}

///

class GcovTestMateTestRunHandler implements TestMateTestRunHandler {
  constructor(private readonly testRun: TestMateTestRun) {}

  private readonly data = new Map<TestMateProcessBuilder, object>();

  // async beginProcess(builder: TestMateProcessBuilder): Promise<void> {
  //   // HERE: can collect your coverage data or do nothing and do it in finalise
  //   // example:
  //   this.data.set(builder, {});
  // }

  async endProcess(
    builder: TestMateProcessBuilder,
    result: 'OK' | 'CancelledByUser' | 'TimeoutByUser' | 'Errored',
  ): Promise<void> {
    // HERE: can collect your coverage data or do nothing and do it in finalise
    // example:
    this.data.set(builder, {});
  }

  async finalise(): Promise<void> {
    // HERE: all the processes were spawn and finished. Now you can collect the coverage data and feed this.testRun.addCoverage(...)
    // example:
    for (const [builder, data] of this.data.entries()) {
      // this.testRun.addCoverage(...)
    }
  }

  async mapTestRunProcessBuilder(builder: TestMateProcessBuilder): Promise<TestMateProcessBuilder> {
    // example:
    return {
      ...builder,
      cmd: 'coverage.exe',
      args: ['--exec', builder.cmd, '--exec_args', ...builder.args],
      env: { ...builder.env, OVERRIDE_THIS: 'new value' },
    };
  }
}

class GcovTestMateAdapter implements TestMateTestRunProfile {
  label: string = 'gcov';
  kind: vscode.TestRunProfileKind = vscode.TestRunProfileKind.Coverage;

  private readonly runData = new WeakMap<TestMateTestRun, GcovTestMateTestRunHandler>();

  createTestRunHandler(testRun: TestMateTestRun): TestMateTestRunHandler {
    // HERE: can do some initilisation and cleanup if you want

    const handler = new GcovTestMateTestRunHandler(testRun);
    this.runData.set(testRun, handler);
    return handler;
  }

  dispose(): void {}
}

export function activate(context: vscode.ExtensionContext) {
  const testMateExtension = vscode.extensions.getExtension<TestMateAPI>('testMateExtensionId');

  if (testMateExtension) {
    const testMate = testMateExtension.exports;

    testMate.registerTestRunProfile(new GcovTestMateAdapter());
  }
}
