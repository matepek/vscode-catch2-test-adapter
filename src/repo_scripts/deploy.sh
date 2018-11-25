# !/bin/sh

npm install
npm audit
npm run compile
node ./out/repo_scripts/deploy.js