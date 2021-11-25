import * as sms from 'source-map-support';
sms.install(); // maps exception location js -> ts

import * as assert from 'assert';
import * as path from 'path';
import { html2ansi, html2mkarkdown } from '../../src/util/HtmlStyleTranslator';

describe.only(path.basename(__filename), function () {
  context('HtmlStyleToMarkdownTranslator', async function () {
    const md = html2mkarkdown;

    it('works', function () {
      assert.strictEqual(md.translate('apple'), 'apple');
      assert.strictEqual(md.translate('apple'.bold()), '**apple**');
      assert.strictEqual(md.translate('apple'.italics()), '*apple*');
      assert.strictEqual(md.translate('apple'.bold().italics()), '***apple***');
    });
  });

  context('HtmlStyleToAnsiColorTranslator', async function () {
    const md = html2ansi;

    it('works', function () {
      assert.strictEqual(md.translate('apple'), 'apple');
      assert.strictEqual(md.translate('apple'.bold()), '\x1B[1mapple\x1B[22m');
      assert.strictEqual(md.translate('apple'.italics()), '\x1B[3mapple\x1B[23m');
      assert.strictEqual(md.translate('apple'.bold().italics()), '\x1B[1m\x1B[3mapple\x1B[23m\x1B[22m');
    });
  });
});
