export class TaskPool {
  /**
   * @param maxTaskCount Has to be bigger than 0 or `undefined`.
   */
  constructor(private _maxTaskCount: number) {
    if (_maxTaskCount < 1) throw Error('invalid maxTaskCount: ' + _maxTaskCount);
  }

  private readonly _availableSlots: number[] = [];
  private _usedSlots = new Set<number>();
  private readonly _waitingTasks: ((_: number | PromiseLike<number>) => void)[] = [];

  get maxTaskCount(): number {
    return this._maxTaskCount;
  }

  set maxTaskCount(value: number) {
    if (value < 1) throw Error('invalid maxTaskCount: ' + value);

    this._maxTaskCount = value;

    this._startIfCanAcquire();
  }

  scheduleTask<TResult>(task: (slotId: number) => TResult | PromiseLike<TResult>): Promise<TResult> {
    const slotId = this._acquire();
    const pre =
      slotId !== undefined
        ? Promise.resolve(slotId)
        : new Promise<number>(resolve => {
            this._waitingTasks.push(resolve);
          });
    return pre.then(slotId =>
      Promise.resolve(slotId)
        .then(task)
        .finally(() => this._release(slotId)),
    );
  }

  private _acquire(): number | undefined {
    const slotId = this._availableSlots.shift();
    if (slotId !== undefined) {
      this._usedSlots.add(slotId);
      return slotId;
    } else if (this._usedSlots.size < this._maxTaskCount) {
      for (let i = 0; i < this._maxTaskCount; ++i) {
        if (!this._usedSlots.has(i)) {
          this._usedSlots.add(i);
          return i;
        }
      }
      throw Error('must have a unused slotId');
    } else {
      return undefined;
    }
  }

  private _release(slotId: number): void {
    this._usedSlots.delete(slotId);
    if (slotId < this._maxTaskCount) {
      this._availableSlots.push(slotId);
      this._startIfCanAcquire();
    }
  }

  private _startIfCanAcquire(): void {
    let slotId: number | undefined;
    while (this._waitingTasks.length > 0 && (slotId = this._acquire()) !== undefined) {
      this._waitingTasks.shift()!(slotId);
    }
  }
}
