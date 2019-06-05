//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

import { TestEvent } from 'vscode-test-adapter-api';

import { AbstractTestInfo } from './AbstractTestInfo';
import { SharedVariables } from './SharedVariables';
import { RunningTestExecutableInfo } from './RunningTestExecutableInfo';

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
    return debugParams;
  }

  public parseAndProcessTestCase(output: string, runInfo: RunningTestExecutableInfo): TestEvent {
    if (runInfo.timeout !== null) {
      const ev = this.getTimeoutEvent(runInfo.timeout);
      this.lastRunState = ev.state;
      return ev;
    }

    try {
      const ev = this.getFailedEventBase();

      const lines = output.split(/\r?\n/);

      if (lines.length < 2) throw new Error('unexpected');

      if (lines[lines.length - 1].startsWith('[       OK ]')) ev.state = 'passed';
      else if (lines[lines.length - 1].startsWith('[  FAILED  ]')) ev.state = 'failed';
      else if (lines[lines.length - 1].startsWith('[  SKIPPED ]')) ev.state = 'skipped';
      else {
        this._shared.log.error('unexpected token:', lines[lines.length - 1]);
        ev.state = 'errored';
      }

      this.lastRunState = ev.state;

      ev.message += output;

      if (ev.state === 'skipped') {
        // asserts or anything what is hapepend until here is not relevant anymore
        // we will fill the output window, because it is maybe interesting, but wont decoreate the code
        return ev;
      }

      {
        const m = lines[lines.length - 1].match(/\(([0-9]+) ms\)$/);
        if (m) this._extendDescriptionAndTooltip(ev, Number(m[1]));
      }

      lines.shift();
      lines.pop();
      const failure = /^(.+):([0-9]+): Failure$/;

      for (let i = 0; i < lines.length; ) {
        const m = lines[i].match(failure);
        if (m !== null) {
          i += 1;
          const lineNumber = Number(m[2]) - 1 /*It looks vscode works like this.*/;

          if (i + 1 < lines.length && lines[i + 0].startsWith('Expected: ') && lines[i + 1].startsWith('  Actual: ')) {
            ev.decorations!.push({
              line: lineNumber,
              message: '⬅️ ' + lines[i] + ';  ' + lines[i + 1],
              hover: [lines[i], lines[i + 1]].join('\n'),
            });
            i += 2;
          } else if (i < lines.length && lines[i].startsWith('Expected: ')) {
            ev.decorations!.push({ line: lineNumber, message: '⬅️ ' + lines[i], hover: lines[i] });
            i += 1;
          } else if (
            i + 2 < lines.length &&
            lines[i + 0].startsWith('Value of: ') &&
            lines[i + 1].startsWith('  Actual: ') &&
            lines[i + 2].startsWith('Expected: ')
          ) {
            ev.decorations!.push({
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
            ev.decorations!.push({
              line: lineNumber,
              message: '⬅️ ' + lines[i + 1].trim() + ';  ' + lines[i + 2].trim() + ';',
              hover: [lines[i], lines[i + 1], lines[i + 2]].join('\n'),
            });
            i += 3;
          } else if (i < lines.length && lines[i].startsWith('Expected equality of these values:')) {
            let j = i + 1;
            while (j < lines.length && lines[j].startsWith('  ')) j++;
            ev.decorations!.push({
              line: lineNumber,
              message: '⬅️ Expected equality',
              hover: lines.slice(i, j).join('\n'),
            });
            i = j;
          } else {
            ev.decorations!.push({ line: lineNumber, message: '⬅️ failure', hover: '' });
          }
        } else {
          i += 1;
        }
      }

      return ev;
    } catch (e) {
      this._shared.log.error(e, output);

      const ev = this.getFailedEventBase();
      ev.message = 'Unexpected error: ' + e.toString();

      return e;
    }
  }
}
