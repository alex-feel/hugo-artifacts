// The organization avatars, on both surfaces that name an organization.
//
// An avatar identifies an organization faster than its login does, so each
// membership entry and each rollup row leads with the organization's avatar
// image, governed by the same avatar option as the identity strip. Three
// contracts matter and each is asserted here: the image renders FROM THE
// DATA (its src is the same URL the item's data-avatar carries), the
// fallback renders where the data carries no URL (a placeholder element
// wrapping the generic organization glyph, never a broken image), and the
// avatar="none" baseline stays image-free.
//
// The rollup's open-fixture row is the deliberate proof of derive.html's
// fill-from-a-later-list guard: the canned commit list -- the FIRST list the
// rollup grouping walks -- carries no avatarUrl on either open-fixture
// owner, so the row can only show o/12 if a later list's occurrence filled
// it in.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, page, element, elementsByClass, attrValue, extractedText} from './helpers.js';

const AVATAR_NONE_PAGE = 'avatar-none/index.html';

// login -> expected avatar URL ('' = the placeholder renders instead).
const MEMBERSHIP_AVATARS = new Map([
  ['fixture-labs', 'https://avatars.fixture.example/o/11?s=64'],
  ['open-fixture', 'https://avatars.fixture.example/o/12?s=64'],
  ['another-org', 'https://avatars.fixture.example/o/13?s=64'],
  ['quiet-collective', ''],
]);

const ROLLUP_AVATARS = new Map([
  ['fixture-labs', 'https://avatars.fixture.example/o/11?s=64'],
  ['open-fixture', 'https://avatars.fixture.example/o/12?s=64'],
  ['another-org', 'https://avatars.fixture.example/o/13?s=64'],
  ['solo-maintainer', ''],
]);

// The avatar element inside a name anchor: the img, or the placeholder span
// (both carry the base class token, so the tag name and the modifier are
// what tell them apart).
function avatarNode(anchorInner, baseClass) {
  const nodes = elementsByClass(anchorInner, baseClass);
  assert.equal(nodes.length, 1, `exactly one ${baseClass} element in the anchor`);
  return nodes[0];
}

function assertAvatar(node, baseClass, expectedSrc, why) {
  if (expectedSrc) {
    assert.equal(node.name, 'img', `${why}: an avatar URL renders as an image`);
    assert.ok(
      !node.classes.includes(`${baseClass}--placeholder`),
      `${why}: a rendered image is not a placeholder`,
    );
    assert.equal(attrValue(node.openTag, 'src'), expectedSrc, `${why}: src comes from the data`);
    assert.equal(attrValue(node.openTag, 'width'), '64', `${why}: intrinsic width`);
    assert.equal(attrValue(node.openTag, 'height'), '64', `${why}: intrinsic height`);
    assert.equal(attrValue(node.openTag, 'loading'), 'lazy', `${why}: lazy loading`);
    assert.equal(attrValue(node.openTag, 'decoding'), 'async', `${why}: async decoding`);
  } else {
    assert.equal(node.name, 'span', `${why}: no avatar URL renders the placeholder`);
    assert.ok(
      node.classes.includes(`${baseClass}--placeholder`),
      `${why}: the placeholder carries its modifier`,
    );
    assert.ok(node.inner.includes('<svg'), `${why}: the placeholder wraps the glyph`);
  }
}

for (const build of BUILDS) {
  test(`[${build.name}] every membership entry leads with its avatar, or the placeholder`, () => {
    const section = element(page(build.dir), 'github-profile__section--orgs');
    assert.ok(section, 'the home page renders the membership section');
    const items = elementsByClass(section.inner, 'github-profile__org');
    assert.equal(items.length, MEMBERSHIP_AVATARS.size, 'every canned membership renders');
    for (const li of items) {
      const login = attrValue(li.openTag, 'data-org');
      assert.ok(MEMBERSHIP_AVATARS.has(login), `unexpected membership ${login}`);
      const expected = MEMBERSHIP_AVATARS.get(login);
      const anchor = element(li.inner, 'github-profile__org-name');
      assert.ok(anchor, `${login}: the name anchor exists`);
      assertAvatar(
        avatarNode(anchor.inner, 'github-profile__org-avatar'),
        'github-profile__org-avatar',
        expected,
        login,
      );
      assert.equal(
        attrValue(li.openTag, 'data-avatar'),
        expected || null,
        `${login}: data-avatar carries the URL exactly when one exists`,
      );
    }
  });

  test(`[${build.name}] every rollup row leads with its owner's avatar, or the placeholder`, () => {
    const section = element(page(build.dir), 'github-profile__section--org-rollup');
    assert.ok(section, 'the home page renders the rollup section');
    const rows = elementsByClass(section.inner, 'github-profile__org-roll');
    assert.equal(rows.length, ROLLUP_AVATARS.size, 'every canned external owner rolls up');
    for (const row of rows) {
      const login = attrValue(row.openTag, 'data-org');
      assert.ok(ROLLUP_AVATARS.has(login), `unexpected rollup owner ${login}`);
      const expected = ROLLUP_AVATARS.get(login);
      const anchor = element(row.inner, 'github-profile__org-roll-name');
      assert.ok(anchor, `${login}: the name anchor exists`);
      assertAvatar(
        avatarNode(anchor.inner, 'github-profile__org-roll-avatar'),
        'github-profile__org-roll-avatar',
        expected,
        login,
      );
      assert.equal(
        attrValue(row.openTag, 'data-avatar'),
        expected || null,
        `${login}: data-avatar carries the URL exactly when one exists`,
      );
    }
  });

  test(`[${build.name}] the avatar image stays out of the text layer, one space from the name`, () => {
    // The image contributes nothing an HTML-to-text extractor reads, and the
    // name follows it after exactly one published space, which is the same
    // text-layer discipline every icon in the widget keeps.
    const section = element(page(build.dir), 'github-profile__section--org-rollup');
    const rows = elementsByClass(section.inner, 'github-profile__org-roll');
    const withAvatar = rows.find((r) => attrValue(r.openTag, 'data-org') === 'fixture-labs');
    const anchor = element(withAvatar.inner, 'github-profile__org-roll-name');
    assert.match(anchor.inner, /^<img [^>]*> /, 'the image, then one space, then the name');
    assert.equal(
      extractedText(anchor.inner),
      'fixture-labs',
      'the text layer reads the login alone',
    );
  });

  test(`[${build.name}] the identity avatar survives its move into the shared partial`, () => {
    // The home page hotlinks, so the src is the canned identity URL verbatim.
    // elementsByClass rather than element(), because the avatar is a void
    // element and element() only matches tags that open a subtree.
    const section = element(page(build.dir), 'github-profile__section--identity');
    assert.ok(section, 'the home page renders the identity section');
    const [img, ...extra] = elementsByClass(section.inner, 'github-profile__avatar');
    assert.ok(img, 'the identity avatar renders');
    assert.deepEqual(extra, [], 'exactly once');
    assert.equal(img.name, 'img');
    assert.equal(attrValue(img.openTag, 'src'), 'https://avatars.fixture.example/u/4242?v=4');
    assert.equal(attrValue(img.openTag, 'width'), '200');
  });

  test(`[${build.name}] avatar="none" renders both surfaces image-free, at their baselines`, () => {
    const widget = element(page(build.dir, AVATAR_NONE_PAGE), 'github-profile');
    assert.ok(widget, 'the avatar-none page renders the widget');
    assert.ok(!widget.outer.includes('<img'), 'no image anywhere in the widget');
    assert.ok(
      !widget.outer.includes('github-profile__org-avatar'),
      'and no avatar element either: none is the baseline, not a placeholder',
    );
    assert.ok(
      !widget.outer.includes('github-profile__org-roll-avatar'),
      'the rollup rows carry bare names',
    );
    // The membership baseline keeps the generic glyph inside the anchor.
    const orgs = element(widget.outer, 'github-profile__section--orgs');
    const anchor = element(orgs.inner, 'github-profile__org-name');
    assert.ok(anchor.inner.includes('<svg'), 'the membership entry keeps its organization glyph');
  });
}
