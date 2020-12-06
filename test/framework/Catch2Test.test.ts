import * as assert from 'assert';
import * as path from 'path';
import { Catch2Test } from '../../src/framework/Catch2Test';
import { AbstractRunnable } from '../../src/AbstractRunnable';
import { Suite } from '../../src/Suite';
import { Version } from '../../src/Util';
import { TestRunEvent } from '../../src/SharedVariables';
import { logger } from '../LogOutputContent.test';
import { EOL } from 'os';

///

describe(path.basename(__filename), function () {
  const catch2: Catch2Test = new Catch2Test(
    {
      log: logger,
    },
    (null as unknown) as AbstractRunnable,
    (null as unknown) as Suite,
    new Version(1, 2, 3),
    'TestName',
    ['tag1'],
    'gtest.cpp',
    11,
    undefined,
  );

  it('should parse s1t', function () {
    const output = `
          <TestCase name="s1t1" description="tag1" filename="../vscode-catch2-test-adapter/src/test/suite1.cpp" line="7">
            <OverallResult success="true" durationInSeconds="0.000112"/>
          </TestCase>`;

    const ev = catch2.parseAndProcessTestCase('runid', output, 42, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      state: 'passed',
      test: catch2.id,
      decorations: [],
      description: '[tag1] (0ms)',
      tooltip: 'Name: TestName\nTags: [tag1]\n⏱Duration: 0ms',
      message: '⏱Duration: 0.000112 second(s).\n🔀 Randomness seeded to: 42',
    };

    assert.deepStrictEqual(ev.type, expected.type);
    assert.deepStrictEqual(ev.state, expected.state);
    assert.deepStrictEqual(ev.test, expected.test);
    assert.deepStrictEqual(ev.description, expected.description);
    assert.deepStrictEqual(ev.tooltip, expected.tooltip);
    assert.deepStrictEqual(ev.message, expected.message);
    assert.deepStrictEqual(ev.decorations, expected.decorations);

    assert.strictEqual(catch2.lastRunMilisec, 0.112);
    assert.strictEqual(catch2.description, ev.description);
    assert.strictEqual(catch2.tooltip, ev.tooltip);

    assert.deepStrictEqual(ev, expected);
    assert.deepStrictEqual(catch2.lastRunEvent, expected);
  });

  it('should parse custom1', function () {
    //https://github.com/matepek/vscode-catch2-test-adapter/issues/214
    const output =
      '<TestCase name="Encode Function" tags="[encode]" ' +
      'filename="/home/dinne/isenseit/firmwares/iMeasureConvert/aws-lambda-imeasure-convert/main.cpp" ' +
      //'line="340">\nBlaat:px2$.%)%&#^?;:<.+sk<1>\n0:POST /0004A3D46576/m?d=|\n' +
      'line="340">\nBlaat:px2$.%)%&amp;#^?;:&lt;.+sk&lt;1&gt;\n0:POST /0004A3D46576/m?d=|\n' +
      '1:20200726182438\nToken:A3C94386BFF38164\n2:0004A3D46576|20200726182438|A3\n' +
      '3:0005|R||100\nHeader Length:  169\nSeed:px\nPlugin:  3\nFlags:  2\nChannels: ' +
      ' 2\nCh:  0\nStatus:  0\nValue:       2400\nSecondary:          0\nCh:  1\n' +
      'Status:  0\nValue:       6450\nSecondary:          0\n4:|3;2400,G;6450,G\n' +
      'Plugin:  0\n4:|0\nPlugin:  0\n4:|0\nFrame Length:  191\nChecksum pos Length:  ' +
      '123\nEnc:px|3;2400,G;6450,G|0|0\nEncr Len:   22\nSeed:  232\nBody Length:   ' +
      '22\nContent Length:   22\nHTTP Length:   192\ntsync: 1595787878\n' +
      'Header1:async: \nHeader2:async: \nHeader3: 10\n1591435475\nHTTP_ASYNC ' +
      '1591435475\nHeader1:csync: \nHeader1:ssync: \nHeader1:rsync: \n' +
      'Header1:dsync: \nHeader1:hres: \nHres not found\nFound HTTP Response:    0\n ' +
      '     <OverallResult success="true" durationInSeconds="0.112402">\n        ' +
      '<StdOut>\nParse JSON:\n { "sn": [0, 4, 163, 212, 101, 118],"sc": ' +
      '[0,0,0,0,0,0,0,0,0,0,0,0],"ch": [2400,6450,0,0,0,0,0,0,0,0,0,0],"pl": ' +
      '[3,0,0],"pf": [2,0,0],"da": [0,0,0,0,0,0,0,0,0,0,0,0] }\nParsed json ' +
      'request:\n{\n    "sn": [\n        0,\n        4,\n        163,\n        212,\n  ' +
      '      101,\n        118\n    ],\n    "sc": [\n        0,\n        0,\n        ' +
      '0,\n        0,\n        0,\n        0,\n        0,\n        0,\n        0,\n    ' +
      '    0,\n        0,\n        0\n    ],\n    "ch": [\n        2400,\n        ' +
      '6450,\n        0,\n        0,\n        0,\n        0,\n        0,\n        0,\n ' +
      '       0,\n        0,\n        0,\n        0\n    ],\n    "pl": [\n        3,\n ' +
      '       0,\n        0\n    ],\n    "pf": [\n        2,\n        0,\n        0\n  ' +
      '  ],\n    "da": [\n        0,\n        0,\n        0,\n        0,\n        0,\n ' +
      '       0,\n        0,\n        0,\n        0,\n        0,\n        0,\n        ' +
      '0\n    ]\n}----------------\ndecode response\n        </StdOut>\n      ' +
      '</OverallResult>\n    </TestCase>';

    const ev = catch2.parseAndProcessTestCase('runid', output, 42, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      state: 'passed',
      test: catch2.id,
    };

    assert.deepStrictEqual(ev.type, expected.type);
    assert.deepStrictEqual(ev.state, expected.state);
    assert.deepStrictEqual(ev.test, expected.test);
  });

  // fails due to Catch2 parsing issuej
  it.skip('should parse custom2', function () {
    // https://github.com/matepek/vscode-catch2-test-adapter/issues/238
    const output = [
      '<TestCase name="LightSensor: can Construct." filename="/home/home/Documents/Cpp-Things/Microfabricator-Embedded/test/unit-tests/light_sensor_test.cpp" line="7">',
      '[132357μs] 12  D FakeLightSensor.hpp          Constructed <Pin:10>',
      '      <OverallResult success="true" durationInSeconds="4.3e-05"/>',
      '    </TestCase>',
      '    <TestCase name="LightSensor: can set Pin." filename="/home/home/Documents/Cpp-Things/Microfabricator-Embedded/test/unit-tests/light_sensor_test.cpp" line="13">',
      '[132401μs] 12  D FakeLightSensor.hpp          Constructed <Pin:10>',
      '      <OverallResult success="true" durationInSeconds="1.6e-05"/>',
      '    </TestCase>',
      '    <TestCase name="LightSensor: can read Value." filename="/home/home/Documents/Cpp-Things/Microfabricator-Embedded/test/unit-tests/light_sensor_test.cpp" line="19">',
      '[132427μs] 12  D FakeLightSensor.hpp          Constructed <Pin:10>',
      '      <OverallResult success="true" durationInSeconds="9.7e-05"/>',
      '    </TestCase>',
      '    <TestCase name="LightSensor: transmits correctly." filename="/home/home/Documents/Cpp-Things/Microfabricator-Embedded/test/unit-tests/light_sensor_test.cpp" line="29">',
      '[132538μs] 12  D FakeLightSensor.hpp          Constructed <Pin:10>',
    ];
    const ev = catch2.parseAndProcessTestCase('runid', output.join(EOL), 42, null, '');

    const expected: TestRunEvent = {
      testRunId: 'runid',
      type: 'test',
      state: 'passed',
      test: catch2.id,
    };

    assert.deepStrictEqual(ev.type, expected.type);
    assert.deepStrictEqual(ev.state, expected.state);
    assert.deepStrictEqual(ev.test, expected.test);
  });
});
