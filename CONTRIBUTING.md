[![GitHub license](https://img.shields.io/github/license/matepek/vscode-catch2-test-adapter.svg?style=for-the-badge)](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/LICENSE)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=for-the-badge)](https://github.com/prettier/prettier)

# Contribution

Author's note:

> This extension is my way of giving back / saying thanks to the open-source community. If you are an open-source contributor then I take it as you already thanked. :)
>
> Otherwise if you wanna express yourself you can buy me a [coffee](https://www.buymeacoffee.com/rtdmjYspB).
> Or you can just [rate](https://marketplace.visualstudio.com/items?itemName=matepek.vscode-catch2-test-adapter&ssr=false#review-details) the extension.
> Whatever fits your budget.

## Contributing to the source

- Report a bug ("properly").
- Tell me about your desired features.
- Create a pull request (against the development branch or master (if you sure your your PR is ready to be deployed)).

### Clone Repo

It is recommended to create a push hook:

`cp ./resources/githooks/pre-push ./.git/hooks/pre-push`

Content of **.git/hooks/pre-push** file:

```bash
#!/bin/sh
echo "pre-push hook:"
set -e -x
npm audit --production
npm run compile
npx mocha ./out/test/Documentation.test.js ./out/test/ESLint.test.js
```

### Install

```bash
npm install
```

### Test

After installing:

```bash
npm test
```

### Debug

After test:

1. Open the folder in VSCode: `code .`.
2. Let task `npm watch` run in the background.
3. VSCode "Run" / Debug page: Select `Manual cpp`.
4. Start debugging.
5. Add your folder to the newly opened VSCode's workspace. (Or change [launch.json](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/.vscode/launch.json#L27)'s `Manual cpp` to the folder which is intended to be debugged and the start.)

Issues are tipically related to file operations:

- [RunnableFactory.ts](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/src/RunnableFactory.ts#L36)
- [GoogleRunnable.ts](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/src/framework/GoogleTestRunnable.ts)
- [Catch2Runnable.ts](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/src/framework/Catch2Runnable.ts#L204)

### Publishing to market

If you think your changes worth of a release add a new version entry to `CHANGELOG.md` file without a date. Travis will publish it automatically.

## TODO:future

- doctest: supporting test suites
- Test cases: google test, catch2: info, warn, fail, stdout, stderr, capture, gtest_skip, gmock_verbose
- gaze is not good enough: detects change and delete, but not creation
- Use https://github.com/assistunion/xml-stream/blob/master/tests/test-readable-stream.js
- https://www.npmjs.com/package/ansi-colors

## VSCE_PAT

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- https://matepek.visualstudio.com/_usersSettings/tokens

## VSCODE TESTING API

### TODOs

- 1. run skipped directly; 2. run skipped by parent; see status: not resetted, shouldn't be
- merge changes from legacy `git difftool -d v3.6.31 v3.6.33`
- if parallel exec limit > 1 then prefix PID
