/* global process */
// The fetch success arm of the shared avatar partial, rendered on a site that
// imports github-profile ALONE.
//
// Every other fixture page hotlinks or goes without, so until the origin-backed
// build existed the fetch arm was template code nothing in this repository ever
// rendered -- and the arm carries a templates.Exists probe for the OPTIONAL
// url-retirement sibling whose FALSE arm only a site without that module can
// take. The cross-module composition suite always imports url-retirement, so a
// broken false arm (say, the guard removed and the partial called
// unconditionally) would break every single-module consumer's build while every
// url-retirement-importing fixture stayed green. This build importing the
// module alone, succeeding, and rendering the fetched copy is that arm's
// subject.
//
// The two offline builds keep their own arm: the origin login degrades to the
// identity chip with nothing fetched and nothing logged, which is what lets the
// page sit in the shared content directory without costing the offline logs
// their silence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {BUILDS, page, element, elementsByClass, attrValue} from './helpers.js';

const originDir = resolve(process.env.FIXTURE_PUBLIC_ORIGIN ?? 'fixture/public/origin');
const originLog = resolve(process.env.HUGO_BUILD_LOG_ORIGIN ?? 'hugo-build-origin.log');
const PAGE = 'avatar-fetch/index.html';

test('[origin] the build imports github-profile alone', () => {
  // The premise the false-arm claim rests on: were url-retirement mounted
  // here, its weight-100 output format would publish a manifest and the
  // templates.Exists probe would be true, and this build would prove nothing
  // the composition suite does not.
  assert.ok(existsSync(join(originDir, PAGE)), 'the origin build published the avatar-fetch page');
  assert.ok(
    !existsSync(join(originDir, 'url-manifest.txt')),
    'url-retirement is mounted after all, so the guard never takes its false arm here',
  );
});

test('[origin] the fetched identity avatar renders, and its copy is on disk', () => {
  const section = element(page(originDir, PAGE), 'github-profile__section--identity');
  assert.ok(section, 'the identity section renders');
  // elementsByClass rather than element(), because the avatar is a void
  // element and element() only matches tags that open a subtree.
  const [img, ...extra] = elementsByClass(section.inner, 'github-profile__avatar');
  assert.ok(img, 'the identity avatar renders');
  assert.deepEqual(extra, [], 'exactly once');
  assert.equal(img.name, 'img', 'as a fetched image, not the placeholder');
  const src = attrValue(img.openTag, 'src');
  assert.match(src, /^\/avatar_[0-9]+\.png$/, 'the src names the URL-derived build-time copy');
  assert.ok(existsSync(join(originDir, src.slice(1))), 'the copy the src names was published');
});

test('[origin] the build succeeded silently', () => {
  // The runner already fails the build on a deprecation or an ERROR; this is
  // the same second, independent gate the offline logs get in
  // 05-build-log.spec.js, for the one build that runs template code they
  // cannot reach.
  const log = readFileSync(originLog, 'utf8');
  assert.match(log, /^Start building sites/m, 'the log must be a full Hugo build log');
  assert.match(log, /Total in \d+ ms/, 'including the completion line');
  const flagged = log
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.startsWith('WARN') ||
        /deprecat/i.test(line) ||
        line.includes('ERROR') ||
        line.includes('found no layout file'),
    );
  assert.deepEqual(flagged, [], 'the fetch success arm renders without a diagnostic');
});

for (const build of BUILDS) {
  test(`[${build.name}] offline, the origin login degrades to the identity chip`, () => {
    // The seam answers origin-dev only when origin.toml names the origin, so
    // the offline builds render the zero-API chip: no fetch, no image, no log
    // line -- which 05-build-log.spec.js is already gating.
    const widget = element(page(build.dir, PAGE), 'github-profile');
    assert.ok(widget, 'the avatar-fetch page renders the widget');
    assert.ok(
      widget.classes.includes('github-profile--degraded'),
      'the widget carries the degraded modifier',
    );
    assert.equal(attrValue(widget.openTag, 'data-state'), 'not-found');
    assert.ok(!widget.outer.includes('<img'), 'nothing offline may render an image');
  });
}
