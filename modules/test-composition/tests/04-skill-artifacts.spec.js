/* global process */
// The one URL class in this repository that a module ANSWERS for rather than
// registers.
//
// agent-readiness republishes every configured agent skill as an artifact of
// its own, at a stable URL keyed by the skill NAME, and no walk of .Site.Pages
// reaches one: an artifact is a Resource, published because a template read its
// URL. The obvious mechanism -- register it where it is published -- cannot be
// placed reliably here, because the artifacts are copied by whichever caller
// first reaches a shared resolution and those callers sit in different render
// passes. Which caller wins is decided by the CONSUMING SITE's configuration,
// so the same registration lands on one site and is refused on another.
//
// So the manifest asks instead, during its own pass, through
// layouts/_partials/url-retirement/writes/<format-name>.html. These builds are
// what shows the difference: the `one-url-per-page` build switches off the very
// setting that decides whether a push would have been in time, and the artifact
// is listed there too.
//
// The index.json beside the artifact is why this matters rather than merely
// being tidy: it is reachable by the page walk, it advertises each artifact
// with a SHA-256 digest, and a missing artifact is therefore a published,
// digest-bearing pointer at a 404 that the registry could not see.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const testRoot = resolve(here, '..');
const fixtureDir = join(testRoot, 'fixture');

const trees = {
  base: resolve(process.env.FIXTURE_PUBLIC ?? join(fixtureDir, 'public', 'base')),
  skills: resolve(process.env.FIXTURE_PUBLIC_SKILLS ?? join(fixtureDir, 'public', 'skills')),
  oneUrl: resolve(
    process.env.FIXTURE_PUBLIC_ONE_URL ?? join(fixtureDir, 'public', 'one-url-per-page'),
  ),
};

const logs = {
  skills: resolve(process.env.HUGO_BUILD_LOG_SKILLS ?? join(testRoot, 'hugo-build-skills.log')),
  oneUrl: resolve(
    process.env.HUGO_BUILD_LOG_ONE_URL ?? join(testRoot, 'hugo-build-one-url-per-page.log'),
  ),
};

const ARTIFACT = '/.well-known/agent-skills/composition-skill/SKILL.md';
const SECOND = '/.well-known/agent-skills/second-skill/SKILL.md';
const INDEX = '/.well-known/agent-skills/index.json';

const manifestUrls = (tree) =>
  readFileSync(join(tree, 'url-manifest.txt'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line !== '' && !line.startsWith('#'));

const servedFile = (tree, url) => join(tree, url.slice(1));

// Every artifact this build actually wrote, found by walking the tree rather
// than by naming them, so an answer cannot be checked against the list that
// produced it.
const artifactsOnDisk = (tree) =>
  readdirSync(join(tree, '.well-known', 'agent-skills'), {recursive: true})
    .map((name) => `/.well-known/agent-skills/${String(name).split('\\').join('/')}`)
    .filter((url) => url.endsWith('/SKILL.md'))
    .sort();

test('the configured skills really were fetched and republished', () => {
  // The premise every assertion below rests on. If the origin answered nothing
  // the module would publish no artifact, the manifest would list none, and
  // three tests would pass by agreeing about an absence.
  assert.deepEqual(
    artifactsOnDisk(trees.skills),
    [ARTIFACT, SECOND].sort(),
    'the skills build did not publish the two artifacts this suite is about',
  );
  assert.ok(existsSync(servedFile(trees.skills, INDEX)), 'the skills build published no index');
});

test('every artifact URL is listed although no page carries one', () => {
  const urls = manifestUrls(trees.skills);
  // Set equality against the TREE, not a remembered list. Two artifacts is what
  // gives this teeth: an answer that named a constant URL would satisfy any
  // assertion about one artifact and is caught here.
  assert.deepEqual(
    urls.filter((url) => url.endsWith('/SKILL.md')).sort(),
    artifactsOnDisk(trees.skills),
    'what the manifest lists and what the build wrote are different sets',
  );
  // The sitemap is the page walk's own projection, so a URL it does not carry
  // is one nothing but the format owner's answer could have put in the manifest.
  const sitemap = readFileSync(join(trees.skills, 'sitemap.xml'), 'utf8');
  assert.ok(!sitemap.includes(ARTIFACT), 'the artifact is reachable by walking pages after all');
  // And the document that points at them, which the page walk DOES reach.
  assert.ok(urls.includes(INDEX), 'the index the artifacts hang off is missing from the manifest');
});

// The whole reason the artifact must be in the registry rather than merely on
// disk: the index advertises a digest for it, so a silently vanished artifact
// leaves a verifiable-looking pointer at a 404.
test('and the index really does advertise a digest for the URL that was listed', () => {
  const index = JSON.parse(readFileSync(servedFile(trees.skills, INDEX), 'utf8'));
  const entry = (index.skills ?? []).find((skill) => skill.url === ARTIFACT);
  assert.ok(entry, `the index does not describe ${ARTIFACT}`);
  const bytes = readFileSync(servedFile(trees.skills, ARTIFACT));
  assert.equal(
    entry.digest,
    `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    'the advertised digest does not match the artifact this build published',
  );
});

// THE LOAD-BEARING ONE. url_retirement.manifest.output_formats decides whether
// the publication hook runs, and therefore whether a registration placed where
// the artifacts are copied would reach the manifest: measured at v0.164.0, such
// a registration landed on every build with the setting on and was refused on
// every build with it off. A pull does not depend on it, and this build is what
// says so. Every push design fails this test.
test('the artifact is listed with the per-format URLs switched off as well', () => {
  assert.ok(
    existsSync(servedFile(trees.oneUrl, ARTIFACT)),
    'the one-url-per-page build published no artifact',
  );
  const urls = manifestUrls(trees.oneUrl);
  assert.ok(urls.includes(ARTIFACT), 'the artifact was lost when output_formats was switched off');
  // The index is a per-format document of the home page, so this mode lists it
  // nowhere -- which is the setting working, and is what makes the line above a
  // statement about the hook rather than about the format wiring.
  assert.ok(!urls.includes(INDEX), 'a per-format document is listed in one-URL-per-page mode');
});

// The refusal diagnostic is what a push would have produced on the builds it
// lost. Its absence here is the difference between "arrived" and "arrived
// quietly enough".
test('and neither build reports a late registration or a refused answer', () => {
  for (const [name, logPath] of Object.entries(logs)) {
    const lines = readFileSync(logPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('[url-retirement]'));
    assert.deepEqual(lines, [], `the ${name} build reported url-retirement diagnostics`);
  }
});

// The other direction, and the one the base build is the only coverage of: with
// no skill configured the module publishes NO index and no artifact, and the
// manifest must name neither. A hook returning a constant would pass every
// assertion above and fail this one.
test('a build with no skill configured lists no artifact at all', () => {
  const urls = manifestUrls(trees.base);
  for (const url of urls) {
    assert.ok(
      !url.startsWith('/.well-known/agent-skills/'),
      `${url} is listed although this build configured no skill`,
    );
  }
  assert.ok(!existsSync(servedFile(trees.base, ARTIFACT)), 'the fixture premise changed');
});
