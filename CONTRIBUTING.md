# Contribution

[![Travis build status](https://img.shields.io/travis/matepek/vscode-catch2-test-adapter/master.svg?logo=Travis&style=for-the-badge)](https://travis-ci.org/matepek/vscode-catch2-test-adapter)
[![Appveyor build status](https://img.shields.io/appveyor/ci/matepek/vscode-catch2-test-adapter?style=for-the-badge)](https://ci.appveyor.com/project/matepek/vscode-catch2-test-adapter/branch/master)
[![GitHub license](https://img.shields.io/github/license/matepek/vscode-catch2-test-adapter.svg?style=for-the-badge)](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/LICENSE)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=for-the-badge)](https://github.com/prettier/prettier)

Any contribution is welcome.

- Create a pull request (against the development branch or master (if you sure your your PR is ready to be deployed)).
- Report a bug.
- Tell me about your desired features.
- [![Buy Me A Coffee](https://bmc-cdn.nyc3.digitaloceanspaces.com/BMC-button-images/custom_images/orange_img.png)](https://www.buymeacoffee.com/rtdmjYspB)

## Clone Repo

It is recommended to create a push hook:

`cp ./resources/githooks/pre-push ./.git/hooks/pre-push`

Content of **.git/hooks/pre-push** file:

```bash
#!/bin/sh
echo "pre-push hook:"
set -e -x
npm audit --production
npm rum compile
npx mocha ./out/test/Documentation.test.js ./out/test/ESLint.test.js
```

## Install

```bash
npm install
```

## Test

After installing:

```bash
npm test
```

## Debug

After installing:

- Open the folder in VSCode: `code .`
- Run task: `npm watch`. Wait unitl it is compiled.
- VSCode "Run" / Debug page: Select `Manual cpp`.
- Start debugging
- Add your folder to the newly opened VSCode's workspace.

Or change [launch.json](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/.vscode/launch.json#L27)'s `Manual cpp` to the folder which is intended to be debugged and the start.

Issues are tipically related to file operations:

- [RunnableFActory.ts](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/src/RunnableFactory.ts#L36)
- [GoogleRunnable.ts](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/src/framework/GoogleRunnable.ts#L159)
- [Catch2Runnable.ts](https://github.com/matepek/vscode-catch2-test-adapter/blob/master/src/framework/Catch2Runnable.ts#L204)

## Publishing to market

If you think your changes worth of a release, add a new version entry to `CHANGELOG.md` file without a date.
Then Travis will publish it automatically.

## Checklist

- [ ] Are the tests are running? (`npm test`)
- [ ] Is the `CHANGELOG.md` was updated? (optional)

## TODOs

- https://www.npmjs.com/package/fast-xml-parser
- doctest: supporting test suites
- Test cases: google test, catch2: info, warn, fail, stdout, stderr, capture, gtest_skip, gmock_verbose
- gaze is not good enough: detects change and delete, but not creation
- `dependsOn` could contain variables
- https://github.com/nodejs/node-gyp
