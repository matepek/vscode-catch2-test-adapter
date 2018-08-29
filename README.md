# Catch2 Test Explorer

This extension allows you to run your [Catch2 tests](https://github.com/catchorg/Catch2) using the
[Test Explorer for VS Code](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

**Note:** Catch2 is a nice and feature-rich C++ testig framework.
This adapter not supports everything.

## Configuration

| Property                                           | Description                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catch2TestExplorer.executables`                   | The location of your test executables (relative to the workspace folder or absolute path) and with a lot of other setting.                                            |
| `catch2TestExplorer.defaultEnv`                    | Default environment variables to be set when running the tests, if it isn't provided in 'executables'. (Resolves: ${workspaceFolder})                                 |
| `catch2TestExplorer.defaultCwd`                    | The working directory where the test is run (relative to the workspace folder or absolue path), if it isn't provided in 'executables'. (Resolves: ${workspaceFolder}) |
| `catch2TestExplorer.defaultWorkerMaxNumberPerFile` | The variable maximize the number of the parallel test execution per file, if it isn't provided in 'executables'.                                                      |
| `catch2TestExplorer.globalWorkerMaxNumber`         | The variable maximize the number of the parallel test execution.                                                                                                      |
| `catch2TestExplorer.enableSourceDecoration`        | Sets the source code decorations: Errored lines will be highlited.                                                                                                    |

### `catch2TestExplorer.executables`

This can be string, an array of strings, an array of objects or an array of strings and objects.

| Property          | Description                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | The name of the test suite (optional)                                                                                                                                                                                                 |
| `path`            | A relative (to workspace) or an absolute directory- or file-path. (required) If it is a directory, the matching children will be added (see `regex`).                                                                                 |
| `regex`           | If `path` is a directory all matching children will be added (if there is no error).                                                                                                                                                  |
| `workerMaxNumber` | This number limits the parallel execution of tests for the current group/file. If `path` is a directory, every valid child has this value. If it isn't provided and `defaultWorkerMaxNumberPerFile` provided, then that will be used. |
| `cwd`             | The current working directory for the test executable. If it isn't provided and `defaultCwd` does, then that will be used.                                                                                                            |
| `env`             | Environment variables for the test executable. If it isn't provided and `defaultEnv` does, then that will be used.                                                                                                                    |

Examples:

```json
"catch2TestExplorer.executables": "dir/test.exe"
```

```json
"catch2TestExplorer.executables": ["dir/test1.exe", "dir/test2.exe"]
```

```json
"catch2TestExplorer.executables": {
	"name": "workspace dir: ", //optional
	"path": "dir/test.exe",
	"regex": "(t|T)est", //optional
	"workerMaxNumber": 1, //optional
	"cwd": ".", //optional
	"env": {} //optional
}
```

```json
"catch2TestExplorer.executables": [
	{
		"name": "Test1 suite", //optional
		"path": "dir/test.exe",
		"regex": "(t|T)est", //optional, it has only meaning if path is a directory
		"workerMaxNumber": 1, //optional
		"cwd": ".", //optional
		"env": {} //optional
	},
	{
		"path": "dir2",
		"regex": "(t|T)est", //optional, now it is used to search for tests under dir2
		"workerMaxNumber": 1, //optional
		"cwd": ".", //optional
		"env": {} //optional
	}
]
```

## License

[The Unlicense](https://choosealicense.com/licenses/unlicense/)

## TODOs

- Better Catch2 xml parser (just a bit)
- Logger

## Contribution

Any contribution is welcome.
