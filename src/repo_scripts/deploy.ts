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
import {promisify} from 'util';
import * as vsce from 'vsce';


const githubOwnerId = 'matepek';
const githubRepoId = 'vscode-catch2-test-adapter';
const githubRepoFullId = githubOwnerId + '/' + githubRepoId;
const vscodeExtensionId = githubOwnerId + '-' + githubRepoId;


main(process.argv.slice(2))
    .then(
        () => {
          process.exit(0);
        },
        (err: any) => {
          console.error('Unhandled error under deployment.', err);
          process.exit(-1);
        });

interface Info {
  version: string;
  vver: string;
  major: string;
  minor: string;
  patch: string;
  label: string;
  date: string;
  full: string;
  packagePath: string|undefined;
}

function main(argv: string[]): Promise<void> {
  console.log('deploying');
  // pre-checks
  assert.strictEqual(path.basename(process.cwd()), githubRepoId);
  assert.ok(process.env['GITHUB_API_KEY'] != undefined);
  assert.ok(process.env['VSCE_PAT'] != undefined);

  if (!process.env['TRAVIS_BRANCH']) {
    console.log('not a branch, skipping deployment');
    return Promise.resolve();
  }

  return updateChangelog().then((info: Info|undefined) => {
    if (info != undefined) {
      return Promise.resolve(info!)
          .then(updatePackageJson)
          .then(gitCommitAndTag)
          .then(createPackage)
          .then(gitPush)
          .then(createGithubRelease)
          .then(publishPackage)
          .then(() => {
            console.log('deploying is finished');
          });
    } else {
      console.log('no deployment has happened.');
      return Promise.resolve();
    }
  });
}

///


function updateChangelog(): Promise<Info|undefined> {
  console.log('Parsing CHANGELOG.md');
  return promisify(fs.readFile)('CHANGELOG.md').then((changelogBuffer) => {
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
      return Promise.resolve(undefined);
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
    return promisify(fs.writeFile)('CHANGELOG.md', changelogWithReleaseDate)
        .then(() => {
          return {
            'version': match[1],
            'vver': 'v' + match[1],
            'major': match[2],
            'minor': match[3],
            'patch': match[4],
            'label': match[5],
            'date': date,
            'full': match[0].substr(3).trim() + ' - ' + date,
            'packagePath': undefined
          };
        });
  });
}

function updatePackageJson(info: Info) {
  console.log('Parsing package.json');
  return promisify(fs.readFile)('package.json').then((packageJsonBuffer) => {
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
    return promisify(fs.writeFile)('package.json', packageJsonWithVer)
        .then(() => {
          return info;
        });
  });
}

function gitCommitAndTag(info: Info) {
  console.log('Creating commit and tag');

  return Promise.resolve()
      .then(() => {
        assert.ok(process.env['TRAVIS_BRANCH']);
        return spawn('git', 'checkout', process.env['TRAVIS_BRANCH']!);
      })
      .then(() => {
        return spawn(
            'git', 'config', '--local', 'user.name', 'deploy.js script');
      })
      .then(() => {
        const deployerMail =
            process.env['DEPLOYER_MAIL'] || 'deployer@deployer.de';
        return spawn('git', 'config', '--local', 'user.email', deployerMail);
      })
      .then(() => {
        return spawn('git', 'status');
      })
      .then(() => {
        return spawn(
            'git', 'add', '--', 'CHANGELOG.md', 'package.json',
            'package-lock.json');
      })
      .then(() => {
        return spawn('git', 'status');
      })
      .then(() => {
        return spawn(
            'git', 'commit', '-m',
            '[Updated] Release info in CHANGELOG.md: ' + info.full!);
      })
      .then(() => {
        return spawn(
            'git', 'tag', '-a', info.vver!, '-m', 'Version ' + info.vver!);
      })
      .then(() => {
        return info;
      });
}

function gitPush(info: Info) {
  console.log('Pushing to origin');

  assert.ok(process.env['GITHUB_API_KEY'] != undefined);
  return spawn(
             'git', 'push', '--follow-tags',
             'https://' + githubOwnerId + ':' + process.env['GITHUB_API_KEY']! +
                 '@github.com/' + githubRepoFullId + '.git')
      .then(() => {
        return info;
      });
}

function createPackage(info: Info) {
  console.log('Creating vsce package');
  const packagePath =
      './out/' + vscodeExtensionId + '-' + info.version + '.vsix';
  return vsce.createVSIX({'cwd': '.', 'packagePath': packagePath}).then(() => {
    info.packagePath = packagePath;
    return info;
  });
}

function publishPackage(info: Info) {
  console.log('Publishing vsce package');
  assert.ok(process.env['VSCE_PAT'] != undefined);
  assert.ok(info.packagePath != undefined);
  return vsce.publishVSIX(info.packagePath!, {'pat': process.env['VSCE_PAT']!});
}

async function createGithubRelease(info: Info) {
  console.log('Publishing to github releases');
  assert.ok(process.env['GITHUB_API_KEY'] != undefined);
  const key = process.env['GITHUB_API_KEY']!;


  return requestP
      .get({
        url: 'https://api.github.com/repos/' + githubRepoFullId +
            '/releases/latest',
        headers: {'User-Agent': githubOwnerId + '-deploy.js'},
        auth: {user: githubOwnerId, pass: key}
      })
      .then((response) => {
        const responseJson = JSON.parse(response.toString());
        assert.notStrictEqual(responseJson.tag_name, info.vver)
      })
      .then(() => {
        return requestP.post({
          url: 'https://api.github.com/repos/' + githubRepoFullId + '/releases',
          headers: {'User-Agent': githubOwnerId + '-deploy.js'},
          json: {
            'tag_name': info.vver,
            'name': info.full,
            'body': 'See [CHANGELOG.md](CHANGELOG.md) for details.',
          },
          auth: {user: githubOwnerId, pass: key}
        });
      })
      .then((createReleaseResponse) => {
        return new Promise((resolve, reject) => {
          assert.ok(info.packagePath != undefined);
          var stats = fs.statSync(info.packagePath!);
          const uploadAssetRequest = request.post({
            url: createReleaseResponse.upload_url.replace(
                '{?name,label}',
                '?name=' + vscodeExtensionId + '-' + info.version + '.vsix'),
            headers: {
              'User-Agent': githubOwnerId + '-deploy.js',
              'Content-Type': 'application/zip',
              'Content-Length': stats.size
            },
            auth: {user: githubOwnerId, pass: key}
          });

          fs.createReadStream(info.packagePath!).pipe(uploadAssetRequest);

          uploadAssetRequest.on('complete', (resp) => {
            resolve(resp);
          });
          uploadAssetRequest.on('error', (e) => {
            reject(e);
          });
        });
      })
      .then(() => {
        return info;
      });
}

async function spawn(command: string, ...args: string[]) {
  console.log('$ ' + command + ' "' + args.join('" "') + '"');
  return new Promise((resolve, reject) => {
    const c = cp.spawn(command, args, {stdio: 'inherit'});
    c.on('exit', (code: number) => {
      code == 0 ? resolve() : reject(new Error('Process exited with: ' + code));
    });
  });
}
