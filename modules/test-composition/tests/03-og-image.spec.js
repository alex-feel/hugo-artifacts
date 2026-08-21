/* global process */
// The generated social card, from the module that composes it to the tag that
// publishes it.
//
// Each of the two modules involved is proven alone by its own suite, and
// neither one can show this. The og-image suite composes cards and reads their
// pixels, but nothing in that fixture publishes a tag. The seo suite proves the
// `params.seo.image_partial` hook against a deliberately minimal stand-in
// partial of its own -- which is what keeps that suite a test of the HOOK
// rather than of any particular supplier, and is why the stand-in stays there
// instead of being swapped for the real module. So "a real generated card
// reached og:image" is a property of the two modules TOGETHER, and this file is
// the only place it can be observed.
//
// The assertions read published bytes rather than published tags wherever the
// tag is the thing in question: `og:image` naming a URL says nothing about
// whether a file exists there, what size it is, or what it was composed on.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodePng, hex, inkBands, pixel, sniffPng} from './lib/raster.js';

const here = dirname(fileURLToPath(import.meta.url));
const testRoot = resolve(here, '..');
const modulesRoot = resolve(testRoot, '..');
const fixtureDir = join(testRoot, 'fixture');
const publicDir = resolve(process.env.FIXTURE_PUBLIC ?? join(fixtureDir, 'public'));

const BASE_URL = 'https://composition.example';
const BANNER = `${BASE_URL}/img/site-banner.png`;

const documentAt = (relPath) => readFileSync(join(publicDir, relPath, 'index.html'), 'utf8');

const meta = (html, property) => {
  const match = new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html);
  return match?.[1] ?? '';
};

// The published file a card URL names. Every card in this fixture is a
// derivative of the one committed base raster, so its published name carries
// that base's name plus Hugo's content-addressed infix.
const isCardUrl = (url) => url.startsWith(`${BASE_URL}/og/card-base_hu_`);
const fileOf = (url) => join(publicDir, url.slice(BASE_URL.length));
const cardOf = (relPath) => {
  const url = meta(documentAt(relPath), 'og:image');
  assert.ok(isCardUrl(url), `${relPath} must publish a composed card as og:image, got ${url}`);
  return url;
};

const readCard = (url) => decodePng(readFileSync(fileOf(url)));

// Every published HTML document in the tree, so the uniqueness assertion is
// exhaustive over what Hugo really built rather than over a list someone
// remembered to update.
const documents = (dir = publicDir, out = []) => {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) documents(full, out);
    else if (entry.name === 'index.html') out.push(readFileSync(full, 'utf8'));
  }
  return out;
};

// The two halves of the card story that only the output directory tells. A tag
// names one card; the directory says how many the build actually wrote, and the
// gap between them is a file a site pays to deploy and nothing ever requests.
const cardFiles = () => readdirSync(join(publicDir, 'og')).sort();

const cardNames = () =>
  documents()
    .map((html) => meta(html, 'og:image'))
    .filter(isCardUrl)
    .map((url) => url.slice(`${BASE_URL}/og/`.length));

test('a generated card outranks the site banner as og:image', () => {
  // The fixture configures BOTH keys. `image_partial` alone could not show the
  // hook's rank, because with no site default every "an og:image is present"
  // assertion passes either way; `default_image` alone could not show that a
  // card ever displaces it. Ranked correctly, a per-page card beats the one
  // banner a whole site shares.
  const url = meta(documentAt('blog/post'), 'og:image');
  assert.ok(isCardUrl(url), `og:image must be the composed card, got ${url}`);
  assert.notEqual(url, BANNER);
  // og:image:secure_url and twitter:image are fed from the same resolved
  // value, so a card that reached one tag and not the others would be a
  // half-crossed boundary.
  assert.equal(meta(documentAt('blog/post'), 'og:image:secure_url'), url);
});

test('the URL that card names is a 1200x630 PNG on disk', () => {
  // The assertion no single-module fixture can make: the seo suite has no real
  // composer behind its hook, and the og-image suite publishes no URL to
  // follow. Sniffed from the leading bytes rather than trusted from the tag,
  // because the tag is exactly what is under test.
  const url = cardOf('blog/post');
  assert.ok(existsSync(fileOf(url)), `${url} must name a file in the published tree`);
  const head = sniffPng(readFileSync(fileOf(url)));
  assert.equal(head.format, 'png');
  assert.equal(head.width, 1200);
  assert.equal(head.height, 630);
});

test('the card was composed on the base raster THIS site configured', () => {
  // The corner pixel is where a card names its origin. The expected value is
  // decoded from the committed asset rather than written here as a literal, so
  // the assertion says "the card came from the raster this site configured"
  // rather than "the card is this shade of green" -- and changing the fixture's
  // base changes both sides together.
  const base = pixel(decodePng(readFileSync(join(fixtureDir, 'assets/og/card-base.png'))), 0, 0);
  const card = readCard(cardOf('blog/post'));
  assert.equal(hex(pixel(card, 0, 0)), hex(base));
});

test('the tag and the pixels describe the same page', () => {
  // A card carries its page's words in pixels no tag assertion can read, and a
  // generator that drew the wrong page's title -- or the same title on every
  // card -- would satisfy every assertion above. Two pages whose og:title
  // lengths differ must produce cards whose first ink band differs the same
  // way. Measured as an ink extent, so nothing here reimplements urlize, reads
  // a glyph, or depends on a font's metrics.
  const shortTitle = meta(documentAt('blog/post'), 'og:title');
  const longTitle = meta(documentAt('blog/long-title'), 'og:title');
  assert.ok(longTitle.length > shortTitle.length, 'the fixture titles must differ in length');

  const bandOf = (relPath) => {
    const bands = inkBands(readCard(cardOf(relPath)));
    assert.ok(bands.length > 0, `${relPath}'s card must carry drawn text`);
    return bands[0];
  };
  const short = bandOf('blog/post');
  const long = bandOf('blog/long-title');
  assert.ok(
    long.right - long.left > short.right - short.left,
    `the longer title must draw the wider band (${long.right - long.left} vs ${short.right - short.left})`,
  );
  // Both bands start at the x the template configured, which is what makes the
  // right edge alone a fair comparison.
  assert.ok(Math.abs(long.left - short.left) <= 4, 'both cards draw from the same left anchor');
});

test('a RESOURCE crossed the hook, not a string naming one', () => {
  // This is what the dimensions are evidence OF. A hook handing back a path
  // publishes a URL and nothing else -- the seo module fabricates no
  // dimensions for a bare string -- so og:image:width/height and the
  // dimensioned JSON-LD image node exist only because a real image resource
  // was returned and normalized like any declared candidate.
  const html = documentAt('blog/post');
  const url = cardOf('blog/post');
  assert.equal(meta(html, 'og:image:width'), '1200');
  assert.equal(meta(html, 'og:image:height'), '630');
  assert.equal(meta(html, 'og:image:type'), 'image/png');

  const jsonld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(jsonld, 'the seo module must publish a JSON-LD block');
  const data = JSON.parse(jsonld[1]);
  assert.equal(data.primaryImageOfPage?.url, url, 'the structured data names the same card');
  assert.equal(data.primaryImageOfPage?.width, 1200);
  assert.equal(data.primaryImageOfPage?.height, 630);
});

test('a page the generator declines falls through to the site banner', () => {
  // The decline half of the contract, end to end. `[params.ogcard]` routes the
  // home page and the blog section and nothing else, so /search/ reaches a
  // generator that has no template for it. Declining is SILENT by contract, so
  // the only published evidence is what the page carries instead: the site
  // banner, and no trace of a card anywhere in the document.
  const html = documentAt('search');
  assert.equal(meta(html, 'og:image'), BANNER);
  assert.ok(
    !html.includes('/og/card-base_hu_'),
    'a declining page must carry no card path in any tag or structured-data node',
  );
});

test('each carded page carries its own card', () => {
  // A generator that memoized too aggressively -- one card reused across
  // pages -- would still publish a card everywhere and satisfy every
  // assertion above. This fixture contains no two pages with identical drawn
  // text, so every card URL in the tree must be distinct.
  const cards = cardNames();
  assert.ok(cards.length >= 3, 'the fixture must publish more than a couple of cards');
  assert.equal(new Set(cards).size, cards.length, `card URLs must be unique: ${cards.join(', ')}`);
});

test('at the default canvas each card is published once and nothing beside it', () => {
  // The og short-circuit, read off the output directory rather than off a tag.
  // The seo module crops whatever the hook returns to 1200x630 and skips the
  // crop for an image that already measures exactly that, so at og-image's own
  // default canvas the composed card IS the file og:image names. Without the
  // skip every carded page ships two files holding the same pixels: the
  // composed card, which og-image publishes by reading its URL to materialize
  // the transformation, and seo's crop, which is what the tag would name. That
  // is what a non-default canvas still costs, where the skip correctly does not
  // fire and this fixture's four cards publish as eight files.
  //
  // A set equality rather than a count, because the two ways this can fail are
  // opposite: an extra file is a duplicate nothing requests, and a missing one
  // is a tag pointing at nothing. Only the pair catches both.
  assert.deepEqual(cardFiles(), [...new Set(cardNames())].sort());
});

test('the og-image README describes the pairing this build demonstrates', () => {
  // A reader wiring the two modules meets that paragraph rather than this
  // fixture, and a paragraph describing a crop that no longer happens sends
  // them to change a canvas size to avoid a cost they were never paying. The
  // assertion above catches the behavior drifting; this one catches the prose
  // drifting away from it, which is the direction nothing else here can see.
  const text = readFileSync(join(modulesRoot, 'og-image', 'README.md'), 'utf8');
  const sectionAt = text.indexOf('### Wired to the seo module');
  assert.notEqual(sectionAt, -1, 'the og-image README must document the seo wiring');
  const section = text.slice(sectionAt);
  const paragraph = section.slice(0, section.indexOf('\n### '));
  // Each phrase carries one load-bearing half of the claim: what the seo
  // module does, what the default therefore costs, and what moving off it
  // costs. A paragraph that keeps only the first two stops saying the one
  // thing it exists to say.
  assert.match(paragraph, /skips the crop/, 'the README must state the seo module skips the crop');
  assert.match(paragraph, /published once/, 'the README must state the default-canvas outcome');
  assert.match(
    paragraph,
    /still published beside it/,
    'the README must state what moving off the default canvas costs',
  );
});

test("og-image's own image-tag renderer stands down where the seo module owns the head", () => {
  // og-image ships a standalone renderer for a site with no seo module, and it
  // decides whether to render by probing for `_partials/seo/head.html`. That
  // probe takes a path under layouts/ WITH the .html suffix, and the pre-v0.146
  // `partials/` spelling silently returns false -- which would publish a second
  // og:image beside the first, with no error and no warning, on every page of
  // every site that mounts both modules. This fixture is the only one in the
  // repository where both are mounted, and its head calls both renderers, so
  // one tag per document is the whole assertion.
  const html = documents();
  assert.ok(html.length >= 4, `the fixture publishes a tree to read: ${html.length} documents`);
  for (const doc of html) {
    const tags = [...doc.matchAll(/<meta property="og:image" content="([^"]*)"/g)];
    assert.equal(tags.length, 1, `exactly one og:image tag: ${tags.map((t) => t[1]).join(', ')}`);
  }
  // And the renderer really is wired in, so the count above is a silence
  // rather than an absence.
  const baseof = readFileSync(join(fixtureDir, 'layouts/baseof.html'), 'utf8');
  assert.match(baseof, /partial "og-image\/meta\.html"/);
});
