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

| `catch2TestExplorer.___`         | Description                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [executables]                    | The location of your test executables (relative to the workspace folder or absolute path) and with a lot of other setting.                                                                                                                                                                                                                  |
| [debugConfigTemplate]            | Set the necessary debug configurations and the debug button will work.                                                                                                                                                                                                                                                                      |
| `defaultCwd`                     | The working directory where the test is run (relative to the workspace folder or absolute path), if it isn't provided in "executables". (It resolves variables.)                                                                                                                                                                            |
| `defaultEnv`                     | Environment variables to be set when running the tests. (It resolves variables.)                                                                                                                                                                                                                                                            |
| `debugBreakOnFailure`            | Debugger breaks on failure while debugging the test. Catch2: [--break](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#breaking-into-the-debugger); Google Test: [--gtest_break_on_failure](https://github.com/google/googletest/blob/master/googletest/docs/advanced.md#turning-assertion-failures-into-break-points); |
| `defaultNoThrow`                 | Skips all assertions that test that an exception is thrown, e.g. REQUIRE_THROWS. This is a Catch2 parameter: [--nothrow](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#eliding-assertions-expected-to-throw);                                                                                                         |
| `defaultRngSeed`                 | Shuffles the tests with the given random. Catch2: [--rng-seed (<integer> or 'time')](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#rng-seed); Google Test: [--gtest_random_seed=<integer>](https://github.com/google/googletest/blob/master/googletest/docs/advanced.md#shuffling-the-tests);                         |
| `defaultWatchTimeoutSec`         | Test executables are being watched (only inside the workspace directory). In case of one recompiles it will try to preserve the test states. If compilation reaches timeout it will drop the suite.                                                                                                                                         |
| `retireDebounceTimeMilisec`      | Retire events will be held back for the given duration. (Reload is required)                                                                                                                                                                                                                                                                |
| `defaultExecParsingTimeoutSec`   | The timeout duration (in seconds) of the test-executable identifier (Calls the exec with `--help`).                                                                                                                                                                                                                                         |
| `defaultRunningTimeoutSec`       | Test executable is running in a process. In case of an infinite loop, it will run forever, unless this parameter is set. It applies instantly. (0 means infinite)                                                                                                                                                                           |
| `workerMaxNumber`                | The variable maximize the number of the parallel test execution. It applies instantly.                                                                                                                                                                                                                                                      |
| `enableTestListCaching`          | (Experimental) In case your executable took too much time to list the tests, one can set this. It will preserve the output of `--gtest_list_tests --gtest_output=xml:...`. (Beware: Older Google Test doesn't support xml test list format.) (Click [here](http://bit.ly/2HFcAC6), if you think it is a useful feature!)                    |
| `logpanel`                       | Creates a new output channel and write the log messages there. For debugging. Enabling it could slow down your vscode.                                                                                                                                                                                                                      |
| `logSentry`                      | Errors/Exceptions will be logged and sent automatically for further analysis.                                                                                                                                                                                                                                                               |
| `googletest.gmockVerbose`        | Sets [--gmock_verbose=...](https://github.com/google/googletest/blob/master/googlemock/docs/cheat_sheet.md#flags). (Note: executable has to be linked to gmock `gmock_main` not `gtest_main`)                                                                                                                                               |
| `googletest.treatGmockWarningAs` | Forces the test to be failed even it is passed if it contains the string `GMOCK_WARNING:`. (You may should consider using [testing::StrictMock<T>](https://github.com/google/googletest/blob/master/googlemock/docs/cook_book.md#the-nice-the-strict-and-the-naggy-nicestrictnaggy))                                                        |

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
