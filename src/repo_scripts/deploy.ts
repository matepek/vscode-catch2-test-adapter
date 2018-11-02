//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

// https://stackoverflow.com/questions/51925941/travis-ci-how-to-push-to-master-branch
// https://stackoverflow.com/questions/23277391/how-to-publish-to-github-pages-from-travis-ci

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as request from 'request';
import * as requestP from 'request-promise';
import {inspect, promisify} from 'util';
import * as vsce from 'vsce';


const githubOwnerId = 'matepek';
const githubRepoId = 'vscode-catch2-test-adapter';
const githubRepoFullId = githubOwnerId + '/' + githubRepoId;
const githubDeployerMail = 'matepek+vscode-catch2-test-adapter@gmail.com';
const vscodeExtensionId = githubOwnerId + '-' + githubRepoId;

try {
  main(process.argv.slice(2))
} catch (e) {
  console.log(inspect(e));
  process.exit(1);
}

async function main(argv: string[]) {
  try {
    console.log('deploying');
    // pre-checks
    assert.strictEqual(path.basename(process.cwd()), githubRepoId);
    assert.ok(process.env['TRAVIS_BRANCH'] != undefined);
    assert.ok(process.env['GITHUB_API_KEY'] != undefined);
    assert.ok(process.env['VSCE_PAT'] != undefined);

    const info = await updateChangelog();
    if (info != undefined) {
      await updatePackageJson(info);
      await gitCommitAndTag(info);
      const packagePath = await createPackage(info);
      await gitPush();
      await createGithubRelease(info, packagePath);
      await publishPackage(packagePath);
    }
    console.log('deploying is finished');
  } catch (e) {
    console.log(inspect(e));
    process.exit(1);
    throw 1;
  }
}

///

interface Info {
  version: string;
  vver: string;
  major: string;
  minor: string;
  patch: string;
  label: string;
  date: string;
  full: string;
}

async function updateChangelog(): Promise<Info|undefined> {
  try {
    console.log('Parsing CHANGELOG.md');
    const changelogBuffer = await promisify(fs.readFile)('CHANGELOG.md');

    const changelog = changelogBuffer.toString();
    // example:'## [0.1.0-beta] - 2018-04-12'
    const re = new RegExp(
        /## \[(([0-9]+)\.([0-9]+)\.([0-9]+)(?:|(?:-([^\]]+))))\](?: - (\S+))?/);

    const match: RegExpMatchArray|null = changelog.match(re);
    if (match === null)
      throw Error('Release error: Couldn\'t find version entry.');

    assert.strictEqual(match.length, 7);

    if (match[6] != undefined) {
      // we dont want to release it now
      console.log(
          'CHANGELOG.md doesn\'t contain unreleased version entry (ex.: "## [1.2.3]" (without date)).');
      return undefined;
    }

    const now = new Date();
    const month = now.getUTCMonth() + 1 < 10 ? '0' + now.getUTCMonth() + 1 :
                                               now.getUTCMonth() + 1;
    const day =
        now.getUTCDate() < 10 ? '0' + now.getUTCDate() : now.getUTCDate();
    const date = now.getUTCFullYear() + '-' + month + '-' + day;

    const changelogWithReleaseDate =
        changelog.substr(0, match.index! + match[0].length) + ' - ' + date +
        changelog.substr(match.index! + match[0].length);

    console.log('Updating CHANGELOG.md');
    await promisify(fs.writeFile)('CHANGELOG.md', changelogWithReleaseDate);

    return {
      'version': match[1],
      'vver': 'v' + match[1],
      'major': match[2],
      'minor': match[3],
      'patch': match[4],
      'label': match[5],
      'date': date,
      'full': match[0].substr(3).trim() + ' - ' + date
    };
  } catch (e) {
    console.log(inspect(e));
    throw process.exit(1);
  }
}

async function updatePackageJson(info: Info) {
  try {
    console.log('Parsing package.json');
    const packageJsonBuffer = await promisify(fs.readFile)('package.json');

    const packageJson = packageJsonBuffer.toString();
    // example:'"version": "1.2.3"'
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
  } catch (e) {
    console.log(inspect(e));
    process.exit(1);
  }
}

async function gitCommitAndTag(info: Info) {
  try {
    console.log('Creating commit and signed tag');

    await spawn('git', 'config', '--local', 'user.name', 'deploy.js script');
    await spawn('git', 'config', '--local', 'user.email', githubDeployerMail);

    await spawn('git', 'status');
    await spawn(
        'git', 'add', '--', 'CHANGELOG.md', 'package.json',
        'package-lock.json');
    await spawn('git', 'status');
    // [skip travis-ci]: because we dont want to build the new commit it again
    await spawn(
        'git', 'commit', '-m',
        '[Updated] Release info in CHANGELOG.md: ' + info.full!, '-m',
        '[skip travis-ci]');

    await spawn('git', 'tag', '-a', info.vver!, '-m', 'Version ' + info.vver!);
  } catch (e) {
    console.log(inspect(e));
    process.exit(1);
  }
}

async function gitPush() {
  try {
    console.log('Pushing to origin');

    assert.ok(process.env['TRAVIS_BRANCH'] != undefined);
    const branch = process.env['TRAVIS_BRANCH']!;
    assert.ok(process.env['GITHUB_API_KEY'] != undefined);
    await spawn('git', 'checkout', branch);
    await spawn(
        'git', 'push', '--follow-tags',
        'https://' + githubOwnerId + ':' + process.env['GITHUB_API_KEY']! +
            '@github.com/' + githubRepoFullId + '.git');
  } catch (e) {
    console.log(inspect(e));
    process.exit(1);
  }
}

async function createPackage(info: Info) {
  try {
    console.log('Creating vsce package');
    const packagePath =
        './out/' + vscodeExtensionId + '-' + info.version + '.vsix';
    await vsce.createVSIX({'cwd': '.', 'packagePath': packagePath});
    return packagePath;
  } catch (e) {
    console.log(inspect(e));
    throw process.exit(1);
  }
}

async function publishPackage(packagePath: string) {
  try {
    console.log('Publishing vsce package');
    assert.ok(process.env['VSCE_PAT'] != undefined);
    await vsce.publishVSIX(packagePath, {'pat': process.env['VSCE_PAT']!});
  } catch (e) {
    console.log(inspect(e));
    process.exit(1);
  }
}

async function createGithubRelease(info: Info, packagePath: string) {
  try {
    console.log('Publishing to github releases');
    assert.ok(process.env['GITHUB_API_KEY'] != undefined);
    const key = process.env['GITHUB_API_KEY']!;

    const latestRes =
        JSON.parse((await requestP.get({
                     url: 'https://api.github.com/repos/' + githubRepoFullId +
                         '/releases/latest',
                     headers: {'User-Agent': githubOwnerId + '-deploy.js'},
                     auth: {user: githubOwnerId, pass: key}
                   })).toString());
    assert.notStrictEqual(latestRes.tag_name, info.vver);

    const createReleaseRes = await requestP.post({
      url: 'https://api.github.com/repos/' + githubRepoFullId + '/releases',
      headers: {'User-Agent': githubOwnerId + '-deploy.js'},
      json: {
        'tag_name': info.vver,
        'name': info.full,
        'body': 'See [CHANGELOG.md](CHANGELOG.md) for details.',
      },
      auth: {user: githubOwnerId, pass: key}
    });

    await new Promise((resolve, reject) => {
      var stats = fs.statSync(packagePath);
      const uploadAssetRequest = request.post({
        url: createReleaseRes.upload_url.replace(
            '{?name,label}',
            '?name=' + vscodeExtensionId + '-' + info.version + '.vsix'),
        headers: {
          'User-Agent': githubOwnerId + '-deploy.js',
          'Content-Type': 'application/zip',
          'Content-Length': stats.size
        },
        auth: {user: githubOwnerId, pass: key}
      });

      fs.createReadStream(packagePath).pipe(uploadAssetRequest);

      uploadAssetRequest.on('complete', (resp) => {
        resolve(resp);
      });
      uploadAssetRequest.on('error', (e) => {
        reject(e);
      });
    });
  } catch (e) {
    console.log(e.toString());
    process.exit(1);
  }
}

async function spawn(command: string, ...args: string[]) {
  try {
    console.log('$ ' + command + ' "' + args.join('" "') + '"');
    await new Promise((resolve, reject) => {
      const c = cp.spawn(command, args, {stdio: 'inherit'});
      c.on('exit', (code: number) => {
        code == 0 ? resolve() :
                    reject(new Error('Process exited with: ' + code));
      });
    });
  } catch (e) {
    console.log(inspect([e, command, args]));
    process.exit(1);
  }
}
