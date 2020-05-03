import * as assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';

describe(path.basename(__filename), function () {
  it('package.json: main should be "out/dist/main.js"', function () {
    // this check is necessary because for development sometimes I change it.
    const packageJson = fse.readJSONSync(path.join(__dirname, '../..', 'package.json'));
    assert.strictEqual(packageJson['main'], 'out/dist/main.js');
  });

  it('package.json should be consistent with documentation', function () {
    const packageJson = fse.readJSONSync(path.join(__dirname, '../..', 'package.json'));
    const properties = packageJson['contributes']['configuration']['properties'];

    const readme = fse.readFileSync(path.join(__dirname, '../..', 'README.md')).toString();
    const executables = fse
      .readFileSync(path.join(__dirname, '../..', 'documents/configuration', 'test.executables.md'))
      .toString();

    const documents = readme + executables;

    const findDescriptionInReadmeTable = (name: string): string => {
      const match = documents.match(new RegExp('^\\| *(?:`|\\[)' + name + '(?:`|\\]) *\\|([^\\|]*)\\|', 'm'));
      if (match) {
        return match[1].trim();
      }
      throw new Error("couldn't find: " + name);
    };
    {
      const executableSchemaProp = properties['copper.test.executables']['items']['properties'] as any; //eslint-disable-line
      const keys = Object.keys(executableSchemaProp).filter(k => k !== 'comment');
      keys.forEach(key => {
        assert.strictEqual(findDescriptionInReadmeTable(key), executableSchemaProp[key]['markdownDescription'], key);
      });

      {
        const catch2Prop = executableSchemaProp['catch2']['properties'];
        const keys = Object.keys(catch2Prop);
        keys.forEach(key => {
          assert.strictEqual(findDescriptionInReadmeTable(key), catch2Prop[key]['markdownDescription']);
        });
      }

      {
        const catch2Prop = executableSchemaProp['catch2']['properties'];
        const keys = Object.keys(catch2Prop);
        keys.forEach(key => {
          assert.strictEqual(findDescriptionInReadmeTable(key), catch2Prop[key]['markdownDescription']);
        });
      }

      {
        const catch2Prop = executableSchemaProp['doctest']['properties'];
        const keys = Object.keys(catch2Prop);
        keys.forEach(key => {
          assert.strictEqual(findDescriptionInReadmeTable(key), catch2Prop[key]['markdownDescription']);
        });
      }
    }
    {
      const keys = Object.keys(properties);

      keys.forEach(key => {
        if (
          key === 'copper.log.logSentry' ||
          key === 'copper.log.logfile' ||
          key === 'copper.log.userId' ||
          key.startsWith('catch2TestExplorer')
        ) {
          // skip: not documented
        } else {
          assert.ok(key.startsWith('copper.'));
          const trimmedKey = key.substring('copper.'.length);
          const descriptionInReadme = findDescriptionInReadmeTable(trimmedKey);
          assert.strictEqual(descriptionInReadme, properties[key]['markdownDescription'], key);
          assert.strictEqual(descriptionInReadme, properties[key]['markdownDescription'], key);
        }
      });
    }
  });
});
