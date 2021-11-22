import * as vscode from 'vscode';
import { AbstractTest, SharedWithTest } from '../AbstractTest';
import { Version } from '../Util';
import { AbstractExecutable } from '../AbstractExecutable';
import { SharedTestTags } from '../SharedTestTags';

///

export class Catch2Test extends AbstractTest {
  public constructor(
    shared: SharedWithTest,
    executable: AbstractExecutable,
    container: vscode.TestItemCollection,
    frameworkVersion: Version | undefined,
    testNameAsId: string,
    file: string | undefined,
    line: string | undefined,
    tags: string[],
    description: string | undefined,
  ) {
    const badChars = [
      // this 3 relates some catch2 bug
      '[',
      '\\',
      ',',
      // this two has some on windows
      '±',
      '§',
    ];
    const forceIgnoreError: string[] | undefined =
      frameworkVersion &&
      frameworkVersion.smaller(EscapeCharParserFix) &&
      badChars.some(b => testNameAsId.indexOf(b) != -1)
        ? [
            '⚡️ This extension is unable to run this test.',
            `Current Catch2 framework version ${frameworkVersion} has a bug (https://github.com/catchorg/Catch2/issues/1905).`,
            `Update your framework to at least ${EscapeCharParserFix}.`,
            'Avoid test names with the following characters: ' + badChars.map(b => `'${b}'`).join(', ') + '.',
          ]
        : undefined;

    const calcDescription = AbstractTest.calcDescription(tags, undefined, undefined, description);

    super(
      shared,
      executable,
      container,
      testNameAsId,
      testNameAsId,
      file,
      line,
      Catch2Test.isSkipped(tags, testNameAsId),
      forceIgnoreError,
      calcDescription,
      tags,
      SharedTestTags.catch2,
    );
  }

  public update2(
    file: string | undefined,
    line: string | undefined,
    tags: string[],
    description: string | undefined,
  ): void {
    const calcDescription = AbstractTest.calcDescription(tags, undefined, undefined, description);
    super.update(this.label, file, line, Catch2Test.isSkipped(tags, this.id), calcDescription, tags);
  }

  private static isSkipped(tags: string[], testNameAsId: string): boolean {
    return tags.some((v: string) => v.startsWith('.') || v == 'hide' || v == '!hide') || testNameAsId.startsWith('./');
  }

  public getEscapedTestName(): string {
    /* ',' and '[' has special meaning */
    return this.id.replace('\\', '\\\\').replace(/,/g, '\\,').replace(/\[/g, '\\[');
  }
}

///

const EscapeCharParserFix = new Version(2, 11, 4);
