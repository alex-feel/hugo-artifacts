// The encoded format, read out of the bytes.
//
// A card's format is claimed in three places -- the resolved options, the
// Resource's media type, and the file name -- and all three can agree while
// the file itself is something else, because the extension is chosen by
// Hugo's naming rather than by the encoder. The frame header is the only one
// of the four that cannot be wrong.
//
// The quality assertion is comparative, never a byte count. Two sections
// cascade the same template over the same title at two different qualities,
// so the only variable between them is the number under test, and the
// relationship holds whatever the encoder does to absolute sizes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredDir, records, cardBytes, cardExists} from './helpers.js';
import {sniff} from './lib/raster.js';

test('a section that cascades a lossy format publishes that format', () => {
  const rec = records(configuredDir).get('/jpeg/sample');
  assert.equal(rec.opts.format, 'jpeg', 'the cascade reached the resolver');
  assert.equal(rec.opts.quality, 85);
  assert.equal(rec.cards.length, 1);
  const card = rec.cards[0];
  assert.equal(card.mediaType, 'image/jpeg');
  assert.ok(cardExists(configuredDir, card.url), `the URL names a real file: ${card.url}`);
  const head = sniff(cardBytes(configuredDir, card.url));
  assert.equal(head.format, 'jpeg', 'and the bytes are a JPEG frame, not a renamed PNG');
  assert.equal(head.width, 1200);
  assert.equal(head.height, 630);
});

test('the quality that was configured is the quality that was encoded', () => {
  // Same template, same title, same canvas; only the quality differs. A module
  // that dropped the quality token, or emitted it for the wrong format, would
  // publish two files of the same size.
  const all = records(configuredDir);
  const high = all.get('/jpeg/sample');
  const low = all.get('/jpeg-low/sample');
  assert.equal(high.title, low.title, 'the two pages draw the same words');
  assert.equal(high.opts.quality, 85);
  assert.equal(low.opts.quality, 20);
  const highBytes = cardBytes(configuredDir, high.cards[0].url).length;
  const lowBytes = cardBytes(configuredDir, low.cards[0].url).length;
  assert.ok(
    lowBytes < highBytes,
    `the lower quality encodes smaller: ${lowBytes} against ${highBytes} bytes`,
  );
});

test('a page that configures no format gets the shipped lossless one', () => {
  // The mechanical default, and the reason the format assertions above are
  // about a cascade rather than about the module: everything else in the tree
  // is a PNG because nothing asked for anything else.
  const rec = records(configuredDir).get('/blog/short');
  assert.equal(rec.opts.format, 'png');
  assert.equal(rec.cards[0].mediaType, 'image/png');
  assert.equal(sniff(cardBytes(configuredDir, rec.cards[0].url)).format, 'png');
});

test('the quality token never reaches a lossless encode', () => {
  // A PNG carries no quality, so a module emitting one would either error or
  // silently produce a differently named derivative. Every PNG card in the
  // tree sniffing as a PNG at the configured size is what says it did not.
  let pngs = 0;
  for (const [path, rec] of records(configuredDir)) {
    for (const card of rec.cards) {
      if (card.mediaType !== 'image/png') continue;
      pngs += 1;
      const head = sniff(cardBytes(configuredDir, card.url));
      assert.equal(head.format, 'png', `${path}: ${card.url}`);
      assert.equal(head.bitDepth, 8, `${path}: ${card.url}`);
      assert.equal(head.interlace, 0, `${path}: ${card.url}`);
    }
  }
  assert.ok(pngs > 20, `every lossless card was read: ${pngs}`);
});
