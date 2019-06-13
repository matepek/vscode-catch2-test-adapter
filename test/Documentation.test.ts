import * as assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';

describe(path.basename(__filename), function() {
  it('package.json: executables should be consistent', function() {
    // definitions/$ref combo doesn't work in case of vscode :(
    const packageJson = fse.readJSONSync(path.join(__dirname, '../..', 'package.json'));
    const executables = packageJson['contributes']['configuration']['properties'][
      'catch2TestExplorer.executables'
    ] as any; // eslint-disable-line

    const executableSchema = executables['oneOf'][0]['items']['oneOf'] as [];
    assert.strictEqual(executableSchema.length + 1, executables['oneOf'].length);

    for (let i = 0; i < executableSchema.length; ++i) {
      assert.deepStrictEqual(executableSchema[i], executables['oneOf'][i + 1]);
    }
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
      throw new Error('couldnt find: ' + name);
    };
    {
      const executableSchemaProp = properties['catch2TestExplorer.executables']['oneOf'][0]['items']['oneOf'][0][
        'properties'
      ] as any; //eslint-disable-line
      const keys = Object.keys(executableSchemaProp);
      keys.forEach(key => {
        assert.strictEqual(findDescriptionInReadmeTable(key), executableSchemaProp[key]['description']);
      });
    }
    {
      const keys = Object.keys(properties);

      keys.forEach(key => {
        if (key === 'catch2TestExplorer.logfile') {
          // skip
        } else {
          const descriptionInReadme = findDescriptionInReadmeTable(key);
          assert.strictEqual(descriptionInReadme, properties[key]['markdownDescription'], key);
          assert.strictEqual(descriptionInReadme, properties[key]['description'], key);
        }
      });
    }
  });
});
