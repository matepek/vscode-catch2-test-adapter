# Contribution

Any contribution is welcome.

- Create a pull request.
- Report a bug.
- Tell me about your desired features.
- [![Buy Me A Coffee](https://bmc-cdn.nyc3.digitaloceanspaces.com/BMC-button-images/custom_images/orange_img.png)](https://www.buymeacoffee.com/rtdmjYspB)

## Install

```bash
npm install
npm test
```

It is recommended to create a push hook:

`cp ./resources/githooks/pre-push ./.git/hooks/pre-push`

Content of **.git/hooks/pre-push** file:

```bash
#!/bin/sh
echo "pre-push hook:"
set -e -x
npm audit --production
npm rum compile
npx mocha ./out/test/Documentation.test.js ./out/test/ESLint.test.js
```

## Publishing to market

If you think your changes worth of a release, add a new version entry to `CHANGELOG.md` file without a date.
Then Travis will publish it automatically.

## Checklist

- Are the tests are running? (`npm test`)
- Is the `CHANGELOG.md` was updated?
