// https://github.com/hbenl/vscode-example-test-adapter/blob/master/src/main.ts

import * as vscode from 'vscode';
import { testExplorerExtensionId, TestHub } from 'vscode-test-adapter-api';
import { TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { TestAdapter } from './TestAdapter';
import { GoogleTest } from './framework/GoogleTest';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);

  if (testExplorerExtension) {
    const testHub = testExplorerExtension.exports;

    context.subscriptions.push(
      new TestAdapterRegistrar(testHub, workspaceFolder => new TestAdapter(workspaceFolder), undefined),
    );

    context.subscriptions.push(
      vscode.languages.registerDocumentLinkProvider(
        { language: 'test-output' },
        {
          provideDocumentLinks: (
            document: vscode.TextDocument,
            token: vscode.CancellationToken, // eslint-disable-line
          ): vscode.ProviderResult<vscode.DocumentLink[]> => {
            const text = document.getText();
            if (text.startsWith('[ RUN      ]')) {
              const result: vscode.DocumentLink[] = [];
              const lines = text.split(/\r?\n/);
              for (let i = 0; i < lines.length; ++i) {
                const m = lines[i].match(GoogleTest.failureRe);
                if (m) {
                  const line = Number(m[3]);
                  result.push(
                    new vscode.DocumentLink(
                      new vscode.Range(i, 0, i, m[1].length),
                      vscode.Uri.file(m[2]).with({ fragment: `${line}` }),
                    ),
                  );
                }
              }
              return result;
            } else if (text.startsWith('⏱Duration:')) {
              const result: vscode.DocumentLink[] = [];
              const lines = text.split(/\r?\n/);
              for (let i = 0; i < lines.length; ++i) {
                const m = lines[i].match(/\(at ((.+):([0-9]+))\)/);
                if (m) {
                  const line = Number(m[3]);
                  const index = m.index ? m.index + 4 : 0;
                  result.push(
                    new vscode.DocumentLink(
                      new vscode.Range(i, index, i, index + m[1].length),
                      vscode.Uri.file(m[2]).with({ fragment: `${line}` }),
                    ),
                  );
                }
              }
              return result;
            } else {
              return null;
            }
          },
        },
      ),
    );
  }
}
