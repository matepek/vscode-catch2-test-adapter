import * as assert from 'assert';
import * as path from 'path';

import { resolveVariables } from '../src/util/ResolveRule';
import { TestAdapter } from './Common';

describe(path.basename(__filename), function () {
  let adapter: TestAdapter;

  beforeEach(async function () {
    adapter = new TestAdapter();
  });

  afterEach(async function () {
    await adapter.waitAndDispose(this);
  });

  context('variableToValue', function () {
    it('if(isWin)', function () {
      assert.strictEqual(
        resolveVariables('${if(isWin)}win32${else}other${endif}', (adapter as any)._shared.varToValue),
        process.platform === 'win32' ? 'win32' : 'other',
      );
    });

    it('multiple if(isWin)', function () {
      assert.strictEqual(
        resolveVariables(
          '${if(isWin)}win32${else}other${endif} ${if(isWin)}win32${else}other${endif}',
          (adapter as any)._shared.varToValue,
        ),
        process.platform === 'win32' ? 'win32 win32' : 'other other',
      );
    });

    it('switch(os)', function () {
      assert.strictEqual(
        resolveVariables(
          '${switch(os)}${win}win32${mac}darwin${lin}linux${endswitch}',
          (adapter as any)._shared.varToValue,
        ),
        process.platform,
      );
    });

    it('switch(os) different order', function () {
      assert.strictEqual(
        resolveVariables(
          '${switch(os)}${mac}darwin${lin}linux${win}win32${endswitch}',
          (adapter as any)._shared.varToValue,
        ),
        process.platform,
      );
    });

    it('switch(os) last case def', function () {
      assert.strictEqual(
        resolveVariables(
          '${switch(os)}${win}win32${mac}darwin${def}linux${endswitch}',
          (adapter as any)._shared.varToValue,
        ),
        process.platform,
      );
    });

    it('switch(os) 1 case with def', function () {
      assert.strictEqual(
        resolveVariables('${switch(os)}${win}win32${def}def${endswitch}', (adapter as any)._shared.varToValue),
        process.platform === 'win32' ? 'win32' : 'def',
      );
    });

    it('switch(os) 1 case', function () {
      assert.strictEqual(
        resolveVariables('${switch(os)}${win}win32${endswitch}', (adapter as any)._shared.varToValue),
        process.platform === 'win32' ? 'win32' : '',
      );
    });

    it('multiple switch(os)', function () {
      assert.strictEqual(
        resolveVariables(
          '${switch(os)}${win}win32${endswitch} ${switch(os)}${win}win32${def}def${endswitch}',
          (adapter as any)._shared.varToValue,
        ),
        process.platform === 'win32' ? 'win32 win32' : ' def',
      );
    });
  });
});
