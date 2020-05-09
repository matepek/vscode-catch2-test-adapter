# C++ TestMate

## A **Catch2**, **GoogleTest** and **DOCtest** Explorer for VSCode

[![Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/v/matepek.vscode-catch2-test-adapter.svg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter)
[![GitHub issues](https://img.shields.io/github/issues/matepek/vscode-catch2-test-adapter?color=green&style=for-the-badge)](https://github.com/matepek/vscode-catch2-test-adapter/issues)
[![Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/d/matepek.vscode-catch2-test-adapter.svg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter)

This extension allows you to run your [Catch2](https://github.com/catchorg/Catch2),
[Google Test](https://github.com/google/googletest)
and [DOCtest](https://github.com/onqtam/doctest) (experimental)
tests using the [Test Explorer for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

## Whats new?

- Version 3: **New name**: The extension is renamed from **Catch2, Google Test and DOCtest Explorer**.
- Simplified settings. This is a breaking change but hopefully the auto migration will handle most of it. 🤞

## Features / Show-Off

- Reloads test list of an executable if it is recompiled. (_Hint: Right click -> Enable Autorun_)
- Runs executables parallel (_testMate.cpp.test.parallelExecutionLimit_).
- Sorts tests and suites (_testExplorer.sort_).
- Supports popular **debuggers** such as `vadimcn.vscode-lldb`, `webfreak.debug` and `ms-vscode.cpptools` out of the box.

### Screenshots

![Screenshot1](resources/Screenshot_2019-05-28.png)
![Screenshot2](resources/Screenshot_2019-05-29.png)

### More features

- One executable can be run parallel with distinct set of subtests to boost runtime.
- Finds and recognises the executables by a given [glob pattern](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options). ([More](#catch2TestExplorer_executables))
- Automatically runs executables if it is modified ("_..._" -> "_Enable autorun_") or if a dependency is modified (`dependsOn`)
- Cooperates with other extensions like:
  - [Test Explorer Status Bar](https://marketplace.visualstudio.com/items?itemName=connorshea.vscode-test-explorer-status-bar)
  - [Test Explorer Live Share](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer-liveshare)
- Grouping can be fully customized. ([Details](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#testgrouping))
- Colorizes output window. (This might conflict with other output colorizer extensions, it's a vscode limitation.)

## [Configuration](https://github.com/matepek/vscode-catch2-test-adapter/tree/master/documents/configuration)

[settings.json]: https://code.visualstudio.com/docs/getstarted/settings
[test.advancedexecutables]: https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md
[debug.configtemplate]: https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/debug.configTemplate.md

The extension is \*_pre-configured_ and it should find executables inside the working directory which match the following [_glob pattern_](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options):
Not good enough for you?!: Edit your `.vscode/`[settings.json] file according to the [test.advancedExecutables]!

| `testMate.cpp.___`                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test.executables`                        | A [glob pattern](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options) to find test executables. (Relative to the workspace folder or absolute path.) Empty string means disabled. For more option set [testMate.cpp.test.advancedExecutables](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md) instead of this. NOTE: if `testMate.cpp.test.advancedExecutables` is set then this is ignored. |
| [test.advancedExecutables]                | Array of executables with a lot of options. (If this is set then `testMate.cpp.test.executables` is ignored.) ([Details](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)).                                                                                                                                                                                                                                             |
| `test.workingDirectory`                   | Sets the working directory of the test executable (relative to the workspace folder or absolute path). Note: `testMate.cpp.executables` overwrites it locally. ([Variables](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#variables))                                                                                                                                                                                 |
| `test.randomGeneratorSeed`                | Shuffles the tests with the given random. Catch2: [--rng-seed (<integer> or 'time')](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#rng-seed); Google Test: [--gtest_random_seed=<integer>](https://github.com/google/googletest/blob/master/googletest/docs/advanced.md#shuffling-the-tests);                                                                                                                                                                           |
| `test.runtimeLimit`                       | [seconds] Test executable is running in a process. In case of an infinite loop it will run forever unless this parameter is set. It applies instantly. (0 means infinite)                                                                                                                                                                                                                                                                                                                     |
| `test.parallelExecutionLimit`             | Maximizes the number of the parallel test executions. (It applies instantly.) Note: If your executables depend on the **same resource** then this **could cause a problem**.                                                                                                                                                                                                                                                                                                                  |
| `test.parallelExecutionOfExecutableLimit` | Maximizes the number of the parallel execution of executables. To enable this just for specific executables use the `testMate.cpp.test.advancedExecutables` -> `parallelizationLimit`. The `testMate.cpp.test.parallelExecutionLimit` is a global limit and this is a local one. Note: If your **test cases** depend on the same resource then this **could cause a problem**.                                                                                                                |
| `test.dependsOnTask`                      | Name of task to execute before running/debugging tests. The task should be defined like any other task in vscode (e.g. in tasks.json). If the task exits with a non-zero code, execution of tests will be halted. The same variables as in [debug.configTemplate] (except `${args*}`) will be substituted before running the task, with an additional one: `${execs}`, a string of quoted executable paths separated by spaces (e.g. `"/path/to/exec1" "/path/to/exec2"`).                    |
| `discovery.gracePeriodForMissing`         | [seconds] Test executables are being watched (only inside the workspace directory). In case of one recompiles it will try to preserve the test states. If compilation reaches timeout it will drop the suite.                                                                                                                                                                                                                                                                                 |
| `discovery.retireDebounceLimit`           | [milisec] Retire events will be held back for the given duration. (Reload is required)                                                                                                                                                                                                                                                                                                                                                                                                        |
| `discovery.runtimeLimit`                  | [seconds] The timeout of the test-executable used to identify it (Calls the exec with `--help`).                                                                                                                                                                                                                                                                                                                                                                                              |
| `discovery.testListCaching`               | (Experimental) In case your executable took too much time to list the tests, one can set this. It will preserve the output of `--gtest_list_tests --gtest_output=xml:...`. (Beware: Older Google Test doesn't support xml test list format.)                                                                                                                                                                                                                                                  |
| [debug.configTemplate]                    | Sets the necessary debug configurations and the debug button will work.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `debug.breakOnFailure`                    | Debugger breaks on failure while debugging the test. Catch2: [--break](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#breaking-into-the-debugger); Google Test: [--gtest_break_on_failure](https://github.com/google/googletest/blob/master/googletest/docs/advanced.md#turning-assertion-failures-into-break-points);                                                                                                                                                   |
| `debug.noThrow`                           | Skips all assertions that test that an exception is thrown, e.g. REQUIRE_THROWS. This is a Catch2 parameter: [--nothrow](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#eliding-assertions-expected-to-throw);                                                                                                                                                                                                                                                           |
| `log.logpanel`                            | Creates a new output channel and write the log messages there. For debugging. Enabling it could slow down your vscode.                                                                                                                                                                                                                                                                                                                                                                        |
| `log.logfile`                             | Writes the log message into the given file. Empty means disabled.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `gtest.treatGmockWarningAs`               | Forces the test to be failed even it is passed if it contains the string `GMOCK_WARNING:`. (You may should consider using [testing::StrictMock<T>](https://github.com/google/googletest/blob/master/googlemock/docs/cook_book.md#the-nice-the-strict-and-the-naggy-nicestrictnaggy))                                                                                                                                                                                                          |
| `gtest.gmockVerbose`                      | Sets [--gmock_verbose=...](https://github.com/google/googletest/blob/master/googlemock/docs/cheat_sheet.md#flags). (Note: executable has to be linked to gmock `gmock_main` not `gtest_main`)                                                                                                                                                                                                                                                                                                 |

Plenty of more **fine-tuning options** are available under [test.advancedExecutables] like:

- test grouping
- parallel running
- ingoring std error
- []...]

### Test Explorer's configurations

This extension is built upon the Test Explorer so its
[configuration](https://github.com/hbenl/vscode-test-explorer#configuration) and [commands](https://github.com/hbenl/vscode-test-explorer#commands)
can be used:

| `testExplorer.___`       | [Description](https://github.com/hbenl/vscode-test-explorer#configuration)                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onStart`                | Retire or reset all test states whenever a test run is started                                                                                                                                                                          |
| `onReload`               | Retire or reset all test states whenever the test tree is reloaded                                                                                                                                                                      |
| `codeLens`               | Show a CodeLens above each test or suite for running or debugging the tests                                                                                                                                                             |
| `gutterDecoration`       | Show the state of each test in the editor using Gutter Decorations                                                                                                                                                                      |
| `errorDecoration`        | Show error messages from test failures as decorations in the editor                                                                                                                                                                     |
| `errorDecorationHover`   | Provide hover messages for the error decorations in the editor                                                                                                                                                                          |
| `sort`                   | Sort the tests and suites by label or location. If this is not set (or set to null), they will be shown in the order that they were received from the adapter                                                                           |
| `showCollapseButton`     | Show a button for collapsing the nodes of the test tree                                                                                                                                                                                 |
| `showExpandButton`       | Show a button for expanding the top nodes of the test tree, recursively for the given number of levels                                                                                                                                  |
| `showOnRun`              | Switch to the Test Explorer view whenever a test run is started                                                                                                                                                                         |
| `addToEditorContextMenu` | Add menu items for running and debugging the tests in the current file to the editor context menu                                                                                                                                       |
| `mergeSuites`            | Merge suites with the same label and parent                                                                                                                                                                                             |
| `hideEmptyLog`           | Hide the output channel used to show a test's log when the user clicks on a test whose log is empty                                                                                                                                     |
| `hideWhen`               | Hide the Test Explorer when no test adapters have been registered or when no tests have been found by the registered adapters. The default is to never hide the Test Explorer (some test adapters only work with this default setting). |

Use these commands in your `tasks.json` like

```
{
  "label": "Activate Test Explorer",
  "type": "shell",
  "command": "echo ${command:test-explorer.reload}",
  "problemMatcher": [],
  "runOptions": {
    "runOn": "folderOpen" // This will cause the triggering. Have to run manually once!
  }
}
```

| ID                                   | Command                                       |
| ------------------------------------ | --------------------------------------------- |
| `test-explorer.reload`               | Reload tests                                  |
| `test-explorer.run-all`              | Run all tests                                 |
| `test-explorer.run-file`             | Run tests in current file                     |
| `test-explorer.run-test-at-cursor`   | Run the test at the current cursor position   |
| `test-explorer.rerun`                | Repeat the last test run                      |
| `test-explorer.debug-test-at-cursor` | Debug the test at the current cursor position |
| `test-explorer.redebug`              | Repeat the last test run in the debugger      |
| `test-explorer.cancel`               | Cancel running tests                          |

And more at [Test Explorer hompage](https://github.com/hbenl/vscode-test-explorer#configuration).

## About [Sentry.io]() integration

As a developer, you may know how valuable can be if you have some information.
The feature is disabled by default, the user is promted to enable it.
It can be enabled globally and disabled for the workspace or the other way around.
I've already fixed several issues using it. With enabling you support my work. 🙏

## [License](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/LICENSE)

## [Support](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/support.md)

## [Contribution](CONTRIBUTING.md)

[![Travis build status](https://img.shields.io/travis/matepek/vscode-catch2-test-adapter/master.svg?logo=Travis&style=for-the-badge)](https://travis-ci.org/matepek/vscode-catch2-test-adapter)
[![Appveyor build status](https://img.shields.io/appveyor/ci/matepek/vscode-catch2-test-adapter?style=for-the-badge)](https://ci.appveyor.com/project/matepek/vscode-catch2-test-adapter/branch/master)
[![GitHub license](https://img.shields.io/github/license/matepek/vscode-catch2-test-adapter.svg?style=for-the-badge)](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/LICENSE)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=for-the-badge)](https://github.com/prettier/prettier)

[The guideline is here.](CONTRIBUTING.md)

[![Buy Me A Coffee](https://bmc-cdn.nyc3.digitaloceanspaces.com/BMC-button-images/custom_images/orange_img.png)](https://www.buymeacoffee.com/rtdmjYspB)
