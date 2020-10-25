import { AbstractTest, AbstractTestEvent, SharedWithTest } from '../AbstractTest';
import { Suite } from '../Suite';
import { AbstractRunnable } from '../AbstractRunnable';
import { TestEventBuilder } from '../TestEventBuilder';

export class GoogleBenchmarkTest extends AbstractTest {
  public constructor(
    shared: SharedWithTest,
    runnable: AbstractRunnable,
    parent: Suite,
    testNameAsId: string,
    private _failIfExceedsLimitNs: number | undefined,
  ) {
    super(
      shared,
      runnable,
      parent,
      testNameAsId,
      testNameAsId,
      undefined,
      undefined,
      false,
      undefined,
      [],
      undefined,
      undefined,
      undefined,
    );
  }

  public update(failIfExceedsLimitNs: number | undefined): boolean {
    const changed = false;
    if (failIfExceedsLimitNs !== this._failIfExceedsLimitNs) {
      this._failIfExceedsLimitNs = failIfExceedsLimitNs;
      // don have to mark it changed
    }
    return changed;
  }

  public compare(testNameAsId: string): boolean {
    return this.testNameAsId === testNameAsId;
  }

  public static readonly failureRe = /^((.+)[:\(]([0-9]+)\)?): ((Failure|EXPECT_CALL|error: )(.*))$/;

  private _getTimeUnitMultiplier(metric: Record<string, string | number>): number {
    if (metric['time_unit'] === 'ns') {
      return 1;
    } else if (metric['time_unit'] === 'ms') {
      return 1000000;
    } else if (metric['time_unit'] === 'us') {
      return 1000;
    } else {
      return 1;
    }
  }

  public parseAndProcessTestCase(
    testRunId: string,
    output: string,
    rngSeed: number | undefined,
    timeout: number | null,
    stderr: string | undefined, //eslint-disable-line
  ): AbstractTestEvent {
    if (timeout !== null) {
      const ev = this.getTimeoutEvent(testRunId, timeout);
      this.lastRunEvent = ev;
      return ev;
    }

    try {
      const metric = JSON.parse(output);

      const eventBuilder = new TestEventBuilder(this, testRunId);

      if (metric['error_occurred']) {
        eventBuilder.errored();
      }

      if (typeof this._failIfExceedsLimitNs === 'number') {
        const timeUnitMultiplier = this._getTimeUnitMultiplier(metric);
        if (
          typeof metric['cpu_time'] === 'number' &&
          this._failIfExceedsLimitNs < metric['cpu_time'] * timeUnitMultiplier
        ) {
          eventBuilder.appendMessage(`❌ Failed: "cpu_time" exceeded limit: ${this._failIfExceedsLimitNs} ns.`, null);
          eventBuilder.appendMessage(' ', null);
          eventBuilder.failed();
        } else if (
          typeof metric['cpu_coefficient'] === 'number' &&
          this._failIfExceedsLimitNs < metric['cpu_coefficient'] * timeUnitMultiplier
        ) {
          eventBuilder.appendMessage(
            `❌ Failed: "cpu_coefficient" exceeded limit: ${this._failIfExceedsLimitNs} ns.`,
            null,
          );
          eventBuilder.appendMessage(' ', null);
          eventBuilder.failed();
        } else if (
          typeof metric['rms'] === 'number' &&
          this._failIfExceedsLimitNs < metric['rms'] * timeUnitMultiplier
        ) {
          eventBuilder.appendMessage(`❌ Failed: "rms" exceeded limit: ${this._failIfExceedsLimitNs} ns.`, null);
          eventBuilder.appendMessage(' ', null);
          eventBuilder.failed();
        }
      }

      Object.keys(metric).forEach(key => {
        const value = metric[key];
        const value2 = typeof value === 'string' ? '"' + value + '"' : value;
        eventBuilder.appendMessage(key + ': ' + value2, null);
      });

      eventBuilder.passed();

      const event = eventBuilder.build();

      return event;
    } catch (e) {
      this._shared.log.exceptionS(e, output);

      const ev = this.getFailedEventBase(testRunId);
      ev.message = 'Unexpected error: ' + e.toString();

      return e;
    }
  }
}
