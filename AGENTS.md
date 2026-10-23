# AGENTS.md

Instructions for AI coding agents working in this repository. These rules are mandatory.
When they conflict with a general habit of yours, follow this file.

## Project

**TestMate C++** (`matepek.vscode-catch2-test-adapter`): a VS Code extension that discovers and runs
Catch2, GoogleTest, doctest, CppUTest and Google Benchmark executables through the native VS Code Testing API.

- Language: TypeScript (strict), compiled with `tsc` to `out/`, bundled with webpack to `out/dist/main.js`.
- Runtime: Node from `.nvmrc` (`node`); CI uses Node 24.x.
- VS Code API floor: `engines.vscode` is `^1.125.0` and `@types/vscode` is pinned to `1.125.0`.
  **Do not use VS Code APIs newer than 1.125.0** and do not bump either pin without the maintainer's approval.

## Layout

| Path                                                                         | Contents                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`                                                                | Extension entry point (the only `src` file in `tsconfig.json` `include`)                                                                                                            |
| `src/WorkspaceManager.ts`, `src/TestItemManager.ts`, `src/Configurations.ts` | Workspace, test tree and settings handling                                                                                                                                          |
| `src/framework/`                                                             | Per-framework executables and tests: `Catch2/`, `GoogleTest/`, `doctest/`, `GoogleBenchmark/`, `CppUTest/`, plus `ExecutableFactory.ts`, `AbstractExecutable.ts`, `AbstractTest.ts` |
| `src/coverage/`                                                              | gcov / llvm-cov / custom coverage (experimental)                                                                                                                                    |
| `src/util/`                                                                  | FS wrappers and watchers, task queue/pool, XML and stream parsers, variable resolution (`ResolveRule.ts`)                                                                           |
| `test/*.test.ts`                                                             | Mocha tests, run inside a VS Code instance                                                                                                                                          |
| `test/disabled_TODO/`                                                        | Old tests, excluded from compilation. Do not re-enable or edit unless asked                                                                                                         |
| `test/cpp/`, `test/bazel/`                                                   | Real C++ test projects used for manual testing                                                                                                                                      |
| `test/repo_scripts/deploy.ts`                                                | Release automation run by CI                                                                                                                                                        |
| `documents/configuration/`                                                   | User docs for `test.advancedExecutables` and `debug.configTemplate`                                                                                                                 |

## Required checks

Run these before you report any code change as done. A task is not finished while any of them fails.

```bash
npm run compile      # tsc, strict. Zero errors.
npm run eslint       # eslint src. Zero errors and zero warnings.
npx prettier --check "src/**/*.ts" "test/*.ts"
npm test             # compiles, then runs Mocha inside VS Code via @vscode/test-electron.
```

If you changed bundling, imports or dependencies, also run `npm run webpack`. CI runs it on Linux.

Report the actual results (for example "44 passing, 1 pending"). Never say tests pass without having run them.
If a check cannot run in your environment, say so explicitly and do not claim success.

### About `npm test`

- It downloads VS Code into `.vscode-test/` on first run and launches it. On macOS and Windows it runs
  directly. On headless Linux it needs a display (CI uses `Xvfb :99` with `DISPLAY=:99.0`).
- If VS Code fails to launch (for example `spawn ... ENOENT`), first make sure `node_modules` matches
  `package-lock.json` (`npm ci` or `npm install`). A stale `@vscode/test-electron` has caused this before.
  **Do not** work around it by creating symlinks inside `.vscode-test/`, adding `postinstall` scripts or
  patching `node_modules`. Fix the dependency instead.
- Tests are found by the glob `**/**.test.js` under `out/test` (see `test/index.ts`). New test files must
  be named `test/<Name>.test.ts`.

## Code standards

### TypeScript

`tsconfig.json` sets `strict`, `noImplicitAny`, `noImplicitReturns`, `noUnusedLocals`,
`noUnusedParameters`, `noImplicitOverride` and `noFallthroughCasesInSwitch`. Do not loosen any of them.

- Do not use `any`. Use `unknown` and narrow it. If `any` is genuinely unavoidable, use a single-line
  `// eslint-disable-line` on that line only. Never disable rules for a whole file or block.
- Unused variables or parameters must be removed, or prefixed with `_` when a signature requires them
  (ESLint is configured to allow `^_`).
- Mark overriding methods with `override`.
- Use `async`/`await` rather than raw promise chains in new code, and handle or propagate every promise.
  No floating promises.
- Follow the patterns already in the surrounding file. Look at a sibling (for example another framework
  under `src/framework/`) before you add a new one.

### Formatting (Prettier, `.prettierrc.js`)

Use 2-space indentation, single quotes, semicolons, trailing commas everywhere, 120-character line width,
`arrowParens: 'avoid'` and LF line endings. Format files you touch with
`npx prettier --write <files>`, and do not reformat files you did not otherwise change.

### Linting (ESLint, `eslint.config.mjs`)

The config is `@eslint/js` recommended plus `typescript-eslint` recommended, with strict unused-variable rules.
Fix the code instead of adding disable comments.

### Markdown

`.markdownlint.json` applies, with MD013 (line length) and MD024 (duplicate headings) disabled.

### Comments

Keep them minimal. Write one only when the _why_ is not obvious from the code.

## Documentation is tested

`test/Documentation.test.ts` fails unless **every** setting in `package.json` → `contributes.configuration.properties`
has a matching row in a Markdown table whose description is **identical** to its `markdownDescription`:

- `testMate.cpp.*` settings → the table in `README.md` (key without the `testMate.cpp.` prefix).
- `test.advancedExecutables` item properties (including `catch2` / `gtest` / `doctest` sub-properties)
  → `documents/configuration/test.advancedExecutables.md`.
- `testMate.cpp.experimental.*`, `testMate.cpp.log.logfile` and `testMate.cpp.log.userId` are exempt.

When you add or change a setting, update `package.json` and the matching doc row in the same change,
character for character. The same test also asserts that `package.json` `main` stays `out/dist/main.js`.
Never change `main`.

## CHANGELOG and releases

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and **drives releases**:
on push to `master`, CI (`test/repo_scripts/deploy.ts`) looks for a version heading **without a date**
(`## [x.y.z]`). If it finds one, it stamps the date, bumps `package.json`, tags the version and
**publishes to the VS Code Marketplace**.

- Record user-visible changes under `## [Unreleased]` using `### Added` / `### Changed` / `### Fixed` / `### Removed`.
- **Never** add an undated `## [x.y.z]` heading, edit the `version` field in `package.json`, or run
  `npm run deploy` / `npm run package` unless the maintainer explicitly asks for a release.

## Dependencies

- Do not add runtime `dependencies` without approval. Everything in them ships in the extension bundle.
- Keep `package.json` and `package-lock.json` in sync, and commit both together.
- Do not run `npm audit fix --force`, and do not do major-version bumps as a side effect of another task.

## Agent boundaries

- Do not commit, push, open PRs or create tags unless asked. When you commit, keep it to the files
  relevant to the task and do not use `--no-verify`.
- Do not modify `.vscode-test/`, `node_modules/`, `out/` or files under `test/cpp/build*` by hand.
  They are generated.
- Do not edit `.github/workflows/` unless the task is about CI and got explicit approval.
- Keep changes scoped to the request. No drive-by refactors, renames or reformatting of unrelated code.
