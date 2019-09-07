import * as util from 'vscode-test-adapter-util';
import * as Sentry from '@sentry/node';

///

export class LogWrapper extends util.Log {
  //eslint-disable-next-line
  public debug(...msg: any[]): void {
    Sentry.addBreadcrumb({ data: msg, level: Sentry.Severity.Debug });
    return super.debug(msg);
  }

  //eslint-disable-next-line
  public info(...msg: any[]): void {
    Sentry.addBreadcrumb({ data: msg, level: Sentry.Severity.Info });
    return super.info(msg);
  }

  //eslint-disable-next-line
  public warn(m: string, ...msg: any[]): void {
    Sentry.addBreadcrumb({ message: m, data: msg, level: Sentry.Severity.Warning });
    Sentry.captureMessage(m, Sentry.Severity.Error);
    return super.warn(m, msg);
  }

  //eslint-disable-next-line
  public error(m: string, ...msg: any[]): void {
    Sentry.addBreadcrumb({ message: m, data: msg, level: Sentry.Severity.Error });
    Sentry.captureMessage(m, Sentry.Severity.Error);
    return super.error(m, msg);
  }

  //eslint-disable-next-line
  public exception(e: Error, ...msg: any[]): void {
    Sentry.addBreadcrumb({ data: msg, level: Sentry.Severity.Error });
    Sentry.captureException(e);
    return super.error(e, msg);
  }
}
