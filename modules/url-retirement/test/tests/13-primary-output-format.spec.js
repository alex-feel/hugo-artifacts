// Which output format supplies a page's URL, and which properties of this
// module's two formats cannot change it.
//
// The home page is the one page this module's formats are wired onto, so it is
// the only page whose URL they could ever supply -- and if they did, every link
// to the site's front page, its canonical and its sitemap entry would name a
// host control file or a plain-text listing instead of the page.
//
// Hugo's documentation says the first entry of a site's `[outputs]` list is the
// page's primary output format and the source of `.Permalink`. Measured at
// v0.164.0 it is not, and neither is the weight on its own. Five builds, three
// surfaces:
//
//   list order    manifest weight   canonical   inbound link   sitemap <loc>
//   html first    100               /           /              /
//   html first    5                 /           /              /
//   html last     100               /           /              /
//   html last     5                 /           /              /url-manifest.txt
//   html absent   100               no page     /url-manifest  /url-manifest.txt
//
// So it takes BOTH halves to move the sitemap: this module's format ahead of
// html in the list AND a weight that renders it before the html pass. The
// module owns one half and pins it at 100; the site owns the other. Dropping
// html altogether is the one change that moves everything, and it is what
// `[outputs]` replacing rather than appending invites. Why the sitemap entry
// alone follows the weight while the page's own canonical and its inbound links
// do not is undetermined; the builds record the behavior rather than explain it.
//
// The canonical is asserted because it is what a consuming site publishes, but
// it is the least sensitive of the three: html is `permalinkable`, so a page
// asking for its own URL inside an html template is answered by the html format
// itself, and no combination measured here moved it. The sitemap's entry and
// the link a regular page carries to the home page are the two that do.
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

// The prescribed wiring and the same list reordered. Both must be identical
// from the outside: that is the claim the module's weight comment makes and the
// one a future reordering would otherwise break silently.
const WIRED = [
  {name: 'baseline', dir: baselineDir},
  {name: 'html-last', dir: htmlLastDir},
];

for (const tree of WIRED) {
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

// The list order does not move the render passes either, and this is what says
// so: pager URLs exist in the manifest only because the html pass ran first and
// registered them. A build whose manifest lost them would have reordered the
// passes, not merely the list.
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
// of failing rather than restating a build that could never differ. Dropping
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
