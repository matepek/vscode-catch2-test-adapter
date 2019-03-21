# Contribution

Any contribution is welcome.

- Create a pull request.
- Report a bug.
- Tell me about your desired features.

## Install

```bash
npm install
npm test
```

It is recommended to create a push hook:

**.git/hooks/pre-push** file:

```bash
#!/bin/sh
echo "pre-push hook:"
set -e -x
npm audit
npm rum compile
npx mocha ./out/test/TestDocumentation.test.js ./out/test/TestESLint.test.js
```
