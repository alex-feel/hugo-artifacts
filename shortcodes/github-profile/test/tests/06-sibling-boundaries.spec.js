// The same whitespace rule, at the two boundaries that live OUTSIDE the
// headline strip and the calendar summary, and that no other spec reaches.
//
// Specs 01 through 04 are scoped to those two elements, so the sweep that
// rewrote every wrapper in this module has three edited files whose result
// nothing reads: the two `github-profile__streak` spans are SIBLINGS of the
// calendar summary rather than children of it, and the identity section's meta
// items are not in either scope. Both are live gluing sites -- text-bearing
// inline elements whose only separation is a single whitespace character that
// the minifier deletes the moment a whitespace text node precedes it -- so a
// revert there republishes issue 27522 one section down while every other
// assertion in this suite stays green.
//
// The rule here is deliberately structural rather than textual. The identity
// section prints a tenure derived from the wall clock, so its text is not
// assertable, and the fixture's streak numbers are static but the property
// under test is the BOUNDARY between two elements, not the words inside them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, page, element, elementsByClass, isWrapper, allElements} from './helpers.js';

const MINIFIED = BUILDS[1];

for (const build of BUILDS) {
  test(`[${build.name}] each streak wrapper closes on its last child`, () => {
    // The wrappers are found from the whole page rather than from the calendar
    // summary, which is what specs 03 and 04 scope to and which does not
    // contain them.
    const streaks = elementsByClass(page(build.dir), 'github-profile__streak');
    assert.equal(streaks.length, 2, 'the fixture renders a current and a longest streak');
    for (const s of streaks) {
      assert.ok(
        !/\s$/.test(s.inner),
        `${s.classes.join(' ')} ends with the whitespace ${JSON.stringify(s.inner.slice(-8))}; move its closing tag back onto its last child's line`,
      );
      assert.match(s.inner, />$/, 'a streak wrapper must close directly on a tag');
    }
  });

  test(`[${build.name}] each identity meta item closes on its last child`, () => {
    // Only the whitespace rule, not spec 03's companion "closes on a tag":
    // the company, location and tenure items legitimately end on loose text
    // because their content is a bare interpolation, and only the website item
    // ends on an element. What matters at all four is that no whitespace text
    // node sits before the closing tag.
    const identity = element(page(build.dir), 'github-profile__section--identity');
    assert.ok(identity, 'the fixture must render the identity section');
    const items = elementsByClass(identity.inner, 'github-profile__meta-item');
    assert.ok(items.length >= 2, 'the fixture must render more than one meta item');
    for (const item of items) {
      assert.ok(
        !/\s$/.test(item.inner),
        `meta item ${JSON.stringify(item.inner.slice(-24))} ends with whitespace`,
      );
    }
  });
}

test('the website meta item closes directly on its link', () => {
  // The one identity wrapper whose content ends on an ELEMENT, which is what
  // made it the section's live gluing site: the anchor's closing tag and the
  // wrapper's own must be adjacent, or the newline between them becomes the
  // whitespace the minifier keeps -- and the space that separated the website
  // from the tenure line is the one it then deletes.
  for (const build of BUILDS) {
    assert.ok(
      page(build.dir).includes('</a></span>'),
      `[${build.name}] the website meta item must close directly on its anchor`,
    );
  }
});

test('the minified build keeps one whitespace character between adjacent inline siblings', () => {
  // The byte-level form, in the only tree where it can be lost. In the reverted
  // shape the whitespace does not vanish -- it RELOCATES inside the preceding
  // wrapper, which a parsed DOM cannot tell apart from the correct output and
  // which an extractor that trims each element reads as a glued run. So the
  // assertion is on where the byte sits, not on whether one exists.
  const html = page(MINIFIED.dir);

  const streakBoundary = /<\/span><\/span>\s<span class=github-profile__streak data-streak=longest/;
  assert.match(
    html,
    streakBoundary,
    'the current streak must close on its value, with one space before the longest streak',
  );

  const metaBoundary = /<\/a><\/span>\s<span class=github-profile__meta-item data-meta=tenure/;
  assert.match(
    html,
    metaBoundary,
    'the website meta item must close on its anchor, with one space before the tenure item',
  );
});

// The rule governs INLINE elements only, and the distinction is the minifier's
// own: whitespace next to a BLOCK tag is deleted outright, because no rendered
// text depends on it, while whitespace next to inline content is collapsed to
// one character that survives -- which is what makes its position, and only its
// position, load-bearing. So a <section> or a <div> may keep its closing tag on
// its own line, and every one in this module does.
const INLINE = ['span', 'a'];

test('every inline wrapper closes on its last child, page-wide', () => {
  // The backstop. Specs 01 through 04 and the assertions above name the
  // boundaries that matter today; this one states the invariant over the whole
  // published widget, so a section added later inherits it without anyone
  // remembering to extend this file. Separator elements are the sole exception
  // and carry no element children, so filtering to wrappers excludes them.
  for (const build of BUILDS) {
    const widget = element(page(build.dir), 'github-profile');
    assert.ok(widget, 'the fixture must render the widget root');
    const offenders = allElements(widget.inner)
      .filter((w) => INLINE.includes(w.name) && isWrapper(w) && /\s$/.test(w.inner))
      .map((w) => `${w.classes.join(' ') || w.name}: ${JSON.stringify(w.inner.slice(-16))}`);
    assert.deepEqual(
      offenders,
      [],
      `[${build.name}] whitespace before an inline wrapper's closing tag`,
    );
  }
});
