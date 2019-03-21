# !/bin/sh

npm install
npm audit
npm run compile
node ./out/test/repo_scripts/deploy.js