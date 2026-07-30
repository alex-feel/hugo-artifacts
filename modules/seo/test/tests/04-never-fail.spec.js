// The never-fail contract, which this module's README opens by making:
// "The module never breaks a build over SEO data: every misconfiguration
// degrades to a deduplicated warnf and a safe fallback, so a broken schema
// declaration costs you one rich result, never the site."
//
// One authoring mistake, two failure shapes. `range` REJECTS a string, so an
// uncoerced value there aborted the consuming site's build. `index` and
// `delimit` ACCEPT it and iterate it BYTE-WISE, so an uncoerced value there
// published integers -- which is the quieter and worse failure, and the one
// that actually shipped. The scalar form is not exotic: Hugo front matter
// accepts `tags: hugo`, and many sites write it that way, so both landed on
// ordinary content.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  badtypesDir,
  configuredDir,
  graph,
  linkRels,
  multilingualDir,
  offswitchDir,
  publicDir,
  rawHtml,
  subpathDir,
  warnCount,
  PAGES,
} from './helpers.js';

test('a page writing tags and categories as bare scalars builds and emits them', () => {
  // That the suite reaches this assertion at all is half the point: before
  // the coercion the build did not complete.
  const html = rawHtml(PAGES.scalarTaxonomies);
  assert.match(html, /<meta property="article:tag" content="single-tag">/);
  assert.match(html, /<meta property="article:section" content="single-category">/);
});

test('the scalar page emits exactly one tag, not one per character', () => {
  // A coercion that split the string instead of wrapping it would emit a tag
  // per character and still "pass" a looser assertion.
  const tags = [...rawHtml(PAGES.scalarTaxonomies).matchAll(/article:tag" content="([^"]*)"/g)];
  assert.equal(tags.length, 1);
  assert.equal(tags[0][1], 'single-tag');
});

test('the JSON-LD node carries the scalar taxonomies as VALUES, not byte codes', () => {
  // The sharpest form of this defect class, and the one that shipped: Hugo's
  // `delimit` and `index` do not reject a string, they iterate it BYTE-WISE.
  // So `tags: hugo` published `"keywords": "104, 117, 103, 111"` and
  // `articleSection` as an integer -- to Google and to every AI crawler,
  // silently, exit 0. The OG surface on the same page was correct throughout,
  // which is exactly why nothing caught it.
  const nodes = graph(PAGES.scalarTaxonomies).filter((n) => n['@type'] === 'BlogPosting');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].keywords, 'single-tag');
  assert.equal(nodes[0].articleSection, 'single-category');
});

test('no JSON-LD value anywhere is a bare byte code', () => {
  // A regression net for the whole class rather than the two known keys.
  for (const [name, rel] of Object.entries(PAGES)) {
    for (const node of graph(rel)) {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'number' && value >= 32 && value <= 126) {
          assert.fail(`${name}: ${node['@type']}.${key} is ${value}, which looks byte-wise`);
        }
      }
    }
  }
});

test('a scalar written for a page sub-table builds, and degrades to unconfigured', () => {
  // `seo: {video: 'dQw4w9WgXcQ'}` is the bare-id spelling the module's own
  // video_id alias encourages. It is TRUTHY, so `| default dict` does not
  // substitute; resolve/types.html then types the page VideoObject and
  // head-jsonld.html dispatches to a builder that reads `.thumbnail_url` off
  // a string. That was a hard build stop -- reaching this assertion at all is
  // half the proof.
  const html = rawHtml(PAGES.scalarSubtables);
  assert.ok(html.length > 0, 'the page built');
  // The unusable block is treated as unconfigured, so no half-built node ships.
  const video = graph(PAGES.scalarSubtables).filter((n) => n['@type'] === 'VideoObject');
  assert.equal(video.length, 0, 'no VideoObject node from an unusable seo.video');
  assert.ok(warnCount(/Ignoring seo\.video/) >= 1, 'and it says so');
});

test('a scalar written for a SITE sub-table degrades without taking the build down', () => {
  // jsonld/organization.html reads `.type` off it on every page, so this one
  // failed site-wide rather than on one page.
  assert.ok(warnCount(/Ignoring seo\.organization/, 'subpath') >= 1);
});

test('the whole seo front-matter block written as a scalar still builds', () => {
  // Read on EVERY page by three resolvers as `| default dict` then `index`.
  // `index` on a string with a string key errors, so one page written this
  // way took the whole build down.
  const html = rawHtml(PAGES.scalarSeoBlock);
  assert.ok(html.includes('<title>'), 'the page built with its head intact');
  assert.ok(warnCount(/Ignoring seo:/) >= 1, 'and it says so');
});

test('a scalar seo.website does not stop the home-page build', () => {
  // jsonld/website.html reads three keys off it on every language home page.
  assert.ok(warnCount(/Ignoring seo\.website/, 'configured') >= 1);
  assert.ok(rawHtml(PAGES.home, configuredDir).includes('<title>'), 'the home page built');
});

test('the whole seo NAMESPACE written as a scalar still builds', () => {
  // Ten builders read site.Params.seo.<child>, and that field access lands on
  // the PARENT before any guard is entered -- so one line of site config
  // stopped the build on the first page rendered. `seo = false` is equally
  // fatal and is the natural shorthand for the documented kill switch.
  const html = rawHtml(PAGES.page, badtypesDir);
  assert.ok(html.includes('<title>'), 'the page built with its head intact');
  assert.ok(warnCount(/Ignoring params\.seo/, 'badtypes') >= 1, 'and it says so');
});

test('a scalar alternates.formats still emits the alternate', () => {
  // Gating on IsSlice made this behave exactly like unset: the twins were
  // published and never linked, silently disabling the surface.
  const md = linkRels(PAGES.page, subpathDir).filter(
    (l) => l.rel === 'alternate' && l.type === 'text/markdown',
  );
  assert.equal(md.length, 1, 'the scalar form is read as a one-item list');
});

test('a non-map [seo.links] warns rather than silently dropping every relation', () => {
  assert.equal(warnCount(/Ignoring \[seo\.links\]/), 1);
  const rels = linkRels(PAGES.page).map((l) => l.rel);
  for (const gone of ['license', 'author', 'search', 'privacy-policy']) {
    assert.ok(!rels.includes(gone), `${gone} is absent, as the warning says`);
  }
});

test('the legacy metadata namespace written as a scalar still builds', () => {
  // Read with a raw parent field access in two builders. `metadata` is far
  // more generic and collision-prone than `seo` -- a site may already own it
  // before importing the module.
  assert.ok(rawHtml(PAGES.page, badtypesDir).includes('<title>'));
  assert.ok(warnCount(/Ignoring params\.metadata/, 'badtypes') >= 1);
});

test('the FALSY namespace spelling is reported, not swallowed', () => {
  // `[params] seo = false` is the shorthand a consumer reaches for to switch
  // the module off. Hugo's nested .Param returns nil rather than false when an
  // intermediate segment is a scalar, so the module does not disable itself --
  // and a guard gated on `with` never fires, because `with` treats false as
  // absent. The consumer's one line did nothing at all, silently.
  assert.ok(warnCount(/Ignoring params\.seo/, 'offswitch') >= 1, 'the mistake is named');
  assert.ok(rawHtml(PAGES.page, offswitchDir).includes('<title>'), 'and the build survives');
});

test('the FALSY page-tier seo block warns by name and the page keeps its head', () => {
  // The page-tier twin of the falsy namespace spelling: `seo: false` in front
  // matter, gated on `with`, produced no diagnostic while the page rendered
  // its full head surface anyway. The exact count holds because the dedup key
  // carries the value: this warning and the scalar-seo-block one share the
  // `seo` config key, and keyed by name alone they raced for one slot.
  assert.equal(warnCount(/Ignoring seo: it expects a table but was given "false"/), 1);
  assert.ok(rawHtml(PAGES.falsySeoBlock).includes('<title>'), 'and the page built');
});

test('the FALSY legacy metadata namespace is reported, not swallowed', () => {
  // `metadata = false` is the same off-switch reach on the legacy alias
  // namespace, read in two builders; falsy, it used to degrade to silence.
  assert.equal(
    warnCount(/Ignoring params\.metadata: it expects a table but was given "false"/, 'offswitch'),
    1,
  );
  assert.ok(rawHtml(PAGES.page, offswitchDir).includes('<title>'), 'and the build survives');
});

test('an article with no keywords or tags falls back to the site seo.keywords list', () => {
  // The site-level JSON-LD keywords fallback: the page carries nothing, so
  // the configured environment's [seo] keywords list supplies the value,
  // comma-joined into one string.
  const nodes = graph(PAGES.keywordsFallback, configuredDir).filter(
    (n) => n['@type'] === 'BlogPosting',
  );
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].keywords, 'alpha, beta');
});

test('the SCALAR spelling of site seo.keywords publishes the identical string', () => {
  // The probe that locks the list coercion: `delimit` accepts a bare string
  // and iterates it BYTE-WISE, so the list-spelled fixture alone cannot tell
  // the one-item-list wrap from a raw delimit. The subpath environment writes
  // the same value as one scalar, and the two trees must publish identical
  // keywords bytes.
  const nodes = graph(PAGES.keywordsFallback, subpathDir).filter(
    (n) => n['@type'] === 'BlogPosting',
  );
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].keywords, 'alpha, beta');
});

test('a page bundle auto-picking a cover with no decodable image data still builds', () => {
  // A resource can be media-typed as an image and still carry bytes Hugo
  // cannot decode: a version-control pointer checked out in place of the
  // binary, or a format Hugo has no decoder for. Reading .Width or calling
  // .Fill decodes, so either cover was a hard build stop -- from a page with
  // ZERO front matter, because the module auto-picks bundle resources by
  // name. Reaching these assertions at all is half the proof.
  assert.ok(rawHtml(PAGES.undecodableRaster).includes('<title>'), 'the pointer-file bundle built');
  assert.ok(rawHtml(PAGES.avifCover).includes('<title>'), 'the decoder-less-format bundle built');
});

test('each undecodable cover warns exactly once and ships a url-only og:image', () => {
  // One deduplicated warning per image, and a degraded rendering that keeps
  // url, type and alt but fabricates no dimensions. Asserting the ABSENCE of
  // og:image:width/height matters: a guard that published 1200x630 for an
  // image it could not read would ship a lie, and a mere og:image-presence
  // assertion would pass on that output too.
  const covers = [
    {
      page: PAGES.undecodableRaster,
      url: 'https://seo-fixture.example/undecodable-raster/cover.jpg',
      type: 'image/jpeg',
      alt: 'Undecodable Raster Cover',
      warn: /Cannot decode image "\/undecodable-raster\/cover\.jpg" \(image\/jpeg\)/,
    },
    {
      page: PAGES.avifCover,
      url: 'https://seo-fixture.example/avif-cover/cover.avif',
      type: 'image/avif',
      alt: 'AVIF Cover',
      warn: /Cannot decode image "\/avif-cover\/cover\.avif" \(image\/avif\)/,
    },
  ];
  for (const c of covers) {
    assert.equal(warnCount(c.warn), 1, `${c.page}: exactly one decode warning`);
    const html = rawHtml(c.page);
    assert.ok(html.includes(`<meta property="og:image" content="${c.url}">`), 'source URL kept');
    assert.ok(html.includes(`<meta property="og:image:type" content="${c.type}">`), 'type kept');
    assert.ok(html.includes(`<meta property="og:image:alt" content="${c.alt}">`), 'alt kept');
    assert.ok(!html.includes('og:image:width'), `${c.page}: no fabricated og:image:width`);
    assert.ok(!html.includes('og:image:height'), `${c.page}: no fabricated og:image:height`);
  }
});

test('a map-shaped image entry publishes its src URL, never the Go debug form', () => {
  // images: [{src: "/img/cover.png"}] is ordinary theme front matter. An
  // ungated printf "%v" renders a map as Go's debug form
  // (map[src:/img/map-cover.png]), which absolutizes into a syntactically
  // valid, permanently-404 URL on og:image, og:image:secure_url,
  // twitter:image and every JSON-LD image node at once -- exit 0.
  const html = rawHtml(PAGES.mapImages);
  assert.ok(
    html.includes(
      '<meta property="og:image" content="https://seo-fixture.example/img/map-cover.png">',
    ),
    'og:image is the absolutized src value',
  );
  const sub = rawHtml(PAGES.mapImages, subpathDir);
  assert.ok(
    sub.includes(
      '<meta property="og:image" content="https://seo-fixture.example/docs/img/map-cover.png">',
    ),
    'and the src absolutizes with the baseURL path kept',
  );
});

test('a map item inside the tags list never publishes as an article:tag', () => {
  // article:tag stringifies each ranged item straight into its content
  // attribute, so one table nested in the tags list published Go's debug
  // form (map[name:nested-tag]) -- silently, exit 0. The fixture page's only
  // tag is that table, so the scalar filter must emit NO article:tag at all;
  // asserting the exact count catches a filter that stringifies instead of
  // dropping.
  const tags = [...rawHtml(PAGES.mapTaxonomies).matchAll(/article:tag" content="([^"]*)"/g)];
  assert.equal(tags.length, 0, 'the only tag is a table, so no article:tag is emitted');
});

test('the JSON-LD keywords skip map items in BOTH consumer lists', () => {
  // The tags list holds only a table, so it must empty out -- not stringify
  // -- letting the keywords chain fall through to seo.keywords, whose own
  // table entry is dropped while the usable scalar beside it is kept. The
  // exact value proves all three at once: tags emptied, the map keyword
  // dropped, the scalar keyword kept.
  const nodes = graph(PAGES.mapTaxonomies).filter((n) => n['@type'] === 'BlogPosting');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].keywords, 'usable-keyword');
  assert.ok(warnCount(/expects a list of scalar values/) >= 1, 'and it says so');
});

test('no emitted file in any build tree contains a Go map debug string', () => {
  // The whole-class net: whichever surface a stringification of a map-shaped
  // consumer value leaks through, the debug form always carries the
  // substring "map[".
  let scanned = 0;
  for (const dir of [
    publicDir,
    configuredDir,
    subpathDir,
    badtypesDir,
    offswitchDir,
    multilingualDir,
  ]) {
    for (const entry of readdirSync(dir, {recursive: true, withFileTypes: true})) {
      if (!entry.isFile() || !/\.(html|xml|json|txt)$/.test(entry.name)) continue;
      const file = join(entry.parentPath, entry.name);
      scanned += 1;
      assert.ok(!readFileSync(file, 'utf8').includes('map['), `${file} contains "map["`);
    }
  }
  assert.ok(scanned > 0, 'the scan actually visited emitted files');
});

test('a sound raster cover still gets the real 1200x630 og crop', () => {
  // The other half of the guard contract: a decodable image keeps the
  // content-aware 1.91:1 crop, or the guard "fixed" the build by disabling
  // the feature. The processed-resource URL proves the crop ran; the exact
  // dimensions prove it produced what og:image wants.
  const html = rawHtml(PAGES.decodableRaster);
  assert.match(html, /property="og:image" content="[^"]*\/decodable-raster\/cover_hu[^"]*\.png"/);
  assert.ok(html.includes('<meta property="og:image:type" content="image/png">'));
  assert.ok(html.includes('<meta property="og:image:width" content="1200">'));
  assert.ok(html.includes('<meta property="og:image:height" content="630">'));
  assert.equal(warnCount(/Cannot decode image "\/decodable-raster\//), 0, 'no decode warning');
});

test('a canonical override written as a table warns and falls back to the permalink', () => {
  // `with` treats a non-empty table as PRESENT, so a canonical written as a
  // table really does reach the absolutizer rather than being skipped
  // upstream. Two things must hold: the consumer is told (silently dropping
  // the key would leave them with a missing tag and no explanation), and the
  // page still carries a canonical -- the self-referencing permalink is
  // always a correct answer, so emitting none would be the worst outcome.
  const html = rawHtml(PAGES.tableCanonical);
  assert.equal(
    warnCount(/Ignoring canonical: it expects a URL written as a single value/),
    1,
    'the unusable canonical override is reported exactly once',
  );
  assert.ok(
    html.includes(
      '<link rel="canonical" href="https://seo-fixture.example/blog/table-canonical/">',
    ),
    'the page falls back to its own permalink rather than emitting no canonical',
  );
  assert.doesNotMatch(html, /rel="canonical"[^>]*map\[/, 'no Go debug form reaches the canonical');
});
