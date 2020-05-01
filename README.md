# **Catch2**, **Google Test** and **DOCtest** Explorer for VSCode

[![Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/v/matepek.vscode-catch2-test-adapter.svg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter)
[![GitHub issues](https://img.shields.io/github/issues/matepek/vscode-catch2-test-adapter?color=green&style=for-the-badge)](https://github.com/matepek/vscode-catch2-test-adapter/issues)
[![Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/d/matepek.vscode-catch2-test-adapter.svg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter)

This extension allows you to run your [Catch2](https://github.com/catchorg/Catch2),
[Google Test](https://github.com/google/googletest)
and [DOCtest](https://github.com/onqtam/doctest) (experimental)
tests using the [Test Explorer for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

## Whats new?

- GoogleTest output parsing is working on windows too.
- One executable can be run parallel with distinct set of subtests.
- Grouping can be customized. ([Details](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/executables.config.md#testgrouping))
  - by souce file of the test
  - by regula expression matching the test
  - by tags
  - by executables (as it was before or in a different way)
  - any of the previous ones can be combined in custom depth and any order.
    `"testGrouping": { "groupByExecutable": { "groupBySource": { "groupByTags": { groupByRegex: { ... } } } } }`

## Features and Screenshots

- Finds and recognises the executables by a given [glob pattern](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options). ([More](#catch2TestExplorer_executables))
- Automatically runs executables if it is modified ("_..._" -> "_Enable autorun_") or if a dependency is modified (`dependsOn`)
- Reloads test list of an executable if it is recompiled.
- Supports popular **debuggers** such as `vadimcn.vscode-lldb`, `webfreak.debug` and `ms-vscode.cpptools` out of the box.
- Runs executables parallel (`catch2TestExplorer.workerMaxNumber`).
- Sorts tests and suites (`testExplorer.sort`).
- Cooperates with other extensions like:
  - [Test Explorer Status Bar](https://marketplace.visualstudio.com/items?itemName=connorshea.vscode-test-explorer-status-bar)
  - [Test Explorer Live Share](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer-liveshare)

![Screenshot1](resources/Screenshot_2019-05-28.png)
![Screenshot2](resources/Screenshot_2019-05-29.png)

## [Configuration](https://github.com/matepek/vscode-catch2-test-adapter/tree/master/documents/configuration)

[settings.json]: https://code.visualstudio.com/docs/getstarted/settings
[executables]: https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/executables.config.md
[debugconfigtemplate]: https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/debugConfigTemplate.config.md

The extension is \*_pre-configured_ and it should find executables inside the working directory which match the following [_glob pattern_](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options):
Not good enough for you?!: Edit your `.vscode/`[settings.json] file according to the [executables]!

Attention: The [executables] related options are on another page: [here][executables]. Example:

- test grouping
- fine tuning
- parallel running

| `copper.___`                             | Description                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test.executable`                        | The location of your test executable (relative to the workspace folder or absolute path). For more option set [copper.test.executables](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/executables.config.md) instead of this. NOTE: if `copper.test.executables` is set then this is ignored.   |
| `test.executables`                       | Array of executables with a lot of options. `null` means disabled. (If this is set then `copper.test.executable` is ignored.) ([Details](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/executables.config.md)).                                                                                 |
| `test.workingDirectory`                  | Sets working directory of the test executable (relative to the workspace folder or absolute path). Note: `copper.executables` overwrites it locally.                                                                                                                                                                                        |
| `test.randomGeneratorSeed`               | Shuffles the tests with the given random. Catch2: [--rng-seed (<integer> or 'time')](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#rng-seed); Google Test: [--gtest_random_seed=<integer>](https://github.com/google/googletest/blob/master/googletest/docs/advanced.md#shuffling-the-tests);                         |
| `test.runtimeLimit`                      | [seconds] Test executable is running in a process. In case of an infinite loop, it will run forever, unless this parameter is set. It applies instantly. (0 means infinite)                                                                                                                                                                 |
| `test.parallelExecutionLimit`            | The variable maximize the number of the parallel test execution. (It applies instantly.) Note: If your executables depends on the same resource than this could cause a problem.                                                                                                                                                            |
| `discovery.misssingFileWaitingTimeLimit` | [seconds] Test executables are being watched (only inside the workspace directory). In case of one recompiles it will try to preserve the test states. If compilation reaches timeout it will drop the suite.                                                                                                                               |
| `discovery.retireDebounceLimit`          | [milisec] Retire events will be held back for the given duration. (Reload is required)                                                                                                                                                                                                                                                      |
| `discovery.runtimeLimit`                 | [seconds] The timeout of the test-executable used to identify it (Calls the exec with `--help`).                                                                                                                                                                                                                                            |
| `discovery.testListCaching`              | (Experimental) In case your executable took too much time to list the tests, one can set this. It will preserve the output of `--gtest_list_tests --gtest_output=xml:...`. (Beware: Older Google Test doesn't support xml test list format.) (Click [here](http://bit.ly/2HFcAC6), if you think it is a useful feature!)                    |
| `debug.configTemplate`                   | Set the necessary debug configurations and the debug button will work.                                                                                                                                                                                                                                                                      |
| `debug.breakOnFailure`                   | Debugger breaks on failure while debugging the test. Catch2: [--break](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#breaking-into-the-debugger); Google Test: [--gtest_break_on_failure](https://github.com/google/googletest/blob/master/googletest/docs/advanced.md#turning-assertion-failures-into-break-points); |
| `debug.noThrow`                          | Skips all assertions that test that an exception is thrown, e.g. REQUIRE_THROWS. This is a Catch2 parameter: [--nothrow](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#eliding-assertions-expected-to-throw);                                                                                                         |
| `log.logpanel`                           | Creates a new output channel and write the log messages there. For debugging. Enabling it could slow down your vscode.                                                                                                                                                                                                                      |
| `log.logfile`                            | Writes the log message into the given file. Empty means disabled.                                                                                                                                                                                                                                                                           |
| `log.logSentry`                          | Errors/Exceptions will be logged and sent automatically for further analysis.                                                                                                                                                                                                                                                               |
| `log.userId`                             | A locally generated identifier which is used to group the errors/events. Not used for anything evil. Anonymity is preserved.                                                                                                                                                                                                                |
| `gtest.treatGmockWarningAs`              | Forces the test to be failed even it is passed if it contains the string `GMOCK_WARNING:`. (You may should consider using [testing::StrictMock<T>](https://github.com/google/googletest/blob/master/googlemock/docs/cook_book.md#the-nice-the-strict-and-the-naggy-nicestrictnaggy))                                                        |
| `gtest.gmockVerbose`                     | Sets [--gmock_verbose=...](https://github.com/google/googletest/blob/master/googlemock/docs/cheat_sheet.md#flags). (Note: executable has to be linked to gmock `gmock_main` not `gtest_main`)                                                                                                                                               |

**Note** that this extension is built upon the Test Explorer so its
[configuration](https://github.com/hbenl/vscode-test-explorer#configuration) and [commands](https://github.com/hbenl/vscode-test-explorer#commands)
can be used.

| `testExplorer.___` | [Description](https://github.com/hbenl/vscode-test-explorer#configuration)                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `errorDecoration`  | Show error messages from test failures as decorations in the editor.                                                                                                                                                                    |
| `gutterDecoration` | Show the state of each test in the editor using Gutter Decorations.                                                                                                                                                                     |
| `codeLens`         | Show a CodeLens above each test or suite for running or debugging the tests.                                                                                                                                                            |
| `onStart`          | Retire or reset all test states whenever a test run is started.                                                                                                                                                                         |
| `onReload`         | Retire or reset all test states whenever the test tree is reloaded.                                                                                                                                                                     |
| `sort`             | Sort the tests and suites by label or location. If this is not set (or set to null), they will be shown in the order that they were received from the adapter                                                                           |
| `hideEmptyLog`     | Hide the output channel used to show a test's log when the user clicks on a test whose log is empty                                                                                                                                     |
| `hideWhen`         | Hide the Test Explorer when no test adapters have been registered or when no tests have been found by the registered adapters. The default is to never hide the Test Explorer (some test adapters only work with this default setting). |

And [more...](https://github.com/hbenl/vscode-test-explorer#configuration).

#### About [Sentry.io]() integration

As a developer, you may know how valuable can be if you have some information.
The feature is disabled by default, the user is promted to enable it.
It can be enabled globally and disabled for the workspace or the other way around.
I've already fixed several issues using it. With enabling you support my work. 🙏

## [License](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/LICENSE)

## [Support](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/support.md)

## [Contribution]

[![Travis build status](https://img.shields.io/travis/matepek/vscode-catch2-test-adapter/master.svg?logo=Travis&style=for-the-badge)](https://travis-ci.org/matepek/vscode-catch2-test-adapter)
[![Appveyor build status](https://img.shields.io/appveyor/ci/matepek/vscode-catch2-test-adapter?style=for-the-badge)](https://ci.appveyor.com/project/matepek/vscode-catch2-test-adapter/branch/master)
[![GitHub license](https://img.shields.io/github/license/matepek/vscode-catch2-test-adapter.svg?style=for-the-badge)](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/LICENSE)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=for-the-badge)](https://github.com/prettier/prettier)

[The guideline is here.](CONTRIBUTING.md)

[![Buy Me A Coffee](https://bmc-cdn.nyc3.digitaloceanspaces.com/BMC-button-images/custom_images/orange_img.png)](https://www.buymeacoffee.com/rtdmjYspB)
