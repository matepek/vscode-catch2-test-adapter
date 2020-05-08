import * as assert from 'assert';
import * as path from 'path';

import * as utils from '../src/Util';

describe(path.basename(__filename), function () {
  it('resolveVariables', function () {
    const func1 = (): string => 'resolvedFunc1';

    // eslint-disable-next-line
    const varsToResolve: utils.ResolveRulePair<null | undefined | string | number | object>[] = [
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

  context.skip('AdvancedII playground', function () {
    class AdvancedII<T> implements IterableIterator<T> {
      public constructor(public readonly next: () => IteratorResult<T>) {}

      public static from<T>(iterable: Iterable<T>): AdvancedII<T> {
        return new AdvancedII<T>(iterable[Symbol.iterator]().next);
      }

      public toArray(): T[] {
        return [...this];
      }

      [Symbol.iterator](): AdvancedII<T> {
        return this;
      }

      public map<U>(func: (t: T) => U): AdvancedII<U> {
        const nextFunc = this.next;
        let next: IteratorResult<T> = (undefined as unknown) as IteratorResult<T>;

        return new AdvancedII<U>(
          (): IteratorResult<U> => {
            next = nextFunc();

            return next.done ? { value: undefined, done: true } : { value: func(next.value), done: false };
          },
        );
      }

      public filter(func: (t: T) => boolean): AdvancedII<T> {
        const nextFunc = this.next;
        let next: IteratorResult<T> = (undefined as unknown) as IteratorResult<T>;

        return new AdvancedII<T>(
          (): IteratorResult<T> => {
            next = nextFunc();
            while (!next.done && !func(next.value)) next = nextFunc();

            return next.done ? { value: undefined, done: true } : { value: next.value, done: false };
          },
        );
      }
    }

    it('test', function () {
      const x = AdvancedII.from([1, 2, 3]);
      assert.deepStrictEqual(x.toArray(), [1, 2, 3]);
    });
  });

  context.skip('decorator playground', function () {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    /* eslint-disable @typescript-eslint/camelcase */
    /* eslint-disable @typescript-eslint/no-unused-vars */
    function CacheableAsync<T, R>(
      storeOnlyResolved: boolean,
      customCache?: {
        store: (obj: T, value: Promise<R> | undefined, propertyKey: string | symbol) => void; // `undefined` clears the cache
        load: (obj: T, propertyKey: string | symbol) => Promise<R> | undefined; // `undefined` means no cached value
      },
    ): (
      target: any,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<R>>,
    ) => void {
      return function (
        target: any,
        propertyKey: string | symbol,
        descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<R>>,
      ): void {
        if (typeof descriptor.value !== 'function') throw Error('use only with method');

        const cacheSymbol = Symbol('cached state of ' + propertyKey.toString());
        const originalFunc = descriptor.value;

        descriptor.value = async function (...args: any[]): Promise<R> {
          const thisWithCache = this as { [cacheSymbol]?: Promise<R> | undefined };

          let cachedVal: Promise<R> | undefined;

          if (customCache) {
            cachedVal = customCache.load(this as T, propertyKey);
          } else {
            cachedVal = thisWithCache[cacheSymbol];
          }

          if (cachedVal !== undefined) {
            return cachedVal;
          } else {
            cachedVal = originalFunc.apply(this, args);

            if (storeOnlyResolved) {
              cachedVal.catch((err: any) => {
                // clear cache
                if (customCache) {
                  customCache.store(this as T, undefined, propertyKey);
                } else {
                  thisWithCache[cacheSymbol] = undefined;
                }

                throw err;
              });
            }

            if (customCache) {
              customCache.store(this as T, cachedVal, propertyKey);
            } else {
              thisWithCache[cacheSymbol] = cachedVal;
            }

            return cachedVal;
          }
        };
      };
    }

    //function Invalidate

    function TryWithFallbackAsync<T, R>(
      defaultValue: R, // returns with this value in case of error
      handler?: {
        resolveHandler?: (obj: T, propertyKey: string | symbol) => void; // called in case of no error
        rejectHandler: (obj: T, errorOpt: any, propertyKey: string | symbol) => void; // called in case of error
      },
    ): (
      target: any,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<R>>,
    ) => void {
      return function (
        target: any,
        propertyKey: string | symbol,
        descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<R>>,
      ): void {
        if (typeof descriptor.value !== 'function') throw Error('use only with method');

        const originalFunc = descriptor.value;

        descriptor.value = async function (...args: any[]): Promise<R> {
          const resolveHandler = handler?.resolveHandler
            ? (val: R): R => {
                handler.resolveHandler!(this as T, propertyKey);
                return val;
              }
            : undefined;

          const errorHandler = handler
            ? (err: any): R => {
                handler.rejectHandler(this as T, err, propertyKey);
                return defaultValue;
              }
            : (): R => defaultValue;

          return originalFunc.apply(this, args).then(resolveHandler, errorHandler);
        };
      };
    }

    // example
    function F_ActionAsync(): (
      target: any,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<number>>,
    ) => void {
      return function (
        target: any,
        propertyKey: string | symbol,
        descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<number>>,
      ): void {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        if (target !== (MyClass.prototype as any)) throw Error('use only with MyClass');

        CacheableAsync<MyClass, number>(true, {
          store: (obj: MyClass, value: Promise<number> | undefined, propertyKey: string | symbol): void => {
            obj._cachedF = value;
          },
          load: (obj: MyClass, propertyKey: string | symbol): Promise<number> | undefined => {
            return obj._cachedF;
          },
        })(target, propertyKey, descriptor);

        TryWithFallbackAsync<MyClass, number>(0, {
          resolveHandler: (obj: MyClass, propertyKey: string | symbol) => {
            // clear error
            obj._errOfF = undefined;
          },
          rejectHandler: (obj: MyClass, err: any, propertyKey: string | symbol): void => {
            // set error
            obj._errOfF = err;
          },
        })(target, propertyKey, descriptor);

        // ... Action(..)(..)
      };
    }

    class MyClass {
      constructor(public readonly val: string) {}

      _cachedF: Promise<number> | undefined = undefined;
      _errOfF: any | undefined = undefined;

      @F_ActionAsync()
      async f(): Promise<number> {
        return new Promise(r => setTimeout(r, 200)).then(() => 3);
      }

      async ff(): Promise<void> {
        await this.f();
      }
    }

    it('test', async function () {
      const x = new MyClass('apple');
      await x.f();
      await x.f();
    });

    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
});
