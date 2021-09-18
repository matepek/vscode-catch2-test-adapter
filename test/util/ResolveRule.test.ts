import * as assert from 'assert';
import * as path from 'path';

import { resolveVariablesAsync, ResolveRuleAsync } from '../../src/util/ResolveRule';

describe(path.basename(__filename), function () {
  it('resolveVariablesAsync', async function () {
    const func1 = (): Promise<string> => Promise.resolve('resolvedFunc1');

    // eslint-disable-next-line
    const varsToResolve: ResolveRuleAsync<null | undefined | string | number | object>[] = [
      { resolve: 'null1', rule: (): Promise<null> => Promise.resolve(null) },
      { resolve: 'undefined1', rule: (): Promise<undefined> => Promise.resolve(undefined) },
      { resolve: 'string1', rule: (): Promise<string> => Promise.resolve('resolvedString1') },
      { resolve: 'number1', rule: (): Promise<number> => Promise.resolve(1) },
      { resolve: 'double1', rule: (): Promise<number> => Promise.resolve(1.0) },
      { resolve: 'object1', rule: (): Promise<Record<string, string>> => Promise.resolve({ name: 'one' }) },
      {
        resolve: 'object2',
        rule: (): Promise<Record<string, string>> => Promise.resolve({ name2: 'two' }),
        isFlat: true,
      },
      { resolve: 'array1', rule: (): Promise<string[]> => Promise.resolve(['item1']) },
      { resolve: 'array2', rule: (): Promise<string[]> => Promise.resolve(['item2', 'item3']), isFlat: true },
      { resolve: 'func1', rule: func1 },
      { resolve: /reg(ex1|ex2)/, rule: (m: RegExpMatchArray): Promise<string> => Promise.resolve(m[1]) },
      { resolve: /reeg(ex1|ex2)/i, rule: (m: RegExpMatchArray): Promise<string> => Promise.resolve(m[1]) },
      { resolve: /func(ex1|ex2)/, rule: (m: RegExpMatchArray): Promise<string> => Promise.resolve(m[1] + 'yee') },
    ];

    assert.deepStrictEqual(await resolveVariablesAsync(null, varsToResolve), null);
    assert.deepStrictEqual(await resolveVariablesAsync(undefined, varsToResolve), undefined);
    assert.deepStrictEqual(await resolveVariablesAsync('', varsToResolve), '');
    assert.deepStrictEqual(await resolveVariablesAsync(1, varsToResolve), 1);
    assert.deepStrictEqual(await resolveVariablesAsync(1.0, varsToResolve), 1.0);
    assert.deepStrictEqual(await resolveVariablesAsync({}, varsToResolve), {});
    assert.deepStrictEqual(await resolveVariablesAsync([], varsToResolve), []);
    assert.deepStrictEqual(await resolveVariablesAsync(func1, varsToResolve), func1);
    assert.deepStrictEqual(await resolveVariablesAsync('func1', varsToResolve), 'resolvedFunc1');

    assert.deepStrictEqual(await resolveVariablesAsync('regex1', varsToResolve), 'ex1');
    assert.deepStrictEqual(await resolveVariablesAsync('p_regex2_s', varsToResolve), 'p_ex2_s');
    assert.deepStrictEqual(await resolveVariablesAsync('p_Reegex1_s p_Reegex2_s', varsToResolve), 'p_ex1_s p_ex2_s');

    assert.deepStrictEqual(await resolveVariablesAsync('funcex1', varsToResolve), 'ex1yee');
    assert.deepStrictEqual(await resolveVariablesAsync('funcex1 funcex2', varsToResolve), 'ex1yee ex2yee');
    assert.deepStrictEqual(await resolveVariablesAsync('p funcex1 funcex2 s', varsToResolve), 'p ex1yee ex2yee s');

    assert.deepStrictEqual(
      await resolveVariablesAsync('p funcex1 funcex2 s', [
        { resolve: /func(ex1|ex2)/, rule: (): Promise<string> => Promise.resolve('yee') },
      ]),
      'p yee yee s',
    );

    assert.deepStrictEqual(await resolveVariablesAsync([null], varsToResolve), [null]);
    assert.deepStrictEqual(await resolveVariablesAsync([undefined], varsToResolve), [undefined]);
    assert.deepStrictEqual(await resolveVariablesAsync([''], varsToResolve), ['']);
    assert.deepStrictEqual(await resolveVariablesAsync([1], varsToResolve), [1]);
    assert.deepStrictEqual(await resolveVariablesAsync([1.0], varsToResolve), [1.0]);
    assert.deepStrictEqual(await resolveVariablesAsync([{}], varsToResolve), [{}]);
    assert.deepStrictEqual(await resolveVariablesAsync([[]], varsToResolve), [[]]);
    assert.deepStrictEqual(await resolveVariablesAsync([func1], varsToResolve), [func1]);
    assert.deepStrictEqual(await resolveVariablesAsync(['notresolve', 'array1'], varsToResolve), [
      'notresolve',
      ['item1'],
    ]);
    {
      const toResolve = ['notresolve', 'array2'];
      const copyOfToResolve = toResolve.map(x => x);
      assert.deepStrictEqual(await resolveVariablesAsync(toResolve, varsToResolve), ['notresolve', 'item2', 'item3']);
      assert.deepStrictEqual(toResolve, copyOfToResolve);
    }
    {
      const toResolve = { x: 'object1', y: 'object2' };
      const copyOfToResolve = Object.assign({}, toResolve);
      const resolved = await resolveVariablesAsync(toResolve, varsToResolve);
      assert.deepStrictEqual(resolved, {
        x: { name: 'one' },
        name2: 'two',
      });
      assert.deepStrictEqual(toResolve, copyOfToResolve);
    }
    assert.deepStrictEqual(await resolveVariablesAsync(['func1'], varsToResolve), ['resolvedFunc1']);

    assert.deepStrictEqual(await resolveVariablesAsync({ x: null }, varsToResolve), { x: null });
    assert.deepStrictEqual(await resolveVariablesAsync({ x: undefined }, varsToResolve), { x: undefined });
    assert.deepStrictEqual(await resolveVariablesAsync({ x: '' }, varsToResolve), { x: '' });
    assert.deepStrictEqual(await resolveVariablesAsync({ x: 1 }, varsToResolve), { x: 1 });
    assert.deepStrictEqual(await resolveVariablesAsync({ x: 1.0 }, varsToResolve), { x: 1.0 });
    assert.deepStrictEqual(await resolveVariablesAsync({ x: {} }, varsToResolve), { x: {} });
    assert.deepStrictEqual(await resolveVariablesAsync({ x: [] }, varsToResolve), { x: [] });
    assert.deepStrictEqual(await resolveVariablesAsync({ x: func1 }, varsToResolve), { x: func1 });
    assert.deepStrictEqual(await resolveVariablesAsync({ x: 'func1' }, varsToResolve), { x: 'resolvedFunc1' });

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
      c: undefined,
      d: undefined,
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

    assert.deepStrictEqual(await resolveVariablesAsync(input, varsToResolve), expected);
    assert.deepStrictEqual(await resolveVariablesAsync({ a: input, b: input }, varsToResolve), {
      a: expected,
      b: expected,
    });
    assert.deepStrictEqual(await resolveVariablesAsync([input, input], varsToResolve), [expected, expected]);
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
        let next: IteratorResult<T> = undefined as unknown as IteratorResult<T>;

        return new AdvancedII<U>((): IteratorResult<U> => {
          next = nextFunc();

          return next.done ? { value: undefined, done: true } : { value: func(next.value), done: false };
        });
      }

      public filter(func: (t: T) => boolean): AdvancedII<T> {
        const nextFunc = this.next;
        let next: IteratorResult<T> = undefined as unknown as IteratorResult<T>;

        return new AdvancedII<T>((): IteratorResult<T> => {
          next = nextFunc();
          while (!next.done && !func(next.value)) next = nextFunc();

          return next.done ? { value: undefined, done: true } : { value: next.value, done: false };
        });
      }
    }

    it('test', function () {
      const x = AdvancedII.from([1, 2, 3]);
      assert.deepStrictEqual(x.toArray(), [1, 2, 3]);
    });
  });

  context.skip('decorator playground', function () {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    /* eslint-disable @typescript-eslint/no-unused-vars */
    // function CacheableAsync<T, R>(
    //   storeOnlyResolved: boolean,
    //   customCache?: {
    //     store: (obj: T, value: Promise<R> | undefined, propertyKey: string | symbol) => void; // `undefined` clears the cache
    //     load: (obj: T, propertyKey: string | symbol) => Promise<R> | undefined; // `undefined` means no cached value
    //   },
    // ): (
    //   target: any,
    //   propertyKey: string | symbol,
    //   descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<R>>,
    // ) => void {
    //   return function (
    //     target: any,
    //     propertyKey: string | symbol,
    //     descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<R>>,
    //   ): void {
    //     if (typeof descriptor.value !== 'function') throw Error('use only with method');
    //     const cacheSymbol = Symbol('cached state of ' + propertyKey.toString());
    //     const originalFunc = descriptor.value;
    //     descriptor.value = async function (...args: any[]): Promise<R> {
    //       const thisWithCache = this as { [cacheSymbol]?: Promise<R> | undefined };
    //       let cachedVal: Promise<R> | undefined;
    //       if (customCache) {
    //         cachedVal = customCache.load(this as T, propertyKey);
    //       } else {
    //         cachedVal = thisWithCache[cacheSymbol];
    //       }
    //       if (cachedVal !== undefined) {
    //         return cachedVal;
    //       } else {
    //         cachedVal = originalFunc.apply(this, args);
    //         if (storeOnlyResolved) {
    //           cachedVal.catch((err: any) => {
    //             // clear cache
    //             if (customCache) {
    //               customCache.store(this as T, undefined, propertyKey);
    //             } else {
    //               thisWithCache[cacheSymbol] = undefined;
    //             }
    //             throw err;
    //           });
    //         }
    //         if (customCache) {
    //           customCache.store(this as T, cachedVal, propertyKey);
    //         } else {
    //           thisWithCache[cacheSymbol] = cachedVal;
    //         }
    //         return cachedVal;
    //       }
    //     };
    //   };
    // }
    // //function Invalidate
    // function TryWithFallbackAsync<T, R>(
    //   defaultValue: R, // returns with this value in case of error
    //   handler?: {
    //     resolveHandler?: (obj: T, propertyKey: string | symbol) => void; // called in case of no error
    //     rejectHandler: (obj: T, errorOpt: any, propertyKey: string | symbol) => void; // called in case of error
    //   },
    // ): (
    //   target: any,
    //   propertyKey: string | symbol,
    //   descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<R>>,
    // ) => void {
    //   return function (
    //     target: any,
    //     propertyKey: string | symbol,
    //     descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<R>>,
    //   ): void {
    //     if (typeof descriptor.value !== 'function') throw Error('use only with method');
    //     const originalFunc = descriptor.value;
    //     descriptor.value = async function (...args: any[]): Promise<R> {
    //       const resolveHandler = handler?.resolveHandler
    //         ? (val: R): R => {
    //             handler.resolveHandler!(this as T, propertyKey);
    //             return val;
    //           }
    //         : undefined;
    //       const errorHandler = handler
    //         ? (err: any): R => {
    //             handler.rejectHandler(this as T, err, propertyKey);
    //             return defaultValue;
    //           }
    //         : (): R => defaultValue;
    //       return originalFunc.apply(this, args).then(resolveHandler, errorHandler);
    //     };
    //   };
    // }
    // class MyClass {
    //   constructor(public readonly val: string) {}
    //   _cachedF: Promise<number> | undefined = undefined;
    //   _errOfF: any | undefined = undefined;
    //   @CacheableAsync<MyClass,number>(false);
    //   @TryWithFallbackAsync<MyClass,number>(2);
    //   async f(): Promise<number> {
    //     return new Promise(r => setTimeout(r, 200)).then(() => 3);
    //   }
    //   async ff(): Promise<void> {
    //     await this.f();
    //   }
    // }
    // it('test', async function () {
    //   const x = new MyClass('apple');
    //   await x.f();
    //   await x.f();
    // });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
});
