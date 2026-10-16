import { request } from 'https';
import * as vscode from 'vscode';

export class Question {
  constructor(
    _id: number,
    readonly message: string,
    ...items: { text: string; link: string | undefined }[]
  ) {
    this.items = items;
  }

  private readonly items: { text: string; link: string }[] = [];

  private _getLink(choice: string): string | undefined {
    const found = this.items.find(v => v.text === choice);
    return found.link;
  }

  private _openLink(link: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      request(link, res => {
        res.once('error', err => reject(err));
        res.once('end', () => resolve());
      });
    });
  }

  async ask(): Promise<boolean> {
    const items = this.items.map(x => x.text);
    const choice = await vscode.window.showInformationMessage(this.message, ...items);

    if (choice === undefined) return false;

    const link = this._getLink(choice);

    if (link) await this._openLink(link);

    return true;
  }
}

export const TestGroupingUsageQuestion = new Question(
  0,
  "Do you use 'testGrouping'?",
  { text: 'Yes', link: '' },
  { text: 'No', link: '' },
  { text: 'What?!', link: undefined },
);
