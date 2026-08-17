// The point of the whole exercise: a retired URL must be a redirect RULE, and
// must not also exist as a published file. A real file wins over a redirect
// rule on the hosts that read this format, so a leftover stub would make the
// generated rule inert while everything looked configured.
//
// Every build with more than one language is checked, not the single-language
// baseline alone. Hugo mints a stub for the default site that `disableAliases`
// does not reach, and it exists ONLY where a language sits in a subdirectory --
// so a suite that asserted "no stub anywhere" against a monolingual tree was
// asserting it where the stub could never have appeared.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  baselineDir,
  multilingualDir,
  multiSubdirDir,
  publishedUrls,
  redirectRules,
} from './helpers.js';

const TREES = [
  {name: 'baseline', dir: baselineDir},
  {name: 'multilingual', dir: multilingualDir},
  {name: 'multilingual-subdir', dir: multiSubdirDir},
];

for (const tree of TREES) {
  test(`no meta-refresh stub is published anywhere in the ${tree.name} build`, () => {
    const offenders = publishedUrls(tree.dir)
      .filter((url) => url.endsWith('/'))
      .filter((url) => {
        const body = readFileSync(join(tree.dir, url.replace(/^\//, ''), 'index.html'), 'utf8');
        return /http-equiv=["']?refresh/i.test(body);
      });
    assert.deepEqual(offenders, []);
  });

  test(`no rule's source path is published as a file in the ${tree.name} build`, () => {
    const published = new Set(publishedUrls(tree.dir));
    for (const rule of redirectRules(tree.dir)) {
      assert.ok(
        !published.has(rule.from) && !published.has(`${rule.from}/`),
        `${rule.from} is published as a file, so the redirect rule for it can never fire`,
      );
    }
  });
}

// Hugo's site-level disableAliases and its pagination.disableAliases are
// SEPARATE settings, and each leaves a different stub behind when it is the one
// forgotten. The first pager of a paginated section is the one the second
// setting governs.
test('the first-pager alias is not published either', () => {
  const published = publishedUrls(baselineDir);
  assert.ok(
    !published.some((url) => /\/page\/1\/$/.test(url)),
    'a /page/1/ stub survived, so pagination.disableAliases is not in force',
  );
});

// The third switch, and the reason the multilingual trees are checked above:
// disableDefaultSiteRedirect governs a stub the other two leave standing, and
// its two shapes retire two different URLs. Asserting the exact path each build
// must NOT publish keeps the check from passing because the file moved.
test('the default site redirect is not published in either multilingual shape', () => {
  assert.ok(
    !publishedUrls(multilingualDir).includes('/en/'),
    '/en/ survived on a site whose default language is served at the root',
  );
  assert.ok(
    !publishedUrls(multiSubdirDir).includes('/'),
    'the site root survived on a site whose default language is served from /en/',
  );
});
