import * as util from 'vscode-test-adapter-util';
import { WorkspaceFolder } from 'vscode';
import * as Sentry from '@sentry/node';
import { inspect } from 'util';

///

export class LoggerWrapper extends util.Log {
  public constructor(configSection: string, workspaceFolder: WorkspaceFolder | undefined, outputChannelName: string) {
    super(configSection, workspaceFolder, outputChannelName, { depth: 2 }, false);
  }

  //eslint-disable-next-line
  private _inspect(v: any): string {
    return inspect(v, undefined, 1);
  }

  //eslint-disable-next-line
  public debugS(...msg: any[]): void {
    try {
      Sentry.addBreadcrumb({ message: this._inspect(msg), data: msg, level: Sentry.Severity.Debug });
    } catch (e) {
      super.error(e);
    }
    return super.debug(...msg);
  }

  //eslint-disable-next-line
  public infoSMessageWithTags(m: string, tags: { [key: string]: string }): void {
    try {
      Sentry.withScope(function (scope) {
        scope.setTags(tags);
        Sentry.captureMessage(m, Sentry.Severity.Log);
      });
    } catch (e) {
      super.error(e);
    }
    return super.info(m, tags);
  }

  //eslint-disable-next-line
  public setContext(name: string, context: { [key: string]: any } | null): void {
    try {
      super.info('context:' + name, context);
      Sentry.setContext(name, context);
    } catch (e) {
      this.exceptionS(e);
    }
  }

  //eslint-disable-next-line
  public infoS(...msg: any[]): void {
    try {
      Sentry.addBreadcrumb({ message: this._inspect(msg), data: msg, level: Sentry.Severity.Info });
    } catch (e) {
      super.error(e);
    }
    return super.info(...msg);
  }

  //eslint-disable-next-line
  public warnS(m: string, ...msg: any[]): void {
    try {
      if (msg.length > 0)
        Sentry.addBreadcrumb({ message: m + ': ' + this._inspect(msg), data: msg, level: Sentry.Severity.Warning });
      Sentry.captureMessage(m, Sentry.Severity.Warning);
    } catch (e) {
      super.error(e);
    }
    return super.warn(m, ...msg);
  }

  //eslint-disable-next-line
  public errorS(m: string, ...msg: any[]): void {
    try {
      if (msg.length > 0)
        Sentry.addBreadcrumb({ message: m + ': ' + this._inspect(msg), level: Sentry.Severity.Error });
      Sentry.captureMessage(m, Sentry.Severity.Error);
    } catch (e) {
      super.error(e);
    }
    return super.error(m, ...msg);
  }

  //eslint-disable-next-line
  public exceptionS(e: Error, ...msg: any[]): void {
    try {
      if (msg.length > 0)
        Sentry.addBreadcrumb({
          message: e.message + ': ' + this._inspect(msg),
          data: msg,
          level: Sentry.Severity.Error,
        });
      Sentry.captureException(e);
    } catch (e) {
      super.error(e);
    }
    return super.error(e, ...msg);
  }
}
