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

  it('parses example no.1', function () {
    const output = [
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
      '    }',
    ].join(EOL);

    const ev = gbenchmark.parseAndProcessTestCase('runid', output, 42, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      test: gbenchmark.id,
      message:
        'name: "BM_StringCreation"\nrun_name: "BM_StringCreation"\nrun_type: "iteration"\nrepetitions: 0\nrepetition_index: 0\nthreads: 1\niterations: 30591330\nreal_time: 22.657936643709753\ncpu_time: 22.64602421666531\ntime_unit: "ns"',
      state: 'passed',
      description: '',
      tooltip: 'Name: TestName',
      decorations: [],
    };

    assert.strictEqual(gbenchmark.description, ev.description);
    assert.strictEqual(gbenchmark.tooltip, ev.tooltip);
    assert.strictEqual(gbenchmark.lastRunMilisec, undefined);
    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(gbenchmark.lastRunEvent, expected);
  });
});
