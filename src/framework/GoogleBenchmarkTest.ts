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

  private _getCpuTime(metric: Record<string, any>): number | undefined {
    if (typeof metric['cpu_time'] !== 'number') {
      this._shared.log.errorS('cpu_time is not a number', metric);
      return undefined;
    }

    let unitMultiplier = 1;
    if (metric['time_unit'] === 'ns') {
      // skip
    } else if (metric['time_unit'] === 'ms') {
      unitMultiplier = 1000;
    } else {
      this._shared.log.errorS('time_unit is unknown', metric['time_unit']);
      return undefined;
    }

    return metric['cpu_time'] * unitMultiplier;
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

      const cpuTimeNs = this._getCpuTime(metric);

      if (typeof cpuTimeNs === 'number') {
        // TODO: nanosec
        eventBuilder.setDurationMilisec(cpuTimeNs / 1000);
      }

      if (
        typeof this._failIfExceedsLimitNs === 'number' &&
        typeof cpuTimeNs === 'number' &&
        this._failIfExceedsLimitNs < cpuTimeNs
      ) {
        eventBuilder.appendMessage(`❌ Failed: "cpu_time" exceeded limit: ${this._failIfExceedsLimitNs} ns`, null);
        eventBuilder.appendMessage(' ', null);
        eventBuilder.failed();
      } else {
        eventBuilder.passed(); //TODO: fail on certain limit
      }

      Object.keys(metric).forEach(key => {
        const value = metric[key];
        const value2 = typeof value === 'string' ? '"' + value + '"' : value;
        eventBuilder.appendMessage(key + ': ' + value2, null);
      });

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
