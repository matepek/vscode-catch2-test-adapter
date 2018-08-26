# Catch2 Test Explorer

This extension allows you to run your [Catch2 tests](https://github.com/catchorg/Catch2) using the
[Test Explorer for VS Code](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

**Note:** Catch2 is a nice and feature-rich C++ testig framework.
This adapter not supports everything.

## Configuration

### `catch2TestExplorer.executables`:

The location of your test executables (relative to the workspace folder or absolute path) and with a lot of other setting.

This can be string, an array of strings, an array of objects or an array of strings and objects.

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
	"workerPool": 1, //optional
	"workingDirectory": ".", //optional
	"environmentVariables": {} //optional
}
```

```json
"catch2TestExplorer.executables": [
	{
		"name": "Test1 suite", //optional
		"path": "dir/test.exe",
		"regex": "(t|T)est", //optional, it has only meaning if path is a directory
		"workerPool": 1, //optional
		"workingDirectory": ".", //optional
		"environmentVariables": {} //optional
	},
	{
		"path": "dir2",
		"regex": "(t|T)est", //optional, now it is used to search for tests under dir2
		"workerPool": 1, //optional
		"workingDirectory": ".", //optional
		"environmentVariables": {} //optional
	}
]
```

- `name`: The name of the test suite (optional)
- `path`: A relative (to workspace) or an absolute directory- or file-path. (required) If it is a directory, the matching children will be added (see `regex`).
- `regex`: If `path` is a directory all matching children will be added (if there is no error).
- `workerPool`: This number limits the number of the parallel running of the executable. If `path` is a directory, every valid child has this value.
- `workingDirectory`: The working directory while the tests are running.
- `environmentVariables`: Environment variables for the executable.

### `catch2TestExplorer.globalWorkerPool`

This number limits the number of the parallel running of ALL executables.

### `catch2TestExplorer.globalEnvironmentVariables`

Environment variables for ALL executable.

### `catch2TestExplorer.globalWorkingDirectory`

The default working directory in case of it is not provided by the object's `workingDirectory` property.

## License

[The Unlicense](https://choosealicense.com/licenses/unlicense/)

## TODOs

- Better Catch2 xml parser (just a bit)
- Logger

## Contribution

Any contribution is welcome.
