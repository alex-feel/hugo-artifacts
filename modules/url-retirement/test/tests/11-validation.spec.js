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
    what: 'a table given to the pagination segment',
    match: /Ignoring url_retirement\.redirects\.pagination_path.*map\[not:a segment\]/,
  },
  // Each regex pins the value AND the clause that names the fault, because the
  // messages share a prefix through the colon: a guard that stopped firing
  // would let the next arm answer in its place with the same quoted value, and
  // a regex ending at the colon would still match.
  {
    what: 'a manifest.extra entry that is not server-relative',
    match: /extra entry "no-leading-slash\.html".*entries are server-relative/,
  },
  {
    what: 'a manifest.extra entry that is an absolute URL',
    match: /extra entry "https:\/\/elsewhere\.example\/x".*entries are server-relative/,
  },
  {
    what: 'a manifest.extra entry that is a protocol-relative URL',
    match: /extra entry "\/\/elsewhere\.example\/z".*protocol-relative URL naming another host/,
  },
  // An empty entry passes a leading-slash test only by never reaching one, and
  // dropping it in silence would leave the site believing the URL it meant to
  // name is covered.
  {
    what: 'an empty manifest.extra entry',
    match: /Ignoring an empty url_retirement\.manifest\.extra entry/,
  },
  // The same faults on the subtracting key, where the diagnostic is the ONLY
  // signal: a malformed exclusion matches no URL, so the manifest it was meant
  // to shorten comes out exactly as it would have anyway.
  {
    what: 'a manifest.exclude entry that is not server-relative',
    match: /exclude entry "no-leading-slash-either\.html".*entries are server-relative/,
  },
  {
    what: 'a manifest.exclude entry that is an absolute URL',
    match: /exclude entry "https:\/\/elsewhere\.example\/y".*entries are server-relative/,
  },
  // Whitespace is fatal to the file format rather than merely wrong: the
  // manifest promises one URL per line, and every reader of it splits on
  // newlines.
  {
    what: 'a manifest.exclude entry carrying whitespace',
    match: /exclude entry "\/has a space\.html".*may not contain whitespace/,
  },
  // The same discipline for the CALL rather than for a configured value. A
  // module author registering a URL cannot get these wrong through
  // configuration -- no key can express passing no page, or a table where a URL
  // belongs -- so the fixture makes the malformed calls itself. Each has to be
  // reported on its own terms: told only that "nothing was recorded", an author
  // has no way to tell a missing page from a mistyped path. The first is the
  // fault of passing the page the way every other partial in this module takes
  // it: reading a named key off a page RAISES, and a module that raises stops a
  // consuming build.
  {
    what: 'a registration made with no context dict at all',
    match: /register-url\.html was called with a string instead of a context dict/,
  },
  {
    what: 'a registration made without a page',
    match: /register-url\.html was called without a page/,
  },
  {
    what: 'a registration naming no URL at all',
    match: /register-url\.html was called on .+? with none of \.url, \.urls or \.resource/,
  },
  {
    what: 'a registration whose .urls is not a list',
    match: /Ignoring the \.urls value "map\[not:a list\]"/,
  },
  {
    what: 'a registration whose URL is a table',
    match: /Ignoring the URL "map\[not:a url\]".*a URL is one path written as a single value/,
  },
  // A boolean is the sharpest of the shapes: it is truthy, so a check written
  // as "is there a value" accepts it and publishes the word `true` as a path.
  {
    what: 'a registration whose URL is a boolean',
    match: /Ignoring the URL "true".*a URL is one path written as a single value/,
  },
  // A list handed to the single-URL key. Hugo's `append` flattens a slice
  // argument into its elements, so a version of this partial that accumulated
  // candidates with it would take the list apart and register both silently.
  {
    what: 'a registration whose .url is a list',
    match: /Ignoring the URL "\[\/a\.txt \/b\.txt\]".*a URL is one path written as a single value/,
  },
  {
    what: 'a registration whose URL is empty',
    match: /Ignoring an empty URL passed to register-url\.html/,
  },
  {
    what: 'a registration whose URL is not server-relative',
    match: /Ignoring the URL "no-leading-slash\.txt".*must start with "\/"/,
  },
  {
    what: 'a registration whose URL is protocol-relative',
    match:
      /Ignoring the URL "\/\/elsewhere\.example\/x".*protocol-relative URL naming another host/,
  },
  {
    what: 'a registration whose URL carries whitespace',
    match: /Ignoring the URL "\/has a space\.txt".*may not contain whitespace/,
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

// The two keys hold the same shape and share one validator, so the message is
// the only place their difference can be stated -- and a reader who is told the
// entry "is left out of /url-manifest.txt" when it was an EXCLUSION has been
// told the opposite of what happened.
test('an exclude diagnostic says what that rejection cost, not what an extra one would', () => {
  const lines = moduleWarnings('shapes').filter((l) => l.includes('manifest.exclude entry'));
  assert.equal(lines.length, 3, 'the exclude faults are not all reported');
  for (const line of lines) assert.match(line, /Nothing is left out of \/url-manifest\.txt for it/);
});

test('a rejected manifest.exclude entry removes nothing', () => {
  assert.ok(
    manifest(shapesDir).urls.includes('/posts/index.xml'),
    'a URL left the manifest on the strength of a rejected exclusion',
  );
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

// A host resolves one retired URL to one rule, so every page but one silently
// never receives its traffic. Three claimants rather than two on purpose: with a
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
