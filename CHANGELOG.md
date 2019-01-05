# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.3.10] - 2019-01-05

Performance and stability impovements.

## [2.3.9] - 2019-01-03

### Fixed

- a bug which caused that `files.exlude` were also applied to pattern. Not anymore.
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

  - Also the unit has changed from milisecond to **second**.

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
  newly created executables will be added automtically, deleted ones will be removed and changed ones will be refresed.

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

- Loads of bugs ave been fixed. (Typically platform related ones.).

## [1.0.0] - 2018-09-12

### Added

- Skipped tests are recognised.
- `catch2TestExplorer.workerMaxNumber`, see Changed section.
- Tricky test names (with spaces in it) are handeld.

### Changed

- Just global worker limitation exists from now so, it was renamed `catch2TestExplorer.globalWorkerMaxNumber` => `catch2TestExplorer.workerMaxNumber`

### Removed

- `catch2TestExplorer.defaultGroupFileLevelRun` was removed. Now just group file level run exists.
- Thats why `catch2TestExplorer.defaultWorkerMaxNumberPerFile` was unnecesary too, removed.
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
