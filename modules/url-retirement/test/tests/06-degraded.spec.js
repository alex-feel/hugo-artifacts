// Every fault class at once, on its own key. A module that promises never to
// break a consuming build has to say what it ignored and carry on, and each
// fault has to produce its own diagnostic rather than one masking another.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baselineDir, degradedDir, moduleWarnings, readDoc} from './helpers.js';

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

// Every fault here is rejected in favor of the shipped default, and the
// baseline build configures nothing at all, so the two builds must publish
// IDENTICAL bytes. That is the whole claim -- "the default stood" -- stated as
// something a diff can settle rather than as a floor that a half-broken
// document would also clear.
test('every document is byte-identical to the build that configured nothing', () => {
  assert.equal(readDoc(degradedDir, '_redirects'), readDoc(baselineDir, '_redirects'));
  assert.equal(readDoc(degradedDir, 'url-manifest.txt'), readDoc(baselineDir, 'url-manifest.txt'));
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

test('a rules path that names no file leaves the generated rules in place', () => {
  const body = readDoc(degradedDir, '_redirects');
  assert.ok(body.includes('/old-post-one/ /posts/post-1/ 301'), 'the generated rules went missing');
  assert.ok(!body.includes('hand-written'), 'rules appeared from a file that does not exist');
});
