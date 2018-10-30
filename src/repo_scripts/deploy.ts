//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

// https://stackoverflow.com/questions/51925941/travis-ci-how-to-push-to-master-branch
// https://stackoverflow.com/questions/23277391/how-to-publish-to-github-pages-from-travis-ci

// TODO
/*
ez igy nagyon nem jo
kell csinalni egy kommitot [skip travis] taggel
ezt meg kell tagelni
ehhez kell github releases apit hasznalva publisholni, travis relelases cucc
mehet a kukaba, not good enough sign-elni kell publusholni kell mindezt csak
masteren
*/

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as request from 'request-promise';
import {inspect, promisify} from 'util';
import * as vsce from 'vsce';


const repoId = 'matepek-vscode-catch2-test-adapter';


try {
  process.env['GITHUB_API_KEY'] = 'a395a14cca36c15c2e62064895a3bb8d06720547';
  createGithubRelease({version: '2.0.0'}, 'tmp');
  main;
  // main(process.argv.slice(2))
} catch (e) {
  console.log(inspect(e));
  process.exit(1);
}

async function main(argv: string[]) {
  assert.strictEqual(
      path.basename(path.dirname(process.cwd())), 'vscode-catch2-test-adapter');
  assert.strictEqual(process.env['TRAVIS_BRANCH'], 'master');

  const info = await updateChangelog();
  await updatePackageJson(info);
  await gitCommitAndTag(info);
  const packagePath = await createPackage(info);
  await gitPush();
  await createGithubRelease(info, packagePath);
  await publishPackage(packagePath);
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

async function updatePackageJson(info: {[prop: string]: string|undefined}) {
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
      packageJson.substr(0, match.index! + match[1].length) + info.version +
      packageJson.substr(match.index! + match[1].length + match[2].length);

  console.log('Updating package.json');
  await promisify(fs.writeFile)('package.json', packageJsonWithVer);
}

async function gitCommitAndTag(info: {[prop: string]: string|undefined}) {
  console.log('Creating commit and signed tag');

  await spawn(
      'git', 'config', '--local', 'user.name',
      'matepek/vscode-catch2-test-adapter');
  await spawn(
      'git', 'config', '--local', 'user.email',
      'matepek+vscode-catch2-test-adapter@gmail.com');
  // TODO signing
  // await spawn(
  //    'git', 'config', '--global', 'user.signingkey', '107C10A2C50AA905');

  await spawn('git', 'status');
  assert.ok(process.env['TRAVIS_BRANCH'] != undefined);
  await spawn(
      'git', 'add', '--', 'CHANGELOG.md', 'package.json', 'package-lock.json');
  await spawn('git', 'status');
  // [skip travis-ci]: because we dont want to build the new commit it again
  await spawn(
      'git', 'commit', '-m',
      '[Updated] Release info in CHANGELOG.md: ' + info.full +
          ' [skip travis-ci]');

  // const logOutput = cp.execSync('git log -n 1', {encoding: 'utf8'});
  // const match = logOutput.match(/^commit ([^ ]+)/);
  // assert.ok(match != null);
  // assert.strictEqual(match!.length, 2);
  // info.commitHash = match![1];

  const tagName = 'v' + info.version;
  await spawn('git', 'tag', '-a', tagName, '-m', 'Version v' + info.version);
}

async function gitPush() {
  console.log('Pushing to origin');

  const branch = process.env['TRAVIS_BRANCH']!;
  assert.ok(process.env['GITHUB_API_KEY'] != undefined);
  await spawn('git', 'checkout', branch);
  await spawn(
      'git', 'push', '--follow-tags',
      'https://matepek:' + process.env['GITHUB_API_KEY']! +
          '@github.com/matepek/vscode-catch2-test-adapter.git');
}

async function createPackage(version: {[prop: string]: string|undefined}) {
  console.log('Creating vsce package');
  const packagePath = './out/' + repoId + '-' + version.version + '.vsix';
  await vsce.createVSIX({'cwd': '.', 'packagePath': packagePath});
  return packagePath;
}

async function publishPackage(packagePath: string) {
  console.log('Publishing vsce package');
  assert.ok(process.env['VSCE_PAT'] != undefined);
  // TODO
  // await vsce.publishVSIX(packagePath, {'pat': process.env['VSCE_PAT']!});
}

async function createGithubRelease(
    info: {[prop: string]: string|undefined}, packagePath: string) {
  console.log('Publishing to github releases');
  assert.ok(process.env['GITHUB_API_KEY'] != undefined);
  const key = process.env['GITHUB_API_KEY']!;

  const latestRes = JSON.parse(
      (await request
           .get({
             url:
                 'https://api.github.com/repos/matepek/vscode-catch2-test-adapter/releases/latest',
             headers: {'User-Agent': 'matepek'}
           })
           .auth('matepek', key))
          .toString());
  assert.notStrictEqual(latestRes.tag_name, 'v' + info.version);

  const createReleaseRes = JSON.parse(
      (await request
           .post({
             url:
                 'https://api.github.com/repos/matepek/vscode-catch2-test-adapter/releases',
             headers: {'User-Agent': 'matepek'},
             form: {
               'tag_name': 'testtag2',  //'v' + info.version,
               'target_commitish': 'development'
             }
           })
           .auth('matepek', key))
          .toString());

  const uploadAssetRequest =
      request
          .post({
            url: createReleaseRes.upload_url.replace(
                '{?name,label}',
                '?name=vscode-catch2-test-adapter-' + info.version + '.vsix'),
            headers:
                {'User-Agent': 'matepek', 'Content-Type': 'application/zip'}
          })
          .auth('matepek', key);

  fs.createReadStream(packagePath).pipe(uploadAssetRequest);

  uploadAssetRequest;
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
