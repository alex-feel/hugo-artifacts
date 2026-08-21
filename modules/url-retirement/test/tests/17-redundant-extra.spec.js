// An `extra` entry naming a URL the build already reaches on its own changes
// nothing about the file: the two arrival paths are merged and deduplicated, so
// the manifest is byte-identical with the entry and without it. What the entry
// becomes is the problem. It is indistinguishable from a line that is the only
// thing carrying its URL, so the day the registration stops arriving it goes on
// holding the URL up and the regression reports nothing -- and the only way a
// site could tell the two apart was to empty the list and rebuild.
//
// The diagnostic that removes that blind spot has one hard constraint: `extra`
// is site-wide while every language renders its own manifest, so an entry can
// be redundant for one language and load-bearing for another. It is therefore
// asked of the whole build -- every language that NAMES the entry records a
// verdict, and only unanimity is reported. Both arms are proven here, each in
// the build that can see it, and every premise is asserted rather than assumed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  baselineDir,
  extraRedundantDir,
  manifest,
  moduleWarnings,
  multiExtraDir,
  multilingualDir,
  perLangExtraDir,
  publishedUrls,
} from './helpers.js';

const REGISTERED = '/probe/also-published-by-url-read.txt';
const SITEMAP = '/sitemap.xml';
const COPIED = '/probe/copied-verbatim.txt';
const GERMAN_SECTION = '/de/posts/';

const redundancyWarnings = (which) =>
  moduleWarnings(which).filter((line) => line.includes('manifest.extra'));

// ---- One language ----

// The premise the whole environment rests on, taken from the build that
// configures no `extra` at all: the URL really does arrive without the list, so
// the entry naming it really is redundant rather than merely duplicated in a
// file that needed it.
test('the reported entry names a URL the build reaches with no extra list at all', () => {
  assert.ok(
    manifest(baselineDir).urls.includes(REGISTERED),
    'the fixture premise changed: nothing registers this URL any more',
  );
});

test('and the build says so exactly once, naming that entry', () => {
  const lines = redundancyWarnings('extraRedundant');
  assert.equal(lines.length, 1, `expected one diagnostic, got: ${lines.join(' | ')}`);
  assert.match(
    lines[0],
    /\/probe\/also-published-by-url-read\.txt is named in url_retirement\.manifest\.extra/,
  );
});

// The other half of the same environment, and the reason the message cannot be
// produced by a check that simply names every entry: the sitemap is published
// and no template can see that it was, so its entry is the only thing carrying
// the URL and must not be reported.
test('and says nothing about the entry that is the only thing carrying its URL', () => {
  const lines = redundancyWarnings('extraRedundant');
  assert.ok(
    !lines.some((line) => line.includes(SITEMAP)),
    'a load-bearing entry was reported as redundant',
  );
  assert.ok(
    publishedUrls(extraRedundantDir).includes(SITEMAP),
    'the sitemap is not published here, so this build proves nothing about it',
  );
  assert.ok(
    !manifest(baselineDir).urls.includes(SITEMAP),
    'the module reaches the sitemap on its own, so the entry was never load-bearing',
  );
});

// A redundant entry the site also EXCLUDES. Exclusion subtracts last and wins,
// so the path is absent from the file however it arrived: the entry is holding
// nothing up, and advice to delete it would be about a line already doing what
// the site asked.
test('and says nothing about a redundant entry the site also excludes', () => {
  const lines = redundancyWarnings('extraRedundant');
  assert.ok(
    !lines.some((line) => line.includes(COPIED)),
    'an excluded entry was reported as redundant',
  );
  assert.ok(
    manifest(baselineDir).urls.includes(COPIED),
    'the fixture premise changed: this URL is no longer registered, so exclusion is not what silenced it',
  );
  assert.ok(
    !manifest(extraRedundantDir).urls.includes(COPIED),
    'the excluded path is still in the manifest, so exclusion did not run',
  );
});

// The file itself is untouched by the diagnostic, which is what keeps this a
// message rather than a behavior change. Asserted as the whole set derived from
// the build tree rather than as the presence of the reported URL: a diagnostic
// that also dropped the entry it reported, or that took the load-bearing one
// with it, would satisfy any weaker check.
//
// Two published paths are legitimately absent. /_redirects is the host control
// file this module never lists, and /probe/copied-verbatim.txt is the path this
// environment excludes. Everything else the build wrote is here, plus the
// sitemap, which is published and reaches the file only through `extra`.
test('and the manifest is exactly the tree the build wrote, diagnostic or not', () => {
  const expected = publishedUrls(extraRedundantDir)
    .filter((url) => !['/_redirects', COPIED].includes(url))
    .sort();
  assert.deepEqual(manifest(extraRedundantDir).urls, expected);
  assert.ok(expected.includes(REGISTERED), 'the reported entry left the file');
  assert.ok(expected.includes(SITEMAP), 'the load-bearing entry left the file');
});

// ---- Two languages ----

// Both premises for the multilingual build, read off the two-language build
// that configures no `extra` list: one URL reaches every language, the other
// reaches German alone.
test('the two-language premises hold: one URL reaches both languages, one only German', () => {
  const en = manifest(multilingualDir).urls;
  const de = manifest(multilingualDir, 'de/url-manifest.txt').urls;
  assert.ok(
    en.includes(COPIED) && de.includes(COPIED),
    'the shared URL is missing from a language',
  );
  assert.ok(de.includes(GERMAN_SECTION), 'German no longer publishes the section this test names');
  assert.ok(
    !en.includes(GERMAN_SECTION),
    'English reaches the German section too, so the discriminating case is gone',
  );
});

test('an entry every language reaches is reported once for the build, not once per language', () => {
  const lines = redundancyWarnings('multiExtra').filter((line) => line.includes(COPIED));
  assert.equal(lines.length, 1, `expected one diagnostic, got: ${lines.join(' | ')}`);
  assert.match(
    lines[0],
    /\/probe\/copied-verbatim\.txt is named in url_retirement\.manifest\.extra/,
  );
  assert.match(lines[0], /every language whose list names it already reaches that URL/);
});

// The language that NAMES an entry and excludes it answers for nothing, so it
// is not one of the languages the tally waits for. Counting it would leave the
// count one short on every build and silence the entry forever -- including for
// English, where it is genuinely redundant. This is the arm that separates a
// namer count from a count of languages naming the entry, and no single-language
// build can reach it.
test('a language that names an entry and excludes it is not waited for', () => {
  const lines = redundancyWarnings('multiExtra').filter((line) => line.includes(REGISTERED));
  assert.equal(lines.length, 1, `expected one diagnostic, got: ${lines.join(' | ')}`);

  // Both premises: English reaches the URL and lists it, German excludes it and
  // does not, so German really did skip the entry rather than answering false.
  const en = manifest(multiExtraDir).urls;
  const de = manifest(multiExtraDir, 'de/url-manifest.txt').urls;
  assert.ok(en.includes(REGISTERED), 'English does not list the entry it answered for');
  assert.ok(!de.includes(REGISTERED), "German's exclusion did not run, so it answered normally");
});

// The case the rule exists for. A per-language check would report this entry
// while rendering German -- which renders LAST here, so it is the language a
// naive rule would be listening to -- and deleting it would strip the URL from
// English's manifest, where the entry is the only thing carrying it.
//
// What must NOT be asserted here is that English lists the path: `extra` is
// appended to every language's set unconditionally, so that line would pass
// whatever the rule did. The claim rests on German reaching the section in THIS
// build and on English not reaching it in a build of the same content with no
// list at all, which the premise test above asserts.
test('and an entry redundant for one language and load-bearing for another is passed over', () => {
  const lines = redundancyWarnings('multiExtra');
  assert.ok(
    !lines.some((line) => line.includes(GERMAN_SECTION)),
    'an entry load-bearing for one language was reported as redundant',
  );
  assert.equal(
    lines.length,
    2,
    `this build reports two entries and no others: ${lines.join(' | ')}`,
  );
  const de = manifest(multiExtraDir, 'de/url-manifest.txt').urls;
  assert.ok(de.includes(GERMAN_SECTION), 'German does not reach the section in this build');
  assert.ok(de.includes(COPIED), 'German did not answer for the shared entry either');
});

// ---- A list that belongs to one language ----
//
// The reason the rule counts NAMERS rather than languages publishing a
// manifest. Here German's own list is the only one naming either entry, so
// German alone can answer for them: a rule waiting for every publisher would
// wait for an English verdict that is never recorded, and no entry would ever
// be reported on a site that scopes its list.
test('an entry only one language names is answered for by that language alone', () => {
  const lines = redundancyWarnings('perLangExtra');
  assert.equal(lines.length, 1, `expected one diagnostic, got: ${lines.join(' | ')}`);
  assert.match(lines[0], /\/de\/posts\/ is named in url_retirement\.manifest\.extra/);
});

// Both halves of the scoped list, so the diagnostic cannot be produced by
// reporting whatever a scoped list holds: German names two paths, reaches one,
// and is told about that one.
test('and the entry it names but does not reach is left alone', () => {
  const lines = redundancyWarnings('perLangExtra');
  assert.ok(
    !lines.some((line) => line.includes('/legacy/de-hand-copied.html')),
    'an entry nothing in the build publishes was reported as redundant',
  );
  const de = manifest(perLangExtraDir, 'de/url-manifest.txt').urls;
  assert.ok(de.includes(GERMAN_SECTION), 'German no longer reaches the section it names');
  assert.ok(de.includes('/legacy/de-hand-copied.html'), 'the scoped list was not read at all');
});

// And the language that names nothing is untouched by either entry, which is
// what the scoping means.
test('and the language whose list is empty lists neither entry', () => {
  const en = manifest(perLangExtraDir).urls;
  assert.ok(!en.includes(GERMAN_SECTION), 'the scoped list leaked into the other language');
  assert.ok(!en.includes('/legacy/de-hand-copied.html'), 'the scoped list leaked into English');
});

test('and none of the three builds reports anything else at all', () => {
  for (const which of ['extraRedundant', 'multiExtra', 'perLangExtra']) {
    const other = moduleWarnings(which).filter((line) => !line.includes('manifest.extra'));
    assert.deepEqual(other, [], `the ${which} build reported something unrelated`);
  }
});
