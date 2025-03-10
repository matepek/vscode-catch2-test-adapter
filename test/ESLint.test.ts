import * as path from 'path';
import * as assert from 'assert';
import * as eslint from 'eslint';

describe(path.basename(__filename), async function () {
  // because eslint dropped support: https://stackoverflow.com/questions/62903921/how-do-i-fix-eslint-createrequire-is-not-a-function-in-atom-editor
  // eslint-disable-next-line
  const nodeVersion = parseInt(process.version.match(/v(\d+)/)![1]);

  if (process.env['C2_INTEGRATIONFROMVSCODE'] === undefined && nodeVersion > 10) {
    specify('eslint', async function () {
      const cli = new eslint.ESLint();
      const results = await cli.lintFiles(['src/**/*.ts']);

      const errors = results
        .filter(result => result.errorCount > 0)
        .map(result => ({
          file: result.filePath,
          messages: result.messages.map(m => `${m.line}:${m.column} ${m.message} (${m.ruleId})`),
        }));

      assert.deepEqual(errors, []);
    });
  }
});
