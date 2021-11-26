import { Readable } from 'stream';
import { RunningExecutable } from '../RunningExecutable';

export interface ParserInterface {
  write(data: string): void;
  end(): Promise<void>;
  writeStdErr(data: string): Promise<boolean>;
}

export const pipeProcess2Parser = async (
  runInfo: RunningExecutable,
  parser: ParserInterface,
  unhandlerStdErrHandler: (data: string) => void,
): Promise<void> =>
  pipeOutputStreams2Parser(runInfo.process.stdout, runInfo.process.stderr, parser, unhandlerStdErrHandler);

export const pipeOutputStreams2Parser = async (
  stdout: Readable,
  stderr: Readable | undefined,
  parser: ParserInterface,
  unhandlerStdErrHandler: ((data: string) => void) | undefined,
): Promise<void> => {
  stdout.on('data', (chunk: Uint8Array) => parser.write(chunk.toLocaleString()));

  if (stderr) {
    stderr.on('data', (chunk: Uint8Array) => {
      const c = chunk.toLocaleString();

      parser.writeStdErr(c).then(hasHandled => {
        if (!hasHandled && unhandlerStdErrHandler) unhandlerStdErrHandler(c);
      });
    });
  }

  if (stderr) {
    await new Promise<void>(resolve => stderr.once('close', resolve));
  }

  await new Promise<void>(resolve => stdout.once('close', resolve));

  // order matters
  await parser.end();
};

export const pipeOutputStreams2String = async (
  stdout: Readable,
  stderr: Readable | undefined,
): Promise<[string, string]> => {
  const stdoutBuffer: string[] = [];
  const stderrBuffer: string[] = [];

  stdout.on('data', (chunk: Uint8Array) => stdoutBuffer.push(chunk.toLocaleString()));

  if (stderr) stderr.on('data', (chunk: Uint8Array) => stderrBuffer?.push(chunk.toLocaleString()));

  if (stderr) {
    await new Promise<void>(resolve => stderr.once('close', resolve));
  }

  await new Promise<void>(resolve => stdout.once('close', resolve));

  return [stdoutBuffer.join(''), stderrBuffer.join('')];
};
