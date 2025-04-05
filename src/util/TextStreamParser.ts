import { Logger } from '../Logger';
import { debugBreak } from './DevelopmentHelper';
import { ParserInterface } from './ParserInterface';

export class TextStreamParser implements ParserInterface {
  constructor(
    private readonly log: Logger,
    rootProcessor: RootLineProcessor,
    private readonly handleStdErr = true,
  ) {
    this.topProcessor = rootProcessor;
  }

  private readonly lines: string[] = [];
  private lastLine = '';

  private sequentialP = Promise.resolve();
  private readonly processorStack: LineProcessor[] = [];
  private topProcessor: LineProcessor;

  async end(): Promise<void> {
    if (this.lastLine) {
      this.lines.push(this.lastLine);
    }
    this.lastLine = '';

    this._process();

    await this.sequentialP;

    if (this.topProcessor.end) this.topProcessor.end();

    while (this.processorStack.length) {
      const p = this.processorStack.pop()!;
      if (p.end) p.end();
    }
  }

  write(data: string): void {
    if (data) {
      const lines = data.split(/\r?\n/); // has at least 1 element

      lines[0] = this.lastLine + lines[0];

      this.lastLine = lines.pop()!; // has at least 1 element

      this.lines.push(...lines);

      if (lines.length) this._process();
    }
  }

  writeStdErr(data: string): Promise<boolean> {
    if (this.handleStdErr) this.write(data);
    return Promise.resolve(this.handleStdErr);
  }

  private _process(): void {
    this.sequentialP = this.sequentialP
      .then(async () => {
        while (this.lines.length) {
          const line = this.lines.shift()!;
          const result = await this.topProcessor.online(line);

          if (typeof result === 'boolean') {
            if (this.processorStack.length) {
              if (this.topProcessor.end) this.topProcessor.end();
              this.topProcessor = this.processorStack.pop()!;
              if (!result) {
                // putting back because the popped processor should process it too
                this.lines.unshift(line);
              }
            } else {
              debugBreak();
              this.log.error('rootProcessor should not be dropped');
            }
          } else if (result === undefined) {
            // skip: the line was processed
          } else {
            this.processorStack.push(this.topProcessor);
            this.topProcessor = result;
            if (result.begin) result.begin(line);
          }
        }
      })
      .catch(e => this.log.exceptionS(e));
  }
}

export interface LineProcessor {
  begin?(line: string): void;

  end?(): void;

  /**
   * @returns `LineProcessor` the control is passed to the new processor
   *            - `begin` will be called with current line
   *            - `online` will be called with the following lines
   *          `void` the line was processed, continue processing
   *          `true` the line was processed and the processor should be retired
   *          `false` the line wasn't processed and the processor should be retired
   *                  the next-on-stack processor should be called with the same line
   */
  online(line: string): void | boolean | LineProcessor | Promise<void | boolean | LineProcessor>;
}

export interface RootLineProcessor extends LineProcessor {
  end?(): void;

  online(line: string): void | LineProcessor | Promise<void | LineProcessor>;
}

export class NoOpLineProcessor implements LineProcessor {
  constructor() {}

  online(_line: string): void {}
}

export class LambdaLineProcessor implements LineProcessor {
  constructor(private readonly _processor: (line: string) => void) {}

  online(line: string): void {
    this._processor(line);
  }
}
