// The configured environment: the site's own rules are copied verbatim and
// come first, and the three redirect settings take effect.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredDir, readDoc, redirectRules, fixtureRules} from './helpers.js';

// Hugo publishes a rendered file and a static/ file to the same path with no
// warning at any log level, and the rendered one wins, so a site that kept
// static/_redirects beside this module would lose every hand-written rule
// silently. The module consumes them instead, which removes the collision
// rather than betting on which producer wins it.
test('the hand-written rules survive verbatim', () => {
  const published = readDoc(configuredDir, '_redirects');
  const authored = fixtureRules().trim();
  assert.ok(
    published.includes(authored),
    `the authored rules are not present verbatim:\n${published}`,
  );
});

test('the hand-written rules come before every generated one', () => {
  const body = readDoc(configuredDir, '_redirects');
  const lastAuthored = body.indexOf('/vendor/*');
  const firstGenerated = body.indexOf('/CaseSensitive/Old-Note/');
  assert.ok(lastAuthored >= 0 && firstGenerated >= 0);
  assert.ok(
    lastAuthored < firstGenerated,
    'a generated rule precedes a hand-written one, which reverses their precedence',
  );
});

test('a comment line in the authored rules stays a comment', () => {
  assert.ok(readDoc(configuredDir, '_redirects').startsWith('# Hand-written rules'));
});

test('redirects.status replaces the default 301 on generated rules only', () => {
  const rules = redirectRules(configuredDir);
  const generated = rules.filter(
    (r) => r.from.startsWith('/CaseSensitive') || r.from.includes('post'),
  );
  assert.ok(generated.length > 0);
  for (const rule of generated) assert.equal(rule.status, '308');
  const authored = rules.find((r) => r.from === '/hand-written/');
  assert.equal(authored.status, '301', 'an authored rule must be copied, not rewritten');
});

test('trailing_slash = slash emits one spelling per alias, the one production served', () => {
  // Selected by the configured status, which is what tells a generated rule
  // from an authored one whose target happens to look the same.
  const generated = redirectRules(configuredDir).filter((r) => r.status === '308');
  assert.equal(generated.length, 3, 'three aliases, one rule each');
  for (const rule of generated) assert.ok(rule.from.endsWith('/'), `${rule.from} lost its slash`);
});
