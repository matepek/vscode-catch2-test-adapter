// https://stackoverflow.com/questions/51925941/travis-ci-how-to-push-to-master-branch
// https://stackoverflow.com/questions/23277391/how-to-publish-to-github-pages-from-travis-ci

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as request from 'request';
import * as requestP from 'request-promise';
import { promisify } from 'util';
import * as vsce from 'vsce';

///

const githubOwnerId = 'matepek';
const githubRepoId = 'vscode-catch2-test-adapter';
const githubRepoFullId = githubOwnerId + '/' + githubRepoId;
const vscodeExtensionId = githubOwnerId + '-' + githubRepoId;

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

async function spawn(command: string, ...args: string[]): Promise<void> {
  console.log('$ ' + command + ' "' + args.join('" "') + '"');
  return new Promise((resolve, reject) => {
    const c = cp.spawn(command, args, { stdio: 'inherit' });
    c.on('exit', (code: number) => {
      code == 0 ? resolve() : reject(new Error('Process exited with: ' + code));
    });
  });
}

///

async function updateChangelog(): Promise<Info | undefined> {
  try {
    console.log('Parsing CHANGELOG.md');

    const changelogBuffer = await promisify(fs.readFile)('CHANGELOG.md');

    const changelog = changelogBuffer.toString();
    // example:'## [0.1.0-beta] - 2018-04-12'
    const re = new RegExp(/## \[(([0-9]+)\.([0-9]+)\.([0-9]+)(?:|(?:-([^\]]+))))\](?: - (\S+))?/);

    const match = changelog.match(re);
    if (match === null) {
      throw Error("Release error: Couldn't find version entry");
    }

    assert.strictEqual(match.length, 7);

    if (match[6] != undefined) {
      // we dont want to release it now
      console.log('CHANGELOG.md doesn\'t contain unreleased version entry (ex.: "## [1.2.3]" (without date)).');
      console.log('(Last released version: ' + match[0] + ')');
      return undefined;
    }

    const now = new Date();
    const month = now.getUTCMonth() + 1 < 10 ? '0' + (now.getUTCMonth() + 1) : now.getUTCMonth() + 1;
    const day = now.getUTCDate() < 10 ? '0' + now.getUTCDate() : now.getUTCDate();
    const date = now.getUTCFullYear() + '-' + month + '-' + day;

    const changelogWithReleaseDate =
      changelog.substr(0, match.index! + match[0].length) +
      ' - ' +
      date +
      changelog.substr(match.index! + match[0].length);

    console.log('Updating CHANGELOG.md');

    await promisify(fs.writeFile)('CHANGELOG.md', changelogWithReleaseDate);

    return {
      version: match[1],
      vver: 'v' + match[1],
      major: match[2],
      minor: match[3],
      patch: match[4],
      label: match[5],
      date: date,
      full: match[0].substr(3).trim() + ' - ' + date,
    };
  } catch (e) {
    return Promise.reject(e);
  }
}

async function waitForAppveyorTestsToBeFinished(): Promise<void> {
  try {
    assert.ok(process.env['APPVEYOR_TOKEN']);
    assert.ok(process.env['TRAVIS_COMMIT']);

    console.log('Checking Appveyor job with commit:', process.env['TRAVIS_COMMIT']);

    const response = await requestP.get({
      url: 'https://ci.appveyor.com/api/projects/' + githubRepoFullId + '/history?recordsNumber=50',
      headers: { Authorization: 'Bearer ' + process.env['APPVEYOR_TOKEN'], 'Content-Type': 'application/json' },
    });

    const responseJson = JSON.parse(response.toString());
    let build;
    for (const b of responseJson.builds) {
      if (b.commitId === process.env['TRAVIS_COMMIT']) {
        build = b;
        break;
      }
    }
    assert.notStrictEqual(build, undefined);

    const timeout = 40 * 60 * 1000;
    const version = build.version;
    let status = build.status;

    const queuedOrRunning = (status: string): boolean => status === 'running' || status === 'queued';

    const start = Date.now();
    while (queuedOrRunning(status) && Date.now() - start < timeout) {
      console.log('Waiting for Appveyor:', version, status);

      await promisify(setTimeout)(20000);

      const response = await requestP.get({
        url: 'https://ci.appveyor.com/api/projects/' + githubRepoFullId + '/build/' + version,
        headers: { Authorization: 'Bearer ' + process.env['APPVEYOR_TOKEN'], 'Content-Type': 'application/json' },
      });
      const responseJson = JSON.parse(response.toString());

      status = responseJson.build.status;

      if (status === 'running') {
        const filteredJobs = responseJson.build.jobs.filter(
          (j: { status: string }) => !queuedOrRunning(j.status) && j.status !== 'success',
        );
        if (filteredJobs.length > 0) {
          throw new Error('Appveyor job status: ' + filteredJobs[0].status);
        }
      }
    }

    if (status === 'success') {
      return Promise.resolve();
    } else if (Date.now() - start > timeout) {
      throw new Error('Appveyor timeout has been reached: ' + timeout);
    } else {
      throw new Error('Appveyor status: ' + status);
    }
  } catch (e) {
    return Promise.reject(e);
  }
}

async function updatePackageJson(info: Info): Promise<void> {
  try {
    console.log('Parsing package.json');

    const packageJsonBuffer = await promisify(fs.readFile)('package.json');

    const packageJson = packageJsonBuffer.toString();
    // example:'"version": "1.2.3"'
    const re = new RegExp(/(['"]version['"]\s*:\s*['"])([^'"]*)(['"])/);

    const match: RegExpMatchArray | null = packageJson.match(re);
    assert.notStrictEqual(match, null);
    if (match === null) throw Error("Release error: Couldn't find version entry.");

    assert.strictEqual(match.length, 4);
    assert.notStrictEqual(match[1], undefined);
    assert.notStrictEqual(match[2], undefined);
    assert.notStrictEqual(match[3], undefined);

    const packageJsonWithVer =
      packageJson.substr(0, match.index! + match[1].length) +
      info.version +
      packageJson.substr(match.index! + match[1].length + match[2].length);

    console.log('Updating package.json');

    await promisify(fs.writeFile)('package.json', packageJsonWithVer);
  } catch (e) {
    return Promise.reject(e);
  }
}

async function gitCommitAndTag(info: Info): Promise<void> {
  try {
    console.log('Creating commit and tag');

    assert.ok(process.env['TRAVIS_BRANCH']);

    await spawn('git', 'checkout', process.env['TRAVIS_BRANCH']!);
    await spawn('git', 'config', '--local', 'user.name', 'deploy.js script');

    const deployerMail = process.env['DEPLOYER_MAIL'] || 'deployer@deployer.de';
    await spawn('git', 'config', '--local', 'user.email', deployerMail);

    await spawn('git', 'status');
    await spawn('git', 'add', '--', 'CHANGELOG.md', 'package.json', 'package-lock.json');
    await spawn('git', 'status');
    await spawn('git', 'commit', '-m', '[Updated] Release info in CHANGELOG.md: ' + info.full!);
    await spawn('git', 'tag', '-a', info.vver!, '-m', 'Version ' + info.vver!);
  } catch (e) {
    return Promise.reject(e);
  }
}

async function gitPush(): Promise<void> {
  try {
    console.log('Pushing to origin');

    assert.ok(process.env['GITHUB_API_KEY'] != undefined);

    await spawn(
      'git',
      'push',
      '--follow-tags',
      'https://' + githubOwnerId + ':' + process.env['GITHUB_API_KEY']! + '@github.com/' + githubRepoFullId + '.git',
    );
  } catch (e) {
    return Promise.reject(e);
  }
}

async function createPackage(info: Info): Promise<string> {
  try {
    console.log('Creating vsce package');

    const packagePath = './out/' + vscodeExtensionId + '-' + info.version + '.vsix';

    await vsce.createVSIX({ cwd: '.', packagePath });

    return packagePath;
  } catch (e) {
    return Promise.reject(e);
  }
}

function publishPackage(packagePath: string): Promise<void> {
  console.log('Publishing vsce package');
  assert.ok(process.env['VSCE_PAT'] != undefined);
  assert.ok(packagePath);
  return vsce.publishVSIX(packagePath, { pat: process.env['VSCE_PAT']! });
}

async function createGithubRelease(info: Info, packagePath: string): Promise<void> {
  try {
    console.log('Publishing to github releases');
    assert.ok(process.env['GITHUB_API_KEY'] != undefined);
    const key = process.env['GITHUB_API_KEY']!;

    const response = await requestP.get({
      url: 'https://api.github.com/repos/' + githubRepoFullId + '/releases/latest',
      headers: { 'User-Agent': githubOwnerId + '-deploy.js' },
      auth: { user: githubOwnerId, pass: key },
    });

    const responseJson = JSON.parse(response.toString());
    assert.notStrictEqual(responseJson.tag_name, info.vver);

    const createReleaseResponse = await requestP.post({
      url: 'https://api.github.com/repos/' + githubRepoFullId + '/releases',
      headers: { 'User-Agent': githubOwnerId + '-deploy.js' },
      json: {
        tag_name: info.vver, // eslint-disable-line
        name: info.full,
        body: 'See [CHANGELOG.md](CHANGELOG.md) for details.',
      },
      auth: { user: githubOwnerId, pass: key },
    });

    await new Promise((resolve, reject) => {
      assert.ok(packagePath);
      const stats = fs.statSync(packagePath);
      const uploadAssetRequest = request.post({
        url: createReleaseResponse.upload_url.replace(
          '{?name,label}',
          '?name=' + vscodeExtensionId + '-' + info.version + '.vsix',
        ),
        headers: {
          'User-Agent': githubOwnerId + '-deploy.js',
          'Content-Type': 'application/zip',
          'Content-Length': stats.size,
        },
        auth: { user: githubOwnerId, pass: key },
      });

      fs.createReadStream(packagePath).pipe(uploadAssetRequest);

      uploadAssetRequest.on('complete', (/*resp*/) => resolve());
      uploadAssetRequest.on('error', e => reject(e));
    });
  } catch (e) {
    return Promise.reject(e);
  }
}

///

async function main(argv: string[]): Promise<void> {
  console.log('deploying; args: ' + argv.join(' '));

  // pre-checks
  assert.strictEqual(path.basename(process.cwd()), githubRepoId);
  assert.ok(process.env['GITHUB_API_KEY']);
  assert.ok(process.env['VSCE_PAT']);
  assert.ok(process.env['APPVEYOR_TOKEN']);

  if (!process.env['TRAVIS_BRANCH']) throw new Error('Not a branch, skipping..');

  if (process.env['TRAVIS_PULL_REQUEST'] !== 'false') throw new Error("Shouldn't be a PR, skipping..");

  if (process.env['TRAVIS_OS_NAME'] !== 'linux') throw new Error('Not osx, skipping..');

  if (process.env['VSCODE_VERSION'] !== 'latest') throw new Error('Not the latest vscode version, skipping..');

  const info = await updateChangelog();

  if (info !== undefined) {
    await updatePackageJson(info);

    await gitCommitAndTag(info);

    const packagePath = await createPackage(info);

    await waitForAppveyorTestsToBeFinished(); // now we should wait

    await gitPush();

    await createGithubRelease(info, packagePath);

    await publishPackage(packagePath);

    console.log('Deployment has finished.');
  } else {
    console.log('Nothing new in CHANGELOG.md; No deployment has happened.');
  }
}

///

main(process.argv.slice(2)).then(
  () => {
    process.exit(0);
  },
  (err: Error) => {
    console.error('Unhandled error under deployment!', err);
    process.exit(-1);
  },
);
