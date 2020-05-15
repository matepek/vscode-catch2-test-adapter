import * as assert from 'assert';
import * as sinon from 'sinon';
import { LoggerWrapper } from '../src/LoggerWrapper';

///

export const globalExpectedLoggedErrors = new Set<string>();

export function expectedLoggedError(errorLine: string): void {
  globalExpectedLoggedErrors.add(errorLine);
}

export const globalExpectedLoggedWarnings = new Set<string>();

export function expectedLoggedWarning(warning: string): void {
  globalExpectedLoggedWarnings.add(warning);
}

///

export const logger = new LoggerWrapper('testMate.cpp.log', undefined, `C++ TestMate`);
// eslint-disable-next-line
const spyError: sinon.SinonSpy<any[], void> = sinon.spy(logger, 'error');
// eslint-disable-next-line
const spyWarning: sinon.SinonSpy<any[], void> = sinon.spy(logger, 'warn');

///

// this is "global". it will run before every test

beforeEach(function () {
  spyError.resetHistory();
  spyWarning.resetHistory();
  globalExpectedLoggedErrors.clear();
  globalExpectedLoggedWarnings.clear();
});

afterEach(async function () {
  this.timeout(2000);

  assert.notStrictEqual(this.currentTest, undefined);
  const currentTest = this.currentTest!;
  const title = currentTest.titlePath().join(' -> ');

  if (currentTest.state === 'passed') {
    {
      const arrived = new Set<string>();

      for (const arg of spyError.args) {
        const msg = arg[0].toString();
        if (!globalExpectedLoggedErrors.has(msg)) {
          assert.fail(`Test: "${title}":  Got error: "${msg}" but not expected.`);
        } else {
          arrived.add(msg);
        }
      }

      for (const expected of globalExpectedLoggedErrors) {
        if (!arrived.has(expected)) {
          assert.fail(`Test: "${title}":  Expected error: "${expected}" but not arrived.`);
        }
      }
    }
    {
      const arrived = new Set<string>();

      for (const arg of spyWarning.args) {
        const msg = arg[0].toString();
        if (!globalExpectedLoggedWarnings.has(msg)) {
          assert.fail(`Test: "${title}":  Got warning: "${msg}" but not expected.`);
        } else {
          arrived.add(msg);
        }
      }

      for (const expected of globalExpectedLoggedWarnings) {
        if (!arrived.has(expected)) {
          assert.fail(`Test: "${title}":  Expected warning: "${expected}" but not arrived.`);
        }
      }
    }
  } else {
    for (const e of spyError.args) {
      console.warn(`Logged ERROR: ${e}`);
    }

    for (const e of spyWarning.args) {
      console.warn(`Logged WANRING: ${e}`);
    }
  }
});
