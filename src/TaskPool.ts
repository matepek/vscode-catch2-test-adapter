export class TaskPool {
  /**
   * @param maxTaskCount Has to be bigger than 0 or `undefined`.
   */
  public constructor(private _maxTaskCount: number | undefined) {
    if (_maxTaskCount !== undefined && _maxTaskCount < 1) throw Error('invalid maxTaskCount: ' + _maxTaskCount);
  }

  public get maxTaskCount(): number | undefined {
    return this._maxTaskCount;
  }

  public set maxTaskCount(value: number | undefined) {
    if (value !== undefined && value < 1) throw Error('invalid maxTaskCount: ' + value);

    this._maxTaskCount = value;

    this._startIfCanAqure();
  }

  public scheduleTask<TResult>(task: () => TResult | PromiseLike<TResult>): Promise<TResult> {
    return new Promise<void>(resolve => {
      if (this._acquire()) resolve();
      else this._waitingTasks.push(resolve);
    })
      .then(task)
      .finally(() => this._release());
  }

  private _runningTaskCount = 0;
  private readonly _waitingTasks: (() => void)[] = [];

  private _acquire(): boolean {
    if (this._maxTaskCount === undefined || this._runningTaskCount < this._maxTaskCount) {
      this._runningTaskCount++;
      return true;
    } else {
      return false;
    }
  }

  private _release(): void {
    this._runningTaskCount--;

    this._startIfCanAqure();
  }

  private _startIfCanAqure(): void {
    while (this._waitingTasks.length > 0 && this._acquire()) {
      this._waitingTasks.shift()!();
    }
  }
}
