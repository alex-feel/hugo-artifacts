// The captured Hugo build logs, for both builds.
//
// run-tests.sh already fails the run on a deprecation, an ERROR or a missing
// layout before the specs start, so these assertions are a SECOND, independent
// gate rather than the only one -- the runner's grep answers "did the build
// succeed", and these answer "and did it succeed silently", which is the part
// a warning slips through. They also cover the case where the suite is run
// directly against an already-published pair of trees.
//
// Warnings matter here specifically because this module degrades gracefully by
// design: a failed fetch, a missing token or an unparsable payload all warn and
// fall back rather than breaking the build. The fixture serves canned data
// through a shadowed fetch partial, so a warning in either log means the seam
// stopped working and some assertion elsewhere in this suite is passing against
// a degraded rendering instead of the real one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, buildLog, logLines} from './helpers.js';

for (const build of BUILDS) {
  test(`[${build.name}] the captured log is the real one`, () => {
    // Without this, an empty or truncated log would make every assertion below
    // pass while proving nothing at all.
    const log = buildLog(build.name);
    assert.match(log, /^Start building sites/m, 'the log must be a full Hugo build log');
    assert.match(log, /^hugo v0\.\d+/m, 'including the version banner');
    assert.match(log, /Total in \d+ ms/, 'and the completion line');
  });

  test(`[${build.name}] the build emitted no warning`, () => {
    const warnings = logLines(build.name).filter((line) => line.startsWith('WARN'));
    assert.deepEqual(warnings, [], 'a clean build of the fixture warns about nothing');
  });

  test(`[${build.name}] the build emitted no deprecation`, () => {
    // Hugo reports a deprecated API at WARN or ERROR depending on how far
    // through its cycle the deprecation is, and the word is the only thing
    // common to both, so the whole log is searched rather than the WARN lines.
    const hits = logLines(build.name).filter((line) => /deprecat/i.test(line));
    assert.deepEqual(hits, [], 'no template in this module may use a deprecated API');
  });

  test(`[${build.name}] the build emitted no error and rendered every layout`, () => {
    const errors = logLines(build.name).filter(
      (line) => line.includes('ERROR') || line.includes('found no layout file'),
    );
    assert.deepEqual(errors, []);
  });

  test(`[${build.name}] the fixture's canned data seam did not degrade`, () => {
    // The shadowed fetch partial raises errorf rather than degrading when its
    // data file is missing, and a degraded render would warn. Either way the
    // log is where it shows up first.
    assert.ok(
      !/github-profile/i.test(buildLog(build.name)),
      'the module must say nothing at all during a clean fixture build',
    );
  });
}
