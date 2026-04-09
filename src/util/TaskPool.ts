export interface TaskPoolI {
  scheduleTask<TResult>(task: () => TResult | PromiseLike<TResult>): Promise<TResult>;
}

export const combine = (pool1: TaskPoolI, pool2: TaskPoolI): TaskPoolI => {
  return {
    scheduleTask<TResult>(task: () => TResult | PromiseLike<TResult>): Promise<TResult> {
      return pool1.scheduleTask(() => pool2.scheduleTask(task));
    },
  };
};

class NoLimitTaskPool implements TaskPoolI {
  async scheduleTask<TResult>(task: () => TResult | PromiseLike<TResult>): Promise<TResult> {
    return task();
  }
}

export const noLimitTaskPool = new NoLimitTaskPool();

export class TaskPool implements TaskPoolI {
  /**
   * @param maxTaskCount Has to be bigger than 0 or `undefined`.
   */
  constructor(private _maxTaskCount: number) {
    if (_maxTaskCount < 1) throw Error('invalid maxTaskCount: ' + _maxTaskCount);
  }

  get maxTaskCount(): number {
    return this._maxTaskCount;
  }

  set maxTaskCount(value: number) {
    if (value < 1) throw Error('invalid maxTaskCount: ' + value);

    this._maxTaskCount = value;

    this._startIfCanAqure();
  }

  get availableSlotCount(): number {
    return Math.max(0, this._maxTaskCount - this._runningTaskCount);
  }

  scheduleTask<TResult>(task: () => TResult | PromiseLike<TResult>): Promise<TResult> {
    return new Promise<void>(resolve => {
      if (this._acquire()) resolve();
      else this._waitingTasks.push(resolve);
    })
      .then(task)
      .finally(() => this._release());
  }

  private _runningTaskCount = 0;
  private readonly _waitingTasks: ((_: void | PromiseLike<void>) => void)[] = [];

  private _acquire(): boolean {
    if (this._runningTaskCount < this._maxTaskCount) {
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

export interface TaskPoolMapI {
  get(key: object): TaskPoolI;
}

// basically its a dynamic semaphore
export class TaskPoolMap implements TaskPoolMapI {
  /**
   * @param maxTaskCount Has to be bigger than 0 or `undefined`.
   */
  constructor(private _maxTaskCount: number) {
    if (_maxTaskCount < 1) throw Error('invalid maxTaskCount: ' + _maxTaskCount);
  }

  private readonly _pools = new WeakMap<object, TaskPoolI>();

  get(key: object): TaskPoolI {
    let p = this._pools.get(key);
    if (p === undefined) {
      p = new TaskPool(this._maxTaskCount);
      this._pools.set(key, p);
    }
    return p;
  }
}

export const noLimitTaskPoolMap: TaskPoolMapI = {
  get(_key: object): TaskPoolI {
    return noLimitTaskPool;
  },
};
