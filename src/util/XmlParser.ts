import * as htmlparser2 from 'htmlparser2';
import { LoggerWrapper } from '../LoggerWrapper';
import { debugBreak } from './DevelopmentHelper';
import { ParserInterface } from './ParserInterface';

type ProcessorFrame = { tag: XmlTag; processor: XmlTagProcessor; nesting: number };
type XmlTagFrame = XmlTag & { _text: string };

export class XmlParser extends htmlparser2.Parser implements ParserInterface {
  private sequentialP = Promise.resolve();
  private readonly tagStack: XmlTagFrame[] = [];
  private readonly xmlTagProcessorStack: ProcessorFrame[] = [];
  private topTagProcessor: ProcessorFrame;

  public constructor(
    private readonly log: LoggerWrapper,
    processor: XmlTagProcessor,
    onerrorCb: (error: Error) => void,
  ) {
    super(
      {
        onopentag: (name: string, attribs: Record<string, string>): void => {
          this.sequentialP = this.sequentialP.then(async () => {
            // flush ontext
            if (this.tagStack.length) {
              const prevTag = this.tagStack[this.tagStack.length - 1];
              if (this.topTagProcessor.processor.ontext) {
                const trimmedText = prevTag._text.trim();
                if (trimmedText) this.topTagProcessor.processor.ontext(trimmedText, prevTag);
              }
              prevTag._text = '';
            }

            const tag = { name, attribs, _text: '' };
            this.log.trace('onopentag', tag);
            this.tagStack.push(tag);

            if (this.topTagProcessor.processor.onopentag) {
              const processor = await this.topTagProcessor.processor.onopentag(tag);
              if (processor) {
                this.xmlTagProcessorStack.push(this.topTagProcessor);
                this.topTagProcessor = { tag, processor, nesting: 0 };
                if (processor.begin) processor.begin(tag);
              } else {
                if (this.topTagProcessor.tag.name === name) this.topTagProcessor.nesting++;
              }
            } else {
              if (this.topTagProcessor.tag.name === name) this.topTagProcessor.nesting++;
            }
          });
        },
        onclosetag: (name: string): void => {
          this.sequentialP = this.sequentialP.then(async () => {
            this.log.trace('onclosetag', name);
            const tag = this.tagStack.pop();

            if (tag?.name !== name) {
              debugger;
              throw Error('onclosetag: tag mismatch');
            }

            // flush ontext
            if (this.topTagProcessor.processor.ontext) {
              const trimmedText = tag._text.trim();
              if (trimmedText) this.topTagProcessor.processor.ontext(trimmedText, tag);
            }

            if (this.topTagProcessor.tag.name === name && --this.topTagProcessor.nesting < 0) {
              if (this.topTagProcessor.processor.end) await this.topTagProcessor.processor.end();

              if (this.xmlTagProcessorStack.length === 0) {
                debugger;
                const error = Error('onclosetag should have at least the root');
                this.log.exceptionS(error, this);
                throw error;
              }

              this.topTagProcessor = this.xmlTagProcessorStack.pop()!;
            } else {
              if (this.topTagProcessor.processor.onclosetag) this.topTagProcessor.processor.onclosetag(tag);
            }
          });
        },
        onend: () => {
          this.sequentialP = this.sequentialP.then(async () => {
            this.log.trace('onend');

            if (this.xmlTagProcessorStack.length !== 0) {
              debugBreak();
              this.log.warn('onend should not have more processors unless the parser was abandoned', this);
            }

            if (this.topTagProcessor.processor.end) await this.topTagProcessor.processor.end();

            this.sequentialP.catch(reason => this.log.errorS(reason));
          });
        },
        ontext: (dataStr: string): void => {
          this.sequentialP = this.sequentialP.then(() => {
            const dataTrimmed = dataStr.trim();
            if (dataTrimmed === '') return;
            this.log.trace('ontext', dataTrimmed);

            this.tagStack[this.tagStack.length - 1]._text += dataStr;
          });
        },
        onerror: (error: Error): void => {
          this.log.errorS('onerror', error);
          onerrorCb(error);
        },
      },
      { xmlMode: true },
    );

    this.topTagProcessor = { tag: { name: '<root>', attribs: {} }, processor, nesting: 0 };
    this.tagStack.push({ name: '<root>', attribs: {}, _text: '' });
  }

  writeStdErr(data: string): Promise<boolean> {
    const p = this.sequentialP.then(() => {
      let tag = this.topTagProcessor;
      for (let i = this.xmlTagProcessorStack.length - 1; tag.processor.onstderr === undefined && i >= 0; --i) {
        tag = this.xmlTagProcessorStack[i];
      }

      if (tag.processor.onstderr) {
        tag.processor.onstderr(data, this.tagStack[this.tagStack.length - 1]);
        return true;
      } else {
        return false;
      }
    });
    this.sequentialP = p.then();
    return p;
  }

  override async end(): Promise<void> {
    super.end();
    await this.sequentialP;
  }

  get parserStack(): XmlTagProcessor[] {
    return this.xmlTagProcessorStack.map(x => x.processor);
  }
}

export interface XmlTag {
  name: string;
  attribs: Record<string, string>;
}

export interface XmlTagProcessor {
  begin?(tag: XmlTag): void;
  end?(): void | Promise<void>;

  /**
   * If returns with XmlTagProcessor then it will be used for this tag and it's children.
   * In this case the onclosetag won't be called for the tag;
   */
  onopentag?(tag: XmlTag): void | XmlTagProcessor | PromiseLike<void | XmlTagProcessor>;
  onclosetag?(tag: XmlTag): void;

  ontext?(dataTrimmed: string, parentTag: XmlTag): void;
  onstderr?(data: string, parentTag: XmlTag): void;
}
