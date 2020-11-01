import * as fsw from './FSWrapper';

///

export interface SpawnReturns extends fsw.SpawnSyncReturns<string> {
  closed: boolean;
}

export type SpawnOptionsWithoutStdio = fsw.SpawnOptionsWithoutStdio;

///

export interface Spawner {
  spawnAsync(cmd: string, args: string[], options: SpawnOptionsWithoutStdio, timeout?: number): Promise<SpawnReturns>;

  spawn(cmd: string, args: string[], options: SpawnOptionsWithoutStdio): fsw.ChildProcessWithoutNullStreams;
}

///

export class DefaultSpawner implements Spawner {
  spawnAsync(cmd: string, args: string[], options: SpawnOptionsWithoutStdio, timeout?: number): Promise<SpawnReturns> {
    return new Promise((resolve, reject) => {
      const ret: SpawnReturns = {
        pid: 0,
        output: [(null as unknown) as string, '', ''],
        stdout: '',
        stderr: '',
        status: 0,
        signal: null,
        error: undefined,
        closed: false,
      };

      const optionsEx = Object.assign<SpawnOptionsWithoutStdio, SpawnOptionsWithoutStdio>({ timeout }, options || {});

      const command = fsw.spawn(cmd, args || [], optionsEx);

      Object.assign(ret, { process: command }); // for debugging

      ret.pid = command.pid;

      command.stdout.on('data', function (data) {
        ret.stdout += data;
        ret.output[1] = ret.stdout;
      });

      command.stderr.on('data', function (data) {
        ret.stderr += data;
        ret.output[2] = ret.stderr;
      });

      command.on('error', function (err: Error) {
        ret.error = err;
        reject(err);
      });

      command.on('close', function (code: number, signal: NodeJS.Signals) {
        ret.closed = true;

        if (signal !== null) {
          ret.signal = signal;
          reject(new Error('FsWrapper.spawnAsync signal: ' + signal));
        } else {
          ret.status = code;
          resolve(ret);
        }
      });
    });
  }

  spawn(cmd: string, args: string[], options: SpawnOptionsWithoutStdio): fsw.ChildProcessWithoutNullStreams {
    return fsw.spawn(cmd, args, options);
  }

  public toString(): string {
    return 'DefaultSpawner';
  }
}

///

export class SpawnWithExecutor extends DefaultSpawner {
  private readonly _cmdR = '${cmd}';
  private readonly _argsR = '${args}';
  private readonly _argsR2 = '${argsFlat}';
  private readonly _argsStrR = '${argsStr}';

  public constructor(private readonly _executor: string, private readonly _args?: string[]) {
    super();

    if (_args && !_args.some(x => x.indexOf(this._cmdR) != -1)) {
      throw Error(`${this._cmdR} should be specified`);
    }

    if (
      _args &&
      !_args.some(x => x.indexOf(this._argsR) != -1 || x.indexOf(this._argsR2) != -1 || x.indexOf(this._argsStrR) != -1)
    ) {
      throw Error(`${this._argsR}, ${this._argsR2} or ${this._argsStrR} should be specified`);
    }
  }

  spawnAsync(cmd: string, args: string[], options: SpawnOptionsWithoutStdio, timeout?: number): Promise<SpawnReturns> {
    const argsV = this.getArgs(cmd, args);
    return super.spawnAsync(this._executor, argsV, options, timeout);
  }

  spawn(cmd: string, args: string[], options: SpawnOptionsWithoutStdio): fsw.ChildProcessWithoutNullStreams {
    const argsV = this.getArgs(cmd, args);
    return super.spawn(this._executor, argsV, options);
  }

  private getArgs(cmd: string, args: string[]): string[] {
    if (this._args && this._args.length > 0) {
      return this._args
        .map((x: string): string[] => {
          if (x === this._cmdR) {
            return [cmd];
          } else if (x === this._argsR || x === this._argsR2) {
            return args;
          } else {
            return [
              x.replace(this._cmdR, `"${cmd}"`).replace(
                this._argsStrR,
                args
                  .map(a => a.replace(/"/g, '\\"'))
                  .map(a => `"${a}"`)
                  .join(' '),
              ),
            ];
          }
        })
        .reduce((prev: string[], curr: string[]): string[] => prev.concat(curr));
    } else {
      return [cmd, ...args];
    }
  }

  public toString(): string {
    return `SpawnWithExecutor(${this._executor}, [${this._args}])`;
  }
}
