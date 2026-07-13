/* global Buffer */
// Feature surfaces: figure/caption/credit/license with the image__meta
// grouping, the capped lightbox anchor, both dark-variant strategies with
// the swap-span display modifier, root_class placement on the root element,
// art-direction variants with combined dark queries, the preload pair plus
// the passthrough preload link, the value-returning src feed, both
// placeholder modes, and the per-page kill switch.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, rawHtml, publishedNonEmpty} from './helpers.js';

const page = dom('bundle/index.html');
const raw = rawHtml('bundle/index.html');

test('figcaption carries the three caption elements with rendered inline Markdown', () => {
  const figure = page.querySelector('#sc-figure');
  assert.equal(figure.tagName, 'FIGURE');
  const area = figure.querySelector('figcaption.image__caption-area');
  const caption = area.querySelector('span.image__caption');
  assert.match(caption.innerHTML, /<em>fine<\/em>/);
  const meta = area.querySelector('span.image__meta');
  assert.ok(meta, 'credit and license group inside the image__meta wrapper');
  assert.equal(
    meta.querySelector('span.image__caption'),
    null,
    'the caption stays outside the meta group',
  );
  const credit = meta.querySelector('span.image__credit');
  assert.match(credit.innerHTML, /<strong>Jane<\/strong>/);
  const separator = meta.querySelector('span.image__meta-separator');
  assert.ok(separator, 'credit and license both present, so the separator hook exists');
  assert.equal(separator.getAttribute('aria-hidden'), 'true');
  assert.equal(separator.textContent, '', 'the separator is an empty hook; CSS supplies the glyph');
  const license = meta.querySelector('a.image__license');
  assert.equal(license.getAttribute('rel'), 'license');
  assert.equal(license.textContent, 'CC BY 4.0');
  assert.ok(!raw.includes('aria-describedby'), 'figure semantics are the only association');
});

test('the lightbox anchor targets the capped derivative with intrinsic dimensions', () => {
  const anchor = page.querySelector('#sc-figure a.image__link');
  assert.equal(anchor.getAttribute('href'), anchor.getAttribute('data-full-src'));
  assert.equal(anchor.getAttribute('data-full-width'), '1600', 'capped at min(1600, 2048)');
  assert.equal(anchor.getAttribute('data-full-height'), '900');
  assert.ok(publishedNonEmpty(anchor.getAttribute('href')));
});

test('media-strategy dark pair: dark sources first, every element theme-tagged', () => {
  const picture = page.querySelector('#sc-dark-media');
  const sources = picture.querySelectorAll('source');
  assert.equal(sources.length, 3);
  assert.equal(sources[0].getAttribute('media'), '(prefers-color-scheme: dark)');
  assert.equal(sources[0].getAttribute('type'), 'image/webp');
  assert.equal(sources[1].getAttribute('media'), '(prefers-color-scheme: dark)');
  assert.equal(sources[1].getAttribute('type'), undefined, 'the dark original-format source');
  assert.equal(sources[2].getAttribute('media'), undefined);
  assert.equal(sources[2].getAttribute('type'), 'image/webp');
  assert.equal(sources[0].getAttribute('data-theme-variant'), 'dark');
  assert.equal(sources[1].getAttribute('data-theme-variant'), 'dark');
  assert.equal(sources[2].getAttribute('data-theme-variant'), 'light');
  assert.equal(picture.querySelector('img').getAttribute('data-theme-variant'), 'light');
});

test('class-strategy dark pair: two trees, both lazy, same alt, roots tagged only', () => {
  const span = page.querySelector('#sc-dark-class');
  assert.equal(span.getAttribute('data-theme-swap'), 'class');
  assert.match(span.getAttribute('class'), /\bimage--theme-class\b/);
  assert.match(
    span.getAttribute('class'),
    /\bimage--swap-block\b/,
    'the bare swap span declares its display context',
  );
  const trees = span.querySelectorAll('picture');
  assert.equal(trees.length, 2);
  assert.equal(trees[0].getAttribute('data-theme-variant'), 'light');
  assert.equal(trees[1].getAttribute('data-theme-variant'), 'dark');
  assert.match(trees[0].getAttribute('class'), /\bimage__picture--light\b/);
  assert.match(trees[1].getAttribute('class'), /\bimage__picture--dark\b/);
  const imgs = trees.map((t) => t.querySelector('img'));
  assert.equal(imgs[0].getAttribute('alt'), imgs[1].getAttribute('alt'));
  for (const img of imgs) assert.equal(img.getAttribute('loading'), 'lazy');
  for (const tree of trees) {
    for (const el of [...tree.querySelectorAll('source'), tree.querySelector('img')]) {
      assert.equal(el.getAttribute('data-theme-variant'), undefined, 'roots only');
    }
  }
});

test('root_class lands on the root element only, after the module classes', () => {
  const picture = page.querySelector('#sc-root-class');
  assert.equal(picture.tagName, 'PICTURE', 'the default render roots on the picture');
  assert.match(
    picture.getAttribute('class'),
    /\bimage\b.*\bhero-frame\b/,
    'the block class precedes the consumer class',
  );
  assert.ok(
    !picture.querySelector('img').getAttribute('class').includes('hero-frame'),
    'root_class never leaks onto the img',
  );
  const figure = page.querySelector('#sc-root-class-figure');
  assert.equal(figure.tagName, 'FIGURE', 'a caption promotes the figure to root');
  assert.match(
    figure.getAttribute('class'),
    /\bimage\b.*\bframe highlight$/,
    'multiple classes append verbatim and close the class list',
  );
  assert.equal(
    figure.querySelector('picture').getAttribute('class'),
    'image__picture',
    'the inner tree stays clean',
  );
});

test('variants emit combined dark queries first, own dimensions, base sources last', () => {
  const picture = page.querySelector('#variants-demo picture');
  const sources = picture.querySelectorAll('source');
  const medias = sources.map((s) => s.getAttribute('media'));
  const combined = '(prefers-color-scheme: dark) and (max-width: 600px)';
  assert.equal(medias[0], combined, 'the per-variant dark source leads its group');
  const firstLight = medias.indexOf('(max-width: 600px)');
  const lastCombined = medias.lastIndexOf(combined);
  assert.ok(lastCombined < firstLight, 'variant dark sources precede their light siblings');
  const firstBaseDark = medias.indexOf('(prefers-color-scheme: dark)');
  assert.ok(firstBaseDark > firstLight, 'base dark sources come after every variant group');
  assert.equal(medias[medias.length - 1], undefined, 'base light sources close the source list');
  for (const s of sources.slice(0, firstBaseDark)) {
    assert.ok(s.getAttribute('width'), 'every variant source reserves its own box');
    assert.ok(s.getAttribute('height'));
  }
});

test('the preload pair is media-qualified and never carries the auto prefix', () => {
  const pair = page
    .querySelectorAll('link[rel="preload"]')
    .filter((l) => l.getAttribute('imagesrcset'));
  assert.equal(pair.length, 2);
  assert.equal(pair[0].getAttribute('media'), '(prefers-color-scheme: light)');
  assert.equal(pair[1].getAttribute('media'), '(prefers-color-scheme: dark)');
  for (const link of pair) {
    assert.equal(link.getAttribute('as'), 'image');
    assert.equal(link.getAttribute('type'), 'image/webp');
    assert.equal(link.getAttribute('fetchpriority'), 'high');
    assert.ok(link.getAttribute('imagesrcset').includes(' 480w,'));
    assert.ok(!link.getAttribute('imagesizes').startsWith('auto,'));
  }
});

test('a passthrough preload source emits one plain-href link without a ladder', () => {
  const plain = page
    .querySelectorAll('link[rel="preload"]')
    .filter((l) => !l.getAttribute('imagesrcset'));
  assert.equal(plain.length, 1, 'exactly the SVG link joins the responsive pair');
  const link = plain[0];
  assert.match(link.getAttribute('href'), /diagram\.svg$/);
  assert.equal(link.getAttribute('as'), 'image');
  assert.equal(link.getAttribute('fetchpriority'), 'high');
  assert.equal(link.getAttribute('type'), undefined, 'no derivative ladder means no type hint');
  assert.equal(link.getAttribute('imagesizes'), undefined);
  assert.equal(link.getAttribute('media'), undefined);
});

test('images/src.html returns an existing published derivative with dimensions', () => {
  const demo = page.querySelector('#src-demo');
  const url = demo.getAttribute('data-hero-src');
  assert.ok(publishedNonEmpty(url), `missing derivative ${url}`);
  assert.equal(demo.getAttribute('data-hero-width'), '800');
  assert.equal(demo.getAttribute('data-hero-height'), '450');
  assert.equal(demo.getAttribute('data-hero-type'), 'image/png');
});

test('dominant placeholder emits measured color data on the root', () => {
  const picture = page.querySelector('#sc-ph-dominant');
  assert.match(picture.getAttribute('class'), /\bimage--placeholder-dominant\b/);
  assert.equal(picture.getAttribute('data-placeholder'), 'dominant');
  assert.match(picture.getAttribute('data-dominant-color'), /^#[0-9a-f]{6}$/);
  assert.match(picture.getAttribute('data-dominant-luminance'), /^\d\.\d\d$/);
  assert.match(picture.getAttribute('style'), /--image-dominant-color: #[0-9a-f]{6}/);
});

test('blur placeholder inlines a decodable WebP data URI custom property', () => {
  const picture = page.querySelector('#sc-ph-blur');
  assert.match(picture.getAttribute('class'), /\bimage--placeholder-blur\b/);
  assert.equal(picture.getAttribute('data-placeholder'), 'blur');
  const style = picture.getAttribute('style').replaceAll('&#39;', "'");
  const m = style.match(/--image-placeholder: url\('data:image\/webp;base64,([A-Za-z0-9+/=]+)'\)/);
  assert.ok(m, 'expected the blur custom property');
  const bytes = Buffer.from(m[1], 'base64');
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP');
});

test('the per-page kill switch renders the neutral fallback everywhere', () => {
  const disabledRaw = rawHtml('disabled/index.html');
  assert.ok(!disabledRaw.includes('<picture'), 'no picture on the disabled page');
  assert.ok(!disabledRaw.includes('srcset'), 'no srcset on the disabled page');
  assert.ok(!disabledRaw.includes('_hu'), 'no derivative references on the disabled page');
  const disabled = dom('disabled/index.html');
  const img = disabled.querySelector('#disabled-img');
  assert.equal(img.getAttribute('src'), '/images/global-1200.png');
  assert.match(img.getAttribute('class'), /\bimage--static\b/);
});
