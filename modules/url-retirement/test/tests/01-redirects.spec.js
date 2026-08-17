// What the module generates into /_redirects for a site that configured
// nothing: one rule per alias per spelling and one per registered paginator,
// merged into a single sorted set, each pointing at the page that owns it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baselineDir, readDoc, redirectRules} from './helpers.js';

test('the module publishes /_redirects at the site root', () => {
  assert.ok(readDoc(baselineDir, '_redirects').length > 0);
});

// The whole generated set at once, which is what proves the merge: two
// producers of rules, one sorted file, and a source path from either of them
// sorted into the same order.
test('every alias and every first pager becomes a rule, in both spellings by default', () => {
  assert.deepEqual(
    redirectRules(baselineDir).map((r) => [r.from, r.to, r.status]),
    [
      ['/CaseSensitive/Old-Note', '/notes/note-a/', '301'],
      ['/CaseSensitive/Old-Note/', '/notes/note-a/', '301'],
      ['/legacy/first-post', '/posts/post-1/', '301'],
      ['/legacy/first-post/', '/posts/post-1/', '301'],
      ['/notes/page/1', '/notes/', '301'],
      ['/notes/page/1/', '/notes/', '301'],
      ['/old-post-one', '/posts/post-1/', '301'],
      ['/old-post-one/', '/posts/post-1/', '301'],
      ['/page/1', '/', '301'],
      ['/page/1/', '/', '301'],
      ['/posts/page/1', '/posts/', '301'],
      ['/posts/page/1/', '/posts/', '301'],
    ],
  );
});

// PAGE.Aliases returns a path without a trailing slash while the stub Hugo
// would have published lands at <alias>/index.html, so the URL production
// actually served carries the slash. Netlify documents that it normalizes the
// difference when matching; Cloudflare's documentation does not say that it
// does, which is why both spellings ship unless a site says otherwise.
test('the two spellings of one retired URL point at the same page', () => {
  const rules = redirectRules(baselineDir);
  const bare = rules.filter((r) => !r.from.endsWith('/'));
  assert.equal(bare.length, 6, 'one bare form per alias and per registered first pager');
  for (const rule of bare) {
    const withSlash = rules.find((r) => r.from === `${rule.from}/`);
    assert.ok(withSlash, `no trailing-slash form for ${rule.from}`);
    assert.equal(withSlash.to, rule.to);
  }
});

// A dict keyed by path would have lower-cased it: Hugo's `merge` folds map
// keys, and a URL path is case-sensitive, so /CaseSensitive/Old-Note would
// have been published as /casesensitive/old-note and redirected nothing.
test('a mixed-case alias keeps its case', () => {
  const rule = redirectRules(baselineDir).find((r) => r.from === '/CaseSensitive/Old-Note/');
  assert.ok(rule, 'the mixed-case alias is missing from the file');
  assert.equal(rule.to, '/notes/note-a/');
});

test('the rules are sorted by source path and the file has no blank first line', () => {
  const body = readDoc(baselineDir, '_redirects');
  assert.ok(!body.startsWith('\n'), 'the file starts with a blank line');
  const froms = redirectRules(baselineDir).map((r) => r.from);
  assert.deepEqual(froms, [...froms].sort());
});

test('a page with no aliases contributes no rule', () => {
  const targets = redirectRules(baselineDir).map((r) => r.to);
  assert.ok(!targets.includes('/notes/note-b/'), 'note-b has no aliases and must not appear');
});

// The example in Hugo's own documentation for this file reads $.RelPermalink
// inside a range, where $ stays bound to the template's top-level context: the
// home page. Every rule would point at "/".
//
// The home page legitimately owns two rules of its own -- it paginates, so its
// first pager is /page/1/ -- which is why this is an exact set rather than the
// blanket "nothing points at the root" it used to be. The mistake would put
// every alias in this list.
test('only the home page pager points at the home page, not every alias', () => {
  assert.deepEqual(
    redirectRules(baselineDir)
      .filter((r) => r.to === '/')
      .map((r) => r.from),
    ['/page/1', '/page/1/'],
  );
});
