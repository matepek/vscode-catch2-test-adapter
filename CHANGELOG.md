# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [3.6.2]

npm update

## [3.6.1] - 2020-11-01

### Added

- `${argsStr}` and `${argsFlat}` for `executionWrapper`.

## [3.6.0] - 2020-10-31

### Added

- vscode command resolution `${command:<...>}`:
  From now variables like `${command:cmake.buildDirectory}` will be resolved.

### Fixed

- source file resolution

### Removed

- `${if(isWin)...}`
- `${osEnvSep}`. Use `${osPathEnvSep}` instead.

## [3.5.3] - 2020-10-30

### Fixed

- resolution of `foo ${match_lowercased}`

## [3.5.2] - 2020-10-30

### Added

- for `testGrouping.groupByRegex` and `testGrouping.groupByTagRegex` added `${match_lowercased}` and `${match_upperfirst}` as alternative of `${match}`.
  Note: regex can contain one grouping `(...)`.

## [3.5.1] - 2020-10-29

### Added

- `groupByTagRegex`
- `sourceFileMap`

## [3.5.0] - 2020-10-25

### Added

- Support for [Google Benchmark](https://github.com/google/benchmark):
  One can set a limit which will report a test/benchmark failure in case of the `cpu_time` exceeds it: `testMate.cpp.test.advancedExecutables` -> `gbenchmark` -> `failIfExceedsLimitNs`.
- `testMate.cpp.test.advancedExecutables` -> `markAsSkipped`: It can be useful espacially in case of GoogleBenchmark.

### Removed

- `testMate.cpp.discovery.retireDebounceLimit`

## [3.4.4] - 2020-10-23

Performance improvements.

## [3.4.3] - 2020-10-16

### Fixed

- `prependTestRunningArgs` was ignored in case of debugging.

## [3.4.2] - 2020-10-02

## Added

- Workaround for `,` char in doctest's test-name.

## [3.4.1] - 2020-08-21

### Added

- Handling more gtest cases

## [3.4.0] - 2020-07-27

### Added

- (experimental) `testMate.advancedExecutables.executionWrapper`: Probably your best option if your executables need some initinalization of enviroment.

## [3.3.0] - 2020-07-27

### Added

- `testMate.advancedExecutables.envFile`: Probably your best option if your executables need some initinalization of enviroment.

## [3.2.12] - 2020-07-26

### Fixed

- Catch2 tag parsing

## [3.2.11] - 2020-07-24

### Fixed

- Potential Catch2 xml parsing issue

### Removed

- Migration from old version is removed. (If one still want it, they can downgrade for temporarily.)

## [3.2.10] - 2020-07-18

### Added

- Support for open-vsx https://github.com/eclipse/openvsx/wiki/Publishing-Extensions

### Fixed

- file link recognition for workaround

## [3.2.9] - 2020-07-11

- npm update
- Logging improvemets
- Passing serializeble data for [Live Share](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer-liveshare)

## [3.2.8] - 2020-06-26

### Added

- Recognising regular links to workaround this [issue](https://github.com/matepek/vscode-catch2-test-adapter/issues/207).

## [3.2.7] - 2020-06-26

- This version tries to limit the coloring to fix an [issue](https://github.com/matepek/vscode-catch2-test-adapter/issues/207).
- Improved link detection

## [3.2.6] - 2020-06-21

### Fixed

- Catch2 v3 preview fixes

## [3.2.5] - 2020-05-30

Minor improvmenets

## [3.2.4] - 2020-05-20

Logging improvements

## [3.2.3] - 2020-05-19

Stability improvements

## [3.2.2] - 2020-05-17

### Fixed

- Error message in case of attempt of debugging suites.

## [3.2.1] - 2020-05-16

### Added

- Support for Catch2 v3.x
- Option for colored debug output `enableOutputColouring`

## [3.2.0] - 2020-05-15

### Added

- Scoping for `testMate.test.advancedExecutables`.
  Example:
  ```
  "testMate.test.advancedExecutables": [{
    "pattern": "<default pattern>",
    "darwin": { "pattern":"<value on mac>" },
    "win32": { "pattern":"<value on win>" },
    "linux": { "pattern":"<value on linux>" },
    ....
  }]
  ```

## [3.1.3] - 2020-05-15

### Added

- Now tests can be added to the run-queue even if there are some tests running already.
  (UI experience [isn't the best](https://github.com/hbenl/vscode-test-explorer/issues/141) though.)

## [3.1.2] - 2020-05-14

- Absolute patterns in Windows can now point to a different volume than the workspace folder.

## [3.1.1] - 2020-05-14

### Added

- `discovery.strictPattern`

## [3.1.0] - 2020-05-13

Lot of changes under the hood to make your life easier.

## [3.0.4] - 2020-05-10

### Added

- Support for custom [`GTEST_FLAG_PREFIX`](https://github.com/google/googletest/blob/master/googletest/include/gtest/internal/gtest-port.h#L282).
  It is recognised automatically by running the executable with `--help`.
- Support for running [vscode tasks](https://code.visualstudio.com/docs/editor/tasks) before tests. (Experimental)
- Support for `strictPattern`: Test loading will fail if one of the matched executables cannot be loaded.

## [3.0.3] - 2020-05-07

### Changed

- Cache file naming convention has changed. Relates: `discovery.testListCaching`

## [3.0.2] - 2020-05-06

Logging improvmenets

## [3.0.1] - 2020-05-05

"Proofreading"

## [3.0.0] - 2020-05-04

It's a big day! The extension was finally renamed to `C++ TestMate`.
(Finally, I mean I've been planning this since a long time ago in a galaxy far, far away....)
Lots of small tweaks were added. (Please be patient and report issuess. ^^)

May the 4th be with you 🖖
(Yes, I know.. ^^)

### Changed

- All the configs has moved and renamed. ⚠
  (Merge logic is implemented to make the transition easier.)

### Removed

- ❌ `defaultEnv` is removed. From now evironment variables can be set
  only in the [test.advancedExecutables](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md).

## [2.9.12] - 2020-05-01

Fine-tuning colorization

## [2.9.11] - 2020-04-30

## [2.9.10] - 2020-04-30

Catch2 long filename recognition improvement.

## [2.9.9] - 2020-04-29

Output coloring improvements.

Hint: Are you working on an executable or a TestCase or just on 1 test?

> Just right click on it and `Enable autorun`.
> Next time you recompile your executable it will run it automatically.

## [2.9.8] - 2020-04-29

Sentry was broken

## [2.9.7] - 2020-04-29

### Added

- Better path resolution in case of output parser.

## [2.9.6] - 2020-04-29

### Added

- Navigation from outout window to source
- Colored output (if not overridden by other extension)

## [2.9.5] - 2020-04-25

### Fixed

- GoogleTest parsing. Nobody told me that on windows GoogleTest has a different format

## [2.9.4] - 2020-04-24

### Fixed

- GoogleTest debugging
- other small stuffs

## [2.9.3] - 2020-04-23

### Added

- Exeprimental _multirun_ feature. Run the same executable multiple times. See config: [parallelizationLimit](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md).

### Changed

- Experimental grouping has changed. More general and flexible. (again)

## [2.9.2] - 2020-04-22

### Changed

- Experimental grouping has changed. More general and flexible.

### Fixed

- An issue when too much test caused `ENAMETOOLONG`.

## [2.9.1] - 2020-04-19

Pesky bug fixes and tons of improvements

## [2.9.0] - 2020-04-17

### Added

Experiment feature: `testGrouping`: Groups the tests inside the executable. ([Example](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#testgrouping))

## [2.8.13] - 2020-04-04

### Fixed

- an issue (#169) when source file path resolution didn't work in case of DOCTest

## [2.8.12] - 2020-03-29

### Removed

- `additionalRunArguments`

### Added

- `prependTestListingArgs`: Similar to `additionalRunArguments` but it prepends instead of appending.
- `prependTestRunningArgs`

## [2.8.11] - 2020-03-18

npm update

## [2.8.10] - 2020-03-15

README fixes and option to force add `.../_deps/...`.

## [2.8.9] - 2020-03-15

### Changed

- Ignoring more known extensions and also ignoring `_deps` subfolder.
  This change might cause a problem for some user but hopefully just makes the test discovery much faster.

## [2.8.8] - 2020-03-08

### Removed

- Google Test framework experimental discovery.

## [2.8.7] - 2020-03-03

Improved logging and some extra error handling.

## [2.8.6] - 2020-02-22

Improved logging

## [2.8.5] - 2020-02-10

### Fixed

- gutter location if the assertion comes from a different file (ex.: `#include`).

## [2.8.4] - 2020-02-02

### Fixed

- catch2 custom failure parsing

## [2.8.3] - 2020-02-01

### Added

- experimental support to override test framework recognition.
- experimental Catch2 benchmark support

### Fixed

- doctest exception handling

### Removed 🚫

- `catch2TestExplorer.executables` used as an array cannot contain strings anymore.
  Example: `[ "*.test.exe" ]` --> `[ { "pattern": "*.test.exe" } ]`

## [2.8.2] - 2020-01-12

### Added

- Some mechanism which prevent to enumerate test for multiple times when the file hasn't changed.

## [2.8.1] - 2020-01-06

### Added

- GoogleTest version detection

## [2.8.0] - 2020-01-05

### Added

- Enhanced variable for `catch2TestExplorer.executables`.
  From now array indexing is supported like: `${relDirpath[:-1]}`: `a/b/c` => `a/b`

### Removed

- `${base2Filename}` => `${filename[:-2]}`
- `${ext2Filename}` => `.${filename[-2:-1]}`
- `${base3Filename}` => `${filename[:-3]}`
- `${ext3Filename}` => `${filename[-3:-2]}`
- `${parentDirname}` => `${relPath[-1:]}`

## [2.7.15] - 2019-12-30

Just some logging related fixes, nothing interesting.

## [2.7.14] - 2019-12-24

## Fixed:

- Catch2 parsing bug

## [2.7.13] - 2019-12-23

## [2.7.12] - 2019-12-22

Nothing interesting:

- npm update
- logging framework usage
- slightly more flexible Catch2 test list parsing.

## [2.7.11] - 2019-12-18

## [2.7.10] - 2019-12-18

Sentry fix: webpack caused it.

## [2.7.9] - 2019-12-17

### Added

- experimental support for [doctest](https://github.com/onqtam/doctest) version >= 2.3.6

## [2.7.8] - 2019-12-08

Finally I decided to use webpack. Package is the fraction of the previous version and loading time is faster.

### Fixed

- Catch2 parsing errors.

## [2.7.7] - 2019-12-06

### Changed

- Google Test parsing improvements

### Fixed

- a bug related to bactick in SECTION name

## [2.7.6] - 2019-10-30

### Changed

- Catch2 output information format has been changed. (Hopefully a bit more readable.)

## [2.7.5] - 2019-09-17

Logging improvements.

## [2.7.4] - 2019-09-16

Logging improvements.

## [2.7.3] - 2019-09-09

Logging improvements.

## [2.7.2] - 2019-09-08

⚠️ Sentry.io integration: From this build errors and exceptions can be reported automatically.
Please allow it by setting `catch2TestExplorer.logSentry: "enable"`.

### Changed

- `debugConfigTemplate` now filters `launch.json` a bit more precisely

## [2.7.1] - 2019-08-30

Nothing really changed (just slightly), but documentation was updated.

## [2.7.0] - 2019-08-25

Fixing vulnerabilites in packages.

### Changed

- Resolving `${os_env:<varname>}` will result in empty string if if `<varname>` is not set.
  Use `${os_env_strict:<varname>}` which will not set the target variable if there is no `<varname>` environment variable.

## [2.6.6] - 2019-08-02

### Changed

- `catch2TestExplorer.workerMaxNumber` now "really" applies for the test exploration phase too

## [2.6.5] - 2019-08-02

### Changed

- `catch2TestExplorer.workerMaxNumber` now applies for the test exploration phase too

## [2.6.4] - 2019-07-19

### Fixed

- The path is relative to the test file. If the source file is already open vscode would open it another time using the unnormalized file path.

### Changed

- Updated googletest links.

## [2.6.3] - 2019-07-15

### Added

- `catch2TestExplorer.retireDebounceTimeMilisec` to the configs.

## [2.6.2] - 2019-07-13

Fixed security vulnerability.

## [2.6.1] - 2019-07-08

### Added

- `catch2TestExplorer.executables`'s `pattern` resolves variables related to the process's environment variables (Ex.: `${os_env:PATH}`).

## [2.6.0] - 2019-07-08

### Added

- `catch2TestExplorer.defaultExecParsingTimeoutSec` to the configs.

## [2.5.0] - 2019-06-26

### Added

- `catch2TestExplorer.googletest.gmockVerbose` to the configs.
- `catch2TestExplorer.googletest.treatGmockWarningAs` to the configs.

## [2.4.14] - 2019-06-13

### Added

- `executables`'s properties can contains variables related to environment variables (ex.: `${os_env:PATH};/mypath`).

## [2.4.13] - 2019-06-08

npm update: security alert fix.

## [2.4.12] - 2019-06-07

"Google Test improvements. Now I use my product, so I've found a lot a of small issues." Vol. 2.

### Changed

- Google Mock output parsing enhancements.

### Fixed

- a [bug](https://github.com/matepek/vscode-catch2-test-adapter/issues/97) related to config retrieval.

## [2.4.11] - 2019-06-06

### Added

- additional file extensions recognized as valid executable: `.cmd` and `.bat` ([PR](https://github.com/matepek/vscode-catch2-test-adapter/pull/96))

## [2.4.10] - 2019-06-05

Google Test improvements. Now I use my product, so I've found a lot a of small issues. :)

### Fixed

- Google Test was losing it's state when the exec was touched.
- a bug which ignored the user and global config values.

### Added

- a logic which tries to create a debug template on the fly.
  It searches for configurations in the workspacefolder's `.vscode/launch.json`.
  It will choose the first one which's `"request"` property is `"launch"` and has `type` property.

## [2.4.9] - 2019-05-28

Just updated the README.md and updated the packages.

## [2.4.8] - 2019-05-17

### Fixed

- a [bug](https://github.com/matepek/vscode-catch2-test-adapter/issues/92) related to parsing a Google Test with 'TypeParam'.

## [2.4.7] - 2019-05-01

### Fixed

- a [bug](https://github.com/matepek/vscode-catch2-test-adapter/issues/88) which occured when the test executables crashed on windows.

## [2.4.6] - 2019-04-27

### Fixed

- a misleading default config.

## [2.4.5] - 2019-04-26

### Fixed

- a [bug](https://github.com/matepek/vscode-catch2-test-adapter/issues/88) which reloads the suite in case of the test crashes.

## [2.4.4] - 2019-04-16

### Fixed

- some vulnerabilities in packages (npm audit fix)

## [2.4.3] - 2019-04-03

### Fixed

- section info in description

## [2.4.2] - 2019-04-02

### Fixed

- some issue with `dependsOn` related to `Gaze` fs-watcher.

## [2.4.1] - 2019-04-02

### Added

- `executables`'s `dependOn` (type: _string[]_) property is no longer experimental.
  Be careful with it. It eats [file descriptors](https://en.wikipedia.org/wiki/File_descriptor) and defecates test executions.
- section result stat to description and tooltip.

## [2.4.0] - 2019-03-25

### Added

- `executables`'s `description` property for nicer labels
- (experimental) `executables`'s `dependOn` (type: _string[]_) property.
  Be careful with it. It eats [file descriptors](https://en.wikipedia.org/wiki/File_descriptor) and defecates test executions.

## [2.3.28] - 2019-03-20

### Changed

- fswatcher library has been replaced: `chokidar` -> `gaze`.
  There were some problem with it on OSX. Don't care, threw it out.

## [2.3.27] - 2019-03-18

### Fixed

- a bug related to abs-path watcher (`chokidar`).

## [2.3.26] - 2019-03-18

### Added

- support for `GTEST_SKIP()`.
- (experimental) glob pattern for patterns outside the workspace directory
- (experimental) watcher for executables outside the workspace directory

### Fixed

- a bug which caused to run all tests of a suite including the skipped ones too

## [2.3.25] - 2019-03-15

### Added

- experimental feature: `catch2TestExplorer.enableTestListCaching`

### Changed

- scripts like `.py`, `.sh`, `.js` are allowed for those who are using wrappers. [Related issue.](https://github.com/matepek/vscode-catch2-test-adapter/issues/73)

## [2.3.24] - 2019-03-14

### Fixed

- a bug related to debugging (https://github.com/Microsoft/vscode/issues/70125).

### Changed

- test suite loading order from now is not deterministic. One can set `testExplorer.sort` for ordering.

## [2.3.23] - 2019-03-14

### Changed

- doesn't send skipped events for skipped tests: This will preserve
- in case of Google Test 'DISABLED\_' prefix is removed from the label. The icon indicates it anyway.
- it seems Google Test's test names first character can be a digit.

## [2.3.22] - 2019-03-01

### Changed

- the test list parser timeout from 5 to 30 seconds.

### Added

- section picker for debugging.

### Fixed

- a bug related to env variables in case of debugging.

## [2.3.21] - 2019-02-26

### Added

- `testExplorer.sort`, so I removed my logic. If you want the old ordering set this to `byLabelWithSuitesFirst`.
- tooltip: it will show more info about the suites and tests.

## [2.3.20] - 2019-02-22

### Fixed

- `catch2TestExplorer.defaultRngSeed`, which didn't work at all.

## [2.3.19] - 2019-02-21

### Added

- config scheme validation is much better

## [2.3.18] - 2019-02-18

### Fixed

- a small bug related to `executables`'s environment variables.

## [2.3.17] - 2019-02-13

Stability improvements.

### Changed

- A list of non-executable extensions has been extended to:
  `'c', 'cmake', 'cpp', 'cxx', 'deb', 'dir', 'gz', 'h', 'hpp', 'hxx', 'ko', 'log', 'o', 'php', 'py', 'rpm', 'sh', 'so', 'tar', 'txt'`

### Fixed

- a bug related to navigation to source.

## [2.3.16] - 2019-01-31

This version probably contains stability improvements ✌️, but in case it doesn't work on all platforms as I expect,
you can downgrade it in the vscode's extension manager and please file an issue about the bug. 🙏

**REMARK**: A list of non-executable extensions are hard-coded: `['py', 'sh', 'cmake', 'deb', 'o', 'so', 'rpm', 'tar', 'gz', 'php', 'ko']`.
And on Windows everything is filtered what is not ends with `.exe`;

### Added

- sending `SIGKILL` in case of second cancel. (Clicking onto the cancel button after the first cancel wasn't successful.)

## [2.3.15] - 2019-01-20

### Changed

- In case of multiple adapters or workspace folders,
  if there are no tests in a particular workspace folder it won't be shown in the Test Explorer.

## [2.3.14] - 2019-01-18

### Fixed

- a bug related to Google Test framework's test list loading. ([Issue](https://github.com/matepek/vscode-catch2-test-adapter/issues/55))

## [2.3.13] - 2019-01-16

Sorting has been change to alphabetic order.

Google Test tests are grouped.

## [2.3.12] - 2019-01-13

### Fixed

- a bug related to suite name uniquification.

## [2.3.11] - 2019-01-11

Performance and stability improvements.

## [2.3.10] - 2019-01-05

Performance and stability improvements.

## [2.3.9] - 2019-01-03

### Fixed

- a bug which caused that `files.exclude` were also applied to pattern. Not anymore.
- a bug which caused to show not file names but patterns in the explorer.
- a bug which allowed suite duplications if more patterns were matching.

## [2.3.8] - 2019-01-03

### Fixed

- a bug related to Google Test framework: `INSTANTIATE_TEST_CASE_P`.

## [2.3.7] - 2019-01-02

### Fixed

- a bug related to `defaultCwd` and `defaultEnv` and `executables`'s `cwd`.

## [2.3.6] - 2018-12-25

### Added

- Handling: Catch2: INFO, WARN, FAIL, std::cout, std::cerr

### Deprecated

- `catch2TestExplorer.enableSourceDecoration` will be removed. Use `testExplorer.errorDecoration`.

## [2.3.5] - 2018-12-23

### Fixed

- `fs-extra` was only a devDependencie, so the extension couldn't load.

## [2.3.4] - 2018-12-22

### Fixed

- Debugging a Google Test did run all the tests.

## [2.3.3] - 2018-12-22

Google Test framework support has been added. It is in experimental phase.

## [2.3.2] - 2018-12-19

### Fixed

- bug related to loading test list with duplicated test names

## [2.3.1] - 2018-12-17

### Fixed

- a bug related to autorun [see](/issues/36)

## [2.3.0] - 2018-12-17

Better error handling and logging.

### Added

- `catch2TestExplorer.defaultRunningTimeoutSec` to prevent infinite loops

## [2.2.6] - 2018-12-10

Stability improvements.

## [2.2.5] - 2018-12-04

### Fixed

- Source file path resolution
- Bug related to automatic test reloading

## [2.2.4] - 2018-12-04

Updated README.md

## [2.2.3] - 2018-11-28

Unnecessary codes and packages are removed from extension package.

Also old releases will be removed from Github releases page,
because of a [security issue](https://github.com/matepek/vscode-catch2-test-adapter/issues/28)
related to `vscode` package.

## [2.2.2] - 2018-11-28

### Security

- Security issue related to event-stream https://code.visualstudio.com/blogs/2018/11/26/event-stream

## [2.2.1] - 2018-11-25

Stability improvements.

### Fixed

- relative patter/path outside of workspace didn't work
- tests are added/removed if change detected under running tests

## [2.2.0] - 2018-11-25

Performance and stability improvements. Improved logging.

### Added

- `catch2TestExplorer.defaultNoThrow` option. Skips all assertions that test that an exception is thrown, e.g. REQUIRE_THROWS. This is a Catch2 parameter: --nothrow.

### Fixed

- debugger recognition. (ms-vscode.cpptools's documentation is incorrect)

## [2.1.0] - 2018-11-20

### Added

- `catch2TestExplorer.debugBreakOnFailure` option. It is true by default.
- Change of test file (ex.:recompilation) triggers "**autorun**" feature.
  (Right click on test/suite in text explorer -> Enable to enable autorun for the selected test/suite.)
  This basically means that the selected test/suite will run in case of any filesystem event related to the `executables` variable.
  It can be really useful if one would like to run a test (or suite) automatically after recompiliation.

### Fixed

Performance and stability improvements.

## [2.0.3] - 2018-11-20

### Fixed

- It reloads suite if it finds any new tests.
- A bug in package.json. It couldn't load the tests by default.

## [2.0.2] - 2018-11-19

### Fixed

- A bug related to jumping to source.

## [2.0.1] - 2018-11-07

### Fixed

- A bug related to xml parsing.

### Added

For development:

> Now, if there is 'something' in the [CHANGELOG](CHANGELOG.md) without date (ex.: "\[1.2.3]")
> and it is merged to the master, a deploy job will run it will:
>
> - Appends the `CHANGELOG.md`'s new version-line with the current UTC date: "\[1.2.3]" --> "\[1.2.3] - 2018-10-31".
> - Updates the version number in `package.json` according to the one in `CHANGELOG.md`.
> - Creates a commit about it.
> - Creates a tag too.
> - Creates a [`GitHub release`](releases) for the tag and uploads the generated `.vsix` file.
> - Publish the new version to [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter).
>
> Hopefully it works (partially tested only 🤞).

### Deprecated

- `executables`'s `path`. Now it is mapped to `pattern`, so works, but it will be removed in the future.

## [2.0.0] - 2018-10-30

Lot of things new under the hood, but lets talk about the 'API' change.

### Changed ⚠️

- Renamed `defaultExecWatchTimeout` --> `defaultWatchTimeoutSec`.

  - Also the unit has changed from millisecond to **second**.

- Renamed `debugConfigurationTemplate` --> `debugConfigTemplate`.
- Renamed `path` property of `executables` --> `pattern`. (Technically `path` still can be used as an alias.)

- Changed behaviour of `path` property of `executables`.
  Now it can understand "VSCode patterns". ([Details](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options)) - These work for only path's inside the _workspace directory_. Paths outside of it can be used
  with absolute path or with relative to _working directory_ (ex.: `../build/test.exe`), but
  without patterns (and without file-watch).

  - `*` to match one or more characters in a path segment
  - `?` to match on one character in a path segment
  - `**` to match any number of path segments, including none
  - `{}` to group conditions (e.g. {`**/*.html,**/*.txt`} matches all HTML and text files)
  - `[]` to declare a range of characters to match (e.g., `example.[0-9]` to match on example.0, example.1, …)

- File system is watched through the previously mentioned pattern (only inside the _workspace directory_), and
  newly created executables will be added automatically, deleted ones will be removed and changed ones will be refreshed.

- Variable substitution has been changed. (See [README](README.md) for details.)

### Removed 🚫

- Removed `regex` property of `executables`.
- Removed `recursiveRegex` property of `executables`.

## [1.2.0] - 2018-10-24

### Added

- Configuration: `catch2TestExplorer.defaultExecWatchTimeout`: Test executables are being watched. In case of one compiles too much this variable can help with it.

## [1.1.2]

Bugfix release

## [1.1.1]

### Added

- Parsing 'Randomness' values

### Changed

- Fixed `catch2TestExplorer.defaultRngSeed`

## [1.1.0]

### Added

- Configuration `catch2TestExplorer.defaultRngSeed` is added.
- Test's running duration is shown.

## [1.0.2] - 2018-09-13

### Changed

- package.json workerMaxNumber naming has been fixed.

## [1.0.1] - 2018-09-13

### Changed

- Lots of bugs ave been fixed. (Typically platform related ones.)

## [1.0.0] - 2018-09-12

### Added

- Skipped tests are recognised.
- `catch2TestExplorer.workerMaxNumber`, see Changed section.
- Tricky test names (with spaces in it) are handled.

### Changed

- Just global worker limitation exists from now so, it was renamed `catch2TestExplorer.globalWorkerMaxNumber` => `catch2TestExplorer.workerMaxNumber`

### Removed

- `catch2TestExplorer.defaultGroupFileLevelRun` was removed. Now just group file level run exists.
- Thats why `catch2TestExplorer.defaultWorkerMaxNumberPerFile` was unnecessary too, removed.
- And also `catch2TestExplorer.executables`'s `workerMaxNumber` was removed.
- `catch2TestExplorer.globalWorkerMaxNumber`, see Changed section.

## [0.3.0] - 2018-09-03

### Added

- `catch2TestExplorer.defaultGroupFileLevelRun`. Check [README.md] for details. If you have a loads of tests in a file or your test file starts slowly because you should benefit from this.

### Changed

- Project structure was refactored.
- Navigate to source now works before running the tests too. (Except on Windows. Probably that is not the problem of this extension.)

## [0.2.3] - 2018-09-02

### Changed

- npm update.

## [0.2.2] - 2018-08-31

## [0.2.1] - 2018-08-30

### Added

- `recursiveRegex` flag has been added.

### Changed

- Fixed debugConfigurationTemplate config default value.

## [0.2.0] - 2018-08-29

### Added

- Debug button works now if `debugConfigurationTemplate` is properly set.

### Changed

- IMPORTANT!!! Config variable names has been changed. Check the updated documentation: README.md
- Fixes some issues related to test auto-reloading after compilation.

## [0.1.1] - 2018-08-25

### Changed

- Nothing really, just refactoring.

## [0.1.0] - 2018-08-25

### Added

- Everything. This is the initial version for review.
