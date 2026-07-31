// The shape matrix of the three list-valued config keys: sections,
// taxonomies and stopwords_extra.
//
// Two spellings are documented and equivalent: a list and a comma-separated
// string. Anything else -- a TOML table, a boolean -- has no list spelling at
// all, and stringifying it produces a single entry that is a Go debug form
// ("map[t:tags]") or a bare word ("false"). Neither matches anything, so a
// mis-shaped `sections` value empties the whole index, and a mis-shaped
// `taxonomies` or `stopwords_extra` value reaches the client options. The
// documented degradation is therefore the module's own warn-and-fall-back
// idiom: exactly one [search] warning naming the key, and the shipped
// defaults in force.
//
// Three static overlay builds cover the matrix cells the served fixture
// cannot: it writes all three keys as comma-separated strings, which is the
// fourth cell and is asserted here too, from its own captured log.
/* global process */
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const dirs = {
  tables: process.env.SHAPE_TABLES_DIR,
  bools: process.env.SHAPE_BOOLS_DIR,
  lists: process.env.SHAPE_LISTS_DIR,
};

const KEYS = ['sections', 'taxonomies', 'stopwords_extra'];

function envelope(dir) {
  return JSON.parse(readFileSync(join(dir, 'searchindex.json'), 'utf8'));
}

function options(dir) {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const attr = /data-search-options="([^"]*)"/.exec(html)?.[1];
  expect(attr, 'the home surface must carry resolved client options').toBeTruthy();
  return JSON.parse(attr.replaceAll('&#34;', '"').replaceAll('&amp;', '&'));
}

// One warning per key, counted from the build log: the module funnels every
// warning through a per-build sentinel, so a value repeated across every page
// of the site must still surface exactly once.
function shapeWarnings(dir, key) {
  const log = readFileSync(dir + '.log', 'utf8');
  const pattern = new RegExp(`\\[search\\] Ignoring the ${key} value`, 'g');
  return log.match(pattern) ?? [];
}

for (const [shape, dirKey] of [
  ['table', 'tables'],
  ['boolean', 'bools'],
]) {
  test(`a ${shape} written for each list-valued key warns once and falls back to the defaults`, () => {
    const dir = dirs[dirKey];
    expect(dir, `the runner must export the ${shape} shape build directory`).toBeTruthy();

    for (const key of KEYS) {
      expect(shapeWarnings(dir, key), `exactly one warning for ${key}`).toHaveLength(1);
    }

    // The shipped defaults are an empty sections allow-list (every section is
    // in scope), the two default taxonomies, and no extra stopwords.
    const env = envelope(dir);
    expect(env.docCount).toBe(env.docs.length);
    expect(env.docCount).toBeGreaterThan(0);
    expect(env.docs.map((d) => d.href)).toContain('/blog/quantum-notes/');

    const opts = options(dir);
    expect(opts.taxonomies).toEqual(['tags', 'categories']);
    expect(opts.stopwordsExtra).toEqual([]);
  });

  test(`a ${shape} written for each list-valued key never reaches an emitted value`, () => {
    const dir = dirs[dirKey];
    const raw = readFileSync(join(dir, 'searchindex.json'), 'utf8');
    const html = readFileSync(join(dir, 'index.html'), 'utf8');

    // "map[" is Go's debug spelling of a map and can only appear in emitted
    // output when a value was stringified that had no string spelling; the
    // bare words are the boolean equivalent, asserted where the client reads
    // its taxonomy and stopword lists.
    for (const document of [raw, html]) {
      expect(document).not.toContain('map[');
    }
    const opts = options(dir);
    for (const value of [...opts.taxonomies, ...opts.stopwordsExtra]) {
      expect(['true', 'false']).not.toContain(value);
    }
  });
}

test('the list spelling is honored as written and logs no shape warning', () => {
  const dir = dirs.lists;
  expect(dir, 'the runner must export SHAPE_LISTS_DIR').toBeTruthy();

  for (const key of KEYS) {
    expect(shapeWarnings(dir, key), `no warning for a list-shaped ${key}`).toHaveLength(0);
  }

  // The overlay allow-lists two sections, one of them nested and one written
  // in the wrong case, so the emitted scope proves the list entries were read
  // individually rather than stringified whole.
  const env = envelope(dir);
  const hrefs = env.docs.map((d) => d.href);
  expect(hrefs).toContain('/blog/quantum-notes/');
  expect(hrefs).toContain('/docs/guides/nested/');
  expect(hrefs).not.toContain('/hostile/');

  const opts = options(dir);
  expect(opts.taxonomies).toEqual(['tags']);
  // Extra stopwords are lowercased for the client pipeline, which normalizes
  // its terms before matching them.
  expect(opts.stopwordsExtra).toEqual(['zeta']);
});

test('the comma-separated spelling is honored as written and logs no shape warning', () => {
  // The served fixture writes all three keys as comma-separated strings; the
  // scalar-tables overlay is built from that same base configuration, so its
  // captured log is the one place this build's warnings can be counted.
  const dir = process.env.SCALAR_TABLES_DIR;
  expect(dir, 'the runner must export SCALAR_TABLES_DIR').toBeTruthy();

  for (const key of KEYS) {
    expect(shapeWarnings(dir, key), `no warning for a CSV-shaped ${key}`).toHaveLength(0);
  }

  const env = envelope(dir);
  const hrefs = env.docs.map((d) => d.href);
  expect(hrefs).toContain('/blog/quantum-notes/');
  expect(hrefs).toContain('/docs/guides/nested/');
  expect(hrefs).not.toContain('/promo/');
});
