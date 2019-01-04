export class TaskPool {
  /**
   * @param maxTaskCount Has to be bigger than 0 or `undefined`.
   */
  constructor(private _maxTaskCount: number | undefined) {
    if (_maxTaskCount != undefined && _maxTaskCount < 1) throw Error('invalid argument');
  }

  get maxTaskCount(): number | undefined {
    return this._maxTaskCount;
  }

  set maxTaskCount(maxTaskCount: number | undefined) {
    if (maxTaskCount != undefined && maxTaskCount < 1) throw Error('invalid argument');
    this._maxTaskCount = maxTaskCount;

    while (this._waitingTasks.length > 0 && this._acquire())
      this._waitingTasks.pop()!();
  }

  scheduleTask<TResult>(task: () => TResult | PromiseLike<TResult>): Promise<TResult> {
    return new Promise<void>(resolve => {
      if (this._acquire())
        resolve();
      else
        this._waitingTasks.unshift(resolve);
    }).then(task)
      .then(
        (v: TResult) => {
          this._release();
          return v;
        },
        (reason?: any) => {
          this._release();
          throw reason;
        });
  }

  private _runningTaskCount: number = 0;
  private readonly _waitingTasks: (() => void)[] = [];

  private _acquire(): boolean {
    if (this._maxTaskCount === undefined || this._runningTaskCount < this._maxTaskCount) {
      this._runningTaskCount += 1;
      return true;
    } else {
      return false;
    }
  }

  private _release(): void {
    this._runningTaskCount -= 1;

    while (this._waitingTasks.length > 0 && this._acquire())
      this._waitingTasks.pop()!();
  }
}
