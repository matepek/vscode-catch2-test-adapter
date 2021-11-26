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
): Promise<void> => pipeOutputStreams(runInfo.process.stdout, runInfo.process.stderr, parser, unhandlerStdErrHandler);

export const pipeOutputStreams = async (
  stdout: Readable,
  stderr: Readable,
  parser: ParserInterface,
  unhandlerStdErrHandler: (data: string) => void,
): Promise<void> => {
  stdout.on('data', (chunk: Uint8Array) => parser.write(chunk.toLocaleString()));

  stderr.on('data', (chunk: Uint8Array) => {
    const c = chunk.toLocaleString();

    parser.writeStdErr(c).then(hasHandled => {
      if (!hasHandled) unhandlerStdErrHandler(c);
    });
  });

  await new Promise<void>(resolve =>
    stderr.once('close', () => {
      resolve();
    }),
  );

  await new Promise<void>(resolve =>
    stdout.once('close', () => {
      resolve();
    }),
  );

  // order matters
  await parser.end();
};
