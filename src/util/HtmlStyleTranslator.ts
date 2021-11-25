import * as htmlparser2 from 'htmlparser2';
import * as ansi from 'ansi-colors';
import { assert, debugBreak } from './DevelopmentHelper';

///

export type Color =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'gray'
  | 'grey'
  | 'blackBright'
  | 'redBright'
  | 'greenBright'
  | 'yellowBright'
  | 'blueBright'
  | 'magentaBright'
  | 'cyanBright'
  | 'whiteBright';

///

interface Styler {
  dim?: (s: string) => string;
  bold?: (s: string) => string;
  italic?: (s: string) => string;
  underline?: (s: string) => string;
  strikethrough?: (s: string) => string;

  color?: (s: string, font: Color | undefined, background?: Color) => string;

  location?: (title: string, link: string, alt?: string) => string;

  h1?: (s: string) => string;
  h2?: (s: string) => string;
  h3?: (s: string) => string;
}

///

export const escapeXmlChars = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const escapeAttrValue = (s: string) => escapeXmlChars(s).replaceAll('"', '&quot;');

export const style: Required<Styler> = {
  dim: (s: string) => `<dim>${s}</dim>`,
  bold: (s: string) => `<b>${s}</b>`,
  italic: (s: string) => `<i>${s}</i>`,
  underline: (s: string) => `<underline>${s}</underline>`,
  strikethrough: (s: string) => `<strikethrough>${s}</strikethrough>`,

  color: (s: string, font: Color | undefined, background?: Color) =>
    `<color${font ? ' font="' + font + '"' : ''}${background ? ' background="' + background + '"' : ''}>${s}</color>`,

  location: (title: string, link: string, alt?: string) =>
    `<location link="${escapeAttrValue(link)}"${alt ? ' alt="' + escapeAttrValue(alt) + '"' : ''}>${escapeXmlChars(
      title,
    )}</location>`,

  h1: (s: string) => `<h1>${s}</h1>`,
  h2: (s: string) => `<h2>${s}</h2>`,
  h3: (s: string) => `<h3>${s}</h3>`,
};

///

///

class XmlStyleTranslator {
  private readonly _parser: htmlparser2.Parser;
  private readonly tagStack: XmlTagFrame[] = [];
  private readonly _resultBuilder: string[] = [];

  constructor(styler: Styler, onerrorCb?: (error: Error) => void) {
    this._parser = new htmlparser2.Parser(
      {
        onopentag: (name: string, attribs: Record<string, string>): void => {
          this.tagStack.push({ name, attribs });
        },
        ontext: (dataStr: string): void => {
          this._resultBuilder.push(
            this.tagStack.reduce((s: string, tag: XmlTagFrame) => {
              switch (tag.name as XmlStyleTag) {
                case 'dim':
                  if (styler.dim) return styler.dim(s);
                  break;
                case 'b':
                  if (styler.bold) return styler.bold(s);
                  break;
                case 'i':
                  if (styler.italic) return styler.italic(s);
                  break;
                case 'color':
                  if (styler.color) return styler.color(s, tag.attribs.font as Color, tag.attribs.background as Color);
                  break;
                case 'location':
                  assert(tag.attribs.link);
                  if (styler.location) return styler.location(s, tag.attribs.link, tag.attribs.alt);
                  break;
                case 'underline':
                  if (styler.underline) return styler.underline(s);
                  break;
                case 'strikethrough':
                  if (styler.strikethrough) return styler.strikethrough(s);
                  break;
                case 'h1':
                  if (styler.h1) return styler.h1(s);
                  break;
                case 'h2':
                  if (styler.h2) return styler.h2(s);
                  break;
                case 'h3':
                  if (styler.h3) return styler.h3(s);
                  break;
                default:
                  debugBreak('unhandled tag:' + tag.name);
              }
              return s;
            }, dataStr),
          );
        },
        onclosetag: (_name: string): void => {
          this.tagStack.pop();
        },
        onerror: (error: Error): void => {
          if (onerrorCb) onerrorCb(error);
          else throw error;
        },
      },
      { xmlMode: true },
    );
  }

  translate(s: string): string {
    assert(this.tagStack.length == 0);
    assert(this._resultBuilder.length == 0);

    this._parser.end(s);
    assert(this.tagStack.length == 0);

    const result = this._resultBuilder.join('');

    this._resultBuilder.splice(0);
    this._parser.reset();

    return result;
  }

  public call(s: string): string {
    return this.translate(s);
  }
}

interface XmlTag {
  name: string;
  attribs: Record<string, string>;
}

type XmlTagFrame = XmlTag;

type XmlStyleTag = 'dim' | 'b' | 'i' | 'color' | 'location' | 'underline' | 'strikethrough' | 'h1' | 'h2' | 'h3';

///

class HtmlStyleToMarkdownTranslator extends XmlStyleTranslator {
  constructor(onerrorCb?: (error: Error) => void) {
    super(
      {
        bold: (s: string) => `**${s}**`,
        italic: (s: string) => `*${s}*`,
        strikethrough: (s: string) => `~${s}~`,
        color: (s: string, font: Color | undefined, background: Color | undefined) =>
          `<span style="${font ? ';color:' + font : ''}${
            background ? ';background-color:' + background : ''
          }">${s}</span>`,
        location: (title: string, s: string, _alt: string | undefined) => `[${title}](${s})`,
        h1: (s: string) => `# ${s}`,
        h2: (s: string) => `## ${s}`,
        h3: (s: string) => `### ${s}`,
      },
      onerrorCb,
    );
  }
}

export const html2mkarkdown = new HtmlStyleToMarkdownTranslator();

///

export class HtmlStyleToAnsiColorTranslator extends XmlStyleTranslator {
  constructor(onerrorCb?: (error: Error) => void) {
    super(
      {
        dim: ansi.dim,
        bold: ansi.bold,
        italic: ansi.italic,
        underline: ansi.underline,
        strikethrough: ansi.strikethrough,
        color: (s: string, font: Color | undefined, background?: Color) => {
          if (font) {
            assert(ansi[font]);
            s = ansi[font](s);
          }
          if (background) {
            assert(ansi[background]);
            s = ansi[background](s);
          }
          return s;
        },
        location: (_title: string, link: string, alt: string | undefined) => ansi.dim(alt ?? link),
        h1: ansi.bold.underline,
        h2: ansi.bold,
        h3: ansi.bold,
      },
      onerrorCb,
    );
  }
}

export const html2ansi = new HtmlStyleToAnsiColorTranslator();
