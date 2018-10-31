# !/bin/sh

npm install
npm install --no-save vsce
npm run compile
node ./out/repo_scripts/deploy.js