// The validation surface the README promises: "every rejected value warns once
// and leaves the shipped default standing". Each fault here is one a consumer
// really makes, and each has to be REPORTED rather than silently obeyed --
// a boolean is the sharpest case, because reading an unrecognized value as
// false switches a document off, which is the loudest thing this module does
// and the quietest way to arrive there.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  shapesDir,
  partialDir,
  conflictDir,
  multiPartialDir,
  moduleWarnings,
  manifest,
  redirectRules,
  docExists,
} from './helpers.js';

const SHAPE_FAULTS = [
  {
    what: 'a misspelled master switch',
    match: /Ignoring url_retirement\.enable value "yse".*leaving it true/,
  },
  {
    what: 'a misspelled per-document switch',
    match: /Ignoring url_retirement\.redirects\.enable value "nope".*using true instead/,
  },
  {
    what: 'a misspelled boolean setting',
    match: /Ignoring url_retirement\.manifest\.output_formats value "maybe".*using true instead/,
  },
  {
    what: 'a table given to the rules path',
    match: /Ignoring url_retirement\.redirects\.rules.*map\[not:a path\]/,
  },
  {
    what: 'a manifest.extra entry that is not server-relative',
    match: /Ignoring the url_retirement\.manifest\.extra entry "no-leading-slash\.html"/,
  },
  {
    what: 'a manifest.extra entry that is an absolute URL',
    match: /Ignoring the url_retirement\.manifest\.extra entry "https:\/\/elsewhere\.example\/x"/,
  },
];

for (const fault of SHAPE_FAULTS) {
  test(`${fault.what} is reported`, () => {
    const hits = moduleWarnings('shapes').filter((line) => fault.match.test(line));
    assert.equal(hits.length, 1, `expected exactly one diagnostic, got ${hits.length}`);
  });
}

test('and nothing else is reported', () => {
  assert.equal(moduleWarnings('shapes').length, SHAPE_FAULTS.length);
});

// A boolean that resolved to false would take the whole document with it, so
// "the default stood" is checked against published bytes rather than a log line.
test('an unrecognized boolean leaves both documents publishing', () => {
  assert.ok(redirectRules(shapesDir).length > 0);
  assert.ok(manifest(shapesDir).urls.length > 0);
});

test('a rejected manifest.extra entry is dropped and an accepted one is kept', () => {
  const {urls} = manifest(shapesDir);
  assert.ok(urls.includes('/kept.html'), 'the well-formed entry was dropped');
  assert.ok(!urls.some((u) => u.includes('elsewhere.example')), 'an absolute URL reached the file');
  assert.ok(!urls.some((u) => u.includes('no-leading-slash')), 'a bare word reached the file');
  assert.ok(!urls.some((u) => u.startsWith('map[')), 'a table was stringified into the file');
});

// The master switch turns both documents off together, so nothing else in the
// suite can tell it from the per-document ones.
test('one document can be switched off while the other keeps publishing', () => {
  assert.ok(!docExists(partialDir, '_redirects'), 'redirects.enable = false still published');
  assert.ok(docExists(partialDir, 'url-manifest.txt'), 'the manifest went with it');
  assert.ok(manifest(partialDir).urls.length > 0);
});

// Both hosts take the first matching rule, so every page but one silently never
// receives its traffic. Three claimants rather than two on purpose: with a
// per-alias deduplication key, a second pair would be suppressed as a duplicate
// of the first and one page would never be named at all.
test('three pages claiming one alias produce one diagnostic naming all three', () => {
  const lines = moduleWarnings('conflict').filter((l) => l.includes('claimed by more than one'));
  assert.equal(lines.length, 2, 'one diagnostic per emitted spelling of the alias');
  for (const line of lines) {
    for (const page of ['/page-a/', '/page-b/', '/page-c/'])
      assert.ok(line.includes(page), `${page} is missing from: ${line}`);
  }
});

test('the conflicting rules are all published, which is why the diagnostic matters', () => {
  const rules = redirectRules(conflictDir).filter((r) => r.from.startsWith('/shared-retired-url'));
  assert.equal(rules.length, 6, 'three pages by two spellings');
});

// The header is the only thing that tells a checker how many manifests exist,
// so naming one that was never written breaks the mechanism it exists to
// provide. Only a per-language read of the configuration can see this: the
// format wiring is identical in both languages.
test('a language that publishes no manifest is not named as a sibling', () => {
  assert.ok(!docExists(multiPartialDir, 'de/url-manifest.txt'), 'the fixture premise changed');
  const header = manifest(multiPartialDir).header.join('\n');
  assert.ok(
    !header.includes('Other languages'),
    `a sibling was named that does not exist:\n${header}`,
  );
});

test('the redirect map still covers that language', () => {
  const froms = redirectRules(multiPartialDir).map((r) => r.from);
  assert.ok(
    froms.includes('/de/alter-pfad/'),
    'switching a manifest off must not drop that language from the redirect map',
  );
});
