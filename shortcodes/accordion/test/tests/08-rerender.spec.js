// What happens when Hugo executes a page's shortcodes MORE THAN ONCE.
//
// A page configured for two HTML-family output formats is rendered through
// both, and the module's shortcodes run again for the second one. Anything the
// module keys on a page-scoped store therefore meets state its first execution
// left behind, and two of them would go wrong without deliberate handling: the
// id registry would hand the same item the next collision suffix, so the two
// published documents would disagree about where a deep link points, and the
// exclusive-group open counter would reach two for a group holding a single
// open item and warn about a defect that is not there.
//
// Neither failure is visible in a single-format build, which is the whole
// reason this fixture page exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, PAGES, AMP_RERENDER, read, items, accordionWarnings} from './helpers.js';

for (const build of BUILDS) {
  test(`[${build.name}] the fixture really does render one page twice`, () => {
    // The control. Without a second document, every assertion below would hold
    // vacuously against a page rendered once.
    const first = items(read(PAGES.rerender, build.dir));
    const second = items(read(AMP_RERENDER, build.dir));
    assert.equal(first.length, 4, 'the re-render page did not publish its four items');
    assert.equal(
      second.length,
      first.length,
      'the second output format published a different item set',
    );
    assert.deepEqual(
      second.map((i) => i.titleText),
      first.map((i) => i.titleText),
      'the two renderings disagree about which items exist',
    );
  });

  test(`[${build.name}] a minted id is the same in both renderings`, () => {
    const first = items(read(PAGES.rerender, build.dir)).map((i) => i.bodyId);
    const second = items(read(AMP_RERENDER, build.dir)).map((i) => i.bodyId);
    assert.deepEqual(
      first,
      ['twice-rendered', 'twice-rendered-1', 'the-open-one', 'the-closed-one'],
      'the first rendering did not mint the expected ids',
    );
    assert.deepEqual(
      second,
      first,
      'the second rendering drifted onto different ids, so a deep link resolves to different content per output format',
    );
  });

  test(`[${build.name}] one open item in a group stays one, however often it renders`, () => {
    const opened = items(read(PAGES.rerender, build.dir)).filter((i) => i.open);
    assert.equal(opened.length, 1, 'the re-render page must carry exactly one open item');
    const group = opened[0].group;
    assert.ok(group, 'the open item is not in an exclusive group, so it proves nothing here');

    const complaints = accordionWarnings(build.name).filter((w) =>
      w.includes(`exclusive group "${group}"`),
    );
    assert.deepEqual(
      complaints,
      [],
      'the module warned about multiple open items in a group that holds exactly one',
    );
  });
}
