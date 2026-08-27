/* global process, URL, structuredClone */
// The fetch-mode avatar copies of the github-profile shortcode, and their
// arrival in url-retirement's manifest.
//
// Under avatar="fetch" the module copies each avatar at build time with
// resources.GetRemote, publishing it at a stable URL-derived name -- measured
// at v0.164.0, <urlbase>_<hash-of-the-URL>.<ext>, unchanged when the bytes
// served at the URL change -- that no walk of .Site.Pages reaches. The
// module's own suite is offline by design (every fixture page hotlinks), so
// the copies exist only in this suite's origin-backed builds, and so does the
// one failure that is SILENT everywhere else: a copy the manifest does not
// carry is a URL whose disappearance from production the coverage check the
// manifest exists for can never report.
//
// The base build is the mirror direction. Its canned data names no avatar
// URL, so the module fetches nothing, publishes nothing, registers nothing,
// and warns about nothing -- and the manifest must list nothing, because a
// registered URL no file backs would put a 404 into a document meant to be
// diffed against production.
import {test} from 'node:test';
import assert from 'node:assert/strict';
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
  base: resolve(process.env.HUGO_BUILD_LOG ?? join(testRoot, 'hugo-build.log')),
  skills: resolve(process.env.HUGO_BUILD_LOG_SKILLS ?? join(testRoot, 'hugo-build-skills.log')),
  oneUrl: resolve(
    process.env.HUGO_BUILD_LOG_ONE_URL ?? join(testRoot, 'hugo-build-one-url-per-page.log'),
  ),
};

const manifestUrls = (tree) =>
  readFileSync(join(tree, 'url-manifest.txt'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line !== '' && !line.startsWith('#'));

const profilePage = (tree) => readFileSync(join(tree, 'github-profile', 'index.html'), 'utf8');

// The published copy an <img> of the given class names, or null where the
// page renders no such image. The class is matched exactly, closing quote
// included: these BEM classes extend by suffix (each is a prefix of its own
// "--placeholder" variant), so an unanchored probe would be one modifier away
// from matching more than it means to.
const avatarSrc = (html, className) => {
  const match = new RegExp(`<img class="${className}" src="([^"]+)"`).exec(html);
  return match ? match[1] : null;
};

// Every avatar copy a tree actually wrote, found by walking its root rather
// than by naming the files, so the manifest set can be checked against the
// tree instead of against the expectation that produced it. The pattern
// covers every canned login, the bare one included: an avatar the data never
// named showing up here is exactly what the base-build assertions exist to
// catch.
const AVATAR_NAME = /^(?:composition-dev|composition-org|quiet-org)_[0-9]+\.[a-z0-9]+$/;
const avatarsOnDisk = (tree) =>
  readdirSync(tree)
    .filter((name) => AVATAR_NAME.test(String(name)))
    .map((name) => `/${name}`)
    .sort();

test('the origin-backed build publishes a copy for exactly the avatars the data names', () => {
  const html = profilePage(trees.skills);
  const identity = avatarSrc(html, 'github-profile__avatar');
  const org = avatarSrc(html, 'github-profile__org-avatar');
  assert.match(
    identity ?? '',
    /^\/composition-dev_[0-9]+\.png$/,
    'the identity avatar was fetched',
  );
  assert.match(org ?? '', /^\/composition-org_[0-9]+\.png$/, 'the organization avatar was fetched');
  // The bare entry renders the placeholder while its sibling fetches, and
  // silently: an API answer that simply carried no avatar is not a failure.
  assert.ok(
    html.includes('github-profile__org-avatar github-profile__org-avatar--placeholder'),
    'the avatar-less organization must render the placeholder',
  );
  assert.deepEqual(
    avatarsOnDisk(trees.skills),
    [identity, org]
      .map((url) => url.slice(1))
      .sort()
      .map((name) => `/${name}`),
    'the copies on disk and the copies the page names are different sets',
  );
});

test('both copies are listed in the manifest, as exactly the set the build wrote', () => {
  const urls = manifestUrls(trees.skills);
  // Set equality against the TREE, mirroring the skill-artifact assertion: an
  // implementation that registered a constant URL, or registered the bare
  // entry it never published, is caught here rather than passing a
  // one-URL containment check.
  assert.deepEqual(
    urls.filter((url) => AVATAR_NAME.test(url.slice(1))).sort(),
    avatarsOnDisk(trees.skills),
    'what the manifest lists and what the build wrote are different sets',
  );
  // The sitemap is the page walk's own projection, so a URL it does not carry
  // is one nothing but a registration could have put in the manifest.
  const sitemap = readFileSync(join(trees.skills, 'sitemap.xml'), 'utf8');
  assert.ok(/<loc>/.test(sitemap), 'the sitemap lists nothing, so the absence proves nothing');
  for (const url of avatarsOnDisk(trees.skills))
    assert.ok(!sitemap.includes(url), `${url} is reachable by walking pages after all`);
});

test('the registration survives manifest.output_formats being switched off', () => {
  // The avatar copy is published inline in the html pass (weight 10), so its
  // registration is in time for the manifest's weight-100 pass in EVERY
  // configuration -- unlike the skill artifacts, whose arrival that setting
  // decides. This build is what says so.
  const copies = avatarsOnDisk(trees.oneUrl);
  assert.equal(copies.length, 2, 'the one-url-per-page build did not publish both copies');
  const urls = manifestUrls(trees.oneUrl);
  for (const url of copies)
    assert.ok(urls.includes(url), `${url} was lost when output_formats was switched off`);
});

test('the base build publishes no copy and lists none', () => {
  assert.deepEqual(avatarsOnDisk(trees.base), [], 'the offline data made the module fetch');
  for (const url of manifestUrls(trees.base)) {
    assert.ok(
      !AVATAR_NAME.test(url.slice(1)),
      `${url} is listed although this build published no avatar copy`,
    );
  }
  // The page itself renders image-free: the identity strip omits its avatar
  // element outright where the data names no URL, and each organization entry
  // renders the placeholder.
  const html = profilePage(trees.base);
  assert.ok(!/<img class="github-profile__/.test(html), 'the offline page renders an avatar image');
  assert.ok(
    html.includes('github-profile__org-avatar github-profile__org-avatar--placeholder'),
    'the organization entries must keep their placeholders',
  );
});

test('the two canned data files differ only in the avatar URLs', () => {
  // The seam picks one of the two by a build-overlay switch, so any other
  // difference between them would make the base and origin builds disagree
  // about something this suite never meant to vary.
  const canned = (name) =>
    JSON.parse(readFileSync(join(fixtureDir, 'data', `github-profile-fetch-${name}.json`), 'utf8'));
  const offline = canned('offline');
  const origin = canned('origin');
  const avatarUrls = (data) => [
    data.user.avatarUrl,
    ...data.user.organizations.nodes.map((node) => node.avatarUrl),
  ];
  for (const url of avatarUrls(offline))
    assert.equal(url, '', 'the offline file must name no avatar anywhere');
  const urls = avatarUrls(origin);
  for (const url of urls.slice(0, 2)) {
    assert.match(
      url,
      /^http:\/\/127\.0\.0\.1:1919\/avatars\//,
      'origin avatars come from the suite origin',
    );
    const relative = new URL(url).pathname.split('/').filter(Boolean);
    assert.ok(
      existsSync(join(testRoot, 'fixture-origin', ...relative)),
      `${url} names nothing in the committed origin corpus`,
    );
  }
  assert.equal(urls[2], '', 'quiet-org stays bare in both files: the placeholder subject');
  const blanked = (data) => {
    const clone = structuredClone(data);
    clone.user.avatarUrl = '';
    for (const node of clone.user.organizations.nodes) node.avatarUrl = '';
    return clone;
  };
  assert.deepEqual(blanked(origin), blanked(offline), 'the files drifted apart beyond the avatars');
});

test('no build reports a github-profile diagnostic', () => {
  // Success is quiet on every arm this fixture exercises: a fetched copy, an
  // empty URL, and a bare organization entry all render without a warning, so
  // any [github-profile] line in any log is a regression.
  for (const [name, logPath] of Object.entries(logs)) {
    const lines = readFileSync(logPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('[github-profile]'));
    assert.deepEqual(lines, [], `the ${name} build reported github-profile diagnostics`);
  }
});
