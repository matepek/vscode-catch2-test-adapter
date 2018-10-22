import {EventEmitter} from 'events';
import {Stream} from 'stream';

export class ChildProcessStub extends EventEmitter {
  readonly stdout = new Stream.Readable();
  public closed: boolean = false;

  constructor(data?: string|Iterable<string>) {
    super();
    this.stdout.on('end', () => {
      this.closed = true;
      this.emit('close', 1);
    });
    if (data != undefined) {
      if (typeof data != 'string') {
        for (let line of data) {
          this.stdout.push(line);
        }
        this.stdout.push(null);
      } else {
        this.writeAndClose(data);
      }
    }
  }

  kill() {
    this.stdout.emit('end');
  }

  writeAndClose(data: string): void {
    this.stdout.push(data);
    this.stdout.push(null);
  }

  writeLineByLineAndClose(data: string): void {
    const lines = data.split('\n');
    lines.forEach((l) => {
      this.stdout.push(l);
    });
    this.stdout.push(null);
  }
};