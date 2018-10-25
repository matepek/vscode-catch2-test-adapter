//-----------------------------------------------------------------------------
// vscode-catch2-test-adapter was written by Mate Pek, and is placed in the
// public domain. The author hereby disclaims copyright to this source code.

export class QueueGraphNode {
  constructor(
      public readonly name?: string, depends: Iterable < QueueGraphNode >= [],
      private readonly _handleError?: ((reason: any) => void)) {
    this._depends = [...depends];
    // TODO check circular dependency
  }

  empty(): boolean {
    return this._count == 0;
  }

  get size(): number {
    return this._count;
  }

  then(
      task?: (() => void|PromiseLike<void>)|undefined|null,
      taskErrorHandler?: ((reason: any) => void|PromiseLike<void>)|undefined|
      null) {
    this._count++;

    const previous = this._queue;
    this._queue = Promise.all(this._depends.map(v => v._queue)).then(() => {
      return previous.then(task);
    });

    if (taskErrorHandler)
      this._queue = this._queue.catch(taskErrorHandler);
    else if (this._handleError)
      this._queue = this._queue.catch(this._handleError);
    this._queue = this._queue.then(() => {
      this._count--;
    });
  }

  dependsOn(depends: Iterable<QueueGraphNode>): void {
    for (const dep of depends) {
      this._depends.push(dep);
    }
    // TODO check recursion
  }


  private _count: number = 0;
  private _queue: Promise<void> = Promise.resolve();
  private readonly _depends: Array<QueueGraphNode>;
}