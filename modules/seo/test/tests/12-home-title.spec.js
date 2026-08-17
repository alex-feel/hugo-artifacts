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
  warnCount,
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
// The `title` front matter of content-undeclared/_index.md, the third
// language's home, which declares no SEO title at all.
const UNDECLARED_HOME_TITLE = 'Undeclared Home';
const RU_HOME = 'ru/index.html';
const DE_HOME = 'de/index.html';

const title = (rel, dir) => dom(rel, dir).querySelector('title')?.text;
const meta = (rel, dir, prop) =>
  dom(rel, dir).querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ??
  dom(rel, dir).querySelector(`meta[name="${prop}"]`)?.getAttribute('content');

// The whole suite rests on these strings being different from each other: an
// assertion that a <title> equals the value it should carry says nothing if
// that value happens to equal the one it should NOT carry, and the distinctness
// that makes the fixture meaningful is the easiest thing for a later edit to
// flatten by accident. Every constant belongs in the set, not only the ones
// the sharpest test uses -- the legacy alias and the undeclared home each fall
// back to the site title, so a collision there would let the whole branch that
// test guards be deleted with the suite still green.
test('the fixture keeps every candidate string distinct', () => {
  const candidates = new Set([
    SITE_TITLE,
    HOME_CONTENT_TITLE,
    DECLARED,
    DECLARED_LEGACY,
    UNDECLARED_HOME_TITLE,
  ]);
  assert.equal(candidates.size, 5, 'every title the fixture authors must differ from the others');
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
  for (const rel of [PAGES.home, RU_HOME, DE_HOME]) {
    assert.ok(!title(rel, hometitleDir).includes(SUFFIX), `${rel}: <title> took the suffix`);
  }
});

test('a home page that declares nothing falls back to the site title alone', () => {
  // The ordinary consumer shape, and the only one that pins the FALLBACK arm
  // while a suffix is in force. The two declaring homes cannot: they leave
  // that arm unrendered, so appending the suffix to it changes no byte of any
  // build. This home is undeclared by construction -- both cascades restrict
  // themselves to the other two languages -- and its own `title` differs from
  // the site title, so one strict equality pins three things at once: the
  // fallback lands on the site title, it takes no suffix, and the page's own
  // content title does not reach it on the way past.
  assert.equal(title(DE_HOME, hometitleDir), SITE_TITLE);
  assert.equal(
    meta(DE_HOME, hometitleDir, 'og:title'),
    UNDECLARED_HOME_TITLE,
    'while og:title still carries the content title, on the same page',
  );
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

// The two keys this resolver reads from consumer configuration are single
// scalars, and until the guard below existed neither was checked. A table
// written under either published Go's map form; a number written under
// seo.title beside a suffix hit a "%s" verb and published a verb-mismatch
// marker. Both shipped silently, exit 0, on every surface the resolved title
// feeds. The `badtypes` build is where wrong shapes live, and it is the only
// build in the suite that carries a suffix beside a numeric title.
test('a wrong-shaped title falls through to the next source and says so once', () => {
  assert.equal(title(PAGES.page, badtypesDir), 'A Regular Page', 'the page title answers');
  assert.equal(meta(PAGES.page, badtypesDir, 'og:title'), 'A Regular Page', 'on every surface');
  assert.equal(
    warnCount(/Ignoring seo\.title:/, 'badtypes'),
    1,
    'exactly one diagnostic, however many pages render',
  );
});

test('a wrong-shaped suffix leaves the title unsuffixed and warns under its own key', () => {
  // Two differently-shaped title mistakes in ONE build must produce TWO
  // diagnostics: a single shared key would let whichever page renders first
  // silence the other.
  assert.equal(title(PAGES.blogPost, badtypesDir), 'A Blog Post');
  assert.equal(warnCount(/Ignoring seo\.title_suffix:/, 'badtypes'), 1);
});

test('a number is a title, and stays one when a suffix is appended to it', () => {
  // The accept side of the guard. A number is a perfectly good title, so it
  // must be PUBLISHED rather than dropped -- and published as the number.
  assert.equal(title(PAGES.promo, badtypesDir), '2024 | Numeric Title Probe');
  assert.equal(meta(PAGES.promo, badtypesDir, 'og:title'), '2024');
});
