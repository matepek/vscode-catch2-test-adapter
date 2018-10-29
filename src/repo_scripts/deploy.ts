//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

// https://stackoverflow.com/questions/51925941/travis-ci-how-to-push-to-master-branch
// https://stackoverflow.com/questions/23277391/how-to-publish-to-github-pages-from-travis-ci

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
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
  await updatePackageJson(version);
  await gitCommitAndTag(version);
  await publishPackage(version)
}

///

async function updateChangelog() {
  console.log('Parsing CHANGELOG.md');
  const changelogBuffer = await promisify(fs.readFile)('CHANGELOG.md');

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
  await promisify(fs.writeFile)('CHANGELOG.md', changelogWithReleaseDate);

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

async function updatePackageJson(version: {[prop: string]: string|undefined}) {
  console.log('Parsing package.json');
  const packageJsonBuffer = await promisify(fs.readFile)('package.json');

  const packageJson = packageJsonBuffer.toString();
  // example:'## [0.1.0-beta] - 2018-04-12'
  const re = new RegExp(/(['"]version['"]\s*:\s*['"])([^'"]*)(['"])/);

  const match: RegExpMatchArray|null = packageJson.match(re);
  assert.notStrictEqual(match, null);
  if (match === null)
    throw Error('Release error: Couldn\'t find version entry.');

  assert.strictEqual(match.length, 4);
  assert.notStrictEqual(match[1], undefined);
  assert.notStrictEqual(match[2], undefined);
  assert.notStrictEqual(match[3], undefined);

  const packageJsonWithVer =
      packageJson.substr(0, match.index! + match[1].length) + version.version +
      packageJson.substr(match.index! + match[1].length + match[2].length);

  console.log('Updating package.json');
  await promisify(fs.writeFile)('package.json', packageJsonWithVer);
}

async function gitCommitAndTag(version: {[prop: string]: string|undefined}) {
  console.log('Creating signed tag and pushing to origin');

  // TODO
  await spawn(
      'git', 'config', '--local', 'user.name',
      'matepek/vscode-catch2-test-adapter bot');
  await spawn(
      'git', 'config', '--local', 'user.email',
      'matepek+vscode-catch2-test-adapter@gmail.com');
  // TODO signing
  // await spawn(
  //    'git', 'config', '--global', 'user.signingkey', '107C10A2C50AA905');

  await spawn('git', 'status');
  assert.ok(process.env['TRAVIS_BRANCH'] != undefined);
  const branch = process.env['TRAVIS_BRANCH']!;
  await spawn('git', 'checkout', branch);
  await spawn(
      'git', 'add', '--', 'CHANGELOG.md', 'package.json', 'package-lock.json');
  await spawn('git', 'status');
  await spawn(
      'git', 'commit', '-m',
      '[Updated] Release info in CHANGELOG.md: ' + version.full);

  const tagName = 'v' + version.version;
  await spawn('git', 'tag', '-a', tagName, '-m', 'Version v' + version.version);
  assert.ok(process.env['GITHUB_API_KEY'] != undefined);
  await spawn(
      'git', 'push', '--follow-tags',
      'https://matepek:' + process.env['GITHUB_API_KEY']! +
          '@github.com/matepek/vscode-catch2-test-adapter.git',
      branch + ':' + branch);
}

async function publishPackage(version: {[prop: string]: string|undefined}) {
  console.log('Creating vsce package');
  const packagePath = './out/' + repoId + '-' + version.version + '.vsix';
  await vsce.createVSIX({'cwd': '.', 'packagePath': packagePath});

  // TODO
  // console.log('Publishing vsce package');
  // process.env['something'];
  // await vsce.publishVSIX(packagePath, {'pat': 'TODO'});
}

async function spawn(command: string, ...args: string[]) {
  console.log('$ ' + command + ' "' + args.join('" "') + '"');
  await new Promise((resolve, reject) => {
    const c = cp.spawn(command, args, {stdio: 'inherit'});
    c.on('exit', (code: number) => {
      code == 0 ? resolve() : reject(new Error('Process exited with: ' + code));
    });
  });
}
