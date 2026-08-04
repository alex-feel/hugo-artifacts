// The Agent Skills discovery index and its digest contract.
//
// NETWORK: these specs exercise a real build-time remote fetch, because the
// digest guarantee cannot be proven without one. A run with no network
// reaches the module's omit-and-warn path, and the first assertion below
// reports that as the cause rather than as a mysterious missing file.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  read,
  exists,
  minimalDir,
  multilingualDir,
  nobuildtimeDir,
  publicDir,
  publishedPath,
  sha256File,
  warnCount,
} from './helpers.js';

const INDEX = '.well-known/agent-skills/index.json';
const index = () => JSON.parse(read(INDEX));

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
    'no index.json was published. If this run had no network access, the module correctly omitted every skill and emitted no file; these specs require network.',
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
// as it does for the fixture's one. It is generous enough for a longer
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
  // THE contract. The digest is computed from the republished copy, not from
  // an upstream snapshot, so the advertised hash and the served bytes cannot
  // disagree. An entry whose digest does not match fails closed for any agent
  // that verifies it, which is strictly worse than publishing nothing.
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
    assert.equal(entry.type, 'skill-md');
    assert.ok(entry.description.length > 0 && entry.description.length <= 1024);
  }
});

test('a skill whose source 404s is omitted, with one warning', () => {
  // resources.GetRemote reports an HTTP 404 as an absent resource rather than
  // as a failure, so the nil branch is what must warn and omit.
  assert.equal(warnCount(/unreachable-skill/), 1);
  assert.ok(!index().skills.some((s) => s.name === 'unreachable-skill'));
  assert.ok(!exists('.well-known/agent-skills/unreachable-skill/SKILL.md'));
});

test('a skill with an invalid name is rejected before any fetch', () => {
  assert.equal(warnCount(/Invalid--Name/), 1);
  assert.ok(!index().skills.some((s) => s.name.toLowerCase().includes('invalid')));
  assert.ok(!exists('.well-known/agent-skills/Invalid--Name/SKILL.md'));
});

test('the index publishes only the skills that survived every gate', () => {
  const doc = index();
  assert.equal(doc.skills.length, 1, 'one of three configured skills is valid and reachable');
  assert.equal(doc.skills[0].name, 'fixture-skill');
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
