# Catch2 and Google Test Explorer for Visual Studio Code

[![Travis build status](https://img.shields.io/travis/matepek/vscode-catch2-test-adapter/master.svg?logo=Travis)](https://travis-ci.org/matepek/vscode-catch2-test-adapter)
[![Appveyor build status](https://ci.appveyor.com/api/projects/status/p6uuyg21cwxcnlv9/branch/master?svg=true)](https://ci.appveyor.com/project/matepek/vscode-catch2-test-adapter/branch/master)
[![GitHub issues](https://img.shields.io/github/issues/matepek/vscode-catch2-test-adapter.svg)](https://github.com/matepek/vscode-catch2-test-adapter/issues)
[![GitHub license](https://img.shields.io/github/license/matepek/vscode-catch2-test-adapter.svg)](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/LICENSE)
[![Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/d/matepek.vscode-catch2-test-adapter.svg)](https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter)
[![Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/v/matepek.vscode-catch2-test-adapter.svg)](https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

This extension allows you to run your [Catch2](https://github.com/catchorg/Catch2)
and [Google Test](https://github.com/google/googletest) tests using the
[Test Explorer for VS Code](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

## Features and Screenshots

- Are you new to VSCode? [Check this!](https://code.visualstudio.com/docs/getstarted/settings)
- Finds and recognises the executables by a given glob-pattern (`catch2TestExplorer.executables`).
- Automatically runs executables if it is modified ("_..._" -> "_Enable autorun_") or if a dependency is modified (`dependsOn`)
- Reloads test list of an executable if it is recompiled.
- Supports popular debuggers such as `vadimcn.vscode-lldb`, `webfreak.debug` and `ms-vscode.cpptools`.
- Runs executables parallel (`catch2TestExplorer.workerMaxNumber`).
- Sorts tests and suites (`testExplorer.sort`).

![Screenshot1](resources/Screenshot_2019-05-28.png)
![Screenshot2](resources/Screenshot_2019-05-29.png)

## Configuration

The extension is pre-configured and should find executables inside the working directory which match the following pattern:

> `{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*`.

This basically means executables inside the `build` and `out` directories (recursive) which contain the `test` word in their name (including extensions).

Not good enough for you?!: Edit your `.vscode/settings.json` [file](https://code.visualstudio.com/docs/getstarted/settings) according to the [examples](#Examples) bellow!

| `catch2TestExplorer.___`         | Description                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `executables`                    | The location of your test executables (relative to the workspace folder or absolute path) and with a lot of other setting. [Details](https://github.com/matepek/vscode-catch2-test-adapter#catch2TestExplorerexecutables)                                                                                                                   |
| `defaultCwd`                     | The working directory where the test is run (relative to the workspace folder or absolute path), if it isn't provided in "executables". (It resolves variables.)                                                                                                                                                                            |
| `defaultEnv`                     | Environment variables to be set when running the tests. (It resolves variables.)                                                                                                                                                                                                                                                            |
| `debugConfigTemplate`            | Set the necessary debug configurations and the debug button will work. [Details](https://github.com/matepek/vscode-catch2-test-adapter#catch2TestExplorerdebugConfigTemplate)                                                                                                                                                               |
| `debugBreakOnFailure`            | Debugger breaks on failure while debugging the test. Catch2: [--break](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#breaking-into-the-debugger); Google Test: [--gtest_break_on_failure](https://github.com/google/googletest/blob/master/googletest/docs/advanced.md#turning-assertion-failures-into-break-points); |
| `defaultNoThrow`                 | Skips all assertions that test that an exception is thrown, e.g. REQUIRE_THROWS. This is a Catch2 parameter: [--nothrow](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#eliding-assertions-expected-to-throw);                                                                                                         |
| `defaultRngSeed`                 | Shuffles the tests with the given random. Catch2: [--rng-seed (<integer> or 'time')](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#rng-seed); Google Test: [--gtest_random_seed=<integer>](https://github.com/google/googletest/blob/master/googletest/docs/advanced.md#shuffling-the-tests);                         |
| `defaultWatchTimeoutSec`         | Test executables are being watched (only inside the workspace directory). In case of one recompiles it will try to preserve the test states. If compilation reaches timeout it will drop the suite.                                                                                                                                         |
| `defaultExecParsingTimeoutSec`   | The timeout duration (in seconds) of the test-executable identifier (Calls the exec with `--help`).                                                                                                                                                                                                                                         |
| `defaultRunningTimeoutSec`       | Test executable is running in a process. In case of an infinite loop, it will run forever, unless this parameter is set. It applies instantly. (0 means infinite)                                                                                                                                                                           |
| `workerMaxNumber`                | The variable maximize the number of the parallel test execution. It applies instantly.                                                                                                                                                                                                                                                      |
| `enableTestListCaching`          | (Experimental) In case your executable took too much time to list the tests, one can set this. It will preserve the output of `--gtest_list_tests --gtest_output=xml:...`. (Beware: Older Google Test doesn't support xml test list format.) (Click [here](http://bit.ly/2HFcAC6), if you think it is a useful feature!)                    |
| `logpanel`                       | Creates a new output channel and write the log messages there. For debugging. Enabling it could slow down your vscode.                                                                                                                                                                                                                      |
| `googletest.gmockVerbose`        | Sets [--gmock_verbose=...](https://github.com/google/googlemock/blob/master/googlemock/docs/v1_6/CheatSheet.md#flags). (Note: executable has to be linked to gmock `gmock_main` not `gtest_main`)                                                                                                                                           |
| `googletest.treatGmockWarningAs` | Forces the test to be failed even it is passed if it contains the string `GMOCK_WARNING:`. (You may should consider using [testing::StrictMock<T>](https://github.com/google/googlemock/blob/master/googlemock/docs/CookBook.md#the-nice-the-strict-and-the-naggy))                                                                         |

| `testExplorer.___` | [Description](https://github.com/hbenl/vscode-test-explorer#configuration)                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `errorDecoration`  | Show error messages from test failures as decorations in the editor. [Details](https://github.com/hbenl/vscode-test-explorer#configuration)                   |
| `gutterDecoration` | Show the state of each test in the editor using Gutter Decorations. [Details](https://github.com/hbenl/vscode-test-explorer#configuration)                    |
| `codeLens`         | Show a CodeLens above each test or suite for running or debugging the tests. [Details](https://github.com/hbenl/vscode-test-explorer#configuration)           |
| `onStart`          | Retire or reset all test states whenever a test run is started. [Details](https://github.com/hbenl/vscode-test-explorer#configuration)                        |
| `onReload`         | Retire or reset all test states whenever the test tree is reloaded. [Details](https://github.com/hbenl/vscode-test-explorer#configuration)                    |
| `sort`             | Sort the tests and suites by label or location. If this is not set (or set to null), they will be shown in the order that they were received from the adapter |

**Note** that this extension is built upon the Test Explorer so its
[configuration](https://github.com/hbenl/vscode-test-explorer#configuration) and [commands](https://github.com/hbenl/vscode-test-explorer#commands)
can be used.

### catch2TestExplorer.executables

This variable can be

- a string (ex.: `"out/**/*test.exe"`) or
- an array of strings and objects (ex.: `[ "debug/*test.exe", { "pattern": "release/*test.exe" }, ... ]`).

If it is an object it can contains the following properties:

| Property      | Description                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | The name of the test suite (file). Can contains variables related to `pattern`.                                                                                                                                                                                               |
| `pattern`     | A relative (to workspace directory) or an absolute path or [_glob pattern_](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options). ⚠️**Avoid backslash!**: 🚫`\`; ✅`/`; (required)                                                                  |
| `description` | A less prominent text after the `name`. Can contains variables related to `pattern`.                                                                                                                                                                                          |
| `cwd`         | The current working directory for the test executable. If it isn't provided and `defaultCwd` does, then that will be used. Can contains variables related to `pattern`.                                                                                                       |
| `env`         | Environment variables for the test executable. If it isn't provided and `defaultEnv` does, then that will be used. Can contains variables related to `pattern` and variables related to the process's environment variables (Ex.: `${os_env:PATH}`).                          |
| `dependsOn`   | Array of (relative / absolute) _paths_ / [_glob pattern_](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options) (string[]). If a related file is _changed/created/deleted_ and autorun is enabled in "..." menu it will run the related executables. |

The `pattern` (or the `executables` used as string or an array of strings)
can contain [_search-pattern_](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options).
Also it can contain variables related to the process's environment variables (Ex.: `${os_env:PATH}`).

Test executables and `pattern`s are being watched.
In case of one recompiles it will try to preserve the test states.
If compilation reaches timeout it will drop the suite (`catch2TestExplorer.defaultWatchTimeoutSec`).

**Note** that there is a mechanism which will filter out every possible executable which:

- on windows: NOT ends with `.exe`, `.cmd` or `.bat`.
- on other platforms: ends with one of the following:
  `'.c', '.cmake', '.cpp', '.cxx', '.deb', '.dir', '.gz', '.h', '.hpp', '.hxx', '.ko', '.log', '.o', '.php', '.rpm', '.so', '.tar', '.txt'`.

It won't filter out `'.sh'`, `'.py'` (etc.) files, so that could be used for wrappers.

If the pattern is too general like `out/**/*test*`, it could cause unexpected executable or script execution (with `--help` argument)
which would not just increase the test-loading duration but also could have other unexpected effects.
I suggest to have a stricter file-name convention and a corresponding pattern like `out/**/*.test.*` or `out/**/Test.*`

**Note** to `dependsOn`:

- If "Enable autorun" is enabled in "**...**" menu (next to the play button), it will trigger the related tests.
- It accumulates events with the following strategy: waiting for 2 seconds after the last event.
- Works flawlessly with paths/patterns **inside** of the workspace directory
  (Usually there is no reason to keep your executables outside of the workspace. [See](https://github.com/matepek/vscode-catch2-test-adapter/issues/48).),
- but have some issue/limitation with paths/patterns **outside** of the workspace directory:
  - Theoretically is should support [glob patterns](https://github.com/matepek/vscode-catch2-test-adapter/issues/48),
    but it seem there is an issue with _double star_ (`**`).
  - Paths on different drive in the same `dependsOn` array maybe won't work.
    (If you find another corner case, feel free to open an issue. It could be handy once in the future.)

#### Variables which can be used in `name`, `description`, `cwd` and `env` of `executables`:

| Variable                | Description                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${absPath}`            | Absolute path of the test executable                                                                                                                        |
| `${relPath}`            | Relative path of the test executable to the workspace folder                                                                                                |
| `${absDirpath}`         | Absolute path of the test executable's parent directory                                                                                                     |
| `${relDirpath}`         | Relative path of the test executable's parent directory to the workspace folder                                                                             |
| `${filename}`           | Filename (Path without directories; "`d/a.b.c`" => "`a.b.c`")                                                                                               |
| `${baseFilename}`       | Filename without extension ("`d/a.b.c`" => "`a.b`")                                                                                                         |
| `${extFilename}`        | Filename extension. ("`d/a.b.c`" => "`.c`")                                                                                                                 |
| `${base2Filename}`      | Filename without second extension ("`d/a.b.c`" => "`a`")                                                                                                    |
| `${ext2Filename}`       | Filename's second level extension. ("`d/a.b.c`" => "`.b`")                                                                                                  |
| `${base3Filename}`      | Filename without third extension ("`d/a.b.c`" => "`a`")                                                                                                     |
| `${ext3Filename}`       | Filename's third level extension. ("`d/a.b.c`" => "")                                                                                                       |
| `${workspaceDirectory}` | (You can only guess once.)                                                                                                                                  |
| `${workspaceFolder}`    | Alias of `${workspaceDirectory}`                                                                                                                            |
| `${workspaceName}`      | Workspace name can be custom in case of [`workspace file`](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_workspace-file-schema).         |
| `${name}`               | The resolved `executables`'s name. Can be used only in `cwd` and `env`.                                                                                     |
| `${description}`        | The resolved `executables`'s description. Can be used only in `cwd` and `env`.                                                                              |
| `${cwd}`                | The resolved `executables`'s cwd. Can be used only in `env`.                                                                                                |
| `${os_env:<varname>}`   | Resolves it to the given(`<varname>`) environment variable. Can be used everywhere. On Windows it is case insensitive: `${os_env:pAtH}` == `${os_env:PATH}` |

#### Examples:

```json
"catch2TestExplorer.executables": "dir/test.exe"
```

```json
"catch2TestExplorer.executables": ["dir/test1.exe", "dir/test2.exe"]
```

```json
"catch2TestExplorer.executables": {
	"name": "${filename}",
	"description": "${relDirpath}/",
	"pattern": "{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*",
	"cwd": "${absDirpath}",
	"env": {
		"ExampleENV1": "You can use variables here too, like ${absPath}"
	}
}
```

```json
"catch2TestExplorer.executables": [
	{
		"name": "Test1 suite",
		"pattern": "dir/test.exe"
	},
	"singleTest.exe",
	{
		"pattern": "dir2/{t,T}est",
		"cwd": "out/tmp",
		"env": {}
	}
]
```

### catch2TestExplorer.debugConfigTemplate

If `catch2TestExplorer.debugConfigTemplate` value is `null` (default),
it searches for configurations in the workspacefolder's `.vscode/launch.json`.
It will choose the first one which's `"request"` property is `"launch"` and has `type` property.

In case it hasn't found one it will look after:

1. [`vadimcn.vscode-lldb`](https://github.com/vadimcn/vscode-lldb#quick-start),
2. [`webfreak.debug`](https://github.com/WebFreak001/code-debug),
3. [`ms-vscode.cpptools`](https://github.com/Microsoft/vscode-cpptools)

extensions in order. If it finds one of it, it will use it automatically.
For further details check [VSCode launch config](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations).

**Remark**: This feature to work automatically (value: `null`) has a lot of requirements which are not listed here.
If it works it is good for you.
If it isn't.. I suggest to create your own `"catch2TestExplorer.debugConfigTemplate"` template.
If you read the _Related documents_ and still have a question feel free to open an issue.
Value `"extensionOnly"` will cause to skip the search of local launch configurations.

#### or user can manually fill it

For [`vadimcn.vscode-lldb`](https://github.com/vadimcn/vscode-lldb#quick-start) add something like this to settings.json:

```json
"catch2TestExplorer.debugConfigTemplate": {
  "type": "cppdbg",
  "MIMode": "lldb",
  "program": "${exec}",
  "args": "${args}",
  "cwd": "${cwd}",
  "env": "${envObj}",
  "externalConsole": false
}
```

#### Usable variables:

| Variable name   | Value meaning                                                        | Type                       |
| --------------- | -------------------------------------------------------------------- | -------------------------- |
| `${label}`      | The name of the test. Same as in the Test Explorer.                  | string                     |
| `${suiteLabel}` | The name of parent suites of the test. Same as in the Test Explorer. | string                     |
| `${exec}`       | The path of the executable.                                          | string                     |
| `${argsArray}`  | The arguments for the executable.                                    | string[]                   |
| `${argsStr}`    | Concatenated arguments for the executable.                           | string                     |
| `${cwd}`        | The current working directory for execution.                         | string                     |
| `${envObj}`     | The environment variables as object properties.                      | { [prop: string]: string } |

These variables will be substituted when a DebugConfiguration is created.

Note that `name` and `request` are filled, if they are undefined, so it is not necessary to set them.
`type` is necessary.

## License

[The Unlicense](https://choosealicense.com/licenses/unlicense/)

## Known issues

- (2018-09-03) On windows the navigate to source button isn't working. It is a framework bug.
- (2018-11-17) Catch2: Long (>80 character) filename, test-name or description can cause test-list parsing failures.
  Workaround: `#define CATCH_CONFIG_CONSOLE_WIDTH 300`

For solving issues use: `catch2TestExplorer.logpanel: true` and check the output window.

## Useful / Related

- [Test Explorer Status Bar](https://marketplace.visualstudio.com/items?itemName=connorshea.vscode-test-explorer-status-bar)

## TODOs

- Test cases: google test, catch2: info, warn, fail, stdout, stderr, capture, gtest_skip, gmock_verbose
- gaze is not good enough: detects change and delete, but not creation
- `dependsOn` could contain variables

## [Contribution guideline here](CONTRIBUTING.md)
