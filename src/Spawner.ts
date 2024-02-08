import * as fsw from './util/FSWrapper';
import { resolveVariablesAsync } from './util/ResolveRule';

///

export interface SpawnReturns extends fsw.SpawnSyncReturns<string> {
  closed: boolean;
}

export type SpawnOptionsWithoutStdio = fsw.SpawnOptionsWithoutStdio & { env: NodeJS.ProcessEnv; cwd: string };

///

//TODO:future, add cancellation flag
export interface Spawner {
  spawnAsync(cmd: string, args: string[], options: SpawnOptionsWithoutStdio, timeout?: number): Promise<SpawnReturns>;

  spawn(cmd: string, args: string[], options: SpawnOptionsWithoutStdio): Promise<fsw.ChildProcessWithoutNullStreams>;
}

///

export class SpawnBuilder {
  constructor(
    private readonly spawner: Spawner,
    readonly cmd: string,
    readonly args: string[],
    readonly options: SpawnOptionsWithoutStdio,
    readonly timeout: number | undefined,
  ) {}

  spawnAsync(): Promise<SpawnReturns> {
    return this.spawner.spawnAsync(this.cmd, this.args, this.options, this.timeout);
  }

  spawn(): Promise<fsw.ChildProcessWithoutNullStreams> {
    return this.spawner.spawn(this.cmd, this.args, this.options);
  }
}

///

export class DefaultSpawner implements Spawner {
  spawnAsync(cmd: string, args: string[], options: SpawnOptionsWithoutStdio, timeout?: number): Promise<SpawnReturns> {
    return new Promise((resolve, reject) => {
      const ret: SpawnReturns = {
        pid: 0,
        output: [null as unknown as string, '', ''],
        stdout: '',
        stderr: '',
        status: 0,
        signal: null,
        error: undefined,
        closed: false,
      };

      const optionsEx = Object.assign<SpawnOptionsWithoutStdio, SpawnOptionsWithoutStdio>(
        { timeout, env: {}, cwd: '' },
        options || {},
      );

      const command = fsw.spawn(cmd, args || [], optionsEx);

      Object.assign(ret, { process: command }); // for debugging

      ret.pid = command.pid || -42;

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

  spawn(cmd: string, args: string[], options: SpawnOptionsWithoutStdio): Promise<fsw.ChildProcessWithoutNullStreams> {
    return Promise.resolve(fsw.spawn(cmd, args, options));
  }

  toString(): string {
    return 'DefaultSpawner';
  }
}

///

export class SpawnWithExecutor extends DefaultSpawner {
  private readonly _cmdR = '${cmd}';
  private readonly _argsR = '${args}'; // deprecated
  private readonly _argsR2 = '${argsFlat}';
  private readonly _argsStrR = '${argsStr}';

  constructor(
    private readonly _executor: string,
    private readonly _args?: ReadonlyArray<string>,
  ) {
    super();

    if (_args && !_args.some(x => x.indexOf(this._cmdR) != -1)) {
      throw Error(`${this._cmdR} should be specified`);
    }

    if (
      _args &&
      !_args.some(x => x.indexOf(this._argsR) != -1 || x.indexOf(this._argsR2) != -1 || x.indexOf(this._argsStrR) != -1)
    ) {
      throw Error(`${this._argsR2} or ${this._argsStrR} should be specified`);
    }
  }

  override async spawnAsync(
    cmd: string,
    args: string[],
    options: SpawnOptionsWithoutStdio,
    timeout?: number,
  ): Promise<SpawnReturns> {
    const argsV = await this.getArgs(cmd, args);
    return super.spawnAsync(this._executor, argsV, options, timeout);
  }

  override async spawn(
    cmd: string,
    args: string[],
    options: SpawnOptionsWithoutStdio,
  ): Promise<fsw.ChildProcessWithoutNullStreams> {
    const argsV = await this.getArgs(cmd, args);
    return super.spawn(this._executor, argsV, options);
  }

  private async getArgs(cmd: string, args: readonly string[]): Promise<string[]> {
    if (this._args && this._args.length > 0) {
      const argsFlat = (): Promise<readonly string[]> => Promise.resolve(args);

      const argsResolved = await resolveVariablesAsync(this._args as string[], [
        {
          resolve: this._cmdR,
          rule: cmd,
        },
        {
          resolve: this._argsR,
          rule: argsFlat,
          isFlat: true,
        },
        {
          resolve: this._argsR2,
          rule: argsFlat,
          isFlat: true,
        },
        {
          resolve: this._argsStrR,
          rule: (): Promise<string> =>
            Promise.resolve(
              args
                .map(a => a.replace(/"/g, '\\"'))
                .map(a => `"${a}"`)
                .join(' '),
            ),
        },
      ]);

      return argsResolved;
    } else {
      return [cmd, ...args];
    }
  }

  override toString(): string {
    return `SpawnWithExecutor(${this._executor}, [${this._args}])`;
  }
}
