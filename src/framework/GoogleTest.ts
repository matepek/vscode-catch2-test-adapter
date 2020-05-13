import { AbstractTest, AbstractTestEvent } from '../AbstractTest';
import { Suite } from '../Suite';
import { AbstractRunnable } from '../AbstractRunnable';
import { LoggerWrapper } from '../LoggerWrapper';
import { TestEventBuilder } from '../TestEventBuilder';

interface SharedWithGoogleTest {
  log: LoggerWrapper;
}

export class GoogleTest extends AbstractTest {
  public constructor(
    shared: SharedWithGoogleTest,
    runnable: AbstractRunnable,
    parent: Suite,
    testNameAsId: string,
    label: string,
    typeParam: string | undefined,
    valueParam: string | undefined,
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
      testNameAsId.startsWith('DISABLED_') || testNameAsId.indexOf('.DISABLED_') != -1,
      undefined,
      [],
      undefined,
      typeParam,
      valueParam,
    );
  }

  public update(
    typeParam: string | undefined,
    valueParam: string | undefined,
    file: string | undefined,
    line: number | undefined,
  ): boolean {
    return this._updateBase(
      this._label,
      file,
      line,
      this._skipped,
      this._tags,
      this._testDescription,
      typeParam,
      valueParam,
      this._staticEvent,
    );
  }

  public compare(testNameAsId: string): boolean {
    return this.testNameAsId === testNameAsId;
  }

  public static readonly failureRe = /^((.+)[:\(]([0-9]+)\)?): ((Failure|EXPECT_CALL|error: )(.*))$/;

  public parseAndProcessTestCase(
    output: string,
    rngSeed: number | undefined,
    timeout: number | null,
    stderr: string | undefined, //eslint-disable-line
  ): AbstractTestEvent {
    if (timeout !== null) {
      const ev = this.getTimeoutEvent(timeout);
      this.lastRunEvent = ev;
      return ev;
    }

    try {
      const lines = output.split(/\r?\n/);

      if (lines.length < 2) throw new Error('unexpected');

      const eventBuilder = new TestEventBuilder(this);

      const runDuration = lines[lines.length - 1].match(/\(([0-9]+) ms\)$/);
      eventBuilder.setDurationMilisec(runDuration ? Number(runDuration[1]) : undefined);

      const isSkipped = lines[lines.length - 1].indexOf('[  SKIPPED ]') != -1;
      if (lines[lines.length - 1].indexOf('[       OK ]') != -1) eventBuilder.passed();
      else if (lines[lines.length - 1].indexOf('[  FAILED  ]') != -1) eventBuilder.failed();
      else if (isSkipped) eventBuilder.skipped();
      else {
        this._shared.log.error('unexpected token:', lines[lines.length - 1]);
        eventBuilder.errored();
      }

      // asserts or anything what is happened until here is not relevant anymore
      // we will fill the output window, because it is maybe interesting, but wont decoreate the code
      if (!isSkipped) {
        lines.shift();
        lines.pop();

        const gMockWarningCount = 0;

        for (let i = 0; i < lines.length; ) {
          const match = lines[i].match(GoogleTest.failureRe);
          if (match !== null) {
            i += 1;
            const filePath = match[2];
            const lineNumber = Number(match[3]) - 1; /*It looks vscode works like this.*/

            if (match[5].startsWith('Failure') || match[5].startsWith('error')) {
              const firstMsgLine = match[6].length > 0 ? match[6] : lines[i++];

              if (
                i + 0 < lines.length &&
                firstMsgLine.startsWith('Expected: ') &&
                lines[i + 0].startsWith('  Actual: ')
              ) {
                eventBuilder.appendDecorator(filePath, lineNumber, [firstMsgLine, lines[i]]);
                i += 1;
              } else if (firstMsgLine.startsWith('Expected: ')) {
                eventBuilder.appendDecorator(filePath, lineNumber, firstMsgLine);
              } else if (
                i + 1 < lines.length &&
                firstMsgLine.startsWith('Value of: ') &&
                lines[i + 0].startsWith('  Actual: ') &&
                lines[i + 1].startsWith('Expected: ')
              ) {
                eventBuilder.appendDecorator(filePath, lineNumber, lines.slice(i, i + 2), [
                  firstMsgLine,
                  lines[i],
                  lines[i + 1],
                ]);
                i += 2;
              } else if (
                i + 1 < lines.length &&
                firstMsgLine.startsWith('Actual function call') &&
                lines[i + 0].startsWith('         Expected:') &&
                lines[i + 1].startsWith('           Actual:')
              ) {
                eventBuilder.appendDecorator(filePath, lineNumber, lines.slice(i, i + 2), [
                  firstMsgLine,
                  lines[i],
                  lines[i + 1],
                ]);
                i += 2;
              } else if (
                i + 3 < lines.length &&
                firstMsgLine.startsWith('Value of:') &&
                lines[i + 0].startsWith('  Actual: "') &&
                lines[i + 1].startsWith('Expected: "') &&
                lines[i + 2].startsWith('a substring of') &&
                lines[i + 3].startsWith('Which is:')
              ) {
                eventBuilder.appendDecorator(filePath, lineNumber, lines.slice(i, i + 2), [
                  firstMsgLine,
                  ...lines.slice(i, i + 4),
                ]);
                i += 4;
              } else if (
                i + 3 < lines.length &&
                firstMsgLine.startsWith('Mock function call') &&
                lines[i + 0].startsWith('    Function call:') &&
                lines[i + 1].startsWith('          Returns:') &&
                lines[i + 2].startsWith('         Expected:') &&
                lines[i + 3].startsWith('           Actual:')
              ) {
                eventBuilder.appendDecorator(filePath, lineNumber, lines.slice(i + 2, i + 4), [
                  firstMsgLine,
                  ...lines.slice(i, i + 4),
                ]);
                i += 4;
              } else if (
                i + 2 < lines.length &&
                firstMsgLine.startsWith('Mock function call') &&
                lines[i + 0].startsWith('    Function call:') &&
                lines[i + 1].startsWith('         Expected:') &&
                lines[i + 2].startsWith('           Actual:')
              ) {
                eventBuilder.appendDecorator(filePath, lineNumber, lines.slice(i + 1, i + 3), [
                  firstMsgLine,
                  ...lines.slice(i, i + 3),
                ]);
                i += 3;
              } else if (firstMsgLine.startsWith('Expected equality of these values:')) {
                let j = i;
                while (j < lines.length && lines[j].startsWith('  ')) j++;
                eventBuilder.appendDecorator(filePath, lineNumber, 'Expected: equality', [
                  firstMsgLine,
                  ...lines.slice(i, j),
                ]);
                i = j;
              } else if (firstMsgLine.startsWith('The difference between')) {
                let j = i;
                while (j < lines.length && lines[j].indexOf(' evaluates to ') != -1) j++;
                eventBuilder.appendDecorator(filePath, lineNumber, firstMsgLine, [firstMsgLine, ...lines.slice(i, j)]);
                i = j;
              } else {
                if (firstMsgLine.length === 0) this._shared.log.warn('unprocessed gtest failure', firstMsgLine);
                eventBuilder.appendDecorator(filePath, lineNumber, firstMsgLine);
              }
            } else if (match[5].startsWith('EXPECT_CALL')) {
              const expectCallMsg = match[4];

              if (
                i + 1 < lines.length &&
                lines[i].startsWith('  Expected') &&
                lines[i + 1].trim().startsWith('Actual:')
              ) {
                let j = i + 1;
                while (j < lines.length && lines[j].startsWith('  ')) j++;
                eventBuilder.appendDecorator(filePath, lineNumber, lines.slice(i, i + 2), [
                  expectCallMsg,
                  ...lines.slice(i, j),
                ]);
                i = j;
              } else {
                eventBuilder.appendDecorator(filePath, lineNumber, expectCallMsg);
              }
            } else {
              this._shared.log.error('unexpected case', i, lines);
              i += 1;
            }
          } else {
            i += 1;
          }
        }

        if (gMockWarningCount) {
          eventBuilder.appendTooltip('⚠️' + gMockWarningCount + ' GMock warning(s) in the output!');
        }
      }

      const event = eventBuilder.build(output.replace(/\): error: /g, '): error: \n'));

      return event;
    } catch (e) {
      this._shared.log.exceptionS(e, output);

      const ev = this.getFailedEventBase();
      ev.message = 'Unexpected error: ' + e.toString();

      return e;
    }
  }
}
