// The Agent Skills discovery index: both distribution types, the digest
// contract, and every gate an entry can fail.
//
// THE ORIGIN: these specs exercise real build-time remote fetches, because the
// digest guarantee -- the advertised hash is computed from the bytes this site
// republishes -- cannot be proven without one. They are answered by
// test/serve-origin.mjs on 127.0.0.1, started by the runners, so the corpus
// under test is committed in this repository and nothing outside it can change
// what a build fetches.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  moduleRoot,
  read,
  exists,
  minimalDir,
  multilingualDir,
  nobuildtimeDir,
  edgeDir,
  publicDir,
  publishedPath,
  buildLog,
  originRequestedPaths,
  sha256File,
  strictskillsDir,
  warnCount,
} from './helpers.js';

const INDEX = '.well-known/agent-skills/index.json';
const index = (dir = publicDir) => JSON.parse(read(INDEX, dir));

// The entries that must publish, in configuration order. An entry that starts
// or stops publishing changes this list, which is the point: the resolver's
// verdicts are the contract.
const PUBLISHED = [
  ['fixture-single', 'skill-md'],
  ['fixture-multi', 'skill-md'],
  ['fixture-lonely', 'skill-md'],
  ['fixture-archive', 'archive'],
  ['fixture-archive-zip', 'archive'],
  ['fixture-desc', 'skill-md'],
  ['fixture-manyrefs', 'skill-md'],
  ['fixture-flaky', 'skill-md'],
  ['fixture-outside', 'skill-md'],
  ['fixture-outside-dotdot', 'skill-md'],
  ['fixture-outside-abs', 'skill-md'],
  ['fixture-prefix', 'skill-md'],
  ['fixture-selfref', 'skill-md'],
  ['fixture-unverifiable', 'skill-md'],
  ['fixture-cdn-archive', 'archive'],
  ['fixture-archive-dot', 'archive'],
  ['fixture-archive-unclear', 'archive'],
];

// Every configured entry that must be refused, with the warning that must name
// it. One line each: a second line would mean the deduplicating funnel in
// lib/warn.html stopped working, and zero would mean the refusal went silent.
const REFUSED = [
  ['fixture-mismatch', /Omitting the agent skill "fixture-mismatch".*name: some-other-name/],
  ['fixture-plain', /Omitting the agent skill "fixture-plain".*no YAML front matter/],
  ['fixture-toml', /Omitting the agent skill "fixture-toml".*front matter is TOML/],
  ['fixture-broken', /Omitting the agent skill "fixture-broken".*not valid YAML/],
  ['fixture-nested-zip', /Omitting the agent skill "fixture-nested-zip".*no SKILL\.md at its root/],
  // The three not-an-archive shapes share one refusal and are told apart ONLY
  // by the sentence naming what the bytes are instead, so each pattern reaches
  // past the shared prefix to its own sentence. Matching the prefix alone left
  // the whole sniffer free to collapse into a single branch.
  [
    'fixture-empty-zip',
    /Omitting the agent skill "fixture-empty-zip".*an archive with no members at all/,
  ],
  [
    'fixture-spanned-zip',
    /Omitting the agent skill "fixture-spanned-zip".*one volume of a split archive rather than a complete one/,
  ],
  ['fixture-encoded', /Omitting the agent skill "fixture-encoded".*neither the gzip signature/],
  [
    'fixture-markdown-as-archive',
    /Omitting the agent skill "fixture-markdown-as-archive".*looks like the SKILL\.md itself; drop the type key/,
  ],
  [
    'fixture-archive-as-skill',
    /Omitting the agent skill "fixture-archive-as-skill".*are a gzip archive/,
  ],
  ['fixture-repo-archive', /Omitting the agent skill "fixture-repo-archive".*WHOLE REPOSITORY/],
  ['fixture-bad-type', /Skipping the agent skill "fixture-bad-type".*two distribution types/],
  ['unreachable-skill', /Omitting the agent skill "unreachable-skill".*returned no resource/],
  ['Invalid--Name', /Skipping the agent skill "Invalid--Name".*lowercase alphanumerics/],
  [
    'fixture-malformed-url',
    /Omitting the agent skill "fixture-malformed-url" from the index: fetching/,
  ],
  [
    'fixture-weird-archive',
    /Omitting the agent skill "fixture-weird-archive" from the index: fetching/,
  ],
  [
    'fixture-weird-skill',
    /Omitting the agent skill "fixture-weird-skill" from the index: fetching/,
  ],
];

test('with no skills declared, NO file is emitted at all', () => {
  // The module's own stated reason for the
  // gate: an empty JSON shell published at a .well-known path is a claim of a
  // capability that does not exist, which is worse than no file. Zero
  // configured skills is also the DEFAULT state for every consumer who
  // imports the module without writing [[params.agent.skills]], so this is
  // the commonest case, not an edge one.
  //
  // The gate is a single template construct. Without this assertion, deleting
  // it would ship the empty shell with the whole suite still green.
  assert.ok(
    !exists(INDEX, minimalDir),
    'a build declaring no skills must publish no index.json whatsoever',
  );
  assert.ok(
    !exists('.well-known/agent-skills', minimalDir),
    'and no .well-known/agent-skills directory either',
  );
});

test('the index is published at the nested well-known path', () => {
  assert.ok(
    exists(INDEX),
    'no index.json was published. Every source is served by test/serve-origin.mjs, so this means the origin was not running for the builds rather than that a remote host was unreachable.',
  );
});

test('the index parses and declares its schema', () => {
  const doc = index();
  assert.equal(doc.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  assert.ok(Array.isArray(doc.skills));
  assert.ok(doc.skills.length > 0);
});

// The metadata block is a fixed size no matter how many skills the index
// carries, so this budget holds for a site publishing fifty of them exactly
// as it does for the fixture's seventeen. It is generous enough for a longer
// configured `$schema` URI, which is the only member here that can grow.
const HEAD_BUDGET = 300;

test('the index describes itself BEFORE it delivers itself', () => {
  // Everything that DESCRIBES the document precedes the thing that IS it, so
  // a reader sampling this file from the front -- a curl piped to head, a
  // truncated preview, a streaming parser, an agent working to a context
  // budget -- learns the format identifier and the build time without
  // reading the skill list.
  //
  // What this asserts is the PUBLISHED order, which is the only thing a
  // reader can observe, and it is deliberately not a proof of the mechanism
  // that produces it: the template emits its members one at a time and
  // appends the payload after the conditional stamp, but a single jsonify of
  // a Go map would produce these same bytes TODAY, because `$` sorts ahead
  // of letters and no key yet sorts after `skills`. That equivalence is
  // precisely the hazard -- a later key named `updated`, `version` or
  // `warnings` reorders a map-serialized document and nothing says so. This
  // assertion is what says so.
  const raw = read(INDEX);
  assert.deepEqual(Object.keys(JSON.parse(raw)), ['$schema', 'generated', 'skills']);

  const payloadAt = raw.indexOf('"skills":');
  assert.ok(payloadAt > 0, 'the payload member must be present');
  assert.ok(
    payloadAt < HEAD_BUDGET,
    `the metadata block must fit in ${HEAD_BUDGET} bytes, found the payload at ${payloadAt}`,
  );
  for (const key of ['$schema', 'generated']) {
    const at = raw.indexOf(`"${key}":`);
    assert.ok(at > 0, `"${key}" must be present`);
    assert.ok(at < payloadAt, `"${key}" must precede the payload`);
  }
  assert.ok(raw.trimEnd().endsWith('}'), 'the document must close on the skills array');
});

test('withholding the stamp drops a member without moving the payload', () => {
  // The stamp is conditional, so the member list has two shapes and the
  // payload has to be last in both. A build with `skills_index.build_time =
  // false` is the shape a map-serialized envelope would also get right by
  // accident, and the shape an emission that appended the payload beside its
  // siblings could get wrong.
  const doc = JSON.parse(read(INDEX, nobuildtimeDir));
  assert.deepEqual(Object.keys(doc), ['$schema', 'skills']);
  assert.ok(Array.isArray(doc.skills));
  assert.ok(doc.skills.length > 0, 'the switch must withhold the stamp, not the index');
});

test('the index dates itself at the top level, beside the per-skill digests', () => {
  // A digest answers "is this different"; it cannot answer "which one is
  // NEWER", and a client holding a cached index needs the direction to know
  // whether ITS copy is the stale one. That gap is sharpest on this surface:
  // a stale index points an agent at a skill body it believes is current, and
  // the digest beside it VERIFIES against the old bytes the client also
  // cached, so index and body stay self-consistent and both are wrong.
  //
  // Top level, not per skill: the document is published as a unit and its
  // entries never come from different builds, so a field per entry would be N
  // copies of one fact. The value's IDENTITY with every other surface of the
  // build is asserted in 11-build-stamp.spec.js, which is where the stamp's
  // one-value-per-build contract lives; here it is the shape and the place.
  const doc = index();
  assert.match(
    doc.generated,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/,
    'RFC 3339 with an offset, the same form every other stamped surface carries',
  );
  for (const entry of doc.skills) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(entry, 'generated'),
      `${entry.name}: the stamp belongs to the document, not to each entry`,
    );
  }
});

test('every entry url resolves to a published file', () => {
  for (const entry of index().skills) {
    assert.ok(
      exists(entry.url.replace(/^\//, '')),
      `${entry.name}: ${entry.url} is advertised but not published`,
    );
  }
});

test('every digest equals the SHA-256 of the bytes actually published', () => {
  // THE contract, and it now spans both distribution types. The discovery
  // convention defines the digest as the SHA-256 of the artifact's raw bytes
  // -- "the SKILL.md file's raw bytes" for one type, "the archive file's raw
  // bytes" for the other -- and the module computes it from the republished
  // copy rather than from an upstream snapshot, so the advertised hash and
  // the served bytes cannot disagree. An entry whose digest does not match
  // fails closed for any agent that verifies it, which is strictly worse than
  // publishing nothing.
  for (const entry of index().skills) {
    assert.match(entry.digest, /^sha256:[0-9a-f]{64}$/, 'digest is 64 lowercase hex, prefixed');
    const actual = sha256File(publishedPath(entry.url, publicDir));
    assert.equal(
      actual,
      entry.digest.slice('sha256:'.length),
      `${entry.name}: the published bytes do not match the advertised digest`,
    );
  }
});

test('each entry carries the declared shape', () => {
  for (const entry of index().skills) {
    assert.match(entry.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(entry.name.length <= 64);
    assert.ok(
      ['skill-md', 'archive'].includes(entry.type),
      `${entry.name}: type must be one of the convention's two values, found ${entry.type}`,
    );
    assert.ok(entry.description.length > 0 && entry.description.length <= 1024);
  }
});

test('the index publishes exactly the entries that survived every gate', () => {
  assert.deepEqual(
    index().skills.map((s) => [s.name, s.type]),
    PUBLISHED,
    'the published set and each entry type, in configuration order',
  );
});

test('both distribution types are reachable, and the type is not a constant', () => {
  // The defect this whole change removes: `type` was hardcoded to "skill-md",
  // so an archive could not be published at all and the field described the
  // template rather than the artifact. An assertion that only checked the
  // skill-md entries would pass against that defect too.
  const types = new Set(index().skills.map((s) => s.type));
  assert.deepEqual([...types].sort(), ['archive', 'skill-md']);
});

test('an archive is published under the extension its BYTES call for', () => {
  // resources.Copy keeps the source resource's media type whatever the target
  // is named, so the published extension is chosen from the magic number and
  // from nothing else. Both signatures are exercised, and each published file
  // is checked to really begin with the signature its name promises.
  const byName = Object.fromEntries(index().skills.map((s) => [s.name, s]));

  const gz = byName['fixture-archive'];
  assert.equal(gz.url, '/.well-known/agent-skills/fixture-archive.tar.gz');
  const gzBytes = readFileSync(publishedPath(gz.url, publicDir));
  assert.deepEqual([...gzBytes.subarray(0, 2)], [0x1f, 0x8b], 'a .tar.gz must be a gzip stream');

  const zip = byName['fixture-archive-zip'];
  assert.equal(zip.url, '/.well-known/agent-skills/fixture-archive-zip.zip');
  const zipBytes = readFileSync(publishedPath(zip.url, publicDir));
  assert.deepEqual(
    [...zipBytes.subarray(0, 4)],
    [0x50, 0x4b, 0x03, 0x04],
    'a .zip must be a zip archive',
  );

  // The archive is republished BYTE FOR BYTE, which is what makes the digest
  // meaningful: the file the origin serves and the file this site serves are
  // the same file.
  assert.deepEqual(
    gzBytes,
    readFileSync(resolve(moduleRoot, 'test/fixture-origin/archives/rooted.tar.gz')),
    'the republished archive must be the fetched archive, unchanged',
  );
});

test('a zip is judged rooted, nested or unclear, and only nested is refused', () => {
  // The rootedness test is COUNTING, not parsing, and the three fixtures pin
  // each state it can reach. `rooted-dot.zip` stores its root members with a
  // `./` prefix, which some zip writers do and which a naive
  // separator-preceded count reads as nested -- a false refusal.
  // `unclear.zip` is genuinely wrapper-nested but carries one extra
  // unseparated occurrence of the name inside an uncompressed member's text,
  // which counting cannot tell from a root member; it publishes, and says so,
  // because refusing on an ambiguous count would delete correct archives.
  // `nested.zip` reaches neither and is refused.
  const published = index().skills.map((s) => s.name);
  assert.ok(published.includes('fixture-archive-dot'), 'a ./-prefixed root member is at the root');
  assert.equal(warnCount(/fixture-archive-dot/), 0, 'and is unremarkable');

  assert.ok(published.includes('fixture-archive-unclear'), 'an ambiguous count still publishes');
  assert.equal(
    warnCount(
      /Publishing the agent skill "fixture-archive-unclear", but its zip does not look like/,
    ),
    1,
    'with the ambiguity named',
  );

  assert.ok(!published.includes('fixture-nested-zip'), 'a wrapper-nested zip is refused');
});

test('a refusal names which shape the bytes are, or names nothing at all', () => {
  // Four byte shapes reach ONE refusal -- "neither the gzip signature nor the
  // zip one" -- so the only thing telling a consumer what to do about it is the
  // sentence naming what arrived instead. Three of the four have one: a zip
  // whose first record is its end-of-central-directory, one volume of a split
  // archive, and a body opening with a front-matter fence. The fourth, a tar
  // that lost its gzip wrapper in transit, is none of those and must carry no
  // sentence at all -- which is what proves the naming is conditional rather
  // than a suffix every refusal wears.
  const NAMED = {
    'fixture-empty-zip': 'an archive with no members at all',
    'fixture-spanned-zip': 'one volume of a split archive rather than a complete one',
    'fixture-markdown-as-archive': 'looks like the SKILL.md itself',
  };
  const blocks = buildLog().split(/^WARN\s+/m);
  const warningFor = (name) => {
    const own = blocks.filter((block) => block.includes(`"${name}"`));
    assert.equal(own.length, 1, `${name}: exactly one warning must name the entry`);
    return own[0];
  };

  for (const [name, sentence] of Object.entries(NAMED)) {
    const warning = warningFor(name);
    assert.ok(warning.includes(sentence), `${name}: its own sentence must be in its own warning`);
    for (const [other, otherSentence] of Object.entries(NAMED)) {
      if (other === name) continue;
      assert.ok(!warning.includes(otherSentence), `${name}: and no other shape's sentence`);
    }
  }

  const encoded = warningFor('fixture-encoded');
  for (const sentence of Object.values(NAMED)) {
    assert.ok(
      !encoded.includes(sentence),
      'bytes that are none of the three named shapes must be named as none of them',
    );
  }
});

test('a skill-md entry with no description takes the one from its own front matter', () => {
  // The convention says the index description SHOULD match the SKILL.md front
  // matter, and `fixture-single` declares no description in configuration at
  // all, so the published value can only have come from the fetched file.
  const entry = index().skills.find((s) => s.name === 'fixture-single');
  assert.match(entry.description, /^A single-file fixture skill, used to prove the fetch/);
  assert.ok(entry.description.length <= 1024);
});

test('a description that disagrees with the skill is published, and warned about', () => {
  // A SHOULD, not a MUST: the entry still publishes, because refusing it would
  // withhold a working skill over wording. The warning names both values so
  // the consumer can see which one to change.
  const entry = index().skills.find((s) => s.name === 'fixture-desc');
  assert.equal(entry.description, 'A paraphrase of the description this skill actually declares.');
  assert.equal(warnCount(/agent skill "fixture-desc" advertises a description that differs/), 1);

  // And it is the ONLY entry that draws this warning. Two others used to, by
  // accident -- their configured descriptions were shortened copies of their
  // own front matter -- which meant an assertion demanding one warning for an
  // entry had to know which unrelated warning that entry also happened to
  // emit. Keeping the paraphrase deliberate and unique is what lets every
  // other per-entry warning count be that entry's own contract.
  assert.equal(
    warnCount(/advertises a description that differs/),
    1,
    'a fixture entry whose description merely drifts from its own SKILL.md is noise, not a case',
  );
});

test('a PROVEN multi-file skill is warned about and still published', () => {
  // The detector nominates names out of the body; the probe decides. Here the
  // body links references/GUIDE.md and the origin really answers for it, so
  // the skill is multi-file as a matter of fact rather than of guesswork.
  //
  // It is published anyway by default. The index emits NOTHING when no entry
  // survives, so an omission on this path can delete the whole discovery
  // surface -- and the detector, which can only ever see the names a body
  // happens to mention, must not be able to do that. The consumer who wants
  // the stricter reading opts into it; the next test is that build.
  assert.equal(warnCount(/agent skill "fixture-multi" is a MULTI-FILE skill/), 1);
  assert.match(
    read('.well-known/agent-skills/index.json'),
    /"fixture-multi"/,
    'the default disposition publishes it',
  );
  assert.ok(exists('.well-known/agent-skills/fixture-multi/SKILL.md'));
});

test("on_supporting_files = 'omit' refuses that skill, and only that skill", () => {
  // The opt-in strictness, and the guard that it stays scoped: every other
  // published entry must be identical to the default build, because the key
  // governs proven supporting files and nothing else.
  const strict = index(strictskillsDir).skills.map((s) => s.name);
  assert.ok(!strict.includes('fixture-multi'), 'the proven multi-file skill is refused');
  assert.ok(
    !exists('.well-known/agent-skills/fixture-multi/SKILL.md', strictskillsDir),
    'and its body is not republished either',
  );
  assert.deepEqual(
    strict,
    PUBLISHED.map(([name]) => name).filter((name) => name !== 'fixture-multi'),
    'nothing else moves',
  );
  assert.equal(
    warnCount(/agent skill "fixture-multi" is a MULTI-FILE skill.*Omitting it/s, 'strictskills'),
    1,
  );
});

test('a body naming a file that does not exist beside it says NOTHING', () => {
  // The other half of the detector's contract. `fixture-lonely` mentions a
  // capitalised file name in prose, the probe gets a 404, and the entry
  // publishes silently. Warning here would be the cheapest way to make every
  // supporting-file warning worth ignoring.
  assert.equal(warnCount(/fixture-lonely/), 0);
  assert.ok(index().skills.some((s) => s.name === 'fixture-lonely'));
});

test('the probe budget is reported when it runs out', () => {
  // Six candidates, a budget of four, and none of them exists. The entry
  // publishes, but the build says plainly that it stopped looking -- a cap
  // that truncates in silence reads exactly like a clean result.
  //
  // The COUNTS are part of the sentence and are asserted with it. The warning
  // interpolates how many probes were actually spent, so "4 of 6" is where the
  // budget's boundary is written down: widening the comparison that enforces
  // it publishes "5 of 6", and a regex stopping at the prefix would match
  // either. The same clause pins the reported number to the probes really
  // issued rather than to the candidate list, which would read "6 of 6" and
  // tell a consumer the build checked every reference when it stopped at four.
  assert.equal(
    warnCount(
      /agent skill "fixture-manyrefs" names more files than this build checks: 4 of 6 candidate references were probed/,
    ),
    1,
  );
  assert.ok(index().skills.some((s) => s.name === 'fixture-manyrefs'));
});

test('the probe budget stops after the fourth request, not the fifth', () => {
  // The warning above says the budget ran out and, with the counts, where.
  // What it cannot say is whether the fifth request was made: a build that
  // probed five candidates and reported four would print the same line, and so
  // would one that reported honestly. The count is what the module CLAIMS; the
  // origin's record is what it DID, and the two are separate observations of
  // one boundary.
  //
  // The candidate ORDER is the body's own -- lib/skill-references.html
  // preserves it -- so ALPHA through DELTA are the four the budget buys.
  const requested = originRequestedPaths();
  for (const name of ['ALPHA', 'BETA', 'GAMMA', 'DELTA']) {
    assert.ok(
      requested.has(`/fixture-manyrefs/${name}.md`),
      `${name}.md is within the budget and must have been probed`,
    );
  }
  for (const name of ['EPSILON', 'ZETA']) {
    assert.ok(
      !requested.has(`/fixture-manyrefs/${name}.md`),
      `${name}.md lies past the budget of four, so no build may have requested it`,
    );
  }
});

test('a probe answered with an error reads as "cannot tell", never as "absent"', () => {
  // The origin returns 500 for this skill's one candidate. Collapsing that
  // into "the sibling is not there" would make a rate-limited origin report
  // every multi-file skill as single-file, which is precisely the silent
  // wrongness this machinery exists to remove.
  assert.equal(warnCount(/Could not determine whether the agent skill "fixture-flaky"/), 1);
  assert.ok(index().skills.some((s) => s.name === 'fixture-flaky'));
});

test('references climbing out of the skill directory are reported, not probed', () => {
  // `..` and a leading slash both leave the directory. Neither can be carried
  // in an archive -- the convention forbids traversal sequences and absolute
  // paths outright -- and probing them would ask the origin about somebody
  // else's document.
  //
  // One warning names BOTH candidates, joined, which is what this fixture is
  // for: it proves the report is one line per entry rather than one per
  // reference. It cannot prove which guard caught which -- either guard alone
  // produces this same single warning -- so the two entries in the next test
  // carry one shape apiece.
  assert.equal(
    warnCount(
      /agent skill "fixture-outside" references \.\.\/ESCAPE\.md and \/abs\/ROOT\.md from outside its own directory/,
    ),
    1,
  );
  assert.equal(
    warnCount(/agent skill "fixture-outside"/),
    1,
    'and it is the only thing said about the entry, so the assertion above needs no allowance',
  );
  assert.ok(index().skills.some((s) => s.name === 'fixture-outside'));
});

test('each half of the outside-reference guard is proven on its own', () => {
  // Two entries carrying one escape shape each, because the combined fixture
  // cannot distinguish them: it emits one warning naming both candidates, and
  // deleting either guard leaves that warning naming the other, still exactly
  // once.
  //
  // The leading-slash half is the one worth stating plainly, because deleting
  // it does NOT leave its candidate unguarded -- path.Join folds an absolute
  // second argument under the first, so `/abs/ROOT.md` becomes
  // `/fixture-outside-abs/abs/ROOT.md`, passes the traversal check, and is
  // probed as a file inside the skill. The failure is not a missing warning
  // alone; it is a request for a document the skill never referenced, which
  // the next test reads from the origin's own log.
  const published = index().skills.map((s) => s.name);
  for (const [name, candidate] of [
    ['fixture-outside-dotdot', String.raw`\.\.\/ESCAPE\.md`],
    ['fixture-outside-abs', String.raw`\/abs\/ROOT\.md`],
  ]) {
    assert.equal(
      warnCount(
        new RegExp(`agent skill "${name}" references ${candidate} from outside its own directory`),
      ),
      1,
      `${name}: its own escape must be named on its own line`,
    );
    assert.equal(
      warnCount(new RegExp(`agent skill "${name}"`)),
      1,
      `${name}: and nothing else may be said about it`,
    );
    assert.ok(published.includes(name), `${name}: an outside reference reports, never refuses`);
  }
});

test('a reference outside the skill directory is never requested from the origin', () => {
  // The other half of "reported, not probed", and the half no published tree
  // can show: a guard that refuses to probe leaves its evidence in a request
  // that was never issued. The origin records every request of the run, so the
  // absence is readable.
  //
  // The two loops below are not one list split for readability: the escape
  // shapes fail in two DIFFERENT places, because path.Join folds an absolute
  // second argument under the first rather than resetting to root. A `..`
  // candidate can leave the origin's skill directories entirely; an absolute
  // one never can, and lands inside the skill's own directory instead. So
  // `/abs/ROOT.md` is not listed here -- no reachable state of the resolver
  // requests it, and asserting its absence would assert nothing.
  const requested = originRequestedPaths();
  for (const path of ['/ESCAPE.md', '/fixture-prefix-sibling/HELPER.md']) {
    assert.ok(
      !requested.has(path),
      `${path} was requested, so a reference that leaves the skill directory was probed after all`,
    );
  }

  // The absolute shape's own failure: nothing under any of these skills' own
  // directories beyond the SKILL.md the resolver fetches by configuration.
  // This is what a dropped leading-slash guard produces -- `/abs/ROOT.md`
  // folded to `/fixture-outside-abs/abs/ROOT.md`, a document the skill never
  // named, requested as though it sat beside it.
  for (const name of [
    'fixture-outside',
    'fixture-outside-dotdot',
    'fixture-outside-abs',
    'fixture-prefix',
  ]) {
    assert.deepEqual(
      [...requested].filter((p) => p.startsWith(`/${name}/`)).sort(),
      [`/${name}/SKILL.md`],
      `${name}: the entry's own SKILL.md is the only thing its directory was asked for`,
    );
  }
});

test("a sibling directory whose name extends the skill's own is outside it", () => {
  // The boundary of the traversal guard itself, which neither escape shape
  // reaches. The guard asks whether the resolved path starts with the skill's
  // directory FOLLOWED BY A SEPARATOR, and every other candidate in this
  // corpus is either plainly inside its directory or lands at the origin root,
  // so dropping that separator decides nothing anywhere else and the suite
  // stays green without it.
  //
  // Here it decides everything: `/fixture-prefix-sibling/HELPER.md` starts
  // with `/fixture-prefix` and does not start with `/fixture-prefix/`. And the
  // failure is not a missing report but a wrong publication -- that file
  // really exists, so the probe succeeds and the skill is declared multi-file
  // on the strength of a document belonging to a different skill, which under
  // on_supporting_files = 'omit' deletes the entry outright. The request-log
  // assertion above is the other half of this one.
  assert.equal(
    warnCount(
      /agent skill "fixture-prefix" references \.\.\/fixture-prefix-sibling\/HELPER\.md from outside its own directory/,
    ),
    1,
  );
  assert.equal(
    warnCount(/agent skill "fixture-prefix"/),
    1,
    'and nothing else is said about it -- a MULTI-FILE line here would be the wrong verdict',
  );
  assert.ok(
    index().skills.some((s) => s.name === 'fixture-prefix'),
    'an outside reference reports, never refuses',
  );
  assert.ok(
    index(strictskillsDir).skills.some((s) => s.name === 'fixture-prefix'),
    'including under the strict disposition, which a wrong multi-file verdict would delete it from',
  );
});

test('a source URL that does not parse is refused, and the build survives', () => {
  // The build completing at all is half of this assertion: an unguarded
  // urls.Parse on `http://127.0.0.1:port/...` -- which passes the
  // absolute-http(s) test the module applies before it -- aborts the whole
  // site render, in a module whose stated contract is that it never fails a
  // build over its own configuration.
  assert.ok(!index().skills.some((s) => s.name === 'fixture-malformed-url'));
  assert.equal(warnCount(/agent skill "fixture-malformed-url" from the index: fetching/), 1);
});

test('an ordinary CDN path containing an archive segment is fetched, not refused', () => {
  // The forge refusal is anchored to a host because `/<a>/<b>/archive/<file>`
  // is an ordinary three-segment path that any CDN or object store can serve.
  // A path-only pattern refused this entry BEFORE the fetch, deleting a valid
  // skill on the shape of somebody else's URL.
  const entry = index().skills.find((s) => s.name === 'fixture-cdn-archive');
  assert.ok(entry, 'the entry must publish');
  assert.equal(entry.url, '/.well-known/agent-skills/fixture-cdn-archive.zip');
  assert.equal(warnCount(/fixture-cdn-archive/), 0, 'and say nothing about it');

  // The origin serves this from a byte-identical copy of the rooted zip, so
  // the copy cannot drift from its original unnoticed.
  assert.deepEqual(
    readFileSync(resolve(moduleRoot, 'test/fixture-origin/cdn/skills/archive/skill.zip')),
    readFileSync(resolve(moduleRoot, 'test/fixture-origin/archives/rooted.zip')),
  );
});

test('a body that links back to itself is not a multi-file skill', () => {
  // `./SKILL.md` resolves to the artifact just fetched, so the probe always
  // succeeds. Counting that as a supporting file declares the skill
  // multi-file on evidence about nothing -- and deletes it outright under
  // on_supporting_files = 'omit'.
  assert.ok(index().skills.some((s) => s.name === 'fixture-selfref'));
  assert.equal(warnCount(/fixture-selfref/), 0);
  assert.ok(
    index(strictskillsDir).skills.some((s) => s.name === 'fixture-selfref'),
    'including under the strict disposition',
  );
});

test('a source shape that blocks the sibling check says so, and still publishes', () => {
  // A query string means a sibling would be requested without it, so nothing
  // is requested at all. This skill's references/GUIDE.md really exists at the
  // origin, so silence here would be a build reporting a clean result it never
  // earned -- the same wrongness as reading a 500 as "absent".
  assert.equal(warnCount(/Could not check whether the agent skill "fixture-unverifiable"/), 1);
  assert.ok(index().skills.some((s) => s.name === 'fixture-unverifiable'));
  assert.ok(
    index(strictskillsDir).skills.some((s) => s.name === 'fixture-unverifiable'),
    '"could not check" is not evidence against an entry, so the strict disposition publishes it too',
  );
});

test('a failed fetch prints the remedy that fits the entry type', () => {
  // Hugo raises ONE message for two different consumer problems: an archive
  // whose media type the site never allowed, and a source URL Hugo can read no
  // media type from. Printing the archive security block for a Markdown source
  // sends the consumer to a setting that would not have helped.
  // Split into WARNING BLOCKS rather than lines: a hint is several lines of
  // configuration to paste, so a line-wise search finds the first line of the
  // warning and none of the remedy under it.
  const blocks = buildLog().split(/^WARN\s+/m);
  const archiveWarning = blocks.find((block) =>
    block.includes('"fixture-weird-archive" from the index'),
  );
  const skillWarning = blocks.find((block) =>
    block.includes('"fixture-weird-skill" from the index'),
  );

  assert.ok(archiveWarning && skillWarning, 'both entries must have failed their fetch');
  assert.match(archiveWarning, /\[security\.http\]/);
  assert.match(archiveWarning, /application\/octet-stream/);
  assert.ok(
    !skillWarning.includes('[security.http]'),
    'a Markdown source failure must not prescribe the archive allow-list',
  );
  assert.match(skillWarning, /resolve no media type/);
});

test('every refused entry is refused, once, with a warning that names it', () => {
  const published = new Set(index().skills.map((s) => s.name));
  for (const [name, pattern] of REFUSED) {
    assert.ok(!published.has(name.toLowerCase()), `${name} must not appear in the index`);
    assert.equal(warnCount(pattern), 1, `${name}: exactly one warning must name it`);
  }
});

test('a refused entry publishes no artifact either', () => {
  for (const [name] of REFUSED) {
    assert.ok(
      !exists(`.well-known/agent-skills/${name}/SKILL.md`),
      `${name}: no SKILL.md may be republished for a refused entry`,
    );
    for (const ext of ['.tar.gz', '.zip']) {
      assert.ok(
        !exists(`.well-known/agent-skills/${name}${ext}`),
        `${name}: no archive may be republished for a refused entry`,
      );
    }
  }
});

// The duplicate-name refusal lives with the other configuration guards, in
// 05-guards.spec.js, rather than being asserted twice from two files that
// would be free to disagree about what it does.

test('a subpath baseURL keeps every artifact URL resolvable', () => {
  // The `url` field is resolved by clients against the index URL per RFC 3986,
  // and the module emits a path-absolute value. Under a baseURL carrying a
  // path, that value has to carry the path too, or it resolves to a document
  // on the wrong site -- and a root-baseURL build cannot tell the two apart.
  for (const entry of index(edgeDir).skills) {
    assert.ok(
      entry.url.startsWith('/docs/.well-known/agent-skills/'),
      `${entry.name}: ${entry.url} must carry the baseURL path`,
    );
    assert.ok(exists(entry.url.replace(/^\/docs\//, ''), edgeDir), `${entry.url} must exist`);
  }
});

test('the index is emitted ONCE across a two-language build, from the default language', () => {
  // The format sets root = true, which pins ONE path for every language, so a
  // second language rendering its own copy would overwrite the first and the
  // surviving file would describe the wrong language's site. The gate is a
  // single conjunct, `site.Language.IsDefault`; in a monolingual build it is
  // always true, so this assertion runs against the two-language build, where
  // deleting the conjunct actually changes the published bytes.
  assert.ok(exists(INDEX, multilingualDir), 'the default language publishes the index');

  // The load-bearing assertion. Because root = true, no language ever writes
  // to /ru/ -- every language targets this one path -- so an absence check
  // there would pass with or without the gate. What ungated rendering
  // actually produces is both languages writing THIS file, last writer
  // winning. The ru language therefore carries a marker schema value, and
  // the surviving file must not be wearing it.
  const doc = JSON.parse(read(INDEX, multilingualDir));
  assert.equal(
    doc.$schema,
    'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    'the surviving index was written by the DEFAULT language',
  );
  assert.ok(!read(INDEX, multilingualDir).includes('RU-WROTE-THIS'));

  // The ru site really does render this module's other surfaces, so the
  // absence above is the gate working rather than the language being inert.
  assert.ok(exists('ru/llms.txt', multilingualDir), 'the ru language is genuinely built');
  assert.ok(exists('ru/about.md', multilingualDir));
});
