import * as assert from 'assert';
import * as path from 'path';

import { BoostTestCaseInfo, parseBoostTestDot } from '../src/framework/BoostTest/BoostTestDotParser';

// trimmed output of `boosttest1.exe --list_content=DOT` and `boosttest2.exe --list_content=DOT` (test/cpp/boosttest)
const dot = `digraph G {rankdir=LR;
tu1[shape=ellipse,peripheries=2,fontname=Helvetica,color=green,label="boosttest1 test"];
{
tu65536[shape=Mrecord,fontname=Helvetica,color=green,label="constructors_test|/w/boosttest1.cpp(15)"];
tu1 -> tu65536;
tu2[shape=Mrecord,fontname=Helvetica,color=green,label="basic_suite|/w/boosttest1.cpp(23)"];
tu1 -> tu2;
{
tu65539[shape=Mrecord,fontname=Helvetica,color=green,label="fail|/w/boosttest1.cpp(29)"];
tu2 -> tu65539;
tu3[shape=Mrecord,fontname=Helvetica,color=green,label="nested_suite|/w/boosttest1.cpp(71)"];
tu2 -> tu3;
{
tu4[shape=Mrecord,fontname=Helvetica,color=green,label="deeply_nested_suite|/w/boosttest1.cpp(81)"];
tu3 -> tu4;
{
tu65550[shape=Mrecord,fontname=Helvetica,color=green,label="deep_pass|/w/boosttest1.cpp(83)"];
tu4 -> tu65550;
}
}
}
tu7[shape=Mrecord,fontname=Helvetica,color=green,label="decorators|/w/boosttest1.cpp(204)|expected failures=4"];
tu1 -> tu7;
{
tu65564[shape=Mrecord,fontname=Helvetica,color=green,label="multiple_labels|/w/boosttest1.cpp(210)|labels: @fast @smoke @network"];
tu7 -> tu65564;
tu65566[shape=Mrecord,fontname=Helvetica,color=yellow,label="is_disabled|/w/boosttest1.cpp(218)"];
tu7 -> tu65566;
tu65574[shape=Mrecord,fontname=Helvetica,color=green,label="timeout_exceeded|/w/boosttest1.cpp(250)|timeout=1"];
tu7 -> tu65574;
tu65577[shape=Mrecord,fontname=Helvetica,color=green,label="depends_on_failing|/w/boosttest1.cpp(262)"];
tu7 -> tu65577;
tu65577 -> tu65539[color=red,style=dotted,constraint=false];
tu65579[shape=Mrecord,fontname=Helvetica,color=green,label="combined|/w/boosttest1.cpp(270)|timeout=10|expected failures=1|labels: @a"];
tu7 -> tu65579;
}
tu8[shape=Mrecord,fontname=Helvetica,color=green,label="suite_with_decorators|/w/boosttest1.cpp(278)|labels: @suite_label"];
tu1 -> tu8;
{
tu65581[shape=Mrecord,fontname=Helvetica,color=green,label="own_and_inherited_label|/w/boosttest1.cpp(284)|labels: @own"];
tu8 -> tu65581;
}
tu9[shape=Mrecord,fontname=Helvetica,color=green,label="disabled_suite|/w/boosttest1.cpp(290)"];
tu1 -> tu9;
{
tu65582[shape=Mrecord,fontname=Helvetica,color=yellow,label="in_disabled_suite|/w/boosttest1.cpp(292)"];
tu9 -> tu65582;
tu65583[shape=Mrecord,fontname=Helvetica,color=green,label="re_enabled_in_disabled_suite|/w/boosttest1.cpp(296)"];
tu9 -> tu65583;
}
tu5[shape=Mrecord,fontname=Helvetica,color=green,label="template_tests|C:\\w\\boosttest2.cpp(111)"];
tu1 -> tu5;
{
tu65549[shape=Mrecord,fontname=Helvetica,color=green,label="template_pass<unsigned char>|C:\\w\\boosttest2.cpp(115)"];
tu5 -> tu65549;
}
tu6[shape=Mrecord,fontname=Helvetica,color=green,label="dataset_tests|/w/boosttest2.cpp(157)"];
tu1 -> tu6;
{
tu10[shape=Mrecord,fontname=Helvetica,color=green,label="array_dataset|/w/boosttest2.cpp(159)"];
tu6 -> tu10;
{
tu65561[shape=Mrecord,fontname=Helvetica,color=green,label="_0|/w/boosttest2.cpp(159)"];
tu10 -> tu65561;
tu65562[shape=Mrecord,fontname=Helvetica,color=green,label="_1|/w/boosttest2.cpp(159)"];
tu10 -> tu65562;
}
}
tu11[shape=Mrecord,fontname=Helvetica,color=green,label="empty_suite|/w/boosttest2.cpp(300)"];
tu1 -> tu11;
}
}
`;

describe(path.basename(__filename), function () {
  const byId = (tests: BoostTestCaseInfo[]): Map<string, BoostTestCaseInfo> =>
    new Map(tests.map(t => [t.path.join('/'), t]));

  const tests = byId(parseBoostTestDot(dot));

  it('should list only the test cases with their full path', function () {
    assert.deepStrictEqual(
      [...tests.keys()],
      [
        'constructors_test',
        'basic_suite/fail',
        'basic_suite/nested_suite/deeply_nested_suite/deep_pass',
        'decorators/multiple_labels',
        'decorators/is_disabled',
        'decorators/timeout_exceeded',
        'decorators/depends_on_failing',
        'decorators/combined',
        'suite_with_decorators/own_and_inherited_label',
        'disabled_suite/in_disabled_suite',
        'disabled_suite/re_enabled_in_disabled_suite',
        'template_tests/template_pass<unsigned char>',
        'dataset_tests/array_dataset/_0',
        'dataset_tests/array_dataset/_1',
      ],
    );
  });

  it('should parse file and line', function () {
    const t = tests.get('basic_suite/nested_suite/deeply_nested_suite/deep_pass')!;
    assert.strictEqual(t.file, '/w/boosttest1.cpp');
    assert.strictEqual(t.line, '83');

    const w = tests.get('template_tests/template_pass<unsigned char>')!;
    assert.strictEqual(w.file, 'C:\\w\\boosttest2.cpp');
    assert.strictEqual(w.line, '115');
  });

  it('should parse the enabled state', function () {
    assert.strictEqual(tests.get('constructors_test')!.enabled, true);
    assert.strictEqual(tests.get('decorators/is_disabled')!.enabled, false);
    assert.strictEqual(tests.get('disabled_suite/in_disabled_suite')!.enabled, false);
    assert.strictEqual(tests.get('disabled_suite/re_enabled_in_disabled_suite')!.enabled, true);
  });

  it('should parse labels, timeout and expected failures', function () {
    const t = tests.get('decorators/combined')!;
    assert.deepStrictEqual(t.labels, ['a']);
    assert.strictEqual(t.timeoutSec, 10);
    assert.strictEqual(t.expectedFailures, 1);

    assert.deepStrictEqual(tests.get('decorators/multiple_labels')!.labels, ['fast', 'smoke', 'network']);
    assert.strictEqual(tests.get('decorators/timeout_exceeded')!.timeoutSec, 1);
    assert.strictEqual(tests.get('decorators/timeout_exceeded')!.expectedFailures, 0);
    assert.strictEqual(tests.get('constructors_test')!.timeoutSec, undefined);
    assert.deepStrictEqual(tests.get('constructors_test')!.labels, []);
  });

  it('should inherit the labels of the parent suites', function () {
    assert.deepStrictEqual(tests.get('suite_with_decorators/own_and_inherited_label')!.labels, ['own', 'suite_label']);
  });

  it('should ignore dependency edges', function () {
    assert.deepStrictEqual(tests.get('decorators/depends_on_failing')!.path, ['decorators', 'depends_on_failing']);
    assert.deepStrictEqual(tests.get('basic_suite/fail')!.path, ['basic_suite', 'fail']);
  });

  it('should handle CRLF line endings', function () {
    assert.deepStrictEqual([...byId(parseBoostTestDot(dot.replace(/\n/g, '\r\n'))).keys()], [...tests.keys()]);
  });

  it('should return empty for empty input', function () {
    assert.deepStrictEqual(parseBoostTestDot(''), []);
  });
});
