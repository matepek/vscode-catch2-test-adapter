import * as util from 'vscode-test-adapter-util';
import { WorkspaceFolder } from 'vscode';
import * as Sentry from '@sentry/node';
import { inspect } from 'util';

///

export class LoggerWrapper extends util.Log {
  public constructor(
    configSection: string,
    workspaceFolder: WorkspaceFolder | undefined,
    outputChannelName: string,
    inspectOptions?: util.InspectOptions,
  ) {
    super(configSection, workspaceFolder, outputChannelName, inspectOptions, false);
  }

  //eslint-disable-next-line
  public debug(...msg: any[]): void {
    try {
      Sentry.addBreadcrumb({ message: JSON.stringify(msg), data: msg, level: Sentry.Severity.Debug });
    } catch (e) {
      super.error(e);
    }
    return super.debug(...msg);
  }

  //eslint-disable-next-line
  public localDebug(...msg: any[]): void {
    return super.debug(...msg);
  }

  //eslint-disable-next-line
  public infoMessageWithTags(m: string, tags: { [key: string]: string }): void {
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
  public info(...msg: any[]): void {
    try {
      Sentry.addBreadcrumb({ message: inspect(msg), data: msg, level: Sentry.Severity.Info });
    } catch (e) {
      super.error(e);
    }
    return super.info(...msg);
  }

  //eslint-disable-next-line
  public warn(m: string, ...msg: any[]): void {
    try {
      if (msg.length > 0)
        Sentry.addBreadcrumb({ message: m + ': ' + JSON.stringify(msg), data: msg, level: Sentry.Severity.Warning });
      Sentry.captureMessage(m, Sentry.Severity.Warning);
    } catch (e) {
      super.error(e);
    }
    return super.warn(m, ...msg);
  }

  //eslint-disable-next-line
  public error(m: string, ...msg: any[]): void {
    try {
      if (msg.length > 0)
        Sentry.addBreadcrumb({ message: m + ': ' + JSON.stringify(msg), level: Sentry.Severity.Error });
      Sentry.captureMessage(m, Sentry.Severity.Error);
    } catch (e) {
      super.error(e);
    }
    return super.error(m, ...msg);
  }

  //eslint-disable-next-line
  public exception(e: Error, ...msg: any[]): void {
    try {
      if (msg.length > 0)
        Sentry.addBreadcrumb({
          message: e.message + ': ' + JSON.stringify(msg),
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
