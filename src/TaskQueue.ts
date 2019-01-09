//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

export class TaskQueue {
  constructor(depends: Iterable<TaskQueue> = [],
    public readonly name?: string) {
    this._depends = [...depends];
    // TODO check circular dependency
  }

  empty(): boolean {
    return this._count == 0;
  }

  get size(): number {
    return this._count;
  }

  get length(): number {
    return this._count;
  }

  then<TResult1>(
    task: (() => TResult1 | PromiseLike<TResult1>)): Promise<TResult1> {
    this._count++;

    const depends = this._depends.map(v => v._queue);
    depends.push(this._queue);

    const current = Promise.all(depends).then(task);

    const decr = () => { this._count--; };

    this._queue = current.then(decr, decr);

    return current;
  }

  dependsOn(depends: Iterable<TaskQueue>): void {
    for (const dep of depends) {
      this._depends.push(dep);
    }
    // TODO check circular dependency
  }

  private _count: number = 0;
  private _queue: Promise<void> = Promise.resolve();
  private readonly _depends: Array<TaskQueue>;
}
