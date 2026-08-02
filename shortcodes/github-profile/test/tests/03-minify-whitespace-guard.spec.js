// The structural rule the fix consists of: inside the headline strip, no
// whitespace text node sits immediately before a closing tag.
//
// This is the guard that catches a revert the text layer cannot see. Only the
// wrapper directly before the note separator can move the published sentence,
// so reformatting any OTHER wrapper's closing tag onto its own line breaks the
// module's stated invariant while every text-layer assertion stays green --
// until the day a consumer turns off the rank or the merged-PR count and that
// wrapper becomes the last one before the note. The invariant is asserted
// directly instead of only through its currently-visible consequence.
//
// Byte-level throughout: an HTML parser discards the whitespace text nodes
// this file exists to count.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDS,
  page,
  headline,
  childNodes,
  allElements,
  isWrapper,
  elementsByClass,
} from './helpers.js';

for (const build of BUILDS) {
  test(`[${build.name}] every wrapper in the strip closes on its last child`, () => {
    // "Closes on the SAME line as its last child", read off the published
    // bytes: the wrapper's content ends AT a tag, with nothing between that
    // tag and the wrapper's own closing tag.
    const wrappers = allElements(headline(build.dir).inner).filter(isWrapper);
    assert.ok(wrappers.length >= 6, 'the fixture must render the full metric strip');

    for (const w of wrappers) {
      assert.ok(
        !/\s$/.test(w.inner),
        `<${w.name} class="${w.classes.join(' ')}"> ends with the whitespace ${JSON.stringify(w.inner.slice(-8))}; move its closing tag back onto its last child's line`,
      );
      assert.match(w.inner, />$/, `<${w.name}> must close directly on a tag, not on loose text`);
    }
  });

  test(`[${build.name}] each metric group's closing tag follows its label's`, () => {
    // The same rule stated as the literal byte pair it produces: </span></span>
    // with nothing in between. Every direct child of the strip that wraps
    // anything ends this way.
    for (const node of childNodes(headline(build.dir).inner)) {
      if (node.type !== 'element' || !isWrapper(node)) continue;
      assert.ok(
        node.outer.endsWith('</span></span>'),
        `${node.classes.join(' ')} ends with ${JSON.stringify(node.outer.slice(-24))}`,
      );
    }
  });

  test(`[${build.name}] the only whitespace before a closing tag is a separator's own`, () => {
    // A separator's trailing space belongs inside it: ", " and " — " both end
    // in one. Mask those elements out and NOTHING in the strip may have
    // whitespace immediately before a closing tag -- that is exactly the
    // newline-plus-indent the minifier trades for the separator's leading
    // space.
    const strip = headline(build.dir).inner;
    let masked = strip;
    for (const sep of elementsByClass(strip, 'github-profile__sep')) {
      masked = masked.split(sep.outer).join('<span></span>');
    }
    const offenders = [...masked.matchAll(/\s+<\//g)].map((m) =>
      JSON.stringify(masked.slice(Math.max(0, m.index - 40), m.index + 10)),
    );
    assert.deepEqual(offenders, [], 'whitespace immediately before a closing tag');
  });
}

test('the rank group, the note separator and the note are one unbroken run', () => {
  // The exact byte boundary the defect lived on, asserted as one literal in
  // BOTH trees. It reads the same in either because the minifier keeps the
  // quotes on a two-token class value, so a single literal covers both builds
  // and there is no build-specific spelling to keep in sync.
  for (const build of BUILDS) {
    assert.ok(
      page(build.dir).includes(
        '>activity score</span></span><span class="github-profile__sep github-profile__sep--note"> — </span>',
      ),
      `[${build.name}] the rank wrapper must close directly on its label, with the separator immediately after`,
    );
  }
});

test('the minified build glues the floor note straight onto the separator', () => {
  // The minified tree alone: with the pretty-printing whitespace gone, the
  // separator's own trailing space is the ONLY thing between the em dash and
  // the note. If the note ever acquires a leading whitespace node of its own,
  // the minifier deletes it and this literal changes.
  assert.ok(
    page(BUILDS[1].dir).includes(
      '<span class="github-profile__sep github-profile__sep--note"> — </span><span class=github-profile__floor-note',
    ),
  );
});
