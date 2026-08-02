// The calendar summary line: the SECOND live instance of the same defect.
//
// The summary separates its total from its window with one explicit literal
// space between two sibling elements, and the streak lines separate their
// label from their value the same way. That space is the first whitespace in
// its run only while the total wrapper closes on its last child; a
// newline-plus-indent inside that wrapper wins instead, and Hugo's --minify
// deletes the deliberate space, publishing "408 contributionslast 12 months".
// Nothing about that is visible in the plain build, which is why the minified
// tree carries the load here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDS,
  page,
  calendarSummary,
  element,
  elementsByClass,
  allElements,
  isWrapper,
  extractedText,
  textOf,
} from './helpers.js';

const MINIFIED = BUILDS[1];

for (const build of BUILDS) {
  test(`[${build.name}] the total and the window stay separated in the text layer`, () => {
    assert.equal(
      extractedText(calendarSummary(build.dir).inner),
      '408 contributions last 12 months',
    );
  });

  test(`[${build.name}] the summary's total wrapper closes on its unit`, () => {
    // The structural cause, asserted directly: the whitespace that would eat
    // the separating space can only enter through this wrapper's closing tag.
    for (const w of allElements(calendarSummary(build.dir).inner).filter(isWrapper)) {
      assert.ok(
        !/\s$/.test(w.inner),
        `${w.classes.join(' ')} ends with the whitespace ${JSON.stringify(w.inner.slice(-8))}`,
      );
    }
  });

  test(`[${build.name}] each streak line keeps its label apart from its value`, () => {
    // Same rule, same file, two more places it applies. The streak wrappers
    // carry no separator element at all -- one literal space between two
    // inline spans is the entire separation.
    const streaks = elementsByClass(page(build.dir), 'github-profile__streak');
    assert.equal(streaks.length, 2, 'the fixture renders a current and a longest streak');
    assert.deepEqual(
      streaks.map((s) => extractedText(s.inner)),
      ['current streak 12 days', 'longest streak 21 days'],
    );
  });
}

test('the minified build publishes the separating space between the two bytes it sits between', () => {
  // The byte-level form, in the tree where it can actually be lost. A parsed
  // DOM cannot tell this apart from the broken output, because the broken
  // output still has whitespace here -- just inside the wrapper instead of
  // between the wrappers, which is a whitespace-only text node the parser
  // discards either way.
  assert.ok(
    page(MINIFIED.dir).includes(
      'contributions</span></span> <span class=github-profile__calendar-period>last 12 months</span>',
    ),
    'the total wrapper must close on its unit, with the literal space and then the window',
  );
});

test('the minified summary carries exactly one whitespace character between its children', () => {
  // Stated as a count rather than as a literal so a relabeled window or a
  // translated unit word still exercises it: between the total wrapper's
  // closing tag and the window's opening tag there is one space, and it is
  // the only text node in the paragraph.
  const summary = calendarSummary(MINIFIED.dir);
  const total = element(summary.inner, 'github-profile__calendar-total');
  const after = summary.inner.slice(summary.inner.indexOf(total.outer) + total.outer.length);
  assert.match(
    after,
    /^ <span/,
    `the window follows the total as ${JSON.stringify(after.slice(0, 24))}`,
  );
});

test('the calendar grid still announces the same total it prints', () => {
  // A guard against the summary being "fixed" by dropping an element: the
  // aria-label is the only announcement left when a site hides the summary,
  // so the two must agree.
  for (const build of BUILDS) {
    const grid = element(page(build.dir), 'github-profile__calendar');
    assert.match(grid.openTag, /data-total="?408"?/);
    assert.ok(textOf(calendarSummary(build.dir).inner).includes('408'));
  }
});
