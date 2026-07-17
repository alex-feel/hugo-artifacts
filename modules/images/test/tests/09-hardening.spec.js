// Hardening regression contract (code-review fixes): hostile pass-through
// attribute VALUES are entity-escaped so no event handler can break out of
// the attribute (stored-XSS fix); non-positive and out-of-range numeric
// tokens (widths="0", quality="150", process=fill without both dimensions)
// degrade with a warning instead of crashing the build; unknown named
// shortcode parameters warn once and are ignored instead of vanishing
// silently; invalid gallery index_pad values warn once per value and tier
// and keep the fallback width; leading-zero integers parse as decimal
// instead of octal-crashing the cast; layout=fixed with only a height
// derives its width from the aspect ratio; a width-only passthrough never
// fabricates height="0"; the two-positional shortcode shorthand renders;
// the priority / eager / full loading rows emit their exact attribute
// sets; credit_from_meta surfaces the IPTC credit; a variant carrying an
// unparseable width/height warns once per media query and keeps rendering
// with the dimensions of its largest generated derivative; a top-level
// unparseable width warns naming the absent height; and a src-less variant
// is dropped with the absent src named.
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

test('an unknown named shortcode parameter warns once and never derails the render', () => {
  const picture = page.querySelector('#sc-typo-param');
  assert.ok(picture, 'the typo call still renders');
  assert.ok(picture.querySelector('img').getAttribute('srcset'), 'the pipeline runs normally');
  assert.equal(warnCount(/Ignoring the unknown image shortcode parameter "captoin"/), 1);
  assert.equal(warnCount(/Ignoring the unknown image-gallery shortcode parameter "cropp"/), 1);
  const typoGallery = page.querySelector('#gallery-typo');
  assert.equal(typoGallery.getAttribute('data-count'), '3', 'the gallery renders all items');
  const img = typoGallery.querySelector('img');
  assert.notEqual(
    img.getAttribute('width'),
    img.getAttribute('height'),
    'cropp= is dropped, so tiles stay uncropped',
  );
});

test('invalid index_pad values warn once per value and keep the fallback width', () => {
  const badpad = page.querySelector('#gallery-badpad');
  assert.ok(badpad, 'the gallery still renders');
  assert.equal(
    badpad.querySelector('li.image-gallery__item').getAttribute('data-index'),
    '1',
    'the pad falls back to the three-item count width',
  );
  assert.ok(page.querySelector('#gallery-badpad-2'), 'the twin bad call renders too');
  assert.equal(
    warnCount(/Ignoring index_pad value "zero"/),
    1,
    'deduplicated across both bad calls',
  );
  assert.equal(
    warnCount(/Ignoring gallery.index_pad value "nope"/),
    1,
    'the invalid page-tier value warns once for the whole page',
  );
});

test('leading-zero integers parse as decimal and never break the build', () => {
  const picture = page.querySelector('#sc-leadzero-widths');
  assert.ok(picture, 'widths="0640,0960" builds');
  const srcset = picture.querySelector('img').getAttribute('srcset');
  assert.ok(srcset.includes(' 640w'), '0640 parses as decimal 640');
  assert.ok(srcset.includes(' 960w'), '0960 parses as decimal 960, not as an invalid octal');
  const leadzero = page.querySelector('#gallery-leadzero');
  assert.equal(
    leadzero.querySelector('li.image-gallery__item').getAttribute('data-index'),
    '00000001',
    'index_pad="08" is decimal 8, not an octal parse error',
  );
});

test('layout=fixed with only a height derives the width from the aspect ratio', () => {
  const picture = page.querySelector('#sc-fixed-height');
  assert.ok(picture, 'the height-only fixed call renders');
  assert.equal(picture.getAttribute('data-layout'), 'fixed');
  const img = picture.querySelector('img');
  assert.equal(img.getAttribute('width'), '128', 'the square 512px source derives width=128');
  assert.equal(img.getAttribute('height'), '128');
  assert.match(img.getAttribute('srcset'), / 1x,.* 2x$/, 'density descriptors within the source');
  assert.equal(img.getAttribute('sizes'), undefined, 'fixed layout emits no sizes');
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

test('a variant with an unparseable width warns once per media query and keeps rendering', () => {
  const picture = page.querySelector('#variants-bad-dims picture');
  assert.ok(picture, 'the build did not fail on a non-numeric variant width');
  const source = picture.querySelector('source[media="(max-width: 480px)"]');
  assert.ok(source, 'the variant source still renders');
  // The degraded variant falls back to the dimensions of its largest
  // generated derivative; the 512px fixture source sits below the ladder
  // cap, so the derivative keeps the full 512.
  assert.equal(source.getAttribute('width'), '512', "the largest derivative's width applies");
  assert.equal(source.getAttribute('height'), '512', "the largest derivative's height applies");
  const narrow = picture.querySelector('source[media="(max-width: 320px)"]');
  assert.ok(narrow, 'the second broken variant renders too');
  assert.equal(
    warnCount(
      /Ignoring a non-numeric width\/height value on the variant with media "\(max-width: 480px\)"/,
    ),
    1,
  );
  assert.equal(
    warnCount(
      /Ignoring a non-numeric width\/height value on the variant with media "\(max-width: 320px\)"/,
    ),
    1,
    'a broken variant differing only by media query warns separately',
  );
  assert.equal(
    warnCount(/on the variant with media .+\(got width=abc height=absent\)/),
    2,
    'an absent height reads as "absent", never as "<nil>"',
  );
});

test('a top-level unparseable width warns once naming the absent height and keeps rendering', () => {
  const picture = page.querySelector('#sc-bad-dims');
  assert.ok(picture, 'the build did not fail on width="abc"');
  assert.ok(picture.querySelector('img').getAttribute('srcset'), 'the pipeline runs normally');
  assert.equal(
    warnCount(/Ignoring a non-numeric width\/height value \(got width=abc height=absent\)/),
    1,
  );
});

test('a variant without a src is dropped with the absent src named', () => {
  const picture = page.querySelector('#variants-bad-dims picture');
  assert.equal(
    picture.querySelectorAll('source[media="(max-width: 240px)"]').length,
    0,
    'the src-less variant emits no source element',
  );
  assert.equal(warnCount(/could not be resolved or processed \(got src=absent\)/), 1);
});
