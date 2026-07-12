// Hardening regression contract (code-review fixes): hostile pass-through
// attribute VALUES are entity-escaped so no event handler can break out of
// the attribute (stored-XSS fix); non-positive and out-of-range numeric
// tokens (widths="0", quality="150", process=fill without both dimensions)
// degrade with a warning instead of crashing the build; a width-only
// passthrough never fabricates height="0"; the two-positional shortcode
// shorthand renders; the priority / eager / full loading rows emit their
// exact attribute sets; and credit_from_meta surfaces the IPTC credit.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, rawHtml, warnCount} from './helpers.js';

const page = dom('bundle/index.html');
const raw = rawHtml('bundle/index.html');

test('a hostile pass-through attribute VALUE cannot break out into a live handler', () => {
  const img = page
    .querySelectorAll('img')
    .find((i) => i.getAttribute('alt') === 'XSS breakout probe');
  assert.ok(img, 'expected the XSS-breakout hook image');
  // The quote-bearing value stays inside one entity-escaped attribute; no
  // second attribute and no event handler materialize.
  assert.match(img.getAttribute('data-evil'), /^x" onerror="alert\(1\)" data-y="y$/);
  assert.equal(img.getAttribute('onerror'), undefined, 'no onerror handler is emitted');
  assert.equal(img.getAttribute('data-y'), undefined, 'the smuggled attribute never materializes');
  assert.equal(img.getAttribute('data-good'), 'plain value', 'a benign value still passes through');
  // At the byte level the quotes are entity-encoded and no live handler exists.
  assert.ok(raw.includes('data-evil="x&#34; onerror=&#34;alert(1)&#34; data-y=&#34;y"'));
  assert.ok(!raw.includes('onerror="alert'), 'no live onerror attribute in the output');
});

test('widths="0" degrades to the default ladder with one warning, never a crash', () => {
  const picture = page.querySelector('#sc-zero-widths');
  assert.ok(picture, 'the build did not fail on widths="0"');
  const img = picture.querySelector('img');
  assert.ok(img.getAttribute('srcset'), 'a valid srcset is still emitted');
  assert.ok(!img.getAttribute('srcset').includes(' 0w'), 'no zero-width candidate');
  assert.equal(warnCount(/Ignoring non-positive widths entry "0"/), 1);
});

test('an out-of-range quality degrades to the per-format default with one warning', () => {
  const picture = page.querySelector('#sc-quality-bomb');
  assert.ok(picture, 'the build did not fail on quality="150"');
  assert.ok(picture.querySelector('img').getAttribute('srcset'));
  assert.equal(warnCount(/Ignoring quality value "150"/), 1);
});

test('fit/fill/crop without both dimensions degrades to resize on the hook', () => {
  const img = page
    .querySelectorAll('img')
    .find((i) => i.getAttribute('alt') === 'Fill without width or height');
  assert.ok(img, 'the build did not fail on process=fill without a width');
  assert.ok(img.getAttribute('srcset'), 'a resize render is emitted instead');
  assert.equal(warnCount(/process="fill" requires BOTH width and height/), 1);
});

test('a width-only passthrough never fabricates height="0"', () => {
  const img = page.querySelector('#sc-svg-width');
  assert.ok(img, 'expected the width-only SVG passthrough');
  assert.match(img.getAttribute('class'), /\bimage--static\b/);
  // A width without a matching height reserves no box at all -- an
  // <img height="0"> would render as a zero-height box in every browser.
  assert.equal(img.getAttribute('width'), undefined, 'no lone width attribute');
  assert.equal(img.getAttribute('height'), undefined, 'and crucially no height="0"');
  assert.ok(!raw.includes('height="0"'), 'height="0" never appears anywhere');
});

test('the two-positional shortcode shorthand renders with its alt', () => {
  const img = page
    .querySelectorAll('img')
    .find((i) => i.getAttribute('alt') === 'A positional described scene');
  assert.ok(img, 'the {{< image "src" "alt" >}} shorthand must render');
  assert.ok(img.getAttribute('srcset'), 'it takes the full pipeline');
});

test('the priority hero row: eager, fetchpriority high, no decoding, no auto sizes, full', () => {
  const picture = page.querySelector('#sc-priority');
  assert.match(picture.getAttribute('class'), /\bimage--priority\b/);
  assert.equal(picture.getAttribute('data-layout'), 'full');
  const img = picture.querySelector('img');
  assert.equal(img.getAttribute('loading'), 'eager');
  assert.equal(img.getAttribute('fetchpriority'), 'high');
  assert.equal(img.getAttribute('decoding'), undefined, 'decoding is suppressed on the LCP hero');
  assert.equal(img.getAttribute('sizes'), '100vw', 'full layout emits 100vw');
  assert.ok(!img.getAttribute('sizes').startsWith('auto,'), 'no auto prefix on an eager image');
});

test('the eager non-priority row keeps decoding async and drops the auto prefix', () => {
  const img = page.querySelector('#sc-eager').querySelector('img');
  assert.equal(img.getAttribute('loading'), 'eager');
  assert.equal(img.getAttribute('decoding'), 'async', 'a non-priority eager image keeps decoding');
  assert.equal(img.getAttribute('fetchpriority'), undefined);
  assert.ok(!img.getAttribute('sizes').startsWith('auto,'), 'no auto prefix on an eager image');
});

test('credit_from_meta surfaces the original image IPTC Credit field', () => {
  const figure = page.querySelector('#sc-iptc-credit');
  assert.equal(figure.tagName, 'FIGURE', 'a credit line turns the render into a figure');
  const credit = figure.querySelector('.image__credit');
  assert.ok(credit, 'the IPTC credit renders as a credit element');
  assert.equal(credit.textContent, 'Stock Agency Credit', 'the IPTC Credit field wins');
});
