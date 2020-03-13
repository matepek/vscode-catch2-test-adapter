export class TaskQueue {
  public constructor(depends: Iterable<TaskQueue> = [], public readonly name?: string) {
    for (const dep of depends) {
      this._checkCircle(dep);
      this._depends.push(dep);
    }
  }

  public empty(): boolean {
    return this._count == 0;
  }

  public get size(): number {
    return this._count;
  }

  public get length(): number {
    return this._count;
  }

  public then<TResult1>(task: () => TResult1 | PromiseLike<TResult1>): Promise<TResult1> {
    ++this._count;

    let current: Promise<any> = this._queue; //eslint-disable-line

    if (this._depends.length > 0) {
      const depends = this._depends.map(tq => tq._queue);
      current = current.then(() => {
        return Promise.all(depends);
      });
    }

    current = current.then(task).finally(() => --this._count);

    this._queue = current.catch((): void => undefined);

    return current;
  }

  public dependsOn(depends: Iterable<TaskQueue>): void {
    for (const dep of depends) {
      this._checkCircle(dep);
    }
    for (const dep of depends) {
      if (this._depends.indexOf(dep) === -1) this._depends.push(dep);
    }
  }

  private _count = 0;
  private _queue: Promise<any> = Promise.resolve(); //eslint-disable-line
  private readonly _depends: TaskQueue[] = [];

  private _checkCircle(tq: TaskQueue): void {
    if (tq === this) throw Error('circle');

    for (let i = 0; i < tq._depends.length; i++) {
      this._checkCircle(tq._depends[i]);
    }
  }
}
