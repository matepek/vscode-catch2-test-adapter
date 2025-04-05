import * as util from 'vscode-test-adapter-util';
import { debugBreak } from './util/DevelopmentHelper';

///

export class Logger {
  constructor() {
    this._logger = new util.Log('testMate.cpp.log', undefined, 'C++ TestMate', { depth: 3 }, false);
  }

  private _logger: util.Log;

  //eslint-disable-next-line
  trace(msg: any, ...msgs: any[]): void {
    if (process.env['TESTMATE_DEBUG']) this._logger.debug(msg, ...msgs);
  }

  //eslint-disable-next-line
  debug(msg: any, ...msgs: any[]): void {
    this._logger.debug(msg, ...msgs);
  }

  //eslint-disable-next-line
  debugS(msg: any, ...msgs: any[]): void {
    this._logger.debug(msg, ...msgs);
  }

  //eslint-disable-next-line
  setContext(name: string, context: { [key: string]: any } | null): void {
    this._logger.info('context:' + name, context);
  }

  setTags(_tags: { [key: string]: string }): void {}

  //eslint-disable-next-line
  info(msg: any, ...msgs: any[]): void {
    this._logger.info(msg, ...msgs);
  }

  //eslint-disable-next-line
  infoS(_m: string, ...msg: any[]): void {
    this._logger.info(...msg);
  }

  infoSWithTags(m: string, tags: { [key: string]: string }): void {
    this._logger.info(m, tags);
  }

  //eslint-disable-next-line
  warn(m: string, ...msg: any[]): void {
    this._logger.warn(m, ...msg);
  }

  //eslint-disable-next-line
  warnS(m: string, ...msg: any[]): void {
    this._logger.warn(m, ...msg);
  }

  //eslint-disable-next-line
  error(m: string, ...msg: any[]): void {
    if (!m.startsWith('TODO')) debugBreak();
    this._logger.error(m, ...msg);
  }

  //eslint-disable-next-line
  errorS(m: string, ...msg: any[]): void {
    this.error(m, ...msg);
  }

  exception(e: unknown, ...msg: unknown[]): void {
    debugBreak();
    this._logger.error(e, ...msg);
  }

  exceptionS(e: unknown, ...msg: unknown[]): void {
    debugBreak();
    this._logger.error(e, ...msg);
  }

  setNextInspectOptions(inspectOptions: util.InspectOptions): void {
    this._logger.setNextInspectOptions(inspectOptions);
  }

  dispose(): void {
    this._logger.dispose();
  }
}
