import * as vscode from 'vscode';
import { Configurations } from './Configurations';
import { LoggerWrapper } from './LoggerWrapper';
import { createPythonIndexerForPathVariable, ResolveRuleAsync } from './util/ResolveRule';
import { WorkspaceShared } from './WorkspaceShared';

//TODO if workspace contains ".vscode/testMate.cpp.json" we have to start loading the tests
export class WorkspaceManager implements vscode.Disposable {
  public constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly log: LoggerWrapper,
    globVariableToValue: ResolveRuleAsync[],
  ) {
    const workspaceNameRes: ResolveRuleAsync = { resolve: '${workspaceName}', rule: this.workspaceFolder.name };

    this._disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        workspaceNameRes.rule = this.workspaceFolder.name;
      }),
    );

    const variableToValue = [
      createPythonIndexerForPathVariable('workspaceFolder', this.workspaceFolder.uri.fsPath),
      createPythonIndexerForPathVariable('workspaceDirectory', this.workspaceFolder.uri.fsPath),
      workspaceNameRes,
      ...globVariableToValue,
    ];

    const configuration = this._getConfiguration(log);

    this.shared = new WorkspaceShared(
      workspaceFolder,
      log,
      variableToValue,
      configuration.getRandomGeneratorSeed(),
      configuration.getExecWatchTimeout(),
      configuration.getExecRunningTimeout(),
      configuration.getExecParsingTimeout(),
      configuration.getDefaultNoThrow(),
      configuration.getParallelExecutionLimit(),
      configuration.getEnableTestListCaching(),
      configuration.getEnableStrictPattern(),
      configuration.getGoogleTestTreatGMockWarningAs(),
      configuration.getGoogleTestGMockVerbose(),
    );
  }

  private readonly _disposables: vscode.Disposable[] = [];
  // owning
  private runnables: Runnable[] = [];
  private readonly shared: WorkspaceShared;

  dispose(): void {
    this.shared.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  load(): Promise<void> {
    const configuration = this._getConfiguration(this.log);
    const exec = configuration.getExecutables(this.shared);
    exec[0].load();
    return Promise.resolve();
  }

  private _getConfiguration(log: LoggerWrapper): Configurations {
    return new Configurations(log, this.workspaceFolder.uri);
  }
}
