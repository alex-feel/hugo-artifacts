// A baseURL carrying a path, published two ways. Neither build is redundant: a
// root-baseURL site cannot show the difference between a path that keeps the
// base segment and one that drops it, and canonifyURLs is the only shape in
// which .RelPermalink stops carrying that segment by itself.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subpathDir, canonifyDir, readDoc, redirectRules, manifest} from './helpers.js';

const BASE = '/docs';

test('both sides of every rule carry the base segment', () => {
  const rules = redirectRules(subpathDir);
  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.ok(rule.from.startsWith(`${BASE}/`), `source ${rule.from} lost the base segment`);
    assert.ok(rule.to.startsWith(`${BASE}/`), `target ${rule.to} lost the base segment`);
  }
});

// PAGE.Aliases returns a path with no base segment while the page it points at
// reports one, so the two sides of a rule would otherwise describe different
// origins -- the source relative to the domain and the target relative to the
// deployment.
test('the alias source and the page target agree about where the site is', () => {
  const rule = redirectRules(subpathDir).find((r) => r.from === '/docs/old-post-one/');
  assert.ok(rule, 'the alias did not get the base segment');
  assert.equal(rule.to, '/docs/posts/post-1/');
});

test('every manifest URL carries it too', () => {
  for (const url of manifest(subpathDir).urls)
    assert.ok(url.startsWith(`${BASE}/`) || url === BASE, `${url} lost the base segment`);
});

// Under canonifyURLs, .RelPermalink stops carrying the base segment, so a
// module that trusted it would publish two different files for one site. The
// segment is derived from the baseURL instead, which is what makes these two
// builds comparable at all.
test('the redirect map is byte-identical under canonifyURLs', () => {
  assert.equal(readDoc(canonifyDir, '_redirects'), readDoc(subpathDir, '_redirects'));
});

test('the manifest is byte-identical under canonifyURLs', () => {
  assert.equal(readDoc(canonifyDir, 'url-manifest.txt'), readDoc(subpathDir, 'url-manifest.txt'));
});
