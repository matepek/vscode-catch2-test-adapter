[[Jump to README](../../README.md)]

# Debugger Configuration Template

```
testMate.cpp.debug.configTemplate
```

Sets the necessary debug configurations and the debug button will work.

If `testMate.cpp.debug.configTemplate` value is `null` (default),

> it searches for configurations in the workspacefolder's `.vscode/launch.json`.
> It will choose the first one which's `"request"` property is `"launch"`
> and has `type` property with string value starting with `cpp`, `lldb` or `gdb`.
> (If you don't want this but also don't want to specify you own debug.configTemplate
> use `"extensionOnly"` as value.)

In case it hasn't found one it will look after:

> 1. [`vadimcn.vscode-lldb`](https://github.com/vadimcn/vscode-lldb#quick-start),
> 2. [`webfreak.debug`](https://github.com/WebFreak001/code-debug),
> 3. [`ms-vscode.cpptools`](https://github.com/Microsoft/vscode-cpptools)
>
> extensions in order. If it finds one of it, it will use it automatically.
> For further details check [VSCode launch config](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations).

**Remark**: This feature to work automatically (value: `null`) has a lot of requirements which are not listed here.
If it works it is good for you.
If it isn't.. I suggest to create your own `"testMate.cpp.debug.configTemplate"` template.
If you read the _Related documents_ and still have a question feel free to open an issue.
Value `"extensionOnly"` will cause to skip the search of local launch configurations.

#### or user can manually fill it

> Note that `name` and `request` are filled, if they are undefined, so it is not necessary to set them. `type` is required.

For [`ms-vscode.cpptools`](https://code.visualstudio.com/docs/cpp/launch-json-reference) add something like this to settings.json:

```json
"testMate.cpp.debug.configTemplate": {
  "type": "cppvsdbg",
  "linux": { "type": "cppdbg", "MIMode": "gdb" },
  "darwin": { "type": "cppdbg", "MIMode": "lldb" },
  "win32": { "type": "cppvsdbg" },
  "program": "${exec}",
  "args": "${argsArray}",
  "cwd": "${cwd}",
  "env": "${envObj}",
  "environment": "${envObjArray}",
  "sourceFileMap": "${sourceFileMapObj}",
}
```

For [`vadimcn.vscode-lldb`](https://github.com/vadimcn/vscode-lldb#quick-start) add something like this to settings.json:

```json
"testMate.cpp.debug.configTemplate": {
  "type": "cppdbg",
  "MIMode": "lldb",
  "program": "${exec}",
  "args": "${argsArray}",
  "cwd": "${cwd}",
  "env": "${envObj}",
  "sourceFileMap": "${sourceFileMapObj}",
  "externalConsole": false
}
```

#### Usable variables:

| Variable name         | Value meaning                                                             | Type                            |
| --------------------- | ------------------------------------------------------------------------- | ------------------------------- |
| `${label}`            | The name of the test. Same as in the Test Explorer.                       | string                          |
| `${suiteLabel}`       | The name of parent suites of the test. Same as in the Test Explorer.      | string                          |
| `${exec}`             | The path of the executable.                                               | string                          |
| `${argsArray}`        | The arguments for the executable.                                         | string[]                        |
| `${argsArrayFlat}`    | The arguments for the executable.                                         | string[]                        |
| `${argsStr}`          | Concatenated arguments for the executable.                                | string                          |
| `${cwd}`              | The current working directory for execution.                              | string                          |
| `${envObj}`           | The environment variables as object properties.                           | { [prop: string]: string }      |
| `${envObjArray}`      | The environment variables as array of objects. (for `ms-vscode.cpptools`) | { name:string, value:string }[] |
| `${sourceFileMapObj}` | The file path mapping object added to `advancedExecutables.sourceFileMap` | { [prop: string]: string }      |

These variables will be substituted when a DebugConfiguration is created.

#### Special fields

##### `testMate.cpp.debug.setEnv` (Record<string,string>)

Key-Value map to overwrite the given environment variables for in case of debugging.

Usage example:

```json
"testMate.cpp.debug.configTemplate": {
  "type": "cppvsdbg",
  "linux": { "type": "cppdbg", "MIMode": "gdb" },
  "darwin": { "type": "cppdbg", "MIMode": "lldb" },
  "win32": { "type": "cppvsdbg" },
  "program": "${exec}",
  "args": "${argsArray}",
  "cwd": "${cwd}",
  "env": "${envObj}",
  "environment": "${envObjArray}",
  "sourceFileMap": "${sourceFileMapObj}",
  "testMate.cpp.debug.setEnv": {
    "GTEST_CATCH_EXCEPTIONS": "0",
    "OVERWRITE_ME": "this env will be added or overwritten with this value",
    "UNSET_ME": null
  }
}
```

#### Remarks

The lack of `type` property in the root object raises a warning but actually it is not required if the platform specific version will overwrite it. See example bellow.

```
"testMate.cpp.debug.configTemplate": {
  "type": "${assert:testMate.cpp.debug.configTemplate doesn't support this platform.}",
  "linux": { "type": "cppdbg", "MIMode": "gdb" },
  "darwin": { "type": "cppdbg", "MIMode": "lldb" },
  "windows": { "type": "cppvsdbg" },
  ...
}
```

One can put an assertion there: `"type": "${assert}"` or `"type": "${assert:<custom message>}"`.
