# Catch2 Test Explorer for Visual Studio Code

This extension allows you to run your [Catch2 tests](https://github.com/catchorg/Catch2) using the
[Test Explorer for VS Code](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

**Note:** Catch2 is a nice and feature-rich C++ testig framework.
This adapter doesn't support everything.

## Configuration

| Property                                        | Description                                                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catch2TestExplorer.executables`                | The location of your test executables (relative to the workspace folder or absolute path) and with a lot of other setting. Details: [below](#catch2TestExplorer.executables) |
| `catch2TestExplorer.defaultEnv`                 | Default environment variables to be set when running the tests, if it isn't provided in 'executables'. (Resolves: ${workspaceFolder})                                        |
| `catch2TestExplorer.defaultCwd`                 | The working directory where the test is run (relative to the workspace folder or absolue path), if it isn't provided in 'executables'. (Resolves: ${workspaceFolder})        |
| `catch2TestExplorer.defaultRngSeed`             | Specify a seed for the Random Number Generator. For details see [Catch2 documentation](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#rng-seed)         |
| `catch2TestExplorer.workerMaxNumber`            | The variable maximize the number of the parallel test execution.                                                                                                             |
| `catch2TestExplorer.enableSourceDecoration`     | Sets the source code decorations: Errored lines will be highlited.                                                                                                           |
| `catch2TestExplorer.debugConfigurationTemplate` | Set the necessary debug configuraitons and the debug button will work. Details: [below](#catch2TestExplorer.debugConfigurationTemplate)                                      |

### catch2TestExplorer.executables

This `catch2TestExplorer.executables` variable can be string, an array of strings, an array of objects or an array of strings and objects.

| Property         |            | Description                                                                                                                                                                                      |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`           | (optional) | The name of the test suite (file). Can contains `${dirname}`, `${absDirname}`, `${name}` if `regex` is provided.                                                                                 |
| `path`           | (requierd) | A relative (to workspace) or an absolute directory- or file-path. If it is a directory, the matching children will be added (see `regex`).                                                       |
| `regex`          | (optional) | If `path` is a directory all matching children (full path) will be added (if there is no error).                                                                                                 |
| `recursiveRegex` | (optional) | If true and `path` is a directory, it will search for the `regex` pattern recursively.                                                                                                           |
| `cwd`            | (optional) | The current working directory for the test executable. If it isn't provided and `defaultCwd` does, then that will be used. Can contains `${dirname}` and `${absDirname}` if `regex` is provided. |
| `env`            | (optional) | Environment variables for the test executable. If it isn't provided and `defaultEnv` does, then that will be used.                                                                               |

Examples:

```json
"catch2TestExplorer.executables": "dir/test.exe"
```

```json
"catch2TestExplorer.executables": ["dir/test1.exe", "dir/test2.exe"]
```

```json
"catch2TestExplorer.executables": {
	"name": "${dirname} : ${name}",
	"path": "./build",
	"regex": "(t|T)est",
	"cwd": "${absDirname}",
	"env": {}
}
```

```json
"catch2TestExplorer.executables": [
	{
		"name": "Test1 suite",
		"path": "dir/test.exe",
		"cwd": ".",
		"env": {}
	},
	"singleTest.exe",
	{
		"path": "dir2",
		"regex": "(t|T)est",
		"recursiveRegex": false,
		"cwd": ".",
		"env": {}
	}
]
```

### catch2TestExplorer.debugConfigurationTemplate

For help, see: [here](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations)

Usable variables:

| Variable name | Value meaning                                       | Type                    |
| ------------- | --------------------------------------------------- | ----------------------- |
| `${label}`    | The name of the test. Same as in the Test Explorer. | string                  |
| `${exec}`     | The path of the executable.                         | string                  |
| `${args}`     | The arguments for the executable.                   | string[]                |
| `${cwd}`      | The current working directory for execution.        | string                  |
| `${envObj}`   | The environment variables as object properties.     | { [prop: string]: any } |

These variables will be substituted when a DebugConfiguration is created.

`name` and `request` are prefilled, so it is not necessary to set them.

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

- On windows the navigate to source button isn't working. I assume it is a framework bug.

## TODOs

- Implement more [Catch command line options](https://github.com/catchorg/Catch2/blob/master/docs/command-line.md#specifying-which-tests-to-run), such as:

  - `--nothrow`

- Tests

## Contribution

Any contribution is welcome.
