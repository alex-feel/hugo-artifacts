/* global process */
// The generated-image hook: params.seo.image_partial names a partial that
// composes a per-page image at build time, and the resolver consults it after
// every declared and bundled candidate has failed to resolve but before the
// site-wide default_image.
//
// Two things about that placement are invisible unless a build carries both a
// hook and a default image, which is why the `generated` environment sets
// both. A hook that ranked BELOW default_image would never fire on a site that
// has one -- the case worth having a hook for -- and every assertion of the
// form "an og:image is present" passes either way. A hook that joined the
// candidate list instead of the fallback tier would attach a synthetic card to
// pages that already have a photograph of their own, quietly, in JSON-LD
// where nobody looks.
//
// The third invisible one is the payload. The card draws the RESOLVED title,
// so a page whose seo.title overrides its .Title publishes one headline in
// og:title and would draw the other if the hook were handed the raw value --
// the same two-authorities-for-one-value defect the site-name resolver exists
// to prevent, except here half of it lives in pixels. The fixture partial
// records what it received in a JSON sidecar beside each card, so the
// comparison is against verbatim strings rather than against a reimplementation
// of urlize.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {
  configuredDir,
  generatedDir,
  publicDir,
  rawHtml,
  subpathDir,
  warnCount,
  PAGES,
} from './helpers.js';

const SITE = 'https://seo-fixture.example';
const DEFAULT_IMAGE = `${SITE}/img/og-default.png`;

// One decoding pass, not a chain of replaces: the fixture carries a page
// titled `Article "quoted" & <angle>`, Hugo writes its double quotes as the
// NUMERIC reference &#34; inside an attribute, and a chain that expanded &amp;
// before or after the numeric form would decode its own output.
const NAMED = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};

function meta(html, property) {
  const m = html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`));
  if (!m) return undefined;
  return m[1].replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) return String.fromCodePoint(Number(body.slice(1)));
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

function jsonldNodes(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
}

// Every published HTML document of a tree, so a claim about what a tree does
// NOT contain is made against all of it rather than a sampled page.
function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, {recursive: true, withFileTypes: true})) {
    if (entry.isFile() && entry.name.endsWith('.html'))
      out.push(join(entry.parentPath, entry.name));
  }
  return out;
}

// The sidecar the fixture hook writes for the page published at this file:
// public/generated/blog/post/index.html -> public/generated/cards/blog/post/
// payload.json. Deriving it from the DOCUMENT's path rather than from the card
// URL is deliberate -- it also proves the hook was handed the page whose head
// the card ended up in.
function payloadFor(file) {
  const rel = relative(generatedDir, dirname(file));
  return join(generatedDir, 'cards', rel, 'payload.json');
}

test('the generated card answers before the site-wide default image', () => {
  // The environment sets BOTH keys, so this is a ranking assertion rather than
  // an availability one: the default is right there and did not win.
  const html = rawHtml(PAGES.page, generatedDir);
  const image = meta(html, 'og:image');
  assert.ok(image.startsWith(`${SITE}/cards/page/`), `og:image is the generated card: ${image}`);
  assert.notEqual(image, DEFAULT_IMAGE);
  assert.equal(meta(html, 'og:image:secure_url'), image);
  assert.equal(meta(html, 'og:image:type'), 'image/png');
  assert.equal(meta(html, 'og:image:width'), '1200');
  assert.equal(meta(html, 'og:image:height'), '630');
  assert.ok(meta(html, 'og:image:alt'), 'and the alt chain still ran');
});

test('a generated resource reaches JSON-LD as a real ImageObject, like a bundled one', () => {
  // The point of returning a Resource rather than a URL: the normalizer treats
  // it exactly as it treats a page-bundle image, so the structured data carries
  // dimensions instead of a bare string. The subject is primaryImageOfPage,
  // which is where a WebPage node puts its one representative image.
  const html = rawHtml(PAGES.page, generatedDir);
  const pages = jsonldNodes(html).filter((n) => n['@type'] === 'WebPage');
  assert.equal(pages.length, 1);
  const image = pages[0].primaryImageOfPage;
  assert.equal(image['@type'], 'ImageObject');
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
  assert.equal(image.url, meta(html, 'og:image'));
});

test('the hook is handed the RESOLVED title, not the page title it overrides', () => {
  // The `generated` environment cascades an seo.title onto this one page, so
  // the two candidate strings are different here and only here. Without that
  // cascade every fixture page resolves a title equal to its .Title and a hook
  // handed the wrong one of the two would look identical.
  const file = join(generatedDir, PAGES.page);
  const html = readFileSync(file, 'utf8');
  assert.equal(meta(html, 'og:title'), 'Cascaded Card Headline', 'the override is in force');
  const payload = JSON.parse(readFileSync(payloadFor(file), 'utf8'));
  assert.equal(payload.title, 'Cascaded Card Headline');
  assert.notEqual(payload.title, 'A Regular Page', 'never the raw .Title it replaced');
});

test('every card in the tree was composed from the exact strings its page published', () => {
  // The whole-tree form: a hook handed some other string -- the site title, the
  // summary, an untruncated or differently-resolved description -- records a
  // payload that stops matching the page the card ended up on.
  let cards = 0;
  for (const file of htmlFiles(generatedDir)) {
    const html = readFileSync(file, 'utf8');
    const image = meta(html, 'og:image');
    if (!image || !image.includes('/cards/')) continue;
    cards += 1;
    const sidecar = payloadFor(file);
    assert.ok(existsSync(sidecar), `${file}: the hook ran but left no payload at ${sidecar}`);
    const payload = JSON.parse(readFileSync(sidecar, 'utf8'));
    assert.equal(payload.title, meta(html, 'og:title'), `${file}: title handed to the hook`);
    assert.equal(
      payload.description,
      meta(html, 'og:description'),
      `${file}: description handed to the hook`,
    );
  }
  assert.ok(cards >= 10, `the sweep actually visited card-bearing pages (saw ${cards})`);
});

test('a page carrying its own image gets no card anywhere on it', () => {
  // Not just "og:image is the cover": a hook appended to the candidate list
  // rather than consulted as a fallback tier would leave og:image alone and
  // still push the card into the JSON-LD image surface.
  const html = rawHtml(PAGES.decodableRaster, generatedDir);
  assert.match(meta(html, 'og:image'), /\/decodable-raster\/cover_hu[^"]*\.png$/);
  assert.ok(!html.includes('/cards/'), 'and the card appears in no surface of the document');
  assert.ok(
    !existsSync(payloadFor(join(generatedDir, PAGES.decodableRaster))),
    'the hook was never even invoked for it',
  );
});

test('a page the generator declines still falls through to the default image', () => {
  // The fixture partial returns nothing for the promo section, standing in for
  // a generator with no template for some page kind. Dropping the image
  // entirely, or publishing a half-made card, would both be worse than the
  // banner the site already configured.
  const html = rawHtml(PAGES.promo, generatedDir);
  assert.equal(meta(html, 'og:image'), DEFAULT_IMAGE);
  assert.ok(!html.includes('/cards/'), 'nothing generated leaked onto it');
});

test("an author's Person.image is never a generated card", () => {
  // Both halves on ONE document: the page's own share image is a card, while
  // the Person node describing its author keeps the portrait path. A social
  // card is a picture of a page, never a photograph of a human, and
  // resolve/author.html asks for the author page's images WITHOUT the payload
  // that enables the hook.
  const html = rawHtml(PAGES.blogPost, generatedDir);
  assert.ok(meta(html, 'og:image').includes('/cards/'), 'the page itself did get a card');
  const article = jsonldNodes(html).find((n) => n['@type'] === 'BlogPosting');
  assert.equal(article.author.length, 1);
  assert.equal(article.author[0]['@type'], 'Person');
  assert.equal(article.author[0].image, DEFAULT_IMAGE);
});

test('a hook pointed at a partial that does not exist warns once and generates nothing', () => {
  // The typo a consumer makes once. Without the templates.Exists guard the
  // lookup aborts the build on the first page rendered, so the `configured`
  // tree existing at all is half of this assertion.
  assert.equal(
    warnCount(/Ignoring seo\.image_partial "nowhere\/no-such-card\.html"/, 'configured'),
    1,
    'exactly one warning, keyed by the offending value',
  );
  assert.match(
    readFileSync(process.env.HUGO_BUILD_LOG_CONFIGURED, 'utf8'),
    /no template exists at "_partials\/nowhere\/no-such-card\.html"/,
    'and it names the path it actually looked up, which is where the _partials/ prefix goes',
  );
  for (const file of htmlFiles(configuredDir)) {
    assert.ok(!readFileSync(file, 'utf8').includes('/cards/'), `${file} published a card`);
  }
});

test('a hook written as a list warns once and is treated as unset', () => {
  // A partial path is one string. `with` treats a populated list as present, so
  // the value really does reach the lookup rather than being skipped upstream --
  // and a list stringified into a template name would be looked up as Go's
  // debug form.
  assert.equal(
    warnCount(/Ignoring seo\.image_partial: it expects a partial path/, 'subpath'),
    1,
    'exactly one warning',
  );
  const html = rawHtml(PAGES.page, subpathDir);
  assert.equal(
    meta(html, 'og:image'),
    `${SITE}/docs/img/og-default.png`,
    'the site default still answers, so only the warning tells the consumer their key did nothing',
  );
});

test('an unconfigured hook is inert', () => {
  // The absent-safe half of the contract, stated as the suite sees it: the
  // baseline environment names no image_partial at all.
  assert.equal(warnCount(/image_partial/), 0, 'no diagnostic on a build that configures none');
  for (const file of htmlFiles(publicDir)) {
    assert.ok(!readFileSync(file, 'utf8').includes('/cards/'), `${file} published a card`);
  }
});
