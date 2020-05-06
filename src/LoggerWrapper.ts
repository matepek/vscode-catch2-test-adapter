import * as util from 'vscode-test-adapter-util';
import { WorkspaceFolder } from 'vscode';
import * as Sentry from '@sentry/node';

///

export class LoggerWrapper extends util.Log {
  public constructor(configSection: string, workspaceFolder: WorkspaceFolder | undefined, outputChannelName: string) {
    super(configSection, workspaceFolder, outputChannelName, { depth: 3 }, false);
  }

  //eslint-disable-next-line
  public debugS(msg: any, ...msgs: any[]): void {
    super.debug(msg, ...msgs);
    try {
      Sentry.addBreadcrumb({ message: msg, data: msgs, level: Sentry.Severity.Debug });
    } catch (e) {
      super.error(e);
    }
  }

  //eslint-disable-next-line
  public setContext(name: string, context: { [key: string]: any } | null): void {
    super.info('context:' + name, context);
    try {
      Sentry.setContext(name, context);
    } catch (e) {
      this.exceptionS(e);
    }
  }

  //eslint-disable-next-line
  public infoS(m: string, ...msg: any[]): void {
    super.info(...msg);
    try {
      Sentry.addBreadcrumb({ message: m, data: msg, level: Sentry.Severity.Info });
      Sentry.captureMessage(m, Sentry.Severity.Info);
    } catch (e) {
      super.error(e);
    }
  }

  public infoSWithTags(m: string, tags: { [key: string]: string }): void {
    super.info(m, tags);
    try {
      Sentry.withScope(function (scope) {
        scope.setTags(tags);
        Sentry.captureMessage(m, Sentry.Severity.Info);
      });
    } catch (e) {
      super.error(e);
    }
  }

  //eslint-disable-next-line
  public warnS(m: string, ...msg: any[]): void {
    super.warn(m, ...msg);
    try {
      Sentry.captureMessage(m, Sentry.Severity.Warning);
    } catch (e) {
      super.error(e);
    }
  }

  //eslint-disable-next-line
  public errorS(m: string, ...msg: any[]): void {
    super.error(m, ...msg);
    try {
      Sentry.captureMessage(m, Sentry.Severity.Error);
    } catch (e) {
      super.error(e);
    }
  }

  //eslint-disable-next-line
  public exceptionS(e: Error, ...msg: any[]): void {
    super.error(e, ...msg);
    try {
      Sentry.captureException(e);
    } catch (e) {
      super.error(e);
    }
  }
}
