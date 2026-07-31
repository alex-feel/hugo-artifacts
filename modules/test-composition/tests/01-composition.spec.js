/* global process */
// Cross-module composition assertions.
//
// Each of seo, agent-readiness and search is proven on its own by its own
// suite, against a fixture that imports that module alone. None of those
// fixtures can see the one surface the three modules SHARE: the consuming
// site's single `[outputs]` table.
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
// hold it to the union of what the three modules define.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
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
    'about.md',
    'index.md',
    'searchindex.json',
    'opensearch.xml',
    'robots.txt',
    'index.html',
  ]) {
    assert.ok(existsSync(join(publicDir, relPath)), `public/${relPath} must be published`);
    assert.ok(published(relPath).trim().length > 0, `public/${relPath} must not be empty`);
  }
});

test('the merged home list carries every format the three modules define', () => {
  const home = homeOutputs();
  const defined = [...moduleFormats('agent-readiness'), ...moduleFormats('search')];
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
  for (const format of ['html', 'rss', 'markdown']) {
    assert.ok(home.includes(format), `the merged home list must restate ${format}`);
  }
});

test('the fixture configuration carries exactly one outputs table', () => {
  // Two [outputs] tables in one file is a config-load failure, so the merged
  // single table is the only shape a consumer can hold all three modules in.
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
