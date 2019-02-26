//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

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
    this._count++;

    const depends: Promise<any>[] = []; //eslint-disable-line
    depends[this._depends.length] = this._queue;

    for (let i = 0; i < this._depends.length; ++i) {
      depends[i] = this._depends[i]._queue;
    }

    this._queue = Promise.all(depends)
      .then(task)
      .finally(() => this._count--);

    return this._queue;
  }

  public dependsOn(depends: Iterable<TaskQueue>): void {
    for (const dep of depends) {
      this._checkCircle(dep);
    }
    for (const dep of depends) {
      if (this._depends.indexOf(dep) == -1) this._depends.push(dep);
    }
  }

  private _count: number = 0;
  private _queue: Promise<any> = Promise.resolve(); //eslint-disable-line
  private readonly _depends: TaskQueue[] = [];

  private _checkCircle(tq: TaskQueue): void {
    if (tq === this) throw Error('circle');

    for (let i = 0; i < tq._depends.length; i++) {
      this._checkCircle(tq._depends[i]);
    }
  }
}
