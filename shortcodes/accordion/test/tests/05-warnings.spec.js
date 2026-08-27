// The degradation contract, asserted as an EXACT warning set.
//
// This spec is why the runner ships no blanket WARN gate: the fixture
// exercises every tolerated input problem on purpose, so failing on any WARN
// would fail the suite on its own subject matter. Asserting the exact set is
// strictly stronger than a gate, in both directions -- a warning that stops
// firing fails this just as loudly as an unexpected new one, and a silently
// dropped diagnostic is the failure a gate can never see.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, accordionWarnings, buildLog} from './helpers.js';

// One entry per tolerated input problem the fixture authors, matched on the
// stable part of the message. Order is not asserted: Hugo renders pages
// concurrently, so the log order varies between runs.
const EXPECTED = [
  {
    what: 'an empty container',
    match: /^\[accordion] The accordion shortcode has no inner content; rendering nothing\./,
  },
  {
    what: 'an unknown container parameter',
    match: /^\[accordion] Ignoring the unknown accordion shortcode parameter "colour"/,
  },
  {
    what: 'an unknown item parameter',
    match: /^\[accordion] Ignoring the unknown accordion-item shortcode parameter "expanded"/,
  },
  {
    what: 'positional container arguments',
    match: /^\[accordion] The accordion shortcode takes named parameters only/,
  },
  {
    what: 'an unrecognized boolean token',
    match:
      /^\[accordion] Ignoring unrecognized open="maybe" .*Falling back to the default \(false\)/,
  },
  {
    what: 'an invalid heading level',
    match: /^\[accordion] Ignoring invalid heading="9" \(use an integer from 2 to 6\)/,
  },
  {
    what: 'a second open item in one exclusive group',
    match: /^\[accordion] More than one item in the exclusive group "multi-open" carries open/,
  },
  {
    what: 'an empty items slice on the partial path',
    match: /^\[accordion] accordion\/list\.html received no items; rendering nothing\./,
  },
];

for (const build of BUILDS) {
  test(`[${build.name}] every documented degradation warns exactly once`, () => {
    const warnings = accordionWarnings(build.name);
    for (const {what, match} of EXPECTED) {
      const hits = warnings.filter((w) => match.test(w));
      assert.equal(hits.length, 1, `${what}: expected exactly one warning, got ${hits.length}`);
    }
  });

  test(`[${build.name}] nothing warns that the fixture did not ask for`, () => {
    const warnings = accordionWarnings(build.name);
    const unexpected = warnings.filter((w) => !EXPECTED.some(({match}) => match.test(w)));
    assert.deepEqual(
      unexpected,
      [],
      'the module emitted warnings this fixture does not account for',
    );
    assert.equal(
      warnings.length,
      EXPECTED.length,
      'the module warning count drifted from the documented degradation set',
    );
  });

  test(`[${build.name}] every warning names the position an author can act on`, () => {
    // A nested shortcode's own .Position collapses to "<file>:1:1" in Hugo, so
    // the module substitutes its outermost ancestor's. A warning that pointed
    // at line 1 would send the author to the top of the file.
    for (const warning of accordionWarnings(build.name)) {
      assert.match(warning, /See \S+/, `a warning carries no origin: ${warning}`);
      assert.doesNotMatch(
        warning,
        /\.md:1:1/,
        `a warning points at line 1 instead of the container: ${warning}`,
      );
    }
  });

  test(`[${build.name}] the build reports no errors and no deprecations`, () => {
    // The runner gates on these too; asserting them here keeps the suite
    // meaningful when a spec is run directly against a retained log.
    const log = buildLog(build.name);
    assert.doesNotMatch(log, /^ERROR/m, 'the build logged an error');
    assert.doesNotMatch(log, /deprecat/i, 'the build logged a deprecation');
    assert.doesNotMatch(log, /found no layout file/, 'the build could not find a layout');
  });
}
