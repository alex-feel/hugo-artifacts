// The headline strip as an HTML-to-text extractor reads it.
//
// THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT THE ORIGINAL REPORT. Every
// structural check on the strip passed while the defect was live: the
// separator element existed, carried the right classes, sat in the right
// place, and held an em dash. What the reader actually got was
// "...last 90— plus 7,934 private contributions", because the extractor trims
// each element and the separator's leading space had been deleted by the
// minifier. Nothing short of reading the strip the way that extractor does can
// see it.
//
// helpers.extractedText states the extractor model in full. The short version:
// a wrapper's text is trimmed (its indentation is layout, not content), a
// text-only leaf is taken verbatim (the separators exist for no other reason
// than to push their spacing into this layer), and the joined result has its
// whitespace runs collapsed. That last step is why the two builds must read
// IDENTICALLY -- and it can normalize a space away, never invent one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, headline, childNodes, extractedText} from './helpers.js';

// Every value here is static in the fixture's canned data. The identity
// section's tenure is the only wall-clock-dependent number the module renders,
// and it is not part of this strip.
const GROUPS = [
  '1.8k commits',
  '1.3k merged pull requests',
  // The external footprint counts every repository the person worked in,
  // including the one they only filed an issue on. That is correct, and it is
  // the counterpart to the language row excluding the same repository: the two
  // sections answer different questions and are supposed to disagree here.
  '20 external repositories',
  '5 organizations',
  '55 active days in the last 90',
  'A+ activity score',
];
const NOTE = 'plus 7,934 private contributions';
const EXPECTED = `${GROUPS.join(', ')} — ${NOTE}`;

for (const build of BUILDS) {
  test(`[${build.name}] the strip reads as one correctly separated sentence`, () => {
    assert.equal(extractedText(headline(build.dir).inner), EXPECTED);
  });

  test(`[${build.name}] the recency count, the note separator and the note are not glued`, () => {
    // The reviewer's report, stated as the exact ordered run it broke on.
    // Spelled out rather than derived from EXPECTED so that relaxing the
    // equality above cannot silently relax this too.
    const text = extractedText(headline(build.dir).inner);
    assert.match(
      text,
      /55 active days in the last 90, A\+ activity score — plus 7,934 private contributions/,
      `the strip read as ${JSON.stringify(text)}`,
    );
  });

  test(`[${build.name}] no word runs into the em dash from either side`, () => {
    // The failure shape itself, independent of the exact wording around it:
    // the em dash must never touch a non-space character. A translation that
    // changes the metric labels leaves this assertion meaningful.
    const text = extractedText(headline(build.dir).inner);
    assert.ok(!/\S—/.test(text), `something is glued to the LEFT of the em dash in ${text}`);
    assert.ok(!/—\S/.test(text), `something is glued to the RIGHT of the em dash in ${text}`);
  });

  test(`[${build.name}] every pair of metric groups is joined by ", "`, () => {
    // Per boundary rather than as one blanket "no comma touches a word" sweep:
    // the floor note's count is locale-grouped as 7,934, so a blanket sweep
    // would have to special-case digit grouping and would stop meaning what it
    // says. Each boundary is asserted where it actually is.
    const text = extractedText(headline(build.dir).inner);
    for (let i = 0; i + 1 < GROUPS.length; i += 1) {
      assert.ok(
        text.includes(`${GROUPS[i]}, ${GROUPS[i + 1]}`),
        `${GROUPS[i]} and ${GROUPS[i + 1]} are not joined by a comma and a space in ${text}`,
      );
    }
  });

  test(`[${build.name}] the strip's own text nodes carry no content`, () => {
    // The extractor collapses whitespace-only text nodes between children to a
    // single space. If the module ever emitted bare text directly inside the
    // section, that content would ride through this suite unchecked, so the
    // model's precondition is asserted rather than assumed.
    for (const node of childNodes(headline(build.dir).inner)) {
      if (node.type !== 'text') continue;
      assert.equal(
        node.raw.trim(),
        '',
        `the strip carries a bare text node ${JSON.stringify(node.raw)}`,
      );
    }
  });
}

test('both builds read identically in the text layer', () => {
  // The whole point of building the same fixture twice. The plain tree is the
  // control: whatever the minifier does to the published bytes, a reader must
  // get the same sentence out of either tree.
  const [plain, minified] = BUILDS.map((b) => extractedText(headline(b.dir).inner));
  assert.equal(minified, plain);
});
