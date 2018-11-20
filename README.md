## **Warning**: Version 2 has been released: **API has been changed**.

Update your settings! ([See changelog](CHANGELOG.md) or [configuration below](#Configuration).)

---

## Catch2 Test Explorer for Visual Studio Code

[![Build Status](https://travis-ci.org/matepek/vscode-catch2-test-adapter.svg?branch=master)](https://travis-ci.org/matepek/vscode-catch2-test-adapter)
[![Build status](https://ci.appveyor.com/api/projects/status/p6uuyg21cwxcnlv9/branch/master?svg=true)](https://ci.appveyor.com/project/matepek/vscode-catch2-test-adapter/branch/master)
[![GitHub issues](https://img.shields.io/github/issues/matepek/vscode-catch2-test-adapter.svg)](https://github.com/matepek/vscode-catch2-test-adapter/issues)
[![GitHub license](https://img.shields.io/github/license/matepek/vscode-catch2-test-adapter.svg)](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/LICENSE)
[![Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/d/matepek.vscode-catch2-test-adapter.svg)](https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter)
[![Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/v/matepek.vscode-catch2-test-adapter.svg)](https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter)

This extension allows you to run your [Catch2 tests](https://github.com/catchorg/Catch2) using the
[Test Explorer for VS Code](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

## Configuration

| Property                                    | Description                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catch2TestExplorer.executables`            | The location of your test executables (relative to the workspace folder or absolute path) and with a lot of other setting. Details: [below](#catch2TestExplorer.executables) |
| `catch2TestExplorer.defaultEnv`             | Default environment variables to be set when running the tests, if it isn't provided in 'executables'. (Resolves: \${workspaceFolder})                                       |
| `catch2TestExplorer.defaultCwd`             | The working directory where the test is run (relative to the workspace folder or absolue path), if it isn't provided in "executables". (Resolves: \${workspaceFolder})       |
| `catch2TestExplorer.defaultRngSeed`         | Specify a seed for the Random Number Generator. For details see [Catch2 documentation](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#rng-seed)         |
| `catch2TestExplorer.defaultWatchTimeoutSec` | Test executables are being watched. In case of one compiles too much this variable can help with it. Unit: second.                                                           |
| `catch2TestExplorer.workerMaxNumber`        | The variable maximize the number of the parallel test execution.                                                                                                             |
| `catch2TestExplorer.enableSourceDecoration` | Sets the source code decorations: Errored lines will be highlited.                                                                                                           |
| `catch2TestExplorer.debugConfigTemplate`    | Set the necessary debug configuraitons and the debug button will work. Details: [below](#catch2TestExplorer.debugConfigTemplate)                                             |
| `testExplorer.onStart`                      | (This is part of the [dependency extension](https://github.com/hbenl/vscode-test-explorer#configuration)'s settings.)                                                        |
| `testExplorer.onReload`                     | (This is part of the [dependency extension](https://github.com/hbenl/vscode-test-explorer#configuration)'s settings.)                                                        |

### catch2TestExplorer.executables

This variable can be string, an array of strings, an array of objects or an array of strings and objects.

If it is an object it can contains the following properties:

| Property  |            | Description                                                                                                                                                                                                         |
| --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`    | (optional) | The name of the test suite (file). Can contains variables related to `pattern`.                                                                                                                                     |
| `pattern` | (requierd) | A relative pattern (to workspace) or an absolute file-path. ⚠️**Avoid backslash!** ([Details](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options)). Example: `{build,out}/**/test[1-9]*` |
| `path`    | (alias)    | Alias of `pattern`.                                                                                                                                                                                                 |
| `cwd`     | (optional) | The current working directory for the test executable. If it isn't provided and `defaultCwd` does, then that will be used. Can contains variables related to `pattern`.                                             |
| `env`     | (optional) | Environment variables for the test executable. If it isn't provided and `defaultEnv` does, then that will be used. Can contains variables related to `pattern`.                                                     |

Variables which can be used in `name`, `cwd` and `env` of `executables`:

| Variable                | Description                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| `${absPath}`            | Absolute path of the test executable                                            |
| `${relPath}`            | Relative path of the test executable to the workspace folder                    |
| `${absDirpath}`         | Absolute path of the test executable's parent directory                         |
| `${relDirpath}`         | Relative path of the test executable's parent directory to the workspace folder |
| `${filename}`           | Filename ( = Path withouth directories, "d/a.b.c" => "a.b.c")                   |
| `${baseFilename}`       | Filename without extension ("d/a.b.c" => "a.b")                                 |
| `${extFilename}`        | Filename extension. ("d/a.b.c" => ".c")                                         |
| `${base2Filename}`      | Filename without extension ("d/a.b.c" => "a")                                   |
| `${ext2Filename}`       | Filename's second level extension. ("d/a.b.c" => ".b")                          |
| `${base3Filename}`      | Filename without extension ("d/a.b.c" => "a")                                   |
| `${ext3Filename}`       | Filename's second level extension. ("d/a.b.c" => "")                            |
| `${workspaceDirectory}` | (You can only guess one.)                                                       |
| `${workspaceFolder}`    | Alias of `${workspaceDirectory}`                                                |

Examples:

```json
"catch2TestExplorer.executables": "dir/test.exe"
```

```json
"catch2TestExplorer.executables": ["dir/test1.exe", "dir/test2.exe"]
```

```json
"catch2TestExplorer.executables": {
	"name": "${relName} (${relDirname}/)",
	"pattern": "{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*",
	"cwd": "${absDirpath}",
	"env": {
		"ExampleENV1": "You can use variables here too, like ${absName}"
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
it will look after `vadimcn.vscode-lldb` and `ms-vscode.cpptools` extensions.
If it founds one of it, it will use it automatically.

#### Or user can manually fill it

See [here](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations) for details.

Usable variables:

| Variable name | Value meaning                                       | Type                    |
| ------------- | --------------------------------------------------- | ----------------------- |
| `${label}`    | The name of the test. Same as in the Test Explorer. | string                  |
| `${exec}`     | The path of the executable.                         | string                  |
| `${args}`     | The arguments for the executable.                   | string[]                |
| `${cwd}`      | The current working directory for execution.        | string                  |
| `${envObj}`   | The environment variables as object properties.     | { [prop: string]: any } |

These variables will be substituted when a DebugConfiguration is created.

Note that `name` and `request` are prefilled, so it is not necessary to set them.

Example:

```json
{
  "type": "cppdbg",
  "MIMode": "lldb",
  "program": "${exec}",
  "args": "${args}",
  "cwd": "${cwd}",
  "env": "${envObj}",
  "externalConsole": false
}
```

## License

[The Unlicense](https://choosealicense.com/licenses/unlicense/)

## Known issues

- (2018-09-03) On windows the navigate to source button isn't working. It is a framework bug.
- (2018-11-17) Long (>80 character) filename, test-name or description can cause test-list parsing failures. Workaround: `#define CATCH_CONFIG_CONSOLE_WIDTH 9999`

## TODOs

- Implement more [Catch command line options](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#specifying-which-tests-to-run), such as:
  - `--nothrow`

## Contribution

Any contribution is welcome.

- Create a pull request.
- Report a bug.
- Tell me about requested features.
