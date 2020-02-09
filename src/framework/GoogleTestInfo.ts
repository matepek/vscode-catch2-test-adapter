import { TestEvent, TestDecoration } from 'vscode-test-adapter-api';

import { AbstractTestInfo } from '../AbstractTestInfo';
import { SharedVariables } from '../SharedVariables';
import { RunningTestExecutableInfo } from '../RunningTestExecutableInfo';

export class GoogleTestInfo extends AbstractTestInfo {
  public constructor(
    shared: SharedVariables,
    id: string | undefined,
    testNameAsId: string,
    label: string,
    typeParam: string | undefined,
    valueParam: string | undefined,
    file: string | undefined,
    line: number | undefined,
  ) {
    let desciption = '';
    let tooltip = '';

    if (typeParam) {
      desciption += '#️⃣Type: ' + typeParam;
      tooltip += '\n#️⃣TypeParam() = ' + typeParam;
    }

    if (valueParam) {
      desciption += '#️⃣Value: ' + valueParam;
      tooltip += '\n#️⃣GetParam() = ' + valueParam;
    }

    super(
      shared,
      id,
      testNameAsId,
      label,
      testNameAsId.startsWith('DISABLED_') || testNameAsId.indexOf('.DISABLED_') != -1,
      file,
      line,
      desciption,
      tooltip ? tooltip : undefined,
    );
  }

  public getDebugParams(breakOnFailure: boolean): string[] {
    const debugParams: string[] = ['--gtest_color=no', '--gtest_filter=' + this.testNameAsId];
    if (breakOnFailure) debugParams.push('--gtest_break_on_failure');
    debugParams.push('--gtest_also_run_disabled_tests');
    return debugParams;
  }

  public parseAndProcessTestCase(output: string, runInfo: RunningTestExecutableInfo): TestEvent {
    if (runInfo.timeout !== null) {
      const ev = this.getTimeoutEvent(runInfo.timeout);
      this.lastRunEvent = ev;
      return ev;
    }

    try {
      const ev = this.getFailedEventBase();

      const lines = output.split(/\r?\n/);

      if (lines.length < 2) throw new Error('unexpected');

      if (lines[lines.length - 1].indexOf('[       OK ]') != -1) ev.state = 'passed';
      else if (lines[lines.length - 1].indexOf('[  FAILED  ]') != -1) ev.state = 'failed';
      else if (lines[lines.length - 1].indexOf('[  SKIPPED ]') != -1) ev.state = 'skipped';
      else {
        this._shared.log.error('unexpected token:', lines[lines.length - 1]);
        ev.state = 'errored';
      }

      this.lastRunEvent = ev;

      ev.message += output;

      if (ev.state === 'skipped') {
        // asserts or anything what is happened until here is not relevant anymore
        // we will fill the output window, because it is maybe interesting, but wont decoreate the code
        return ev;
      }

      {
        const m = lines[lines.length - 1].match(/\(([0-9]+) ms\)$/);
        if (m) this._extendDescriptionAndTooltip(ev, Number(m[1]));
      }

      lines.shift();
      lines.pop();

      const reportRe = /^(?:(.+):([0-9]+):) (Failure.*|EXPECT_CALL\(.+)$/;

      const addDecoration = (d: TestDecoration): void => {
        const found = ev.decorations!.find(v => v.line === d.line);
        if (found && d.hover) {
          if (!found.hover) found.hover = '';
          else found.hover += '\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n';
          found.hover += d.hover;
        } else {
          ev.decorations!.push(d);
        }
      };

      let gMockWarningCount = 0;

      for (let i = 0; i < lines.length; ) {
        const match = lines[i].match(reportRe);
        if (match !== null) {
          i += 1;
          const filePath = match[1];
          const lineNumber = Number(match[2]) - 1 /*It looks vscode works like this.*/;

          if (match[3].startsWith('Failure')) {
            const failureMsg = match[3];
            if (
              i + 1 < lines.length &&
              lines[i + 0].startsWith('Expected: ') &&
              lines[i + 1].startsWith('  Actual: ')
            ) {
              addDecoration({
                file: filePath,
                line: lineNumber,
                message: '⬅️ ' + lines[i] + ';  ' + lines[i + 1],
                hover: [lines[i], lines[i + 1]].join('\n'),
              });
              i += 2;
            } else if (i < lines.length && lines[i].startsWith('Expected: ')) {
              addDecoration({ file: filePath, line: lineNumber, message: '⬅️ ' + lines[i], hover: lines[i] });
              i += 1;
            } else if (
              i + 2 < lines.length &&
              lines[i + 0].startsWith('Value of: ') &&
              lines[i + 1].startsWith('  Actual: ') &&
              lines[i + 2].startsWith('Expected: ')
            ) {
              addDecoration({
                file: filePath,
                line: lineNumber,
                message: '⬅️ ' + lines[i + 1].trim() + ';  ' + lines[i + 2].trim() + ';',
                hover: [lines[i], lines[i + 1], lines[i + 2]].join('\n'),
              });
              i += 3;
            } else if (
              i + 2 < lines.length &&
              lines[i + 0].startsWith('Actual function call') &&
              lines[i + 1].startsWith('         Expected:') &&
              lines[i + 2].startsWith('           Actual:')
            ) {
              addDecoration({
                file: filePath,
                line: lineNumber,
                message: '⬅️ ' + lines[i + 1].trim() + ';  ' + lines[i + 2].trim() + ';',
                hover: [lines[i], lines[i + 1], lines[i + 2]].join('\n'),
              });
              i += 3;
            } else if (
              i + 4 < lines.length &&
              lines[i + 0].startsWith('Mock function call') &&
              lines[i + 1].startsWith('    Function call:') &&
              lines[i + 2].startsWith('          Returns:') &&
              lines[i + 3].startsWith('         Expected:') &&
              lines[i + 4].startsWith('           Actual:')
            ) {
              addDecoration({
                file: filePath,
                line: lineNumber,
                message: '⬅️ ' + lines[i + 3].trim() + ';  ' + lines[i + 4].trim() + ';',
                hover: lines.slice(i, i + 5).join('\n'),
              });
              i += 5;
            } else if (
              i + 3 < lines.length &&
              lines[i + 0].startsWith('Mock function call') &&
              lines[i + 1].startsWith('    Function call:') &&
              lines[i + 2].startsWith('         Expected:') &&
              lines[i + 3].startsWith('           Actual:')
            ) {
              addDecoration({
                file: filePath,
                line: lineNumber,
                message: '⬅️ ' + lines[i + 2].trim() + ';  ' + lines[i + 3].trim() + ';',
                hover: lines.slice(i, i + 4).join('\n'),
              });
              i += 4;
            } else if (i < lines.length && lines[i].startsWith('Expected equality of these values:')) {
              let j = i + 1;
              while (j < lines.length && lines[j].startsWith('  ')) j++;
              addDecoration({
                file: filePath,
                line: lineNumber,
                message: '⬅️ Expected: equality',
                hover: lines.slice(i, j).join('\n'),
              });
              i = j;
            } else if (i < lines.length && lines[i].startsWith('The difference between')) {
              let j = i + 1;
              while (j < lines.length && lines[j].indexOf(' evaluates to ') != -1) j++;
              addDecoration({
                file: filePath,
                line: lineNumber,
                message: '⬅️ ' + lines[i].trim(),
                hover: lines.slice(i, j).join('\n'),
              });
              i = j;
            } else {
              addDecoration({ file: filePath, line: lineNumber, message: '⬅️ ' + failureMsg, hover: '' });
            }
          } else if (match[3].startsWith('EXPECT_CALL')) {
            const expectCallMsg = match[3];

            if (
              i + 1 < lines.length &&
              lines[i].startsWith('  Expected') &&
              lines[i + 1].trim().startsWith('Actual:')
            ) {
              let j = i + 1;
              while (j < lines.length && lines[j].startsWith('  ')) j++;
              addDecoration({
                file: filePath,
                line: lineNumber,
                message: '⬅️ ' + lines[i].trim() + ';  ' + lines[i + 1].trim() + ';',
                hover: [expectCallMsg, ...lines.slice(i, j)].join('\n'),
              });
              i = j;
            } else {
              addDecoration({ file: filePath, line: lineNumber, message: '⬅️ ' + expectCallMsg });
            }
          } else {
            throw Error('unexpected case');
          }
        } else {
          if (lines[i].startsWith('GMOCK WARNING:')) {
            gMockWarningCount += 1;
            if (ev.state === 'passed' && this._shared.googleTestTreatGMockWarningAs === 'failure') ev.state = 'failed';
          }

          i += 1;
        }
      }

      if (gMockWarningCount) {
        ev.tooltip += '\n\n⚠️' + gMockWarningCount + ' GMock warning(s) in the output!';
      }

      return ev;
    } catch (e) {
      this._shared.log.exception(e, output);

      const ev = this.getFailedEventBase();
      ev.message = 'Unexpected error: ' + e.toString();

      return e;
    }
  }
}
