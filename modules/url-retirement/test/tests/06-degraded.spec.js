// Every fault class at once, on its own key. A module that promises never to
// break a consuming build has to say what it ignored and carry on, and each
// fault has to produce its own diagnostic rather than one masking another.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {degradedDir, moduleWarnings, redirectRules, manifest} from './helpers.js';

const FAULTS = [
  {
    what: 'an unknown redirect status',
    match: /Ignoring url_retirement\.redirects\.status value "499"/,
  },
  {
    what: 'an unknown trailing-slash mode',
    match: /Ignoring url_retirement\.redirects\.trailing_slash value "sometimes"/,
  },
  {
    what: 'a table given to a key that expects a list',
    match: /Ignoring url_retirement\.manifest\.extra/,
  },
  {
    what: 'a rules path naming no file',
    match: /No file at assets\/url-retirement\/does-not-exist/,
  },
];

test('the build survives every fault at once', () => {
  assert.ok(redirectRules(degradedDir).length > 0, 'the document is still published');
  assert.ok(manifest(degradedDir).urls.length > 0);
});

for (const fault of FAULTS) {
  test(`${fault.what} is reported`, () => {
    const hits = moduleWarnings('degraded').filter((line) => fault.match.test(line));
    assert.equal(hits.length, 1, `expected exactly one diagnostic, got ${hits.length}`);
  });
}

test('no fault produces a diagnostic nobody asked for, and none is reported twice', () => {
  const lines = moduleWarnings('degraded');
  const counted = new Map();
  for (const line of lines) counted.set(line, (counted.get(line) ?? 0) + 1);
  assert.deepEqual(
    [...counted].filter(([, n]) => n > 1),
    [],
    'a diagnostic was emitted more than once',
  );
  assert.equal(
    lines.length,
    FAULTS.length,
    `${lines.length} diagnostics for ${FAULTS.length} faults`,
  );
});

test('every rejected value leaves the shipped default standing', () => {
  const rules = redirectRules(degradedDir);
  for (const rule of rules) assert.equal(rule.status, '301', 'status fell back');
  const bare = rules.filter((r) => !r.from.endsWith('/')).length;
  const slashed = rules.filter((r) => r.from.endsWith('/')).length;
  assert.equal(bare, slashed, 'trailing_slash fell back to both spellings');
});

test('a rules path that names no file leaves the generated rules in place', () => {
  assert.ok(redirectRules(degradedDir).length > 0);
});
