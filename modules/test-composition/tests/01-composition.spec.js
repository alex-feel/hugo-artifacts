/* global process, URL */
// Cross-module composition assertions.
//
// Every module the fixture imports is proven on its own by its own suite,
// against a fixture that imports that module alone. None of those fixtures can
// see the surface those modules SHARE: the consuming site's single `[outputs]`
// table.
//
// Hugo replaces the output list per page kind rather than merging it, and a
// module's own `[outputs]` table never reaches the consumer configuration, so
// each README has to show an `[outputs]` block of its own. A consumer who
// follows two of those READMEs literally lands in one of two states: a second
// `[outputs]` table in the same file, which TOML refuses outright ("table
// outputs already exists"), or one table replacing the other, which loads
// cleanly, exits 0, prints nothing -- and silently stops publishing every
// document the replaced list asked for. The second shape is the one this
// suite exists to catch, because nothing in a single-module suite can.
//
// The fixture therefore carries ONE merged home list, and these assertions
// hold it to the union of what those modules define.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const testRoot = resolve(here, '..');
const modulesRoot = resolve(testRoot, '..');
const fixtureDir = join(testRoot, 'fixture');
const publicDir = resolve(process.env.FIXTURE_PUBLIC ?? join(fixtureDir, 'public'));
const buildLog = resolve(process.env.HUGO_BUILD_LOG ?? join(testRoot, 'hugo-build.log'));

const fixtureConfig = readFileSync(join(fixtureDir, 'hugo.toml'), 'utf8');

const published = (relPath) => readFileSync(join(publicDir, relPath), 'utf8');

// The `home = [...]` value of the fixture's single [outputs] table, read from
// the raw configuration rather than from a Hugo dump: what a consumer copies
// out of a README is TOML text, so TOML text is what these assertions read.
const homeOutputs = () => {
  const table = /^\[outputs\][^\n]*\n([\s\S]*?)(?=\n\[|$)/m.exec(fixtureConfig);
  assert.ok(table, 'the fixture configuration must carry an [outputs] table');
  const home = /^\s*home\s*=\s*\[([^\]]*)\]/m.exec(table[1]);
  assert.ok(home, 'the [outputs] table must carry a home list');
  return home[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
};

// Every output format name a module's own hugo.toml defines. These are the
// names that merge into the consumer configuration additively (unlike
// [outputs]) and therefore the exact set a consumer has to wire by hand.
const moduleFormats = (moduleName) => {
  const configPath = join(modulesRoot, moduleName, 'hugo.toml');
  const config = readFileSync(configPath, 'utf8');
  return [...config.matchAll(/^\s*\[outputFormats\.([A-Za-z0-9_-]+)\]/gm)].map((match) => match[1]);
};

test('one build publishes every module document side by side', () => {
  // The four documents the recipe names, plus the two the same merged list
  // carries: the OpenSearch description and the robots.txt the
  // agent-readiness module owns.
  for (const relPath of [
    'llms.txt',
    'llms-index.txt',
    'about.md',
    'index.md',
    'searchindex.json',
    'opensearch.xml',
    'robots.txt',
    'index.html',
    'manifest.webmanifest',
    '_redirects',
    'url-manifest.txt',
  ]) {
    assert.ok(existsSync(join(publicDir, relPath)), `public/${relPath} must be published`);
    assert.ok(published(relPath).trim().length > 0, `public/${relPath} must not be empty`);
  }
});

test('the merged home list carries every format the modules define', () => {
  const home = homeOutputs();
  const defined = [
    ...moduleFormats('agent-readiness'),
    ...moduleFormats('search'),
    ...moduleFormats('url-retirement'),
  ];
  // Guards the enumeration itself: a mis-typed module name or a changed table
  // header would make `defined` empty and every assertion below vacuous.
  assert.ok(defined.length >= 5, 'the modules must define at least five output formats');
  for (const format of defined) {
    assert.ok(
      home.includes(format),
      `the merged home list must carry the ${format} format the modules define`,
    );
  }
  // The built-in formats a replacing list silently drops. `markdown` drives
  // the agent-readiness twins; `html` and `rss` are Hugo defaults that a
  // consumer-authored list has to restate.
  for (const format of ['html', 'rss', 'markdown', 'webappmanifest']) {
    assert.ok(home.includes(format), `the merged home list must restate ${format}`);
  }
});

test('the fixture configuration carries exactly one outputs table', () => {
  // Two [outputs] tables in one file is a config-load failure, so the merged
  // single table is the only shape a consumer can hold every module in.
  const tables = fixtureConfig.match(/^\[outputs\]$/gm) ?? [];
  assert.equal(tables.length, 1);
});

test('the agent-readiness twins describe the same page the search index holds', () => {
  const llms = published('llms.txt');
  const facts = published('about.md');
  const homeTwin = published('index.md');
  assert.match(
    llms,
    /\[A Composition Post\]\(https:\/\/composition\.example\/blog\/post\/index\.md\)/,
  );
  assert.match(facts, /\[A Composition Post\]\(https:\/\/composition\.example\/blog\/post\/\)/);
  assert.match(homeTwin, /^---\ntitle: "Composition Fixture Home"/);

  const index = JSON.parse(published('searchindex.json'));
  assert.ok(Array.isArray(index.docs), 'the search index must serialize a docs array');
  const hrefs = index.docs.map((doc) => doc.href);
  assert.ok(
    hrefs.includes('/blog/post/'),
    'the search index must hold the page the twins describe',
  );
});

test('the seo head surface renders in the same document as the search markup', () => {
  const html = published('index.html');
  // The seo module contributes head markup only, so its composition evidence
  // is that its markup and the search module's body markup coexist on one
  // page rendered through one baseof.
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /class="search[ _"]/);
});

test('the OpenSearch description names the fixture site', () => {
  const xml = published('opensearch.xml');
  assert.match(xml, /<OpenSearchDescription/);
  // ShortName is capped at the 16 characters the OpenSearch specification
  // allows, so the fixture title arrives truncated -- that truncation is the
  // module's own contract and this suite only holds it to composing.
  assert.match(xml, /<ShortName>Composition Fixt<\/ShortName>/);
  // The search page the shortcode sits on is reachable from the description,
  // which is the one search surface that needs a page the other two modules
  // also publish twins for.
  assert.match(xml, /template="https:\/\/composition\.example\/search\/\?q=\{searchTerms\}"/);
});

test('ONE build stamp reaches every module that publishes a dated document', () => {
  // The point of a build stamp is that a reader can COMPARE surfaces: the
  // twins, both link indexes, /about.md and the search index all come out of
  // one deploy, and a reader who finds two values there learns nothing except
  // that the site is unreliable. Neither module's own suite can see this --
  // each is proven against a fixture that imports it alone -- so the shared
  // value is a composition property or it is nothing.
  const stamp = /^> Build time: (.+)$/m.exec(published('llms.txt'));
  assert.ok(stamp, 'the compact link index must carry a build-time line');
  const value = stamp[1];
  assert.match(
    value,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/,
    'RFC 3339 with an offset',
  );

  assert.equal(/^> Build time: (.+)$/m.exec(published('about.md'))[1], value, 'about.md agrees');
  assert.equal(
    /^> Build time: (.+)$/m.exec(published('llms-index.txt'))[1],
    value,
    'the complete link index agrees',
  );
  // Compared as a literal rather than through a constructed pattern: the
  // offset's `+` is a regex quantifier, and a RegExp built from the value
  // would quietly match a DIFFERENT timestamp.
  assert.ok(
    published('index.md').includes(`\nbuild_time: "${value}"\n`),
    "the home twin's front-matter stamp agrees",
  );
  assert.equal(
    JSON.parse(published('searchindex.json')).generated,
    value,
    'and the search index, published by a DIFFERENT module, carries the same string',
  );
});

test('the search module reaches that stamp by DELEGATION, not by coincidence', () => {
  // The equality above is necessary and nowhere near sufficient. This fixture
  // builds in well under a second while the stamp's precision is one second,
  // so a search module that computed its own value would print the same
  // string and satisfy every assertion in the test above. Deleting the
  // delegation changes no published byte anywhere in this tree.
  //
  // The store entries are what cannot be faked. search/lib/build-time.html
  // delegates to agent-readiness/build-time.html when that partial exists, so
  // here the search module's own fallback must never run: `search:build-time`
  // stays EMPTY while `agent-readiness:build-time` holds the value. The
  // fixture's probe calls each resolver immediately before reading its key,
  // so the observation cannot depend on render order.
  //
  // This is also the only place the repository verifies that templates.Exists
  // sees a partial mounted from a MODULE rather than from the project -- the
  // fact the whole soft-dependency design rests on.
  const html = published('index.html');
  const attr = (name) => {
    const match = new RegExp(`${name}="([^"]*)"`).exec(html);
    assert.ok(match, `the fixture probe must emit ${name}`);
    return match[1];
  };

  assert.equal(
    attr('data-search-store'),
    '',
    'the search module must not write its own stamp key when the sibling is present',
  );
  assert.ok(
    attr('data-agent-store').length > 0,
    'while the sibling module must have written its own',
  );
  // Both resolvers return one string. The attribute values are HTML-escaped
  // (`+` becomes `&#43;`), which is why they are compared with each other
  // rather than with the published RFC 3339 text.
  assert.equal(attr('data-search-resolved'), attr('data-agent-resolved'));
  assert.equal(attr('data-agent-resolved'), attr('data-agent-store'));
});

// A module owns the templates of the output formats it ships, and several of
// them publish NOTHING on purpose -- a twin withheld from an excluded page, an
// Agent Skills index withheld when no skill resolves. Hugo publishes no file
// for a zero-byte render and reports that nowhere: the format stays listed on
// the page with a resolving .RelPermalink, at every log level. So the manifest
// asks the owner through _partials/url-retirement/publishes/<format>.html, and
// the answer has to cross a module boundary to arrive.
//
// No single-module suite can see this. url-retirement's own fixture ships its
// hooks itself, and agent-readiness's fixture has no manifest to correct.
const manifestUrls = () =>
  published('url-manifest.txt')
    .split(/\r?\n/)
    .filter((line) => line !== '' && !line.startsWith('#'));

const servedFile = (url) =>
  url.endsWith('/') ? join(publicDir, url.slice(1), 'index.html') : join(publicDir, url.slice(1));

test('every URL the manifest lists is a file this build wrote', () => {
  const urls = manifestUrls();
  assert.ok(urls.length > 5, 'the manifest must list something for this to mean anything');
  for (const url of urls)
    assert.ok(existsSync(servedFile(url)), `${url} is listed but no file was published for it`);
});

// The mirror of the assertion above, and the direction that fails SILENTLY: a
// wrong answer from any module's hook removes a URL production really serves,
// and the coverage check the manifest exists for then stops seeing it. Nothing
// in the tree comparison catches that, because a short manifest is consistent
// with itself.
test('and every module document the build serves is listed', () => {
  const urls = manifestUrls();
  for (const url of [
    '/',
    '/index.md',
    '/llms.txt',
    '/llms-index.txt',
    '/about.md',
    '/searchindex.json',
    '/opensearch.xml',
    '/manifest.webmanifest',
    '/url-manifest.txt',
  ]) {
    assert.ok(existsSync(servedFile(url)), `${url} must be published for this to mean anything`);
    assert.ok(urls.includes(url), `${url} is served but missing from the manifest`);
  }
});

test('a page the twin renderer excludes keeps its own URL and loses its twin', () => {
  // The fixture's search page is excluded by agent-readiness's own
  // exclude_search_page tier, so the markdown format is wired on it and
  // publishes nothing.
  assert.ok(existsSync(join(publicDir, 'search', 'index.html')), 'the fixture premise changed');
  assert.ok(!existsSync(join(publicDir, 'search', 'index.md')), 'the fixture premise changed');
  const urls = manifestUrls();
  assert.ok(urls.includes('/search/'), 'the page itself was dropped with its twin');
  assert.ok(!urls.includes('/search/index.md'), 'a twin that was never written is listed');
});

test('and the pages that do publish a twin keep theirs', () => {
  const urls = manifestUrls();
  for (const url of ['/index.md', '/blog/index.md', '/blog/post/index.md'])
    assert.ok(urls.includes(url), `${url} is published but missing from the manifest`);
});

test('a site-level document withheld for want of content is not listed either', () => {
  // agent-readiness withholds the Agent Skills index outright when no skill
  // resolves -- an empty index at a .well-known path claims a capability that
  // does not exist -- and this fixture configures none.
  const url = '/.well-known/agent-skills/index.json';
  assert.ok(!existsSync(servedFile(url)), 'the fixture premise changed');
  assert.ok(!manifestUrls().includes(url), 'a document that was never written is listed');
});

// The other direction of the same problem, and the one no hook can reach. The
// manifest is built by crossing pages with their output formats, so a URL that
// belongs to no page is invisible to it however correct every hook is: the pwa
// module's offline page carries build.list = never and is therefore in no page
// collection at all, and its service worker is not a page but a Resource. Both
// are stable URLs a real deployment serves, and a 404 at either one is a defect
// -- silently, since the registry meant to catch it cannot see them.
// The positive control for every `!sitemap.includes(...)` below. Those read
// the raw bytes, so an EMPTY or truncated sitemap satisfies all of them at
// once and the registry checks they support go quietly vacuous -- reading
// `published` only rules out the file being missing, never its being empty.
// This suite carries no dependencies by design, so the control is not an XML
// parse (the seo suite owns the well-formedness gate) but the substance: the
// document really does list pages, every one of them was published, and every
// one is in the manifest too, which is the containment the absence checks
// below assume in the other direction.
test('the sitemap lists pages this build published, which is what the absence checks rest on', () => {
  const locs = [...published('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 0, 'the sitemap lists nothing at all');
  const urls = manifestUrls();
  for (const loc of locs) {
    const url = new URL(loc).pathname;
    assert.ok(existsSync(servedFile(url)), `the sitemap lists ${url}, which was never published`);
    assert.ok(urls.includes(url), `the sitemap lists ${url} and the manifest does not`);
  }
});

test('a URL no page carries is listed because the module that published it said so', () => {
  const urls = manifestUrls();
  const sitemap = published('sitemap.xml');
  for (const url of ['/offline/', '/sw.js']) {
    assert.ok(existsSync(servedFile(url)), `${url} must be published for this to mean anything`);
    assert.ok(urls.includes(url), `${url} is served but missing from the manifest`);
    // The sitemap is the page walk's own projection, so a URL it does not carry
    // is one nothing but a registration could have put in the manifest.
    assert.ok(!sitemap.includes(url), `${url} is reachable by walking pages after all`);
  }
});

// And the URLs deliberately left out. A fingerprinted name changes with its own
// contents, so listing one would report a retirement and a new URL on every
// rebuild in the one document whose only use is showing what really changed.
// The pwa module publishes such scripts beside the worker it does register,
// which is what makes this a decision rather than an oversight.
test('and a content-addressed URL is deliberately not', () => {
  const hashed = readdirSync(join(publicDir, 'pwa')).filter((name) => name.endsWith('.js'));
  assert.ok(hashed.length > 0, 'the fixture publishes no fingerprinted script to check');
  const urls = manifestUrls();
  for (const name of hashed) {
    assert.match(name, /\.[0-9a-f]{40,}\.js$/, `${name} does not look content-addressed`);
    assert.ok(!urls.includes(`/pwa/${name}`), `the content-addressed /pwa/${name} is listed`);
  }
});

// The same arrival path, for the files a site's own CONTENT publishes. Four
// modules read the URL of a resource here while rendering ordinary content, and
// reading it is what writes the file: a page-bundle raster through the image
// shortcode, a bundled SVG the seo module passes through uncropped, a global
// icon asset the callout resolves, and a share image. None of the four is a
// Page, so no walk of the page graph reaches any of them, and a consumer
// configured none of them for the registry.
const CONTENT_ASSET_URLS = [
  '/blog/gallery/shot.png',
  '/blog/gallery/card.svg',
  '/icons/star.svg',
  '/social/share-card.png',
];

test('a file a module published out of this site own content is listed too', () => {
  const urls = manifestUrls();
  const sitemap = published('sitemap.xml');
  for (const url of CONTENT_ASSET_URLS) {
    assert.ok(existsSync(servedFile(url)), `${url} must be published for this to mean anything`);
    assert.ok(urls.includes(url), `${url} is served but missing from the manifest`);
    assert.ok(!sitemap.includes(url), `${url} is reachable by walking pages after all`);
  }
});

// The other half of that decision, and the one that makes it safe. These
// modules publish DERIVATIVES of the same files -- a resized raster, a composed
// card -- under names carrying a hash of their own contents, and every one of
// them must stay out: a name that changes with its source would report a
// retirement and a new URL on every rebuild. The set is derived by walking the
// tree rather than listed here, so a new derivative cannot arrive unchecked.
test('while every derivative they published is deliberately left out', () => {
  const derived = readdirSync(publicDir, {recursive: true})
    .map((name) => `/${String(name).split('\\').join('/')}`)
    .filter((url) => /_hu_[0-9a-f]+/.test(url));
  assert.ok(derived.length > 0, 'the fixture publishes no derivative to check');
  const urls = manifestUrls();
  for (const url of derived)
    assert.ok(!urls.includes(url), `the content-addressed ${url} is listed`);
});

test('and those registrations come from the owning modules, not from the fixture', () => {
  // White-box, for the same reason as the pwa assertion below: the manifest
  // would look identical if this fixture had registered the URLs itself.
  const owners = [
    [join(modulesRoot, 'seo'), 'layouts/_partials/seo/lib/image-url.html'],
    [join(modulesRoot, 'images'), 'layouts/_partials/images/resolve/source.html'],
    [join(modulesRoot, 'social-share'), 'layouts/_partials/social-share/lib/register-url.html'],
    [join(modulesRoot, 'carousel'), 'layouts/_partials/carousel/slides.html'],
    [resolve(modulesRoot, '..', 'shortcodes', 'callout'), 'layouts/_shortcodes/callout.html'],
  ];
  for (const [root, rel] of owners) {
    const source = readFileSync(join(root, rel), 'utf8');
    assert.match(
      source,
      /url-retirement\/register-url\.html/,
      `${rel} must register the URL it publishes`,
    );
  }
});

// The pull direction, which exists because a push cannot be placed reliably for
// this format: the artifacts are copied by whichever caller first reaches a
// shared resolution, and those callers sit in different render passes. The hook
// file has to live in the module that OWNS the format, beside the publishes/
// hook of the same name, and nowhere else.
test('the side-file hook for a format lives in the module that owns it', () => {
  assert.ok(
    existsSync(
      join(
        modulesRoot,
        'agent-readiness',
        'layouts',
        '_partials',
        'url-retirement',
        'writes',
        'agentskills.html',
      ),
    ),
    'agent-readiness must answer what else the agentskills format wrote',
  );
  assert.ok(
    !existsSync(join(fixtureDir, 'layouts', '_partials', 'url-retirement')),
    'the fixture must not answer for any format, or it proves nothing about modules',
  );
});

test('and the registrations behind those two URLs come from the owning module', () => {
  // White-box for the same reason the hook assertion below is: the manifest
  // would look identical if this fixture had registered the URLs itself, and
  // then it would prove nothing about what a consumer gets for free.
  for (const rel of ['layouts/offline/single.html', 'layouts/_partials/pwa/service-worker.html']) {
    const source = readFileSync(join(modulesRoot, 'pwa', rel), 'utf8');
    assert.match(
      source,
      /url-retirement\/register-url\.html/,
      `modules/pwa/${rel} must register the URL it publishes`,
    );
  }
  const fixtureTemplates = readdirSync(join(fixtureDir, 'layouts'), {recursive: true})
    .filter((name) => String(name).endsWith('.html'))
    .map((name) => readFileSync(join(fixtureDir, 'layouts', String(name)), 'utf8'));
  assert.deepEqual(
    fixtureTemplates.filter((source) => source.includes('register-url.html')),
    [],
    'the fixture registers a URL itself, so it proves nothing about the module',
  );
});

test('the answers behind those omissions come from the owning modules', () => {
  // White-box, because the behavioral assertions above would also pass if the
  // fixture answered for the formats itself: the files that decide them live
  // in the modules that OWN the formats, and nowhere else.
  for (const [moduleName, format] of [
    ['agent-readiness', 'markdown'],
    ['agent-readiness', 'agentskills'],
    ['search', 'searchindex'],
  ]) {
    const hook = join(
      modulesRoot,
      moduleName,
      'layouts',
      '_partials',
      'url-retirement',
      'publishes',
      `${format}.html`,
    );
    assert.ok(existsSync(hook), `${moduleName} must answer for the ${format} format it owns`);
  }
  assert.ok(
    !existsSync(join(fixtureDir, 'layouts', '_partials', 'url-retirement')),
    'the fixture must not answer for any format, or it proves nothing about modules',
  );
});

test('the combined build reports no warning, error or deprecation line', () => {
  // Every module in the chain degrades by warning rather than failing, so a
  // silent composition regression surfaces here first: an exit-0 build whose
  // log carries a module warning is a module that could not do its job in
  // company.
  const log = readFileSync(buildLog, 'utf8');
  const flagged = log
    .split(/\r?\n/)
    .filter((line) => /(^|\s)(WARN|ERROR)\s/.test(line) || /deprecat/i.test(line));
  assert.deepEqual(flagged, []);
});
