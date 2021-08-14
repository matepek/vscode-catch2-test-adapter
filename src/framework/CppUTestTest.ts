import { AbstractTest, AbstractTestEvent, SharedWithTest } from '../AbstractTest';
import { Suite } from '../Suite';
import { AbstractRunnable } from '../AbstractRunnable';
import { TestEventBuilder } from '../TestEventBuilder';

export class CppUTestTest extends AbstractTest {
  public constructor(
    shared: SharedWithTest,
    runnable: AbstractRunnable,
    parent: Suite,
    testNameAsId: string,
    label: string,
    file: string | undefined,
    line: number | undefined,
  ) {
    super(
      shared,
      runnable,
      parent,
      testNameAsId,
      label,
      file,
      line,
      testNameAsId.startsWith('IGNORE_TEST'),
      undefined,
      [],
      undefined,
      undefined,
      undefined,
    );
  }

  private static _isSkipped(tags: string[], testNameAsId: string): boolean {
    return tags.some((v: string) => v.startsWith('.') || v == 'hide' || v == '!hide') || testNameAsId.startsWith('./');
  }

  public update(testNameAsId: string | undefined, file: string | undefined, line: number | undefined): boolean {
    const label = testNameAsId ? testNameAsId : this._label;
    return this._updateBase(
      label,
      file,
      line,
      CppUTestTest._isSkipped(this._tags, this.testNameAsId),
      this._tags,
      this._testDescription,
      undefined,
      undefined,
      this._staticEvent,
    );
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
      const lines = output.split(/\r?\n/);

      const eventBuilder = new TestEventBuilder(this, testRunId);

      const runDuration = lines[lines.length - 1].match(/([0-9]+) ms/);
      eventBuilder.setDurationMilisec(runDuration ? Number(runDuration[1]) : undefined);

      const isSkipped = lines[0].indexOf('IGNORE_TEST') != -1;
      if (isSkipped) eventBuilder.skipped();
      if (lines.length === 1) eventBuilder.passed();
      else eventBuilder.failed();

      if (!isSkipped && lines.length > 1) {
        const match = lines[1].match(CppUTestTest.failureRe);
        if (match !== null) {
          const filePath = match[2].split('/').pop();
          const lineNumber = Number(match[3]) - 1;
          eventBuilder.appendDecorator(filePath, lineNumber, [lines[3], lines[4]]);
        }
      }

      const event = eventBuilder.build(output.replace(/\): error: /g, '): error: \n'));

      return event;
    } catch (e) {
      this._shared.log.exceptionS(e, output);

      const ev = this.getFailedEventBase(testRunId);
      ev.message = 'Unexpected error: ' + e.toString();

      return e;
    }
  }
}
