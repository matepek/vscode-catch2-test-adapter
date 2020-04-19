# Support

For support open an issue with detailed description and please attach logs.

## Getting logs

Set `catch2TestExplorer.logpanel: true` and check the VSCode oputput window. Change the window to "Test Explorer: ...". The log should be there.

Or one can set the `catch2TestExplorer.logfile: "<full path>"`. In this case a logfile will be created to the given path. Close VSCode to flush the log before you attach to an issue.

**Don't forget** to disable after it by un-setting. Unnecessary logging can have a performance impact on VSCode.

## Known issues

- (2018-09-03) On windows the navigate to source button isn't working. It is a framework bug.
- (2018-11-17) Catch2: Long (>80 character) filename, test-name or description can cause test-list parsing failures.
  Workaround: `#define CATCH_CONFIG_CONSOLE_WIDTH 300` and it has to be defined before every `#include "catch.hpp"` lines.
- (2019-12-27) doctest 2.3.6 is support file and line informations. Previous version will recognise the tests but navigation will be disabled.
- (202004-19) Catch2 version < 2.11.4 have a parameter parsing problem issue which makes soem test name restrictions. The extension will notify if you are affected.

For solving issues use: check [support](#Support).

## F.A.Q

> Wanna see the test run results in the status bar too.
>
> > Check this extension: [Test Explorer Status Bar](https://marketplace.visualstudio.com/items?itemName=connorshea.vscode-test-explorer-status-bar)

> I want to run some **custom script** before the tests (for example to set some environment variables and do some init), how should I do that?
>
> > Create command line wrapper (.sh/.bat) or a python script wrapper. The most convenient way is to generate one.
>
> Would you show me an example?
>
> > Sure! For example in case of CMake: [check this](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/documents/examples/test_wrapper/cmake_test_wrapper_example/CMakeLists.txt).
> > Note: However this is the easiest, not the best solution.
> > There is a drawback: Debugging button won't work, since the debuger will attach to the script not to the executable started by the script.
>
> Is there a solution for that?
>
> > Yes. One can enhance their test executable from c++. The example is [here](https://github.com/matepek/vscode-catch2-test-adapter/tree/master/documents/examples/test_wrapper/cppmain_test_wrapper_example)

> Wanna set `cwd` to the _source file_'s dir to use the resources next to it and my structure looks like (because I use cmake):
>
> ```
> <workspaceFolder>/src/a/resources/
> <workspaceFolder>/src/a/test1.cpp
> <workspaceFolder>/build/a/test1.exe
> ```
>
> > You can try this:
> >
> > ```
> > "catch2TestExplorer.executables": [
> >   {
> >     "pattern": "build/**/test*.exe",
> >     "cwd": "${relDirpath[1:]}/resources"
> >   }
> > ]
> > ```
> >
> > This will remove the `build/` from the beggining of the relative path of the executable.
