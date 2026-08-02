// The shipped data files.
//
// The runner executes THIS spec file on its own, BEFORE either fixture is
// built. That ordering is the point: a malformed data file otherwise surfaces
// as an opaque Hugo build failure at some unrelated template, and the reader
// has to work backwards to the registry. Run first, it is reported as itself.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from 'smol-toml';
import {moduleRoot} from './helpers.js';

const dataDir = join(moduleRoot, 'data', 'agent-readiness');
const loadToml = (name) => parse(readFileSync(join(dataDir, name), 'utf8'));

test('defaults.toml parses', () => {
  const d = loadToml('defaults.toml');
  assert.ok(d, 'defaults.toml must parse as TOML');
  assert.equal(typeof d.enable, 'boolean');
});

test('defaults.toml declares every table the cascade merges', () => {
  const d = loadToml('defaults.toml');
  for (const table of [
    'robots',
    'markdown',
    'llms',
    'facts',
    'skills_index',
    'frontmatter',
    'license',
  ]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(d, table),
      `defaults.toml must declare the ${table} table, or a consumer overriding one key inside it would have nothing to merge onto`,
    );
  }
});

test('defaults.toml ships a permissive robots policy', () => {
  // A Disallow shipped as a module default would deindex a consumer's site
  // on the build after they imported the module -- and a shipped Allow would
  // tie against a consumer-configured Disallow of equal path length, a tie
  // RFC 9309 resolves in favor of Allow, silently unblocking the crawler the
  // consumer blocked. Permissive therefore means EMPTY on all four directive
  // lists: a directive-free group is already fully permissive.
  const {robots} = loadToml('defaults.toml');
  assert.deepEqual(robots.allow, []);
  assert.deepEqual(robots.disallow, []);
  assert.deepEqual(robots.bots_allow, []);
  assert.deepEqual(robots.bots_disallow, []);
  assert.deepEqual(robots.bots, []);
  assert.equal(robots.content_signal, '');
});

test('every license switch and value ships inert', () => {
  const d = loadToml('defaults.toml');
  assert.equal(d.license.name, '');
  assert.equal(d.license.url, '');
  assert.equal(d.license.spdx, '');
  assert.equal(d.markdown.license, false);
  assert.equal(d.llms.license, false);
});

test('facts sections carry no limit key, by design', () => {
  // A truncated facts index answers the one-fetch question wrongly while
  // appearing to answer it, so the key must not exist to be set.
  const {facts} = loadToml('defaults.toml');
  assert.ok(!Object.prototype.hasOwnProperty.call(facts, 'limit'));
});

test('bots.toml parses and holds exactly 21 entries', () => {
  const bots = loadToml('bots.toml');
  assert.equal(Object.keys(bots).length, 21);
});

test('bots.toml carries no retired token', () => {
  // Claude-Web and anthropic-ai were retired by Anthropic: a rule naming
  // either matches nothing today and merely looks current.
  const bots = loadToml('bots.toml');
  const retired = Object.entries(bots).filter(([, v]) =>
    ['Claude-Web', 'anthropic-ai'].includes(v.token),
  );
  assert.deepEqual(retired, []);
});

test('every bots.toml entry carries a token and a vendor', () => {
  const bots = loadToml('bots.toml');
  for (const [key, value] of Object.entries(bots)) {
    assert.equal(typeof value.token, 'string', `${key} must carry a token`);
    assert.ok(value.token.length > 0, `${key}: token must be non-empty`);
    assert.equal(typeof value.vendor, 'string', `${key} must carry a vendor`);
    assert.match(key, /^[a-z0-9_]+$/, `${key}: registry keys are lowercase snake_case`);
  }
});

test('i18n ships the same twelve keys in every language', () => {
  const en = parse(readFileSync(join(moduleRoot, 'i18n', 'en.toml'), 'utf8'));
  const ru = parse(readFileSync(join(moduleRoot, 'i18n', 'ru.toml'), 'utf8'));
  const expected = [
    'agent_facts_contact_heading',
    'agent_facts_identity_heading',
    'agent_facts_title',
    'agent_llms_start_heading',
    'agent_section_pages_heading',
    'agent_sitemap_heading_llms',
    'agent_sitemap_heading_sitemap',
    'agent_skills_entry_name',
    'agent_skills_entry_note',
    'agent_surface_facts',
    'agent_surface_llms',
    'agent_surface_skills',
  ];
  assert.deepEqual(Object.keys(en).sort(), expected);
  assert.deepEqual(Object.keys(ru).sort(), expected);
  for (const key of expected) {
    assert.ok(ru[key].length > 0, `${key} must be translated, not empty`);
  }
});
