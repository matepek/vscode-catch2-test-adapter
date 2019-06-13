import * as path from 'path';

describe(path.basename(__filename), function() {
  require('mocha-eslint')('src/**/*.ts', {
    // Specify style of output
    formatter: 'compact', // Defaults to `stylish`

    // Only display warnings if a test is failing
    alwaysWarn: false, // Defaults to `true`, always show warnings

    // Increase the timeout of the test if linting takes to long
    timeout: 10000, // Defaults to the global mocha `timeout` option

    // Increase the time until a test is marked as slow
    slow: 4000, // Defaults to the global mocha `slow` option

    // Consider linting warnings as errors and return failure
    strict: true, // Defaults to `false`, only notify the warnings

    // Specify the mocha context in which to run tests
    contextName: 'eslint src/**/*.ts', // Defaults to `eslint`, but can be any string
  });
});
