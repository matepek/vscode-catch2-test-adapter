//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

export class QueueGraphNode {
  constructor(
    public readonly name?: string, depends: Iterable<QueueGraphNode> = [],
    private readonly _handleError?: ((reason: any) => any)) {
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

  then<TResult1, TResult2 = never>(
    task: (() => TResult1 | PromiseLike<TResult1>),
    taskErrorHandler?: ((reason: any) => TResult2 | PromiseLike<TResult2>) |
      undefined | null): Promise<TResult1> {
    this._count++;

    const previous = this._queue;
    const current = Promise.all(this._depends.map(v => v._queue))
      .then(() => {
        return previous.then(task);
      });
    this._queue = current
      .then(
        (value: TResult1) => {
          this._count--;
        },
        (reason: any) => {
          this._count--;
          if (taskErrorHandler)
            return taskErrorHandler(reason);
          else if (this._handleError)
            return this._handleError(reason);
          else
            throw reason; // fatal: the queue is broken
        });

    return current;
  }

  dependsOn(depends: Iterable<QueueGraphNode>): void {
    for (const dep of depends) {
      this._depends.push(dep);
    }
    // TODO check circular dependency
  }

  private _count: number = 0;
  private _queue: Promise<void> = Promise.resolve();
  private readonly _depends: Array<QueueGraphNode>;
}
