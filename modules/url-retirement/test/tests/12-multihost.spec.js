// A baseURL per language, which is the one deployment where /_redirects stops
// being one file describing the whole site. Hugo publishes each language into
// its own directory, that directory IS that language's host root, and a format
// declared `root = true` therefore resolves to a different path per language --
// so every host receives its own copy, and a rule built from another language's
// page names a URL that host does not serve.
//
// German serves from a path and English from a domain root, so the two segments
// a multihost rule has to get right at once are different strings here: the
// baseURL's own /docs, which every rule keeps, and the /de publish directory
// Hugo puts in front of that language's aliases, which no host serves and every
// rule drops.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  multihostDir,
  docExists,
  manifest,
  moduleWarnings,
  publishedUrls,
  redirectRules,
} from './helpers.js';

const de = () => redirectRules(multihostDir, 'de/_redirects');
const en = () => redirectRules(multihostDir, 'en/_redirects');

// The premise every other assertion here rests on. If Hugo ever stopped giving
// each language its own publish root, these rules would be graded against a
// deployment shape the build no longer has.
test('each host gets its own redirect map, and the deployment root gets none', () => {
  assert.ok(docExists(multihostDir, 'de/_redirects'));
  assert.ok(docExists(multihostDir, 'en/_redirects'));
  assert.ok(!docExists(multihostDir, '_redirects'), 'a shared map was written above the hosts');
});

test("a host's map carries its own language's aliases", () => {
  assert.deepEqual(
    de()
      .filter((r) => r.to === '/docs/posts/post-de/')
      .map((r) => r.from),
    ['/docs/alter-pfad', '/docs/alter-pfad/'],
  );
  assert.deepEqual(
    en()
      .filter((r) => r.to === '/posts/post-1/')
      .map((r) => r.from)
      .sort(),
    ['/legacy/first-post', '/legacy/first-post/', '/old-post-one', '/old-post-one/'],
  );
});

// The defect this environment exists for. Both copies used to carry every
// language's rules, so the English host answered /de/alter-pfad with a German
// page it does not publish, and the German host carried English pager rules.
test("a host's map carries no other language's rules at all", () => {
  const enPages = ['/notes/note-a/', '/posts/post-1/'];
  for (const rule of de())
    assert.ok(!enPages.includes(rule.to), `${rule.line} points at a page the German host lacks`);
  for (const rule of en())
    assert.ok(
      rule.to !== '/posts/post-de/' && rule.to !== '/docs/posts/post-de/',
      `${rule.line} points at a page the English host lacks`,
    );
});

// Measured at Hugo v0.164.0: .Aliases carries the language's publish-directory
// segment under multihost for EVERY language, the default one included, while
// .RelPermalink of the same page carries none. The /en/ half is the surprising
// one -- that site's .LanguagePrefix is the empty string -- and it is exactly
// the half a fix written from the German symptom alone would miss.
test('no rule keeps the publish directory Hugo prefixes onto an alias', () => {
  for (const rule of [...de(), ...en()]) {
    assert.ok(!/^\/(de|en)(\/|$)/.test(rule.from), `${rule.from} kept its publish directory`);
    assert.ok(!/^\/(de|en)(\/|$)/.test(rule.to), `${rule.to} kept its publish directory`);
  }
});

// The base segment and the publish directory are handled independently, which
// only a host serving from a path can show: /de/alter-pfad had to lose one
// segment and gain a different one.
test('a host serving from a path keeps that path on both sides of every rule', () => {
  for (const rule of de()) {
    assert.ok(rule.from.startsWith('/docs/'), `${rule.from} lost the baseURL path`);
    assert.ok(rule.to.startsWith('/docs/'), `${rule.to} lost the baseURL path`);
  }
});

// Pager URLs are recorded in the build-global store during each language's own
// html pass, and each language renders completely before the next one begins,
// so a map assembled from every language leaves the FIRST host missing whatever
// had not been registered yet. German carries weight 1 and therefore renders
// first: its own pager rules being present is what proves the map is complete
// by construction rather than by luck of the language weights.
test('the first host to render still gets its own pager rules', () => {
  const byFrom = new Map(de().map((r) => [r.from, r.to]));
  assert.equal(byFrom.get('/docs/seite/1/'), '/docs/');
  assert.equal(byFrom.get('/docs/posts/seite/1/'), '/docs/posts/');
});

test('each host uses its own pagination segment and never the other one', () => {
  const byFrom = new Map(en().map((r) => [r.from, r.to]));
  assert.equal(byFrom.get('/page/1/'), '/');
  assert.equal(byFrom.get('/posts/page/1/'), '/posts/');
  assert.equal(byFrom.get('/notes/page/1/'), '/notes/');
  for (const rule of en()) assert.ok(!rule.from.includes('/seite/'), `${rule.from} used German's`);
  for (const rule of de()) assert.ok(!rule.from.includes('/page/'), `${rule.from} used English's`);
});

// Two languages resolving different redirect settings is reported on a
// shared-domain site, where one file cannot hold both answers. Here each host
// has its own file, so the difference is legitimate -- and the build being
// silent is asserted by the runner, which fails this environment on any warning
// at all.
test('each host carries its own redirect status', () => {
  for (const rule of de()) assert.equal(rule.status, '308', rule.line);
  for (const rule of en()) assert.equal(rule.status, '301', rule.line);
});

test('the per-language settings are not reported as a divergence', () => {
  assert.deepEqual(moduleWarnings('multihost'), []);
});

// Hugo mints no redirect between a site root and a default language's directory
// on a multihost site -- verified by building this shape with
// disableDefaultSiteRedirect at Hugo's own default, which published four alias
// stubs and no root stub -- so the module must emit no rule for one either.
test('neither host gets a default-site redirect rule', () => {
  for (const rule of [...de(), ...en()])
    assert.ok(rule.from !== '/' && rule.from !== '/docs/', `${rule.line} retires a host root`);
});

for (const host of ['de', 'en']) {
  test(`no rule's source path is published as a file on the ${host} host`, () => {
    const base = host === 'de' ? '/docs' : '';
    const published = new Set(publishedUrls(join(multihostDir, host)).map((u) => `${base}${u}`));
    const rules = host === 'de' ? de() : en();
    for (const rule of rules)
      assert.ok(
        !published.has(rule.from) && !published.has(`${rule.from}/`),
        `${rule.from} is published as a file, so the rule for it can never fire`,
      );
  });

  test(`no meta-refresh stub is published on the ${host} host`, () => {
    const dir = join(multihostDir, host);
    const offenders = publishedUrls(dir)
      .filter((url) => url.endsWith('/'))
      .filter((url) => {
        const body = readFileSync(join(dir, url.replace(/^\//, ''), 'index.html'), 'utf8');
        return /http-equiv=["']?refresh/i.test(body);
      });
    assert.deepEqual(offenders, []);
  });
}

// A checker starting on one host has to be able to reach the other, and a
// relative path cannot say which domain it means. The foreign manifest's
// .RelPermalink is /url-manifest.txt here -- the same path this host serves its
// OWN manifest at -- so the line that exists to point elsewhere used to point
// back home on both hosts.
test('each manifest names its sibling by its own host', () => {
  const deHeader = manifest(multihostDir, 'de/url-manifest.txt').header;
  const enHeader = manifest(multihostDir, 'en/url-manifest.txt').header;
  assert.ok(
    deHeader.some((h) => h.includes('https://en.url-retirement.example/url-manifest.txt')),
    'the German manifest does not name the English host',
  );
  assert.ok(
    enHeader.some((h) => h.includes('https://de.url-retirement.example/docs/url-manifest.txt')),
    'the English manifest does not name the German host',
  );
  for (const header of [deHeader, enHeader])
    assert.ok(
      !header.some((h) => h.startsWith('# Other languages:') && h.includes(' /url-manifest.txt')),
      'a manifest named its sibling with a path, which on another host means this host',
    );
});

// The manifest body is asserted against a WALK of that host's own tree rather
// than a remembered list, exactly as the single-host manifest is: every URL the
// host publishes is listed, and nothing else. The sitemap is the one class the
// module cannot see, and its own header says so.
test('each manifest lists exactly what its own host publishes', () => {
  for (const [host, base] of [
    ['de', '/docs'],
    ['en', ''],
  ]) {
    const expected = publishedUrls(join(multihostDir, host))
      .filter((url) => url !== '/sitemap.xml')
      .map((u) => `${base}${u}`)
      .sort();
    assert.deepEqual(
      manifest(multihostDir, `${host}/url-manifest.txt`).urls,
      expected,
      `the ${host} manifest does not match its own tree`,
    );
  }
});
