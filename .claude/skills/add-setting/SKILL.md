---
name: add-setting
description: Add or change a configuration setting of the extension (package.json contributes.configuration, README table, advancedExecutables docs, CHANGELOG). Use whenever a setting is added, renamed or its description changes.
---

# Add or change a setting

`test/Documentation.test.ts` fails unless package.json and the docs match exactly.

1. Edit `package.json` → `contributes.configuration.properties`. Give the setting a `markdownDescription`.
2. Copy that `markdownDescription` **character for character** into the docs table:
   - `testMate.cpp.*` setting → the table in `README.md` (key without the `testMate.cpp.` prefix).
   - `test.advancedExecutables` item property (including `catch2` / `gtest` / `doctest` sub-properties)
     → `documents/configuration/test.advancedExecutables.md`.
   - Exempt: `testMate.cpp.experimental.*`, `testMate.cpp.log.logfile`, `testMate.cpp.log.userId`.
3. If the value is read in code, wire it through `src/Configurations.ts` following the neighbouring settings.
4. Add a line under `## [Unreleased]` in `CHANGELOG.md` (`### Added` / `### Changed`). Never add an undated version heading.
5. Verify: `npm run compile`, `npm run eslint`, `npx prettier --check "src/**/*.ts" "test/*.ts"`, `npm test`.
   Report the real results.

Do not touch `main` in package.json or the `version` field.
