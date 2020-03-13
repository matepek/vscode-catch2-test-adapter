// https://dev.to/robertcoopercode/using-eslint-and-prettier-in-a-typescript-project-53jb

module.exports = {
    "parser": '@typescript-eslint/parser',  // Specifies the ESLint parser
    "env": {
        "es6": true,
        "node": true
    },
    "extends": [
        //"eslint:recommended",
        'plugin:@typescript-eslint/recommended',  // Uses the recommended rules from the @typescript-eslint/eslint-plugin
        'prettier/@typescript-eslint',  // Uses eslint-config-prettier to disable ESLint rules from @typescript-eslint/eslint-plugin that would conflict with prettier
        'plugin:prettier/recommended',  // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
    ],
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly"
    },
    "parserOptions": {
        "ecmaVersion": 2018,
        "sourceType": "module"
    },
    "rules": {
        // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
        // e.g. "@typescript-eslint/explicit-function-return-type": "off",

        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-parameter-properties": "off",
        '@typescript-eslint/explicit-function-return-type': "error",

        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/camelcase": "warn",
        "prettier/prettier": 'warn',
    },
};