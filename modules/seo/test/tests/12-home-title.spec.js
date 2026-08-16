/* global process */
// The home page's <title>.
//
// Every other page's <title> is its resolved title plus the configured suffix.
// The home page is the exception, and the exception used to be absolute: the
// resolved title was DISCARDED there and the site title took its place, so a
// home page could carry any og:title it liked and still publish the site title
// as its search headline, with no configuration able to change it. A site whose
// brand reads well as a suffix on every other page therefore had to choose
// between that suffix and a keyword-bearing headline on the one page that
// carries its search traffic.
//
// The exception is now bounded: the home <title> follows the title the page
// DECLARES through seo.title or its meta_title alias, and falls back to the
// site title. What it still never follows is the home page's own `title` front
// matter -- that field names the page for menus and headings and is routinely
// the word "Home", which is the one headline worse than the brand.
//
// The `hometitle` build is the only one that can see any of this. Nowhere else
// is a title suffix configured at all, and nowhere else does a home page
// declare a title, so the home <title> lands on the site title in every other
// build whether the rule is right, wrong, or absent.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {
  publicDir,
  badtypesDir,
  configuredDir,
  generatedDir,
  graphDir,
  hometitleDir,
  multilingualDir,
  offswitchDir,
  sitenameDir,
  subpathDir,
  dom,
  nodesOfType,
  PAGES,
} from './helpers.js';

// The site's own `title`, inherited by every environment from the baseline.
const SITE_TITLE = 'SEO Fixture';
// The `title` front matter of content/_index.md -- the home page's CONTENT
// title, which reaches og:title and must never reach <title> by itself.
const HOME_CONTENT_TITLE = 'SEO Fixture Home';
// Cascaded onto the English home as seo.title in the `hometitle` environment.
const DECLARED = 'Fixture Home Search Headline';
// Cascaded onto the Russian home as the deprecated meta_title alias.
const DECLARED_LEGACY = 'Fixture Home Legacy Headline';
// [params.seo] title_suffix, set only in the `hometitle` environment.
const SUFFIX = ' | SEO Fixture';
const RU_HOME = 'ru/index.html';

const title = (rel, dir) => dom(rel, dir).querySelector('title')?.text;
const meta = (rel, dir, prop) =>
  dom(rel, dir).querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ??
  dom(rel, dir).querySelector(`meta[name="${prop}"]`)?.getAttribute('content');

// The whole suite rests on these three strings being different from each
// other: an assertion that the <title> equals the declared headline says
// nothing if the declared headline happens to equal the site title, and the
// value that makes the fixture meaningful is the easiest thing for a later
// edit to flatten by accident.
test('the fixture keeps the three candidate strings distinct', () => {
  const candidates = new Set([SITE_TITLE, HOME_CONTENT_TITLE, DECLARED]);
  assert.equal(candidates.size, 3, 'site title, content title and declared title must differ');
  assert.ok(!DECLARED.includes(SUFFIX), 'the declared headline must not contain the suffix');
});

test('a home page that declares a title publishes it as its search headline', () => {
  assert.equal(title(PAGES.home, hometitleDir), DECLARED);
});

test('and the legacy meta_title spelling reaches the same place', () => {
  // The alias is read by a different branch of the resolver, so an
  // implementation that honors only the current spelling passes every
  // assertion above while silently dropping every migrating site's home page
  // back onto the site title. It is a second LANGUAGE rather than a second
  // page because a site has exactly one home per language, and seo.title
  // would mask the alias on a home page carrying both.
  assert.equal(title(RU_HOME, hometitleDir), DECLARED_LEGACY);
});

test('every surface the home page names itself on agrees with the <title>', () => {
  // The defect was visible precisely because these surfaces DID follow the
  // declared title while the <title> alone did not, so a page could describe
  // itself one way to a share card and another way to a search result.
  for (const [rel, expected] of [
    [PAGES.home, DECLARED],
    [RU_HOME, DECLARED_LEGACY],
  ]) {
    assert.equal(meta(rel, hometitleDir, 'og:title'), expected, `${rel}: og:title`);
    assert.equal(meta(rel, hometitleDir, 'twitter:title'), expected, `${rel}: twitter:title`);

    const [webpage] = nodesOfType(rel, 'WebPage', hometitleDir);
    assert.ok(webpage, `${rel}: the home page must carry a WebPage node`);
    assert.equal(webpage.name, expected, `${rel}: WebPage.name`);
  }
});

test('no home page takes the suffix, not even one that declares a headline', () => {
  // The suffix is a SERP display device for pages that need to name their
  // site; a home page IS the site, so "Acme | Acme" is the shape this rule
  // exists to prevent. Declaring a headline does not opt a home page in --
  // a home page that wants a suffixed headline writes the whole string.
  for (const rel of [PAGES.home, RU_HOME]) {
    assert.ok(!title(rel, hometitleDir).includes(SUFFIX), `${rel}: <title> took the suffix`);
  }
});

test('a non-home page takes the suffix in <title> and nowhere else', () => {
  // Before this environment existed no build set `title_suffix` at all, so
  // the branch that appends it rendered in no build in the suite: deleting it
  // outright left every assertion green.
  const pageTitle = meta(PAGES.page, hometitleDir, 'og:title');
  assert.ok(pageTitle, 'the regular page must carry an og:title');
  assert.equal(title(PAGES.page, hometitleDir), `${pageTitle}${SUFFIX}`);
  assert.equal(meta(PAGES.page, hometitleDir, 'twitter:title'), pageTitle, 'never on twitter');

  const [webpage] = nodesOfType(PAGES.page, 'WebPage', hometitleDir);
  assert.ok(webpage, 'the regular page must carry a WebPage node');
  assert.equal(webpage.name, pageTitle, 'and never in JSON-LD');
});

test('a home page that declares nothing publishes the site title, not its own title', () => {
  // The regression lock, and the reason `.Title` is not in the home chain.
  // Every build below has a home page whose `title` front matter differs from
  // the site title, and NONE of them declares an SEO title -- so each one
  // proves both halves at once: the fallback still lands on the site title
  // (the output these builds published before the rule changed, unmoved), and
  // the content title, which reaches og:title on the very same page, does not
  // reach the <title> on the way past.
  const untouched = {
    baseline: publicDir,
    configured: configuredDir,
    subpath: subpathDir,
    badtypes: badtypesDir,
    offswitch: offswitchDir,
    multilingual: multilingualDir,
    graph: graphDir,
    sitename: sitenameDir,
    generated: generatedDir,
  };

  for (const [name, dir] of Object.entries(untouched)) {
    assert.equal(title(PAGES.home, dir), SITE_TITLE, `${name}: home <title>`);
    assert.equal(
      meta(PAGES.home, dir, 'og:title'),
      HOME_CONTENT_TITLE,
      `${name}: og:title still follows the page's own title`,
    );
  }
});

test('the resolver reads the page it was handed, never the rendering language', () => {
  // A source lock, because no fixture can reach the path it guards. The
  // resolver is asked about a FOREIGN page -- resolve/image.html requests an
  // alt fallback for whatever page it holds, and resolve/author.html hands it
  // an author page pulled from the default-language site while a translation
  // renders -- and on that path the global `site` is the language being
  // RENDERED rather than the language of the page being described. Reaching it
  // through the fixture would need a titleless author page carrying an
  // alt-less image, referenced from a translation: a fallback of a fallback,
  // whose cost is a page shape that distorts several unrelated assertions.
  // seo/resolve/description.html states the same rule in its own comments and
  // follows it; this file used to be the one resolver that did not.
  //
  // Scanned with the Go-template comments STRIPPED, because the docstring
  // discusses the global `site` by name and a raw substring search would find
  // the prose and report a read the template does not perform. Both delimiters
  // carry an independent whitespace-trim marker, so the pattern tolerates
  // `{{- /*` and `*/ -}}` alike -- and it is proven in BOTH directions below,
  // since a stripper that ate the template would pass this lock on a file that
  // no longer resolves anything at all.
  const layouts = resolve(process.env.MODULE_LAYOUTS ?? '../layouts/_partials/seo');
  const body = readFileSync(join(layouts, 'resolve/title.html'), 'utf8').replace(
    /\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g,
    '',
  );

  assert.ok(body.includes('$page.IsHome'), 'stripping must leave the template behind');
  assert.ok(!body.includes('ONE terminal return'), 'stripping must remove the comments');

  assert.ok(!body.includes('site.Title'), 'the global site is the RENDERING language');
  assert.ok(body.includes('$page.Site.Title'), 'the page names its own site');
});
