import * as assert from 'assert';
import * as path from 'path';

import * as utils from '../src/Util';

describe(path.basename(__filename), function() {
  it('resolveVariables', function() {
    const func1 = (): string => 'resolvedFunc1';

    // eslint-disable-next-line
    const varsToResolve: utils.ResolveRulePair[] = [
      ['null1', null],
      ['undefined1', undefined],
      ['string1', 'resolvedString1'],
      ['number1', 1],
      ['double1', 1.0],
      ['object1', { name: 'one' }],
      ['array1', ['item1']],
      ['func1', func1],
      [/reg(ex1|ex2)/, '$1'],
      [/Reg(ex1|ex2)/g, '$1'],
      [/func(ex1|ex2)/, (m: RegExpMatchArray): string => m[1] + 'yee'],
    ];

    assert.deepStrictEqual(utils.resolveVariables(null, varsToResolve), null);
    assert.deepStrictEqual(utils.resolveVariables(undefined, varsToResolve), undefined);
    assert.deepStrictEqual(utils.resolveVariables('', varsToResolve), '');
    assert.deepStrictEqual(utils.resolveVariables(1, varsToResolve), 1);
    assert.deepStrictEqual(utils.resolveVariables(1.0, varsToResolve), 1.0);
    assert.deepStrictEqual(utils.resolveVariables({}, varsToResolve), {});
    assert.deepStrictEqual(utils.resolveVariables([], varsToResolve), []);
    assert.deepStrictEqual(utils.resolveVariables(func1, varsToResolve), func1);
    assert.deepStrictEqual(utils.resolveVariables('func1', varsToResolve), 'resolvedFunc1');

    assert.deepStrictEqual(utils.resolveVariables('regex1', varsToResolve), 'ex1');
    assert.deepStrictEqual(utils.resolveVariables('p_regex2_s', varsToResolve), 'p_ex2_s');
    assert.deepStrictEqual(utils.resolveVariables('p_regex1_s p_regex2_s', varsToResolve), 'p_ex1_s p_regex2_s');
    assert.deepStrictEqual(utils.resolveVariables('p_Regex1_s p_Regex2_s', varsToResolve), 'p_ex1_s p_ex2_s');

    assert.deepStrictEqual(utils.resolveVariables('funcex1', varsToResolve), 'ex1yee');
    assert.deepStrictEqual(utils.resolveVariables('funcex1 funcex2', varsToResolve), 'ex1yee ex2yee');
    assert.deepStrictEqual(utils.resolveVariables('p funcex1 funcex2 s', varsToResolve), 'p ex1yee ex2yee s');

    assert.deepStrictEqual(
      utils.resolveVariables('p funcex1 funcex2 s', [[/func(ex1|ex2)/, (): string => 'yee']]),
      'p yee yee s',
    );

    assert.deepStrictEqual(utils.resolveVariables([null], varsToResolve), [null]);
    assert.deepStrictEqual(utils.resolveVariables([undefined], varsToResolve), [undefined]);
    assert.deepStrictEqual(utils.resolveVariables([''], varsToResolve), ['']);
    assert.deepStrictEqual(utils.resolveVariables([1], varsToResolve), [1]);
    assert.deepStrictEqual(utils.resolveVariables([1.0], varsToResolve), [1.0]);
    assert.deepStrictEqual(utils.resolveVariables([{}], varsToResolve), [{}]);
    assert.deepStrictEqual(utils.resolveVariables([[]], varsToResolve), [[]]);
    assert.deepStrictEqual(utils.resolveVariables([func1], varsToResolve), [func1]);
    assert.deepStrictEqual(utils.resolveVariables(['func1'], varsToResolve), ['resolvedFunc1']);

    assert.deepStrictEqual(utils.resolveVariables({ x: null }, varsToResolve), { x: null });
    assert.deepStrictEqual(utils.resolveVariables({ x: undefined }, varsToResolve), {
      /*x: undefined*/
    });
    assert.deepStrictEqual(utils.resolveVariables({ x: '' }, varsToResolve), { x: '' });
    assert.deepStrictEqual(utils.resolveVariables({ x: 1 }, varsToResolve), { x: 1 });
    assert.deepStrictEqual(utils.resolveVariables({ x: 1.0 }, varsToResolve), { x: 1.0 });
    assert.deepStrictEqual(utils.resolveVariables({ x: {} }, varsToResolve), { x: {} });
    assert.deepStrictEqual(utils.resolveVariables({ x: [] }, varsToResolve), { x: [] });
    assert.deepStrictEqual(utils.resolveVariables({ x: func1 }, varsToResolve), { x: func1 });
    assert.deepStrictEqual(utils.resolveVariables({ x: 'func1' }, varsToResolve), { x: 'resolvedFunc1' });

    const input = {
      a: null,
      b: 'null1',
      c: undefined,
      d: 'undefined1',
      e: '',
      f: 'string1',
      g: 1,
      h: 'number1',
      i: 1.0,
      j: 'double1',
      k: {},
      l: 'object1',
      m: [],
      n: 'array1',
      o: func1,
      p: 'func1',
    };

    const expected = {
      a: null,
      b: null,
      //c: undefined,
      //d: undefined,
      e: '',
      f: 'resolvedString1',
      g: 1,
      h: 1,
      i: 1.0,
      j: 1.0,
      k: {},
      l: { name: 'one' },
      m: [],
      n: ['item1'],
      o: func1,
      p: 'resolvedFunc1',
    };

    assert.deepStrictEqual(utils.resolveVariables(input, varsToResolve), expected);
    assert.deepStrictEqual(utils.resolveVariables({ a: input, b: input }, varsToResolve), { a: expected, b: expected });
    assert.deepStrictEqual(utils.resolveVariables([input, input], varsToResolve), [expected, expected]);
  });
});
