import * as util from 'vscode-test-adapter-util';
import { debugBreak } from './util/DevelopmentHelper';

///

export class LoggerWrapper extends util.Log {
  constructor(configSection: string, outputChannelName: string) {
    super(configSection, undefined, outputChannelName, { depth: 3 }, false);
  }

  //eslint-disable-next-line
  trace(msg: any, ...msgs: any[]): void {
    process.env['TESTMATE_DEBUG'] && super.debug(msg, ...msgs);
  }

  //eslint-disable-next-line
  debugS(msg: any, ...msgs: any[]): void {
    super.debug(msg, ...msgs);
  }

  //eslint-disable-next-line
  setContext(name: string, context: { [key: string]: any } | null): void {
    super.info('context:' + name, context);
  }

  setTags(_tags: { [key: string]: string }): void {}

  //eslint-disable-next-line
  infoS(_m: string, ...msg: any[]): void {
    super.info(...msg);
  }

  infoSWithTags(m: string, tags: { [key: string]: string }): void {
    super.info(m, tags);
  }

  //eslint-disable-next-line
  warnS(m: string, ...msg: any[]): void {
    super.warn(m, ...msg);
  }

  //eslint-disable-next-line
  override error(m: string, ...msg: any[]): void {
    if (!m.startsWith('TODO')) debugBreak();
    super.error(m, ...msg);
  }

  //eslint-disable-next-line
  errorS(m: string, ...msg: any[]): void {
    this.error(m, ...msg);
  }

  //eslint-disable-next-line
  exceptionS(e: unknown, ...msg: unknown[]): void {
    debugBreak();
    super.error(e, ...msg);
  }
}
