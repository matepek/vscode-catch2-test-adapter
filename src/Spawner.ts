import * as cp from 'child_process';

///

export interface SpawnReturns extends cp.SpawnSyncReturns<string> {
  closed: boolean;
}

export type SpawnOptions = cp.SpawnOptions;

///

export interface Spawner {
  spawnAsync(cmd: string, args: string[], options: SpawnOptions, timeout?: number): Promise<SpawnReturns>;

  spawn(cmd: string, args: string[], options: SpawnOptions): cp.ChildProcess;
}

///

export class DefaultSpawner implements Spawner {
  spawnAsync(cmd: string, args: string[], options: SpawnOptions, timeout?: number): Promise<SpawnReturns> {
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

      const optionsEx = Object.assign<SpawnOptions, SpawnOptions>({ timeout }, options || {});

      const command = cp.spawn(cmd, args || [], optionsEx);

      Object.assign(ret, { process: command }); // for debugging

      ret.pid = command.pid;

      command.stdout!.on('data', function (data) {
        ret.stdout += data;
        ret.output[1] = ret.stdout;
      });

      command.stderr!.on('data', function (data) {
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

  spawn(cmd: string, args: string[], options: SpawnOptions): cp.ChildProcess {
    return cp.spawn(cmd, args, options);
  }

  public toString(): string {
    return 'DefaultSpawner';
  }
}

///

export class SpawnWithExecutor extends DefaultSpawner {
  private readonly _cmdStr = '${cmd}';
  private readonly _argsStr = '${args}';

  public constructor(private readonly _executor: string, private readonly _args?: string[]) {
    super();

    if (_args && !_args.some(x => x === this._cmdStr)) throw Error(`${this._cmdStr} should be specified`);
    if (_args && !_args.some(x => x === this._argsStr)) throw Error(`${this._argsStr} should be specified`);
  }

  spawnAsync(cmd: string, args: string[], options: SpawnOptions, timeout?: number): Promise<SpawnReturns> {
    return super.spawnAsync(this._executor, this.getArgs(cmd, args), options, timeout);
  }

  spawn(cmd: string, args: string[], options: SpawnOptions): cp.ChildProcess {
    return super.spawn(this._executor, this.getArgs(cmd, args), options);
  }

  private getArgs(cmd: string, args: string[]): string[] {
    if (this._args && this._args.length > 0) {
      return this._args
        .map((x: string): string[] => {
          if (x === this._cmdStr) return [cmd];
          else if (x === this._argsStr) return args;
          else return [x];
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
