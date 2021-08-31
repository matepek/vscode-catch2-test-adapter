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
    //TODO: Refactor following codes
    try {
      const lines = output.split(/\r?\n/);

      const eventBuilder = new TestEventBuilder(this, testRunId);

      const runDuration = lines[lines.length - 1].match(/([0-9]+) ms/);
      eventBuilder.setDurationMilisec(runDuration ? Number(runDuration[1]) : undefined);

      let failedTest: RegExpMatchArray | null = null;
      //Ignored tests will be never gets here because tests were run individually
      const isSkipped = lines[0].match(/^IGNORE_TEST/);
      if (isSkipped) eventBuilder.skipped();
      if (lines.length > 1) {
        failedTest = lines[1].match(CppUTestTest.failureRe);
      }
      if (failedTest === null) eventBuilder.passed();
      else eventBuilder.failed();

      if (lines.length > 1 && failedTest !== null) {
        const filePath = failedTest[2].split('/').pop();
        const lineNumber = Number(failedTest[3]) - 1;
        const expected = lines.find(value => /^\texpected/.test(value));
        const actual = lines.find(value => /^\tbut was/.test(value));
        eventBuilder.appendDecorator(filePath, lineNumber, [expected ? expected : '', actual ? actual : '']);
      }

      const event = eventBuilder.build(output.replace(/\): error: /g, '): error: \n'));

      return event;
    } catch (e) {
      this._shared.log.exceptionS(e, output);

      const ev = this.getFailedEventBase(testRunId);
      ev.message = 'Unexpected error: ' + e;

      return ev;
    }
  }
}
