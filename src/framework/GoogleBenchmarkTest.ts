import { AbstractTest, AbstractTestEvent, SharedWithTest } from '../AbstractTest';
import { Suite } from '../Suite';
import { AbstractRunnable } from '../AbstractRunnable';
import { TestEventBuilder } from '../TestEventBuilder';

export class GoogleBenchmarkTest extends AbstractTest {
  public constructor(shared: SharedWithTest, runnable: AbstractRunnable, parent: Suite, testNameAsId: string) {
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

  public update(): boolean {
    return false;
  }

  public compare(testNameAsId: string): boolean {
    return this.testNameAsId === testNameAsId;
  }

  public static readonly failureRe = /^((.+)[:\(]([0-9]+)\)?): ((Failure|EXPECT_CALL|error: )(.*))$/;

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
      const outputO = JSON.parse(output);

      const eventBuilder = new TestEventBuilder(this, testRunId);

      Object.keys(outputO).forEach(key => {
        eventBuilder.appendMessage(key + ': ' + outputO[key], null);
      });

      eventBuilder.passed(); //TODO: fail on certain limit

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
