# Support

For support open an issue with **detailed** description and please attach logs.

## Getting logs

Set `testMate.cpp.log.logpanel: true` and check the VSCode oputput window. Change the window to "Test Explorer: ...". The log should be there.

Or one can set the `testMate.cpp.log.logfile: "<full path>"`. In this case a logfile will be created to the given path. Close VSCode to flush the log before you attach to an issue.

**Don't forget** to disable after it by un-setting. Unnecessary logging can have a performance impact on VSCode.

## Known issues

- (2018-09-03) On windows the navigate to source button isn't working. It is a framework bug.
- (2018-11-17) Catch2: Long (>80 character) filename, test-name or description can cause test-list parsing failures.
  Workaround: `#define CATCH_CONFIG_CONSOLE_WIDTH 300` and it has to be defined before every `#include "catch.hpp"` lines.
- (2019-12-27) doctest 2.3.6 is support file and line informations. Previous version will recognise the tests but navigation will be disabled.
- (2020-04-19) Catch2 version < 2.11.4 have a parameter parsing problem issue which makes some test name restrictions. The extension will notify if you are affected.
- (2020-12-05) Catch2 test result parsing can fail if the test outputs unescaped "xml-like" text: `<Pin:10>`.

## For self-service

Check [CONTRIBUTING.md](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/CONTRIBUTING.md).

## F.A.Q

### Link / Build process fails because the executable is locked by this extension.

> Check `testMate.cpp.test.advancedExecutables` -> `waitForBuildProcess`.

### Debug button doesn't work / stopped working

> Please check the documentation of [debug.configTemplate](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/debug.configTemplate.md).

### Wanna see the test run results in the status bar too.

> Check this extension: [Test Explorer Status Bar](https://marketplace.visualstudio.com/items?itemName=connorshea.vscode-test-explorer-status-bar)

### Custom scripts and **environment** variables

Check

- [`advancedExecutables.dependsOn`](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)
- [`advancedExecutables.envFile`](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md) (usually used togheter with `dependsOn`)
- [`advancedExecutables.runTask`](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)
- [`advancedExecutables.executionWrapper`](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md)

### I want to add custom environment variables

Easiest: `advancedExecutables.env`

If you want dynamically set enviranment variables generate a file which contains those variables in a JSON format and set `envFile` and `dependsOn`.

### I want to run some **custom script** before the tests (for example to set some environment variables and do some init), how should I do that?

> Create command line wrapper (.sh/.bat) or a python script wrapper. The most convenient way is to generate one.
>
> Would you show me an example?
>
> Sure! For example in case of CMake: [check this](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/examples/test_wrapper/cmake_test_wrapper_example/CMakeLists.txt).
> Note: However this is the easiest, not the best solution.
> There is a drawback: Debugging button won't work, since the debuger will attach to the script not to the executable started by the script.
>
> Is there a solution for that?
>
> Yes. One can enhance their test executable from c++. The example is [here](https://github.com/matepek/vscode-catch2-test-adapter/tree/master/documents/examples/test_wrapper/cppmain_test_wrapper_example)

### Wanna set `cwd` to the _source file_'s dir to use the resources next to it and my structure looks like (because I use cmake):

>

```
<workspaceFolder>/src/a/resources/
<workspaceFolder>/src/a/test1.cpp
<workspaceFolder>/build/a/test1.exe
```

> You can try this:
>
> ```
> "testMate.cpp.test.advancedExecutables": [
>   {
>     "pattern": "build/**/test*.exe",
>     "cwd": "${relDirpath[1:]}/resources"
>   }
> ]
> ```
>
> This will remove the `build/` from the beggining of the relative path of the executable.

### My tests are fine from command line but running fails using this extension.

> What are the values of `testMate.cpp.test.parallelExecutionLimit`, `testMate.cpp.test.parallelExecutionOfExecutableLimit` or `testMate.cpp.test.advancedExecutables`'s `parallelizationLimit`?
> These values can make a mess if your excutable/executables depending on the same resource(s).

### Loading takes a lot of time:

> Enable `testMate.cpp.discovery.testListCaching`.

### Can I run test disovery or all my tests at startup?

> Sure you can. VSCode provides a fine way to do it:
> Create a task (`.vscode/tasks.json`) which will be triggered at startup:
>
> ```
> {
>   "label": "Activate Test Explorer",
>   "command": "${command:test-explorer.reload}",
>   "problemMatcher": [],
>   "runOptions": {
>     "runOn": "folderOpen" // This will cause the triggering. Have to run manually once!
>   }
> }
> ```

### Can I run my tests at startup.

> Well that is a bit triciker due to the activation event has to arrive before the run command.
> Here is the workaround:
>
> ```
> "tasks": [
>  {
>    "label": "LoadTests",
>    "type": "shell",
>    "command": "sleep 1; echo ${command:test-explorer.reload}",
>    "problemMatcher": []
>  },
>  {
>    "label": "LoadAndRunAllTests",
>    "command": "echo ${command:test-explorer.run-all}",
>    "problemMatcher": [],
>    "runOptions": {
>      "runOn": "folderOpen"
>    },
>    "dependsOn": ["LoadTests"]
>  }
> ]
> ```

### Test parsing fails because my executable writes some stuff to the error channel / `std::cerr`.

> Check `test.advancedExecutables` -> [ignoreTestEnumerationStdErr](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/configuration/test.advancedExecutables.md#ignoreTestEnumerationStdErr)
