// The Markdown twins.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse as parseYaml} from 'yaml';
import {
  read,
  exists,
  publicDir,
  configuredDir,
  publishedTwins,
  splitFrontMatter,
  warnCount,
  BASE_URL,
} from './helpers.js';

// Strict YAML with duplicate-key detection: `uniqueKeys` makes a repeated
// mapping key an error rather than a silently-kept last value. This is the
// exact parser behavior the twins exist to satisfy, so the suite uses it.
const parseStrict = (text) => parseYaml(text, {uniqueKeys: true, strict: true});

const frontMatterKeys = (rel, dir) =>
  splitFrontMatter(read(rel, dir))
    .frontMatter.split('\n')
    .filter((l) => /^[a-z_]+:/.test(l))
    .map((l) => l.split(':')[0]);

test('a page twin opens with front matter and carries the fixed field order', () => {
  const text = read('blog/post-one/index.md');
  assert.ok(text.startsWith('---\n'), 'a twin must open with the front-matter fence');

  const keys = frontMatterKeys('blog/post-one/index.md', publicDir);
  assert.equal(keys[0], 'title', 'title is always first');
  assert.equal(keys[1], 'description', 'description follows when non-empty');
  assert.equal(keys.at(-1), 'canonical', 'canonical is ALWAYS last');
  assert.ok(!keys.includes('license'), 'no license key in the baseline build');

  // The per-section keys sit between the builder's always-on fields and the
  // trailing canonical, in the order the consumer declared them.
  assert.deepEqual(keys.slice(4, -1), ['categories', 'tags', 'keywords']);
});

test('license sits immediately before the always-last canonical', () => {
  const keys = frontMatterKeys('blog/post-one/index.md', configuredDir);
  assert.equal(keys.at(-1), 'canonical', 'canonical is ALWAYS last');
  assert.equal(keys.at(-2), 'license', 'license sits immediately before canonical');
});

test('every published twin parses under strict YAML with duplicate-key detection', () => {
  for (const dir of [publicDir, configuredDir]) {
    for (const twin of publishedTwins(dir)) {
      const {frontMatter} = splitFrontMatter(read(twin.replace(/^\//, ''), dir));
      assert.ok(frontMatter, `${twin} must carry a front-matter block`);
      assert.doesNotThrow(() => parseStrict(frontMatter), `${twin} front matter must parse`);
    }
  }
});

test('a per-section key that repeats a builder key is skipped, with one warning', () => {
  // The fixture deliberately lists `title` in [params.agent.frontmatter.blog].
  // Two equal keys in one YAML mapping node make the whole block invalid to
  // strict parsers, which is exactly the tooling twins exist for.
  assert.equal(warnCount(/duplicate-frontmatter-key|Skipping the "title" key/), 1);
  const {frontMatter} = splitFrontMatter(read('blog/post-one/index.md'));
  const titleLines = frontMatter.split('\n').filter((l) => l.startsWith('title:'));
  assert.equal(titleLines.length, 1, 'exactly one title key survives');
});

test('canonical is the page HTML URL, not the twin URL', () => {
  const fm = parseStrict(splitFrontMatter(read('blog/post-one/index.md')).frontMatter);
  assert.equal(fm.canonical, `${BASE_URL}/blog/post-one/`);
});

test('values are emitted through jsonify, so scalars are quoted and safe', () => {
  const raw = splitFrontMatter(read('projects/beta/index.md')).frontMatter;
  // The fixture title carries a colon and a comma, which unquoted would make
  // the mapping entry ambiguous or invalid.
  assert.match(raw, /^title: "Project Beta: a title, with punctuation"$/m);
  assert.match(raw, /^period_from: "2024-03-01"$/m, 'dates are quoted strings');
});

test('a front-matter key carrying a line break cannot split the twin mapping line', () => {
  // The per-section keys are the one consumer-authored string on the KEY
  // side of the twin's YAML mapping, where jsonify does not already stand
  // guard: emitted raw, an embedded line break splits the mapping entry
  // across two lines and strict parsers reject the whole block. A key that
  // is not a plain token is emitted as its JSON-quoted form, which YAML
  // reads as the identical key on one line.
  const raw = splitFrontMatter(read('blog/post-two/index.md')).frontMatter;
  assert.match(raw, /^"probe\\nkey": "probe value"$/m, 'the hostile key is quoted onto one line');
  assert.equal(parseStrict(raw)['probe\nkey'], 'probe value', 'the parsed key survives byte-exact');
});

test('the present sentinel is OMITTED from the twin front matter', () => {
  // It is a display convention for an open-ended range; the literal string is
  // not a date and must never reach a machine surface.
  const raw = splitFrontMatter(read('projects/alpha/index.md')).frontMatter;
  assert.ok(!/period_to/.test(raw), 'no period_to line at all when the value is `present`');
  assert.ok(!/present/.test(raw));
});

test('last_updated is emitted only when it differs from date', () => {
  const withLastmod = parseStrict(splitFrontMatter(read('blog/post-one/index.md')).frontMatter);
  assert.equal(withLastmod.last_updated, '2026-06-15');

  const without = parseStrict(splitFrontMatter(read('blog/post-two/index.md')).frontMatter);
  assert.ok(
    !('last_updated' in without),
    'a last_updated equal to date is noise and must be omitted',
  );
});

test('the body is rendered Markdown with shortcode output inline and no chrome', () => {
  const {body} = splitFrontMatter(read('blog/post-one/index.md'));
  assert.match(body, /^## A heading$/m, 'heading syntax survives as Markdown');
  assert.match(body, /\*\*bold\*\*/, 'emphasis survives as Markdown');
  assert.match(body, /<div class="probe" data-x="alpha">PROBE alpha<\/div>/, 'shortcode expanded');
  assert.ok(!body.includes('FIXTURE CHROME HEADER'), 'no site chrome');
  assert.ok(!body.includes('FIXTURE CHROME FOOTER'));
  assert.ok(!body.includes('<html'), 'a twin is not an HTML document');
});

test('home and section twins exist and carry a canonical', () => {
  for (const [twin, expected] of [
    ['index.md', `${BASE_URL}/`],
    ['blog/index.md', `${BASE_URL}/blog/`],
    ['projects/index.md', `${BASE_URL}/projects/`],
  ]) {
    assert.ok(exists(twin), `${twin} must exist`);
    const text = read(twin);
    assert.ok(text.startsWith('---\n'));
    assert.equal(parseStrict(splitFrontMatter(text).frontMatter).canonical, expected);
  }
});

test('restating rss on the section outputs list kept every section feed', () => {
  // Hugo REPLACES the outputs list per kind. Dropping RSS from the section
  // line silently deletes every section feed with no error; this count is
  // what catches it.
  for (const feed of ['index.xml', 'blog/index.xml', 'projects/index.xml']) {
    assert.ok(exists(feed), `${feed} must survive the section outputs replacement`);
  }
});

test('an opted-out page produces no twin at all', () => {
  assert.ok(!exists('blog/excluded/index.md'), '`agent: false` must suppress the twin');
  assert.ok(exists('blog/excluded/index.html'), 'its HTML page still publishes');
});

test('a noindex page and the search page produce no twin', () => {
  assert.ok(!exists('blog/noindexed/index.md'));
  assert.ok(!exists('search/index.md'));
});

test('sitemap.xml contains zero .md URLs', () => {
  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 0, 'the sitemap must list something');
  assert.deepEqual(
    locs.filter((u) => u.endsWith('.md')),
    [],
    'a secondary output format must never appear in the sitemap',
  );
});

test('the license line is inert when unset and present when configured', () => {
  for (const twin of publishedTwins(publicDir)) {
    const {frontMatter} = splitFrontMatter(read(twin.replace(/^\//, ''), publicDir));
    assert.ok(!/^license:/m.test(frontMatter), `${twin} must carry no license when unset`);
  }
  for (const twin of publishedTwins(configuredDir)) {
    const {frontMatter} = splitFrontMatter(read(twin.replace(/^\//, ''), configuredDir));
    const lines = frontMatter.split('\n').filter((l) => l.startsWith('license:'));
    assert.equal(lines.length, 1, `${twin} must carry exactly one license line`);
    assert.equal(lines[0], 'license: "https://creativecommons.org/licenses/by/4.0/"');
  }
});
