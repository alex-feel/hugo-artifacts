// The point of the whole exercise: a retired URL must be a redirect RULE, and
// must not also exist as a published file. A real file wins over a redirect
// rule on the hosts that read this format, so a leftover stub would make the
// generated rule inert while everything looked configured.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {baselineDir, publishedUrls, redirectRules} from './helpers.js';

test('no meta-refresh stub is published anywhere in the build', () => {
  const offenders = publishedUrls(baselineDir)
    .filter((url) => url.endsWith('/'))
    .filter((url) => {
      const body = readFileSync(join(baselineDir, url.replace(/^\//, ''), 'index.html'), 'utf8');
      return /http-equiv=["']?refresh/i.test(body);
    });
  assert.deepEqual(offenders, []);
});

test('no alias path exists as a published URL', () => {
  const published = new Set(publishedUrls(baselineDir));
  for (const rule of redirectRules(baselineDir)) {
    assert.ok(
      !published.has(rule.from) && !published.has(`${rule.from}/`),
      `${rule.from} is published as a file, so the redirect rule for it can never fire`,
    );
  }
});

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
