import * as assert from 'assert';
import * as path from 'path';
import { GoogleBenchmarkTest } from '../../src/framework/GoogleBenchmarkTest';
import { AbstractRunnable } from '../../src/AbstractRunnable';
import { Suite } from '../../src/Suite';
import { EOL } from 'os';
import { TestRunEvent } from '../../src/SharedVariables';
import { logger } from '../LogOutputContent.test';

///

describe(path.basename(__filename), function () {
  const gbenchmark: GoogleBenchmarkTest = new GoogleBenchmarkTest(
    {
      log: logger,
    },
    (null as unknown) as AbstractRunnable,
    (null as unknown) as Suite,
    'TestName',
    undefined,
  );

  it.only('parses example no.1', function () {
    const output = [
      '{',
      '  "context": {',
      '    "date": "2020-10-09T13:39:40+07:00",',
      '    "host_name": "C02TM0QHG8WL",',
      '    "executable": "./gbenchmark.exe",',
      '    "num_cpus": 8,',
      '    "mhz_per_cpu": 2800,',
      '    "cpu_scaling_enabled": false,',
      '    "caches": [',
      '      {',
      '        "type": "Data",',
      '        "level": 1,',
      '        "size": 32768,',
      '        "num_sharing": 2',
      '      },',
      '      {',
      '        "type": "Instruction",',
      '        "level": 1,',
      '        "size": 32768,',
      '        "num_sharing": 2',
      '      },',
      '      {',
      '        "type": "Unified",',
      '        "level": 2,',
      '        "size": 262144,',
      '        "num_sharing": 2',
      '      },',
      '      {',
      '        "type": "Unified",',
      '        "level": 3,',
      '        "size": 6291456,',
      '        "num_sharing": 8',
      '      }',
      '    ],',
      '    "load_avg": [2.65625,2.96094,3.1333],',
      '    "library_build_type": "debug"',
      '  },',
      '  "benchmarks": [',
      '    {',
      '      "name": "BM_StringCreation",',
      '      "run_name": "BM_StringCreation",',
      '      "run_type": "iteration",',
      '      "repetitions": 0,',
      '      "repetition_index": 0,',
      '      "threads": 1,',
      '      "iterations": 30591330,',
      '      "real_time": 2.2657936643709753e+01,',
      '      "cpu_time": 2.2646024216665310e+01,',
      '      "time_unit": "ns"',
      '    },',
      '    {',
      '      "name": "BM_StringCopy",',
      '      "run_name": "BM_StringCopy",',
      '      "run_type": "iteration",',
      '      "repetitions": 0,',
      '      "repetition_index": 0,',
      '      "threads": 1,',
      '      "iterations": 85353363,',
      '      "real_time": 8.3383029676526874e+00,',
      '      "cpu_time": 8.3028597244610030e+00,',
      '      "time_unit": "ns"',
      '    }',
      '  ]',
      '}',
    ].join(EOL);

    const ev = gbenchmark.parseAndProcessTestCase('runid', output, 42, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      test: gbenchmark.id,
      message: output,
      state: 'failed',
      description: '(66ms)',
      tooltip: 'Name: TestCase.TestName\n⏱Duration: 66ms',
      decorations: [
        {
          file: 'gtest.cpp',
          line: 77,
          message: '⬅ multiple failures',
          hover: [
            'EXPECT_CALL(foo, Describe(4))...',
            '  Expected arg #0: is equal to 4',
            '           Actual: 3',
            '         Expected: to be called once',
            '           Actual: never called - unsatisfied and active',
            '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯',
            "Actual function call count doesn't match EXPECT_CALL(foo, Describe(4))...",
            '         Expected: to be called once',
            '           Actual: never called - unsatisfied and active',
          ].join('\n'),
        },
      ],
    };

    assert.strictEqual(gbenchmark.description, ev.description);
    assert.strictEqual(gbenchmark.tooltip, ev.tooltip);
    assert.strictEqual(gbenchmark.lastRunMilisec, undefined);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(gbenchmark.lastRunEvent, expected);
  });
});
