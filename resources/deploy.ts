
// create vsix
// check changelog with date

// kell pull rqeuest checkhez changelog check

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fse from 'fs-extra';
import {inspect, promisify} from 'util';
import * as vsce from 'vsce';

try {
  main()
} catch (e) {
  console.log(inspect(e));
  process.exit(1);
}

const repoId = 'matepek-vscode-catch2-test-adapter';

async function main() {
  const version = await updateChangelog();
  await gitCommitAndTag(version);
  await publishPackage(version)
}

///

async function updateChangelog() {
  console.log('Parsing CHANGELOG.md');
  const changelogBuffer = await promisify(fse.readFile)('CHANGELOG.md');

  const changelog = changelogBuffer.toString();
  // example:'## [0.1.0-beta] - 2018-04-12'
  const re = new RegExp(
      /## \[(([0-9]+)\.([0-9]+)\.([0-9]+)(?:|(?:-([^\]]+))))\](?: - (\S+))?/);

  const match: RegExpMatchArray|null = changelog.match(re);
  assert.notStrictEqual(match, null);
  if (match === null)
    throw Error('Release error: Couldn\'t find version entry.');

  assert.strictEqual(match.length, 7);

  if (match[6] != undefined) {
    throw Error(
        'Release error: Most recent version has release date: ' + match[0] +
        '\n  For deploy it should be a version without date.');
  }

  const now = new Date();
  const month = now.getUTCMonth() + 1 < 10 ? '0' + now.getUTCMonth() + 1 :
                                             now.getUTCMonth() + 1;
  const day = now.getUTCDate() < 10 ? '0' + now.getUTCDate() : now.getUTCDate();
  const date = now.getUTCFullYear() + '-' + month + '-' + day;

  const changelogWithReleaseDate =
      changelog.substr(0, match.index! + match[0].length) + ' - ' + date +
      changelog.substr(match.index! + match[0].length);

  console.log('Updating CHANGELOG.md');
  // TODO
  // await promisify(fse.writeFile)('CHANGELOG.md', changelogWithReleaseDate);

  return {
    'version': match[1],
    'major': match[2],
    'minor': match[3],
    'patch': match[4],
    'label': match[5],
    'date': date,
    'full': match[0].substr(3) + ' - ' + date
  };
}

async function gitCommitAndTag(version: {[prop: string]: string|undefined}) {
  console.log('Creating signed tag and pushing to origin');

  // TODO
  // await promisify(cp.exec)(
  //     'git config --local user.name "matepek+vscode-catch2-test-adapter"');
  // await promisify(cp.exec)(
  //     'git config --local user.email
  //     "matepek+vscode-catch2-test-adapter@gmail.com"');

  await promisify(cp.exec)('git add -- CHANGELOG.md');
  await promisify(cp.exec)(
      'git commit -m "[Updated] Release info in CHANGELOG.md: ' + version.full +
      '"');

  const tagName = 'v' + version.version;
  await promisify(cp.exec)('git tag -a ' + tagName);
  // await promisify(cp.exec)('git push origin ' + tagName); TODO
}

async function publishPackage(version: {[prop: string]: string|undefined}) {
  console.log('Creating vsce package');
  const packagePath = './out/' + repoId + '-' + version.version + '.vsix';
  await vsce.createVSIX({'cwd': '.', 'packagePath': packagePath});

  // TODO
  process.env['something'];
  // await vsce.publishVSIX(packagePath, {'pat': 'TODO'});
}