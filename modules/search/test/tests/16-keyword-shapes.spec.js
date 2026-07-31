// The shape matrix of the page-level `search.keywords` front matter key.
//
// Two spellings carry terms: a list and a comma-separated string. A map and a
// boolean carry none, at either level -- as the whole key, or as one entry
// inside a keywords list. Stringifying such a value produces a Go debug form
// ("map[branch:trunk]") or a bare word ("true"), and a bare word is the worse
// of the two because it looks like an ordinary term: it enters the boosted
// keywords field, so every page written that way answers a query for "true".
// The documented degradation is the module's warn-and-fall-back idiom --
// exactly one [search] warning naming the page, the whole key treated as
// absent (the standard `keywords` front matter fallback still applies), and a
// single unusable entry skipped while its scalar siblings still index.
//
// The assertions read the scalar-tables overlay build: it is built from the
// same base configuration as the served fixture, and its log is captured, so
// the emitted records and the warning counts come from one build.
/* global process */
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.env.SCALAR_TABLES_DIR;

function envelope() {
  expect(dir, 'the runner must export SCALAR_TABLES_DIR').toBeTruthy();
  return JSON.parse(readFileSync(join(dir, 'searchindex.json'), 'utf8'));
}

function log() {
  return readFileSync(dir + '.log', 'utf8');
}

function warnings(pattern) {
  return log().match(new RegExp(pattern, 'g')) ?? [];
}

test('a boolean written as the whole search.keywords key warns once and falls back to the standard keywords', () => {
  const doc = envelope().docs.find((d) => d.href === '/bool-keywords/');
  expect(doc, 'the boolean-keywords page must be indexed').toBeTruthy();

  // The page writes `search.keywords: true` beside `keywords: ['chronometer-kw']`:
  // the boolean has no term spelling, so the record must read exactly as if
  // search.keywords were absent.
  expect(doc.keywords).toEqual(['chronometer-kw']);
  expect(doc.keywords).not.toContain('true');

  expect(
    warnings('\\[search\\] Ignoring search\\.keywords on /bool-keywords:'),
    'exactly one warning for the boolean-shaped key',
  ).toHaveLength(1);
});

test('a boolean entry inside a keywords list is skipped once while its scalar sibling still indexes', () => {
  const doc = envelope().docs.find((d) => d.href === '/bool-entry-keywords/');
  expect(doc, 'the boolean-entry page must be indexed').toBeTruthy();

  // `search.keywords: ['charted-kw', false]`: the scalar entry indexes, the
  // boolean entry contributes nothing at all -- not an empty string, not the
  // bare word.
  expect(doc.keywords).toEqual(['charted-kw']);

  expect(
    warnings('\\[search\\] Skipping a keywords entry on /bool-entry-keywords:'),
    'exactly one warning for the boolean-shaped entry',
  ).toHaveLength(1);
});

test('no record in the build carries a bare boolean word as a keyword', () => {
  // Stated over every record rather than the two probe pages alone: the gate
  // belongs to the record builder, so any page written that way must degrade
  // the same, and a keywords array is the one place the bare word would be
  // indistinguishable from an authored term.
  for (const doc of envelope().docs) {
    for (const term of doc.keywords ?? []) {
      expect(['true', 'false']).not.toContain(term);
    }
  }
});
