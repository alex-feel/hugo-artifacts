// Alternate representations and static link relations.
//
// The load-bearing pair of assertions is that the Markdown alternate appears
// AND the RSS alternate still appears: head-meta.html deliberately narrows
// its own feed emission to the RSS format so JSON and other alternates are
// never mislabeled as feeds, and this second emitter must not have widened
// that. The unset build is asserted just as hard, because a surface that is
// always on is indistinguishable from one that works unless both are checked.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredDir, linkRels, rawHtml, subpathDir, warnCount, PAGES} from './helpers.js';

const markdownAlternates = (rel, dir) =>
  linkRels(rel, dir).filter((l) => l.rel === 'alternate' && l.type === 'text/markdown');
const rssAlternates = (rel, dir) =>
  linkRels(rel, dir).filter((l) => l.rel === 'alternate' && /rss\+xml/.test(l.type ?? ''));

test('unset config emits no alternate representation and no static link relation', () => {
  for (const [name, rel] of Object.entries(PAGES)) {
    const rels = linkRels(rel).map((l) => l.rel);
    assert.equal(markdownAlternates(rel).length, 0, `${name} must have no markdown alternate`);
    for (const forbidden of ['privacy-policy', 'author', 'license', 'search']) {
      assert.ok(!rels.includes(forbidden), `${name} must not carry rel="${forbidden}" when unset`);
    }
  }
});

test('unset config leaves feed discovery untouched', () => {
  assert.equal(rssAlternates(PAGES.page).length, 1, 'exactly one RSS alternate on a regular page');
  assert.equal(rssAlternates(PAGES.home).length, 1, 'exactly one RSS alternate on the home page');
});

test('configured: exactly one markdown alternate AND exactly one RSS alternate', () => {
  const md = markdownAlternates(PAGES.page, configuredDir);
  assert.equal(md.length, 1, 'exactly one markdown alternate');
  assert.match(md[0].href, /\/page\/index\.md$/);
  assert.equal(
    rssAlternates(PAGES.page, configuredDir).length,
    1,
    'the RSS alternate must survive alongside it',
  );
});

test('configured: the allow-list advertises only the formats it names', () => {
  // The home page has no markdown output in this fixture, so an allow-list
  // naming `markdown` must advertise nothing there rather than reaching for
  // whatever other formats the page happens to carry.
  assert.equal(markdownAlternates(PAGES.home, configuredDir).length, 0);
  const homeRels = linkRels(PAGES.home, configuredDir);
  assert.ok(
    !homeRels.some((l) => /searchindex|webmanifest|\.json$/.test(l.href ?? '')),
    'no JSON or manifest output may be advertised as a page alternate',
  );
});

test('configured: rel="license" appears exactly once on every page shape', () => {
  for (const [name, rel] of Object.entries(PAGES)) {
    const licenses = linkRels(rel, configuredDir).filter((l) => l.rel === 'license');
    assert.equal(licenses.length, 1, `${name} must carry exactly one rel="license"`);
    assert.equal(licenses[0].href, 'https://creativecommons.org/licenses/by/4.0/');
  }
});

test('configured: the promo-shaped page gets the identical head surface', () => {
  // The consuming site shape this mirrors calls seo/head.html from a separate
  // promo baseof, so a regression there would be invisible on every other page.
  const promo = linkRels(PAGES.promo, configuredDir)
    .map((l) => l.rel)
    .sort();
  const page = linkRels(PAGES.page, configuredDir)
    .map((l) => l.rel)
    .sort();
  for (const r of ['license', 'privacy-policy', 'author', 'search']) {
    assert.ok(promo.includes(r), `promo page must carry rel="${r}"`);
    assert.ok(page.includes(r), `regular page must carry rel="${r}"`);
  }
});

test('configured: registered relations carry their required attributes', () => {
  const rels = linkRels(PAGES.page, configuredDir);
  const search = rels.find((l) => l.rel === 'search');
  assert.ok(search, 'rel="search" must be emitted');
  assert.equal(search.type, 'application/opensearchdescription+xml');
  assert.ok(search.title, 'rel="search" must carry a title');

  const privacy = rels.find((l) => l.rel === 'privacy-policy');
  assert.match(privacy.href, /^https:\/\//, 'a site-relative value must be resolved to absolute');
});

test('a subpath baseURL survives into every emitted href', () => {
  // Hugo's absURL resolves a value that already begins with "/" against the
  // protocol and host ONLY, discarding the baseURL path -- and the leading
  // slash is the form this module documents for all four [seo.links] keys and
  // for the canonical override. At a domain root, which every other build
  // uses, a broken implementation is byte-identical to a correct one, so this
  // is the only place the difference exists.
  const under = (rel) => linkRels(rel, subpathDir);
  let checked = 0;
  for (const [name, rel] of Object.entries(PAGES)) {
    for (const l of under(rel)) {
      if (!l.href?.startsWith('https://seo-fixture.example')) continue;
      assert.ok(
        l.href.startsWith('https://seo-fixture.example/docs/'),
        `${name}: rel="${l.rel}" href ${l.href} dropped the baseURL path`,
      );
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'the subpath build must emit at least one on-site link');
});

test('every consumer-authored URL surface keeps the baseURL path', () => {
  // The link relations were the first call sites normalized; these three were
  // the ones the first sweep missed, each fed by a documented site-root form.
  // Asserted on the raw HTML rather than through the link parser, because
  // they land in meta content, JSON-LD and image tags rather than in <link>.
  const html = rawHtml(PAGES.page, subpathDir);
  const bad = [...html.matchAll(/https:\/\/seo-fixture\.example(?!\/docs\/)[^\s"'<]*/g)].map(
    (m) => m[0],
  );
  assert.deepEqual(bad, [], 'no emitted URL may drop the /docs/ path component');

  assert.ok(
    html.includes('https://seo-fixture.example/docs/img/og-default.png'),
    'default_image feeds og:image and the JSON-LD image nodes',
  );
  const home = rawHtml(PAGES.home, subpathDir);
  assert.ok(
    home.includes('https://seo-fixture.example/docs/search/?q={search_term_string}'),
    'the SearchAction target keeps the path',
  );
});

test('a consumer-authored canonical override keeps the baseURL path', () => {
  // rel="canonical" is the one tag whose entire job is to be exactly right;
  // a dropped path prefix declares a canonical URL the site does not serve.
  const canonical = linkRels(PAGES.page, subpathDir).find((l) => l.rel === 'canonical');
  assert.ok(canonical, 'a canonical link must be emitted');
  assert.equal(canonical.href, 'https://seo-fixture.example/docs/canonical-override/');
});

test('an unregistered [seo.links] key warns exactly once and emits no tag', () => {
  assert.equal(
    warnCount(/unknown \[seo\.links\] key/, true),
    1,
    'exactly one deduplicated warning for the unregistered key',
  );
  for (const rel of Object.values(PAGES)) {
    const rels = linkRels(rel, configuredDir).map((l) => l.rel);
    assert.ok(
      !rels.some((r) => r === 'not_a_real_relation' || r === 'not-a-real-relation'),
      'an unregistered relation must never be emitted as a bare token',
    );
  }
});

test('the unset build emits nothing at all at the alternates call site', () => {
  // Regression lock for a defect the pre/post byte-identity gate caught: the
  // call site originally left a blank line behind on every page of every
  // consuming site, because an untrimmed comment preserved the newline before
  // it. The partial must contribute NOTHING when unconfigured -- not even
  // whitespace -- so the head stays byte-identical to a build from before the
  // partial existed. It is called immediately after feed discovery, so the
  // bytes following the feed link are the exact witness.
  let checked = 0;
  for (const [name, rel] of Object.entries(PAGES)) {
    const head = /<head>([\s\S]*?)<\/head>/.exec(rawHtml(rel))?.[1] ?? '';
    const feed = head.indexOf('rss&#43;xml');
    if (feed === -1) continue;
    const after = head.slice(head.indexOf('>', feed) + 1);
    assert.match(
      after,
      /^\n\n\S/,
      `${name}: exactly one blank line must follow the feed link, as it did before the partial existed`,
    );
    checked += 1;
  }
  // Without this the whole test degrades to zero assertions the day the feed
  // anchor changes shape -- every iteration would take the `continue` above
  // and the test would pass having proven nothing. This is the only standing
  // guard for a byte-identity result that was measured once by hand against a
  // pre-change worktree and cannot be re-measured in CI.
  assert.equal(checked, Object.keys(PAGES).length, 'every page shape must carry the feed anchor');
});
