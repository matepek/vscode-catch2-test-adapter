import * as assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';

describe(path.basename(__filename), function() {
  it('package.json: main should be "out/dist/main.js"', function() {
    // this check is necessary because for development sometimes I change it.
    const packageJson = fse.readJSONSync(path.join(__dirname, '../..', 'package.json'));
    assert.strictEqual(packageJson['main'], 'out/dist/main.js');
  });

  it('package.json should be consistent with README.md', function() {
    const packageJson = fse.readJSONSync(path.join(__dirname, '../..', 'package.json'));
    const properties = packageJson['contributes']['configuration']['properties'];

    const readme = fse.readFileSync(path.join(__dirname, '../..', 'README.md')).toString();
    const findDescriptionInReadmeTable = (name: string): string => {
      const match = readme.match(new RegExp('^\\| *`' + name + '` *\\|([^\\|]*)\\|', 'm'));
      if (match) {
        return match[1].trim();
      }
      throw new Error("couldn't find: " + name);
    };
    {
      const executableSchemaProp = properties['catch2TestExplorer.executables']['oneOf'][0]['items']['oneOf'][0][
        'properties'
      ] as any; //eslint-disable-line
      const keys = Object.keys(executableSchemaProp);
      keys.forEach(key => {
        assert.strictEqual(findDescriptionInReadmeTable(key), executableSchemaProp[key]['description']);
      });

      {
        assert.deepStrictEqual(executableSchemaProp['catch2'], executableSchemaProp['gtest']);
        assert.deepStrictEqual(executableSchemaProp['catch2'], executableSchemaProp['doctest']);

        const catch2Prop = executableSchemaProp['catch2']['properties'];
        const keys = Object.keys(catch2Prop);
        keys.forEach(key => {
          assert.strictEqual(findDescriptionInReadmeTable(key), catch2Prop[key]['description']);
        });
      }
    }
    {
      const keys = Object.keys(properties);

      keys.forEach(key => {
        if (key === 'catch2TestExplorer.logfile' || key === 'catch2TestExplorer.userId') {
          // skip: not documented
        } else {
          assert.ok(key.startsWith('catch2TestExplorer.'));
          const trimmedKey = key.substring('catch2TestExplorer.'.length);
          const descriptionInReadme = findDescriptionInReadmeTable(trimmedKey);
          assert.strictEqual(descriptionInReadme, properties[key]['markdownDescription'], key);
          assert.strictEqual(descriptionInReadme, properties[key]['description'], key);
        }
      });
    }
  });
});
