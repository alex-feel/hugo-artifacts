// The separator elements' own published bytes, in both builds.
//
// THIS IS THE REGRESSION LOCK. Hugo's --minify collapses each run of
// whitespace to a single character and then deletes any whitespace that
// immediately follows it, even across a tag boundary. While every metric
// wrapper in section-headline.html closed on a line of its own, the
// newline-plus-indent sitting just inside the wrapper's closing tag won that
// contest and the note separator's LEADING space was deleted from the
// published file -- so a text extractor read "...last 90— plus 7,934 private
// contributions" instead of "...last 90 — plus 7,934 private contributions".
//
// Asserted on BYTES rather than on a parsed DOM on purpose: the defect is a
// whitespace RELOCATION, and every HTML parser normalizes exactly the thing
// that moved. A DOM assertion passes against the broken output.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, page, headline, elementsByClass, bytesOf} from './helpers.js';

// SPACE, U+2014 EM DASH, SPACE. The i18n default of github_profile_note_sep.
const NOTE_SEP_BYTES = [0x20, 0xe2, 0x80, 0x94, 0x20];
// COMMA, SPACE. The i18n default of github_profile_sep.
const GROUP_SEP_BYTES = [0x2c, 0x20];

for (const build of BUILDS) {
  test(`[${build.name}] the note separator carries a space on BOTH sides of the em dash`, () => {
    const seps = elementsByClass(headline(build.dir).inner, 'github-profile__sep--note');
    assert.equal(seps.length, 1, 'exactly one note separator precedes the floor note');

    const inner = seps[0].inner;
    // Byte equality, not a trimmed comparison: " — " and "— " and " —" all
    // render identically in a diff and only the leading byte tells the fixed
    // output from the broken one.
    assert.deepEqual(
      bytesOf(inner),
      NOTE_SEP_BYTES,
      `note separator published as ${JSON.stringify(inner)}; the metric wrapper before it must close on the SAME line as its last child`,
    );
    assert.ok(inner.startsWith(' '), 'the LEADING space is the byte the minifier deleted');
    assert.ok(inner.endsWith(' '), 'the trailing space separates the dash from the note');
  });

  test(`[${build.name}] the note separator element is published verbatim`, () => {
    // The whole element as one literal. The minifier drops attribute quotes
    // for single-token class values but keeps them here, because this element
    // carries two classes -- so the SAME literal must appear in both trees,
    // and any drift in the class hooks, the element name or the spacing shows
    // up as a single failure rather than as a silently narrowed assertion.
    assert.ok(
      page(build.dir).includes(
        '<span class="github-profile__sep github-profile__sep--note"> — </span>',
      ),
      'the note separator element must reach the published page byte for byte',
    );
  });

  test(`[${build.name}] every group separator keeps its trailing space`, () => {
    // The comma separators are the same defect class one step earlier: they
    // are the only thing standing between "1.8k commits" and "1.3k merged
    // pull requests" in the text layer, since CSS gaps and ::before dividers
    // never enter it. The fixture renders five metric groups before the floor
    // note, so five separators sit between them.
    const seps = elementsByClass(headline(build.dir).inner, 'github-profile__sep').filter(
      (n) => !n.classes.includes('github-profile__sep--note'),
    );
    assert.equal(seps.length, 5, 'one separator between each pair of rendered metric groups');

    for (const sep of seps) {
      assert.deepEqual(
        bytesOf(sep.inner),
        GROUP_SEP_BYTES,
        `group separator published as ${JSON.stringify(sep.inner)}`,
      );
    }
  });

  test(`[${build.name}] no separator is published empty`, () => {
    // A separator stripped to <span class="github-profile__sep"></span> still
    // satisfies every structural check a class-hook assertion could make while
    // publishing a glued run to every extractor. Only its content matters.
    for (const sep of elementsByClass(headline(build.dir).inner, 'github-profile__sep')) {
      assert.ok(sep.inner.length > 0, 'a separator with no text separates nothing');
    }
  });
}
