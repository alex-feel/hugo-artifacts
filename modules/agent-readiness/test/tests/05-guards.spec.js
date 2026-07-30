// The configuration guards, and the cross-surface invariant they protect.
//
// Every guard here is a handful of template lines whose deletion would change
// no published byte in a correctly-configured build -- which is exactly how a
// guard rots. Each one is therefore driven by a deliberately broken entry in
// the fixture, and asserted on two axes: the warning Hugo actually emitted,
// and the absence of the wrong output that would otherwise ship.
import {test as nodeTest} from 'node:test';
import assert from 'node:assert/strict';
import {
  read,
  exists,
  badtablesDir,
  edgeDir,
  minimalDir,
  nsoffDir,
  publishedTwins,
  llmsoffDir,
  notwinsDir,
  offDir,
  markdownLinks,
  sectionsWithTopLevelBullets,
  warnCount,
} from './helpers.js';

// Mutation-to-test attribution rests entirely on test titles: a red result
// must trace to exactly one test, so a reused title makes it untraceable.
// Every registration in this file goes through this wrapper, and the final
// test asserts that no title was registered twice.
const registeredTitles = [];
function test(title, fn) {
  registeredTitles.push(title);
  return nodeTest(title, fn);
}

// ---- The invariant: a listed URL always exists ----

test('with twins off site-wide, neither document advertises a twin URL', () => {
  // The whole reason these five surfaces ship as ONE module. `markdown` stays
  // in [outputs] page here, so `.OutputFormats.Get "markdown"` still resolves
  // -- it answers "is the format wired", not "did anything render into it".
  // A link emitter that trusts it publishes a document in which every page
  // link 404s, on the exact configuration the module tells consumers to use
  // to turn twins off.
  for (const doc of ['llms.txt', 'about.md']) {
    const links = markdownLinks(read(doc, notwinsDir));
    assert.ok(links.length > 0, `${doc} must still list its pages`);
    for (const {url} of links) {
      assert.ok(!url.endsWith('/index.md'), `${doc} advertises ${url}, but no twin was published`);
    }
  }
});

test('with twins off site-wide, no twin file is published', () => {
  // The other half of the same invariant: proving the links are right is only
  // meaningful if the files really are absent.
  for (const rel of ['index.md', 'blog/post-one/index.md', 'projects/alpha/index.md']) {
    assert.ok(!exists(rel, notwinsDir), `${rel} must not be published when twins are off`);
  }
});

test('with twins off, the pages are still listed by their HTML URLs', () => {
  // Degrading to no listing at all would be a different bug with the same
  // green suite.
  const text = read('llms.txt', notwinsDir);
  assert.match(text, /^- \[Post One\]\(https:\/\/fixture\.example\/blog\/post-one\/\)/m);
});

// ---- Section-entry guards ----

test('a section entry with an empty `section` is skipped, with one warning', () => {
  // An empty section matches EVERY page, because the prefix test degenerates
  // to "starts with /". Left ungated, one `sections`-for-`section` typo
  // publishes the whole site under a single heading and looks deliberate.
  assert.equal(warnCount(/`section` is empty/), 2, 'one for llms, one for facts');
  for (const doc of ['llms.txt', 'about.md']) {
    assert.ok(!read(doc).includes('## Empty Section Key'), `${doc} must not carry the entry`);
  }
});

test('a section entry with no `name` is skipped, with one warning', () => {
  // Its bullets would be appended under the PREVIOUS entry's heading, where
  // a Markdown parser reads them as that section's links. The observable
  // symptom is a section that silently grows.
  assert.equal(warnCount(/it has no `name`/), 2, 'one for llms, one for facts');

  // The nameless fixture entry targets /blog, so the failure would show up as
  // Blog listing more pages than the shared filter admits.
  const blogBullets = read('llms.txt')
    .split(/^## /m)
    .find((s) => s.startsWith('Blog'))
    .split('\n')
    .filter((l) => l.startsWith('- '));
  assert.equal(blogBullets.length, 3, 'Blog lists exactly the pages the filter admits');
});

test('a section matching no page is omitted rather than published empty', () => {
  assert.equal(warnCount(/matches no page/), 2, 'one for llms, one for facts');
  for (const doc of ['llms.txt', 'about.md']) {
    assert.ok(
      !read(doc).includes('## Matches Nothing'),
      `${doc} must not publish a heading with nothing under it`,
    );
  }
});

// ---- The limit contract ----

test('limit = 0 lists everything and a positive limit truncates', () => {
  // Both halves in one build: `Blog` and `Recent Blog` target the same
  // section and differ only in `limit`. Without the second entry the
  // truncation branch never executes at all, because every other entry in
  // the fixture pins limit = 0.
  const sections = sectionsWithTopLevelBullets(read('llms.txt'));
  assert.equal(sections.get('Blog').length, 3, 'limit = 0 lists every admitted page');
  assert.equal(sections.get('Recent Blog').length, 1, 'limit = 1 lists exactly one');
});

// ---- The twin's trailing pointer block ----

test('a twin ends with the pointer section, byte-exactly', () => {
  // Rewritten to assemble its own terminating newline, because the closing
  // trim marker of the previous inline form ate it. Nothing asserted the
  // tail, so the missing newline shipped unnoticed.
  const tail = '\n\n## Sitemap\n\n- [llms.txt](https://fixture.example/llms.txt)\n';
  for (const rel of ['index.md', 'blog/post-one/index.md']) {
    assert.ok(read(rel).endsWith(tail), `${rel} must end with the pointer block and one newline`);
  }
});

// ---- Site-scoped keys set at the page tier ----

test('every site-scoped key set in front matter warns exactly once', () => {
  // The trap is `agent: {enable: false}`: a reader of the key table reaches
  // for it as a per-page opt-out, it is a map so the non-map guard cannot
  // catch it, and without this warning it is discarded in total silence while
  // the page keeps its twin and stays listed. The opt-out that works is
  // `agent: false`.
  for (const key of ['enable', 'sections', 'exclude_noindex', 'robots']) {
    assert.equal(
      warnCount(new RegExp(`agent key "${key}"|\\[${key}\\] table`)) > 0,
      true,
      `a page-tier \`${key}\` must warn`,
    );
  }
  assert.equal(warnCount(/agent key "enable"/), 1, 'exactly once, deduplicated across pages');
  assert.equal(warnCount(/`markdown.enable`/), 1);
});

test('a surface `enable` set on the HOME page is discarded, with one warning each', () => {
  // The home page is the only place a page-tier surface switch could do real
  // damage: llms.txt, about.md and the skills index all render from it, so a
  // page tier that reached them would switch a document off while every twin
  // kept pointing at it -- exactly the disagreement the site-scoping exists to
  // prevent. All three keys are set there and all three must be ignored.
  for (const key of ['llms.enable', 'facts.enable', 'skills_index.enable']) {
    assert.equal(warnCount(new RegExp(`\`${key.replace('.', '\\.')}\``)), 1, `${key} must warn`);
  }
  assert.ok(exists('llms.txt'), 'llms.txt is still published');
  assert.ok(exists('about.md'), 'about.md is still published');
  assert.ok(exists('.well-known/agent-skills/index.json'), 'the skills index is still published');
});

test('the page that set them is unaffected by them', () => {
  // The keys are discarded, so the page behaves exactly as the site config
  // says. It sits outside the `sections` allow-list, so it has no twin and
  // appears in no listing -- and NOT because its own `enable: false` worked.
  assert.ok(!exists('scoped-keys/index.md'));
  assert.ok(exists('scoped-keys/index.html'), 'the HTML page is untouched');
  for (const doc of ['llms.txt', 'about.md']) {
    assert.ok(!read(doc).includes('scoped-keys'), `${doc} must not list an out-of-scope page`);
  }
});

// ---- The other pointed-at document: llms.txt switched off ----

test('with llms.txt off, nothing points at it', () => {
  // The counterpart of the twins case above, and the same distinction:
  // `site.Home.OutputFormats.Get "llmstxt"` still resolves with the switch
  // off, because it answers "is the format wired", not "did llms.html render
  // anything into it". Two surfaces point at llms.txt, and both would publish
  // a dead link if they trusted the format alone.
  assert.ok(!exists('llms.txt', llmsoffDir), 'the document itself is not published');

  for (const rel of ['index.md', 'blog/post-one/index.md']) {
    assert.ok(!read(rel, llmsoffDir).includes('llms.txt'), `${rel} must not point at it`);
  }
  assert.ok(!read('about.md', llmsoffDir).includes('llms.txt'));

  // The Sitemap block itself survives -- only the dead pointer is dropped.
  assert.match(read('about.md', llmsoffDir), /^## Sitemap$/m);
  assert.match(read('about.md', llmsoffDir), /- \[sitemap\.xml\]\(/);
});

// ---- Subpath baseURL ----

test('a subpath baseURL is preserved in every consumer-authored URL', () => {
  // absURL does NOT prepend the whole baseURL to a value that already starts
  // with "/" -- Hugo resolves that form against the protocol and host only,
  // DISCARDING the baseURL's path. A leading slash is exactly what a consumer
  // writes, and exactly the input that breaks, so the module normalizes before
  // absolutizing. Every other fixture sits at a domain root, where a broken
  // implementation is indistinguishable from a correct one.
  const llms = read('llms.txt', edgeDir);
  assert.match(llms, /- \[Sitemap\]\(https:\/\/example\.org\/docs\/sitemap\.xml\)/);
  assert.ok(
    !/\]\(https:\/\/example\.org\/(?!docs\/)/.test(llms),
    'no URL may drop the baseURL path component',
  );

  const about = read('about.md', edgeDir);
  assert.match(about, /\[Contact form\]\(https:\/\/example\.org\/docs\/contact\/\)/);
  assert.ok(!/\]\(https:\/\/example\.org\/(?!docs\/)/.test(about));

  // A value carrying its own scheme is still passed through untouched.
  assert.match(about, /\(mailto:hello@fixture\.example\)/);
});

// ---- The remaining refusals ----

test('a license with a url but no name is refused, with one warning', () => {
  // Composed as [name](url), so emitting it with an empty name would publish
  // a Markdown link with an empty label -- the failure this guard exists for.
  assert.equal(warnCount(/license line/, 'edge'), 1);
  assert.ok(!read('llms.txt', edgeDir).includes('Content licensed under'));
  assert.ok(!read('llms.txt', edgeDir).includes(']()'));
});

test('an unrecognized sitemap_section_target warns and drops the pointer block', () => {
  assert.equal(warnCount(/unrecognized markdown.sitemap_section_target/, 'edge'), 1);
  for (const rel of ['index.md', 'blog/post-one/index.md']) {
    assert.ok(!read(rel, edgeDir).includes('## Sitemap'), `${rel} must carry no pointer block`);
  }
});

test('two pages publishing one URL are listed once, with one warning', () => {
  // Only one twin can exist at a colliding URL, so listing both would
  // advertise a URL whose twin belongs to the other page.
  assert.equal(warnCount(/duplicate agent-surface entry/, 'edge'), 1);
  const collisions = markdownLinks(read('llms.txt', edgeDir)).filter((l) =>
    l.url.includes('/dupes/collide/'),
  );
  assert.equal(collisions.length, 1, 'the colliding URL is listed exactly once');
});

test('a non-map `agent:` front-matter value warns rather than being interpreted', () => {
  // `agent: false` is the documented shorthand; any other scalar is a mistake
  // and is reported instead of guessed at.
  assert.equal(warnCount(/expected a map/), 1);
});

// ---- The configuration namespace itself ----

test('the whole [params] agent namespace written as a bare value is reported', () => {
  // `[params] agent = false` is the shorthand a consumer reaches for to switch
  // the module off. Discarded in silence it does NOTHING: every default stays
  // in force and the module publishes its full surface -- the exact opposite
  // of what was asked. The falsy spelling is the likelier one for a kill
  // switch, so a guard testing truthiness rather than presence misses
  // precisely the case that matters.
  assert.equal(warnCount(/Ignoring \[params\] agent/, 'nsoff'), 1);
  // And the discard is a real discard: the shipped defaults still publish.
  assert.ok(exists('llms.txt', nsoffDir), 'the module still emits its surfaces');
});

// ---- The shipped default allow-list ----

test('an EMPTY sections allow-list admits every regular page', () => {
  // The shipped default, and until this build it was reachable by nothing:
  // every environment inherited the two sections _default configures, so the
  // `{{- if $cfg.sections -}}` gate was always true. A regression making the
  // empty list admit NOTHING would have shipped with the suite green.
  const twins = publishedTwins(minimalDir);
  for (const rel of [
    '/blog/post-one/index.md',
    '/projects/alpha/index.md',
    '/contact/index.md',
    '/scoped-keys/index.md',
  ]) {
    assert.ok(twins.includes(rel), `${rel} must be admitted when sections is empty`);
  }
  // The per-page rules still apply -- empty means "no section filter", not
  // "no filter at all".
  assert.ok(!twins.includes('/blog/excluded/index.md'), 'agent: false still excludes');
  assert.ok(!twins.includes('/blog/noindexed/index.md'), 'robots: noindex still excludes');
});

// ---- The master switch ----

test('enable = false emits no agent surface at all', () => {
  // The switch gates all six renderers, and until this build every one of
  // those conjuncts was unconditionally true: deleting `$cfg.enable` from any
  // renderer changed no published byte and left the suite green. All four
  // formats stay wired in [outputs] here, so the absence is the switch
  // working rather than the format being unwired.
  for (const rel of [
    'llms.txt',
    'about.md',
    'index.md',
    'blog/post-one/index.md',
    '.well-known/agent-skills/index.json',
    // Even the built-in robots format publishes nothing: a template that
    // renders zero bytes makes Hugo write no file, whoever owns the format.
    'robots.txt',
  ]) {
    assert.ok(!exists(rel, offDir), `${rel} must not be published with enable = false`);
  }
  // The site itself is untouched -- the switch suppresses the agent surfaces,
  // not the site that carries them.
  assert.ok(exists('blog/post-one/index.html', offDir), 'the HTML site still builds');
  assert.ok(exists('index.html', offDir));
});

// ---- The documented map opt-out, and its explicit-include override ----

test('agent: {exclude: true} is equivalent to the bare shorthand', () => {
  // The README publishes both forms as equivalent, but only the shorthand had
  // a fixture page, so the `isset` branch implementing the map form survived
  // deletion with the suite green.
  assert.ok(!exists('blog/opt-out-map/index.md'), 'no twin');
  for (const doc of ['llms.txt', 'about.md']) {
    assert.ok(!read(doc).includes('opt-out-map'), `${doc} must not list it`);
  }
  assert.ok(exists('blog/opt-out-map/index.html'), 'the HTML page is untouched');
});

test('agent: {exclude: false} overrides the noindex rule', () => {
  // The documented escape hatch for a page that is noindex but should still
  // appear on the agent surfaces. Both `if not $explicitlyIncluded` wrappers
  // were dead code before this page existed.
  assert.ok(exists('blog/noindex-but-included/index.md'), 'the twin IS emitted');
  assert.ok(read('llms.txt').includes('noindex-but-included'), 'and it IS listed');
});

// ---- Configured Disallow, and nested-map merge ----

test('configured Disallow lines are emitted in their groups', () => {
  // The module ships all four directive lists empty, correctly -- a Disallow
  // shipped as a default would deindex a site on the build after import, and
  // a shipped Allow would tie a configured Disallow away -- so no other build
  // exercises these emission paths or their line placement.
  const robots = read('robots.txt', edgeDir).split('\n');
  const star = robots.indexOf('User-agent: *');
  const group = robots.slice(star + 1, robots.indexOf('', star + 1));
  assert.ok(group.includes('Disallow: /private/'), 'inside the catch-all group');
  assert.ok(group.includes('Disallow: /tmp/'));
  assert.ok(group.includes('Allow: /'), 'the consumer-authored Allow survives alongside');

  const gptbot = robots.indexOf('User-agent: GPTBot');
  assert.ok(gptbot > star, 'the bot group follows the catch-all group');
  const botGroup = robots.slice(gptbot + 1, robots.indexOf('', gptbot + 1));
  assert.deepEqual(
    botGroup,
    ['Disallow: /'],
    'the bot group carries the configured bots_disallow, and nothing else',
  );
});

test('a bots_disallow configured alone blocks, with no Allow line to tie against it', () => {
  // RFC 9309 section 2.2.2 resolves an Allow and a Disallow of equal path
  // length in favor of Allow, and Google's parser does the same. Shipped as
  // a default, bots_allow = ['/'] would therefore sit in every bot group as
  // Allow: /, tie the consumer's Disallow: / at length one, and keep the
  // crawler fully allowed -- the one directive the consumer wrote to block
  // it would silently never take effect. The module ships bots_allow empty
  // so the configured block is the whole group.
  const robots = read('robots.txt', edgeDir).split('\n');
  for (const token of ['GPTBot', 'ClaudeBot', 'CCBot']) {
    const start = robots.indexOf(`User-agent: ${token}`);
    assert.ok(start > -1, `a group for ${token} must exist`);
    const group = robots.slice(start + 1, robots.indexOf('', start + 1));
    assert.ok(group.includes('Disallow: /'), `${token} carries the configured Disallow: /`);
    assert.ok(
      !group.some((l) => l.startsWith('Allow:')),
      `${token} must carry no Allow line for the Disallow to tie against`,
    );
  }
});

test('a robots path value carrying a line break cannot add a directive line', () => {
  // The edge build writes one Disallow entry as a TOML basic string with an
  // embedded \n. robots.txt is line-oriented in exactly the way llms.txt and
  // about.md are: uncollapsed, the value's second half would publish as a
  // directive line of its own rather than as part of the configured path.
  const robots = read('robots.txt', edgeDir).split('\n');
  const star = robots.indexOf('User-agent: *');
  const group = robots.slice(star + 1, robots.indexOf('', star + 1));
  assert.ok(group.includes('Disallow: /drafts/ /old-drafts/'), 'one line, collapsed');
  assert.ok(
    !robots.includes('/old-drafts/'),
    'no fragment of the value may become a line of its own',
  );
});

test('a scalar written where a list is expected is coerced, with one warning', () => {
  // Go's range accepts no string, so without coercion this alone would stop
  // the build -- against the module's published never-fail-the-build contract.
  assert.equal(warnCount(/robots\.extra expects a list/, 'edge'), 1);
  assert.ok(read('robots.txt', edgeDir).includes('# a single extra line written as a bare string'));
});

test('setting one key in a nested map leaves the rest at their shipped values', () => {
  // The named acceptance criterion for map-merge-not-replace. The edge build
  // sets markdown.canonical = false and nothing else in that table, so every
  // other markdown key must still be at its default.
  const twin = read('blog/post-one/index.md', edgeDir);
  assert.ok(!/^canonical:/m.test(twin), 'canonical is off, as configured');
  assert.match(twin, /^title:/m, 'front_matter is still on, as shipped');
  assert.match(twin, /^description:/m);
});

// ---- Type mistakes are absorbed, never raised ----

test('a non-numeric limit is reported and read as complete', () => {
  // `int` raises a template error on it, which would stop the consuming
  // site's build over a one-character config typo.
  assert.equal(warnCount(/non-numeric `limit`/, 'edge'), 1);
  const bad = sectionsWithTopLevelBullets(read('llms.txt', edgeDir)).get('Bad Limit');
  assert.ok(bad && bad.length > 0, 'the section is still listed');
  assert.equal(bad.length, 3, 'and listed COMPLETE, which is what limit = 0 means');
});

test('a SCALAR written for an array-of-tables key is refused, not evaluated', () => {
  // The shape that stops the build outright, as opposed to the bare-string
  // ARRAY shape below which merely drops entries. Both guards exist; both
  // need a build that enters them.
  assert.equal(warnCount(/\[\[params\.agent\.skills\]\] expects an array of tables/, 'notwins'), 1);
  assert.equal(warnCount(/identity\] rows expects an array of tables/, 'notwins'), 1);
});

test('a sub-table written as a non-map is reported, not silently discarded', () => {
  // Discarded silently, every key inside keeps its shipped default -- so
  // `[params.agent] llms = false`, the natural mis-write of
  // `[params.agent.llms] enable = false`, leaves llms.txt publishing. That is
  // the opposite of what the consumer asked for, with no signal at all.
  assert.equal(warnCount(/agent robots value|\] robots:/, 'notwins'), 1);
  assert.equal(warnCount(/agent skills_index value/, 'notwins'), 1);
  // A frontmatter SECTION written as a non-map drops that section's entire
  // vocabulary from every twin and from about.md.
  assert.equal(warnCount(/frontmatter\] blog/, 'notwins'), 1);

  // The FALSY half, on BOTH cascade loops. `with` treats false as absent, so
  // a with-gated guard never sees `[params.agent] llms = false` -- the exact
  // mis-write these guards exist for. Presence must be tested with `ne nil`,
  // the rule the scalar cascade already follows.
  assert.equal(warnCount(/\[params\.agent\] license:/, 'notwins'), 1, 'site-scoped loop');
  assert.equal(warnCount(/agent frontmatter value/, 'llmsoff'), 1, 'all-tiers loop');
  // And the discard really is a discard: shipped defaults survive, so the
  // surfaces keep publishing rather than silently vanishing.
  assert.ok(exists('llms.txt', notwinsDir), 'the shipped defaults stand');
});

test('a bare value in ANY array-of-tables key is refused, not dropped', () => {
  // The scalar coercion cannot see these: `skills = ['my-skill']` is a real
  // slice, so it passes IsSlice untouched and every entry then fails the
  // entry-must-be-a-table test. Dropped silently each one publishes a surface
  // that is byte-indistinguishable from "the consumer configured nothing" --
  // no index at all, no `## Optional` heading, no `## Identity` block, a
  // missing contact channel.
  assert.equal(warnCount(/params\.agent\.skills\]\] entry/, 'badtables'), 2);
  assert.equal(warnCount(/llms\.optional\]\] entry/, 'badtables'), 1);
  assert.equal(warnCount(/identity\.rows\]\] entry/, 'badtables'), 2);
  assert.equal(warnCount(/contact channel/, 'badtables'), 2);
});

test('refused bare-string entries leave a degraded document that still publishes', () => {
  // The bare-string-array shapes of the contact channels, the identity rows
  // and the skills all land in `badtables` (the scalar sub-table shape lives
  // in `llmsoff`), and each refused entry must cost exactly its own block: a
  // document that still publishes, minus the block that could not be read,
  // is what separates degradation from failure.
  const about = read('about.md', badtablesDir);
  assert.ok(!about.includes('## Contact'), 'no channel survived, so no block');
  assert.ok(!about.includes('## Identity'), 'no row survived, so no block');
  assert.match(about, /^# /m, 'the rest of the document is intact');
  assert.ok(!exists('.well-known/agent-skills/index.json', badtablesDir));
});

test('a scalar written for a consumer sub-table is refused, not evaluated', () => {
  // `[params.agent.facts] identity = '/'` is the natural mis-write of
  // `[params.agent.facts.identity] page = '/'`. Hugo's `default` substitutes
  // only on a FALSY value, so the string reached facts.html and `.rows` was
  // evaluated as a field on a string -- a hard build stop, inside a module
  // the consumer does not own.
  assert.equal(warnCount(/facts\] identity expects a table/, 'llmsoff'), 1);
  // BOTH halves of the loop: dropping either name from
  // `range $t := slice "identity" "contact"` must fail.
  assert.equal(warnCount(/facts\] contact expects a table/, 'llmsoff'), 1);
  const about = read('about.md', llmsoffDir);
  assert.ok(!about.includes('## Identity'), 'the unreadable block is omitted');
  assert.match(about, /^# /m, 'the rest of the document still publishes');
});

test('a bare value where a section table belongs is refused, not dropped', () => {
  // `sections = ['blog']` is a real slice, so the scalar coercion passes it
  // through and every string entry then fails the entry-must-be-a-table test.
  // Dropped silently -- which is what shipped -- it publishes an llms.txt with
  // an H1 and no sections at all: exit 0, no warning, a deliberate-looking
  // document.
  assert.equal(warnCount(/llms\.sections\]\] entry/, 'badtables'), 2, 'blog and projects');
  assert.equal(warnCount(/facts\.sections\]\] entry/, 'badtables'), 1);

  for (const doc of ['llms.txt', 'about.md']) {
    const text = read(doc, badtablesDir);
    assert.match(text, /^# /m, 'the document still publishes');
    assert.ok(
      !/^## (Blog|Projects)$/m.test(text),
      `${doc} must carry no section heading built from an unreadable entry`,
    );
  }
});

test('a scalar written where a section vocabulary belongs is coerced', () => {
  // [params.agent.frontmatter.<section>] keys is the one table every consuming
  // site hand-authors, and a one-field vocabulary is ordinary, so `keys =
  // 'title'` is a likely typo. It aborted the build until it was coerced.
  assert.equal(warnCount(/frontmatter\.dupes\.keys expects a list/, 'edge'), 1);
});

// ---- No Go debug form ever reaches a published document ----

test('map- and list-valued front-matter values are rendered, never stringified', () => {
  // Go's %v yields `map[k:v]` and `[a b]`. The twin runs the same key through
  // jsonify and would never produce either, and both surfaces are documented
  // as describing a page with one vocabulary.
  const about = read('about.md');
  assert.match(about, /^- \*\*Credential\*\*: id: ABC-123, issuer: Fixture Authority$/m);
  assert.match(about, /^- \*\*Focus\*\*: testing, tooling$/m);
  assert.ok(!/map\[/.test(about), 'no Go map debug form anywhere in the document');
  assert.ok(!/\[[a-z]+ [a-z]+\]/.test(about), 'no Go slice debug form either');
});

// ---- Skill name uniqueness ----

test('a duplicate skill name is refused, with one warning', () => {
  // The name is the sole published path segment. Publishing both entries
  // would serve ONE file while the index advertised two digests for it, so at
  // least one advertised digest could not match the bytes at its own URL --
  // which a verifying agent is entitled to read as tampering.
  assert.equal(warnCount(/second agent skill named/), 1);

  const doc = JSON.parse(read('.well-known/agent-skills/index.json'));
  const names = doc.skills.map((s) => s.name);
  assert.equal(new Set(names).size, names.length, 'no name may appear twice in the index');
  assert.equal(names.filter((n) => n === 'fixture-skill').length, 1);
});

// ---- The suite's own attribution invariant ----

nodeTest('every test title in this file is unique', () => {
  // Registered last, after every wrapped registration above has recorded its
  // title, and registered through nodeTest directly so it cannot count
  // itself.
  const dupes = registeredTitles.filter((t, i) => registeredTitles.indexOf(t) !== i);
  assert.deepEqual(dupes, [], 'a reused title makes a red result untraceable');
});
