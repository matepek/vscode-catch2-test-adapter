# Advanced Executables

```
testMate.cpp.test.advancedExecutables
```

[[Jump to README.md](../../README)]

The location of your test executables (relative to the workspace folder or absolute path) and with a lot of other setting.

he extension is \*_pre-configured_ and it should find executables inside the working directory which match the following [_glob pattern_](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options):

`"testMate.cpp.test.advancedExecutables": [ "{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*" ]`

This basically means executables inside the `build` and `out` directories (recursive `/**/`) which contain the `test` word in their name (including extensions).

(Examples [here](#Examples))

See vscode's [documentation](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options) for syntax.

The first example (`.vscode/settings.json` or hit _Ctr/Cmd + ,_):

```json
"testMate.cpp.test.advancedExecutables": [
  {
    "pattern": "{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*",
    "cwd": "${absDirpath}",
    "env": {
      "ExampleENV1": "You can use variables here too, like ${relPath}",
      "PATH": "${os_env:PATH}${osPathEnvSep}/adding/new/item/to/PATH/env"
    }
  }
]
```

[More examples.](#Examples)

This variable can be

- a string (ex.: `"out/**/*test.exe"`) or
- an array of objects (ex.: `[ { "pattern": "release/*test.exe" }, ... ]`).

If it is an object it can contains the following properties:

| Property               | Description                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                 | The name of the test suite (file). Can contains variables related to `pattern`. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)                                                                                                                                                                                               |
| `pattern`              | A relative (to workspace directory) or an absolute path or [_glob pattern_](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options). ⚠️**Avoid backslash!**: 🚫`\`; ✅`/`; (required) [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)                                                                  |
| `description`          | A less prominent text after the `name`. Can contains variables related to `pattern`. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)                                                                                                                                                                                          |
| `cwd`                  | The current working directory for the test executable. If it isn't provided and `test.workingDirectory` does then that will be used. Can contains variables related to `pattern`. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)                                                                                             |
| `env`                  | Environment variables for the test executable. Can contains variables related to `pattern` and variables related to the process's environment variables (Ex.: `${os_env:PATH}`). [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)                                                                                              |
| `dependsOn`            | Array of (relative / absolute) _paths_ / [_glob pattern_](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options) (string[]). If a related file is _changed/created/deleted_ and autorun is enabled in "..." menu it will run the related executables. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md) |
| `parallelizationLimit` | (Experimental) The variable maximize the number of the parallel execution of one executable instance. Note: `testMate.cpp.test.parallelExecutionLimit` is a global limit. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)                                                                                                     |
| `catch2`               | Object with framework specific settings. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#framework-specific-settings)                                                                                                                                                                                                          |
| `gtest`                | Object with framework specific settings. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#framework-specific-settings)                                                                                                                                                                                                          |
| `doctest`              | Object with framework specific settings. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#framework-specific-settings)                                                                                                                                                                                                          |

The `pattern` (or the `executables` used as string or an array of strings)
can contain [_search-pattern_](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options).
Also it can contain variables related to the process's environment variables (Ex.: `${os_env:PATH}`).

Test executables and `pattern`s are being watched.
In case of one recompiles it will try to preserve the test states.
If compilation reaches timeout it will drop the suite (`testMate.cpp.discovery.defaultWatchTimeoutSec`).

**Note** that there is a mechanism which will filter out every possible executable which:

- on windows: NOT ends with `.exe`, `.cmd` or `.bat`.
- on other platforms: ends with one of the following:
  `'.a', '.bat', '.c', '.cc', '.cmake', '.cpp', '.cxx', '.deb', '.dir', '.gz', '.h', '.hpp', '.hxx', '.in', '.input', '.ko', '.log', '.md', '.mm', '.o', '.pc', '.php', '.pyc', '.rpm', '.so', '.tar', '.txt', '.vcxproj.user', '.xml'`.
- inside a sub-folder called: `_deps`. Except when it is explicitly contained by the `pattern`.

It won't filter out `'.sh'`, `'.py'` (etc.) files, so that could be used for wrappers.

If the pattern is too general like `out/**/*test*`, it could cause unexpected executable or script execution (with `--help` argument)
which would not just increase the test-loading duration but also could have other unexpected effects.
I suggest to have a stricter file-name convention and a corresponding pattern like `out/**/*.test.*` or `out/**/Test.*`

**Note** to `dependsOn`:

- ℹ️Executables found by pattern are automatically watched, don't need to add them to `dependsOn`.
- If "Enable autorun" is enabled in "**...**" menu (next to the play button), it will trigger the related test suites by detecting the recompilation of the executable.
- It accumulates events with the following strategy: waiting for 2 seconds after the last event.
- Works flawlessly with paths/patterns **inside** of the workspace directory
  (Usually there is no reason to keep your executables outside of the workspace. [See](https://github.com/matepek/vscode-catch2-test-adapter/issues/48).),
- but have some issue/limitation with paths/patterns **outside** of the workspace directory:
  - Theoretically is should support [glob patterns](https://github.com/matepek/vscode-catch2-test-adapter/issues/48),
    but it seem there is an issue with _double star_ (`**`).
  - Paths on different drive in the same `dependsOn` array maybe won't work.
  - (If you find another corner case, feel free to open an issue. It could be handy once in the future.)

## Variables

which can be used in `cwd` and `env` of `executables`:

[array index]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice

| Variable                            | Description                                                                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${absPath}`                        | Absolute path of the test executable. Supports [array index]ing.                                                                                                                             |
| `${relPath}`                        | Relative path of the test executable to the workspace folder. Supports [array index]ing.                                                                                                     |
| `${absDirpath}`                     | Absolute path of the test executable's parent directory. Supports [array index]ing.                                                                                                          |
| `${relDirpath}`                     | Relative path of the test executable's parent directory to the workspace folder. Supports [array index]ing.                                                                                  |
| `${filename}`                       | Filename (Path without directories; "`d/a.b.c`" => "`a.b.c`") Supports [array index]ing.                                                                                                     |
| `${baseFilename}`                   | Filename without extension ("`d/a.b.c`" => "`a.b`")                                                                                                                                          |
| `${extFilename}`                    | Filename extension. ("`d/a.b.c`" => "`.c`")                                                                                                                                                  |
| `${workspaceDirectory}`             | (You can only guess once.)                                                                                                                                                                   |
| `${workspaceFolder}`                | Alias of `${workspaceDirectory}`                                                                                                                                                             |
| `${workspaceName}`                  | Workspace name can be custom in case of [`workspace file`](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_workspace-file-schema).                                          |
| `${cwd}`                            | The resolved `executables`'s cwd. Can be used only in `env`. Supports [array index]ing.                                                                                                      |
| `${os_env:<varname>}`               | Resolves it to the given(`<varname>`) environment variable if exists empty string otherwise. Can be used everywhere. On Windows it is case insensitive: `${os_env:pAtH}` == `${os_env:PATH}` |
| `${os_env_strict:<varname>}`        | Resolves it to the given(`<varname>`) environment variable if exists won't set the variable othewise. Can be used ONLY in `env`.                                                             |
| `${osPathSep}`                      | `/` on Linux and macOS, `\` on Windows.                                                                                                                                                      |
| `${osPathEnvSep}`                   | `:` on Linux and macOS, `;` on Windows.                                                                                                                                                      |
| `${if(iswin)}<W>${else}<U>${endif}` | `<U>` on Linux and macOS, `<W>` on Windows.                                                                                                                                                  |

[Array index]ing: `(?:\[(-?[0-9]+)?:(-?[0-9]+)?\])?`.
Exmaple: `${relPath[:-2]}`: 'a/b/c/d' -> 'a/b'

## Framework specific settings

Under property: `catch2`, `gtest`, `doctest`.

One can fine-tune framework related behaviour.

[testgrouping]: #testgrouping

| Property                      | Description                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helpRegex`                   | A javascript [regex](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions) which will be used to recognise the framework. Flags: `su`. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)             |
| `prependTestRunningArgs`      | Additinal argument array passed to the executable when it is called for testing. Good for experimental features like `["--benchmark-samples", "10"]`. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)                           |
| `prependTestListingArgs`      | Additinal argument array passed to the executable when it is called for test listing. (Discouraged. Try to use environment variables to pass values.) [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)                           |
| `ignoreTestEnumerationStdErr` | If false (or undefined) and there are something on `stderr` then test-listing will fail. Otherwise it will ignore the `stderr` and test listing will try to parse the `stdout`. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md) |
| [testGrouping]                | Groups the tests inside the executable. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#testgrouping)                                                                                                                            |

If the regex is too general it will mach all the executables❗️
One should avoid that❗️

**Note** `.*` matches `\n`

## Examples:

```json
"testMate.cpp.test.advancedExecutables": ["dir/test1.exe", "dir/test2.exe"]
```

```json
"testMate.cpp.test.advancedExecutables": {
  "name": "${filename}",
  "description": "${relDirpath}/",
  "pattern": "{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*",
  "cwd": "${absDirpath}",
  "env": {
    "ExampleENV1": "You can use variables here too, like ${absPath}",
    "PATH": "${os_env:PATH}${osPathEnvSep}/adding/new/item/to/PATH/env"
  }
}
```

```json
"testMate.cpp.test.advancedExecutables": [
  {
    "name": "Test1 suite",
    "pattern": "dir/test.exe"
  },
  "canBeMixed.exe",
  {
    "pattern": "${os_env:HOME}/dir2/{t,T}est",
    "cwd": "out/tmp",
    "env": {}
  }
]
```

### helpRegex

In case of `gtest` the helpRegex' the first capture should be the value of [`GTEST_FLAG_PREFIX`](https://github.com/google/googletest/blob/master/googletest/include/gtest/internal/gtest-port.h#L282).
For example:

- `--gtest_list_tests` + `--(\w+)list_tests` -> `gtest_`

In case if `catch2` and `doctest` the first, second and third captures are the version number's major, minor and patch values.
For example:

- `Catch v2.11.1` + `/Catch v(\d+)\.(\d+)\.(\d+)\s?/` -> `[2, 11, 1]`

## testGrouping

It is undocumented. Contact me by opening an issue or read the code a bit.

- [interface](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/src/TestGroupingInterface.ts)
- [code](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/src/AbstractRunnable.ts#L129)

```
{
  "testMate.cpp.test.advancedExecutables": [
    {
      "pattern": "{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*",
      "catch2":  { "testGrouping": { ... } },
      "gtest":   { "testGrouping": { ... } },
      "doctest": { "testGrouping": { ... } },
    }
   ]
}
```

| Property            | Description                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groupByExecutable` | Groups tests by the executable file. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#testgrouping)                                                                                                                                                                                                                  |
| `groupBySource`     | It sorts the tests by the related source file group. (`${sourceRelPath}`, `${sourceAbsPath}`). [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#testgrouping)                                                                                                                                                        |
| `groupByTags`       | True to group by every exiting combination of the tags. (`{$tag}`) Or it can be an array of tags: `["[tag1]["tag2"]", "tag2", "tag3"]` [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#testgrouping)                                                                                                                |
| `groupByRegex`      | Groups tests by the first match group of the first matching regex. (`${match}`) Example: `["(?:good|bad) (apple|peach)"]` will create 2 groups and put the matched tests inside it. Hint: Grouping starting with \"?:\" won't count as a match group. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#testgrouping) |
| `groupUngroupedTo`  | If a test is not groupable it will be grouped by the given name. [Detail](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#testgrouping)                                                                                                                                                                                      |

### TestGrouping examples

Note: This example overused it.

```
{
  "testMate.cpp.test.advancedExecutables": [
    {
      "pattern": "{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*",
      "catch2": {
        "testGrouping": {
          "groupByExecutable": {
            "label": "${filename}",
            "description": "${relDirpath}/",
            "groupBySource": {
              "label": "Source: ${sourceRelPath[2:]}",
              "groupByTags": {
                "tags": [],
                "label": "[${tag}]"
              }
            }
          }
        }
      },
      "gtest": {
        "testGrouping": {
          "groupByExecutable": {
            "label": "${filename}",
            "description": "${relDirpath}/",
            "groupByTags": {
              "tags": [],
              "label": "[${tag}]",
              "groupBySource": {
                "label": "📝${sourceRelPath[2:]}",
                "groupUngroupedTo": "📝unknown source file"
              }
            },
          }
        }
      },
      "doctest": {
        "testGrouping": {
          "groupByExecutable": {
            "label": "${filename}",
            "description": "${relDirpath}/",
            "groupByRegex": {
              "regexes": ["(suite..)"],
              "label": "just ${match}"
            }
          }
        }
      },
    }
   ]
}
```

```
"testMate.cpp.test.advancedExecutables": [
  {
    "pattern": "{build,Build,BUILD,out,Out,OUT}/**/*{test,Test,TEST}*",
    "catch2": {
      "testGrouping": {
        "groupBySource": "[-3:]",
        "groupByTags": true, // or [["1","2"],["2"],["3"]],
        "groupByRegex": [ "(apple|peach)" ],
        "groupUngroupedTo": "ungrouped"
      }
    },
    "gtest": {
      "testGrouping": {
        "groupBySource": "[-3:-1]",
        "groupByRegex": [ "(?:good|bad) (apple|peach)" ]
      }
    },
    "doctest": {
      "testGrouping": {
        "groupBySource": "[-1]",
        "groupByRegex": ["apple", "peach"]
      }
    }
  }
]
```
