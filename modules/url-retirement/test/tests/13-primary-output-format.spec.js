// Which output format supplies a page's URL, and which properties of this
// module's two formats can change it.
//
// The home page is the one page this module's formats are wired onto, so it is
// the only page whose URL they could ever supply -- and if they did, the link
// every other page carries to the site's front page, its canonical and its
// sitemap entry would name a host control file or a plain-text listing instead
// of the page.
//
// Hugo's documentation says the first entry of a site's `[outputs]` list is the
// page's primary output format and the source of `.Permalink`. Measured at
// v0.164.0 it is not, and neither is the weight on its own. Five builds, three
// surfaces:
//
//   build                    list order    weight   canonical  link   sitemap
//   baseline                 html first    100      /          /      /
//   render-early             html first    5        /          /      /
//   html-last                html last     100      /          /      /
//   render-early-html-last   html last     5        /          /      /url-manifest.txt
//   html-missing             html absent   100      no page    /url-manifest.txt (both)
//
// So it takes BOTH halves to move the sitemap: this module's format ahead of
// html in the list AND a weight that renders it before the html pass. The
// module owns one half and pins it at 100; the site owns the other. Dropping
// html altogether is the change that moves everything, and it is what
// `[outputs]` replacing rather than appending invites. Why the sitemap entry
// alone follows the weight while the page's own canonical and the links to it
// do not is undetermined; these builds record the behavior rather than explain
// it.
//
// Every row above is a build this suite runs, and every one of them passes at
// the module's declared floor, v0.160.0, as well as at v0.164.0 -- so the
// behavior is not a property of one release.
//
// The canonical is asserted because it is what a consuming site publishes, but
// it is the least sensitive of the three: html is `permalinkable`, so a page
// asking for its own URL inside an html template is answered by the html format
// itself, and no combination measured here moved it. What the module DERIVES
// from a page's URL -- redirect targets and manifest lines -- is a fourth
// surface, and 14-derived-page-urls.spec.js covers it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  baselineDir,
  docExists,
  htmlLastDir,
  htmlMissingDir,
  manifest,
  pagerUrls,
  readDoc,
  renderEarlyDir,
  renderEarlyLastDir,
} from './helpers.js';

const SITE_HOME = 'https://url-retirement.example/';

const canonicalOf = (dir, rel = 'index.html') => {
  const match = readDoc(dir, rel).match(/<link rel="canonical" href="([^"]*)"/);
  assert.ok(match, `${rel} carries no canonical link`);
  return match[1];
};

// The home link every regular page carries. A regular page publishes html
// alone, so this is a page asking a FOREIGN page for its URL, which is where
// the format that supplies it is chosen.
const homeLinkOf = (dir, rel = 'posts/post-1/index.html') => {
  const match = readDoc(dir, rel).match(/<nav><a href="([^"]*)"/);
  assert.ok(match, `${rel} carries no link to the home page`);
  return match[1];
};

const sitemapLocs = (dir) =>
  [...readDoc(dir, 'sitemap.xml').matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

// The three builds in which nothing moves, and they differ in exactly the two
// properties that are suspected of moving something: the prescribed wiring, the
// same wiring with the manifest rendering first, and the shipped weight with
// html at the end of the list.
const UNMOVED = [
  {name: 'baseline', dir: baselineDir},
  {name: 'render-early', dir: renderEarlyDir},
  {name: 'html-last', dir: htmlLastDir},
];

for (const tree of UNMOVED) {
  test(`the home page canonicalizes to itself in the ${tree.name} build`, () => {
    assert.equal(canonicalOf(tree.dir), SITE_HOME);
  });

  test(`every page links to the html home page in the ${tree.name} build`, () => {
    assert.equal(homeLinkOf(tree.dir), '/');
  });

  test(`the sitemap names the home page in the ${tree.name} build`, () => {
    const locs = sitemapLocs(tree.dir);
    assert.ok(locs.includes(SITE_HOME), `the sitemap does not name ${SITE_HOME}`);
    assert.deepEqual(
      locs.filter((loc) => /url-manifest\.txt$|_redirects$/.test(loc)),
      [],
      'a document this module publishes is in the sitemap as if it were a page',
    );
  });
}

// Both halves together, and the only build in this suite where a document this
// module publishes takes over a URL Hugo hands to the outside world. The page
// itself is untouched: its canonical still names the page, and so does every
// link to it, which is what makes the sitemap entry silent.
test('the sitemap alone moves when the manifest renders first from ahead of html', () => {
  const locs = sitemapLocs(renderEarlyLastDir);
  assert.ok(
    locs.includes(`${SITE_HOME}url-manifest.txt`),
    'the sitemap does not carry the manifest URL for the home page',
  );
  assert.ok(!locs.includes(SITE_HOME), 'the sitemap still names the home page as well');
  assert.equal(canonicalOf(renderEarlyLastDir), SITE_HOME);
  assert.equal(homeLinkOf(renderEarlyLastDir), '/');
});

// Both weight builds have to be shown to have taken effect, or an override that
// silently failed to reach Hugo would leave every assertion above passing for
// the wrong reason. Pager URLs are the evidence: they reach the manifest only
// because the html pass ran first and registered them, so a manifest without
// them is a manifest that rendered early.
for (const tree of [
  {name: 'render-early', dir: renderEarlyDir},
  {name: 'render-early-html-last', dir: renderEarlyLastDir},
]) {
  test(`the ${tree.name} build really did render the manifest first`, () => {
    const published = pagerUrls(tree.dir);
    assert.ok(published.length > 0, 'the build published no pager at all');
    assert.deepEqual(
      manifest(tree.dir).urls.filter((url) => published.includes(url)),
      [],
      'the manifest carries pager URLs, so its pass still ran after the html one',
    );
  });
}

// The counterpart at the shipped weight: reordering the list alone does not
// move the render passes either, so html-last keeps every pager URL that
// render-early loses.
test('reordering the list leaves the render order alone', () => {
  const {urls} = manifest(htmlLastDir);
  const pagers = pagerUrls(htmlLastDir);
  assert.ok(pagers.length > 0, 'the build published no pager at all');
  assert.deepEqual(
    pagers.filter((url) => !urls.includes(url)),
    [],
    'the manifest is missing pager URLs the build published',
  );
});

// The other half of the rule, and the reason the assertions above are capable
// of failing rather than restating builds that could never differ. Dropping
// html is what Hugo's list semantics invite -- `[outputs]` REPLACES the default
// list -- and the module README names it for that reason.
test('a home page with no html output publishes no page at the site root', () => {
  assert.equal(docExists(htmlMissingDir, 'index.html'), false);
});

test('and its URL becomes the first output format left', () => {
  assert.equal(homeLinkOf(htmlMissingDir), '/url-manifest.txt');
});

test('which is the URL the sitemap then carries for it', () => {
  const locs = sitemapLocs(htmlMissingDir);
  assert.ok(
    locs.includes(`${SITE_HOME}url-manifest.txt`),
    'the sitemap does not carry the manifest URL for the home page',
  );
  assert.ok(
    !locs.includes(SITE_HOME),
    'the sitemap still names a home page that was not published',
  );
});
