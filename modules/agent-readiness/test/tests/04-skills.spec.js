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
