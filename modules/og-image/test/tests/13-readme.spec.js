/* global process */
// Documentation locks, and the contract between what the module ships as data
// and what its templates actually read.
//
// A card is configured entirely from TOML: a key the README does not name is a
// key nobody can use, and a key the README names that no template reads is a
// key that silently does nothing. Both failures are invisible from inside the
// module, because a template ignores an option it does not know about without
// a word, and the pixels of a card configured with a misspelled key look
// exactly like the pixels of a card configured with no key at all.
//
// The key lists below are therefore asserted twice: against the template that
// reads each key, so the list cannot go stale as the module grows, and against
// the README, so the documentation cannot.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';

const moduleRoot = resolve(process.env.MODULE_ROOT ?? '..');
const read = (rel) => readFileSync(join(moduleRoot, rel), 'utf8');

const readme = read('README.md');
const defaults = read('data/og-image/defaults.toml');
const metrics = read('data/og-image/metrics.toml');
const partial = (rel) => read(join('layouts/_partials/og-image', rel));

// The shipped mechanical defaults: the key, the value data/og-image/defaults.toml
// states, and the way the README's parameter table has to state the same value
// in its Default column. The two are written separately because one of them
// ships as the empty string, which no substring search can look for -- a
// `readme.includes('')` is true of every document ever written, including one
// with the whole parameter reference deleted.
const SHIPPED_DEFAULTS = [
  ['enable', 'true', '`true`'],
  ['width', '1200', '`1200`'],
  ['height', '630', '`630`'],
  ['format', "'png'", '`png`'],
  ['quality', '75', '`75`'],
  ['anchor', "'Center'", '`Center`'],
  ['default_template', "''", '--'],
];

// The documentation sections the locks below are scoped to. A key or a token
// has to be named in the section that DOCUMENTS it, not merely to occur
// somewhere in forty kilobytes of English prose: `x`, `y`, `key`, `case`,
// `date` and `param` are all ordinary words, so an unscoped substring search
// is satisfied by the README being written in English at all, and stays green
// with the entire parameter reference deleted.
function section(heading) {
  const start = readme.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `the README has a "${heading}" section`);
  const rest = readme.slice(start + 1);
  const end = rest.indexOf('\n## ', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

// The Default cell of the parameter row that names a key, or undefined when no
// row names it.
function documentedDefault(text, key) {
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length > 4 && cells[1].includes(`\`${key}\``)) return cells[3];
  }
  return undefined;
}

const MODULE_KEYS = [
  'enable',
  'width',
  'height',
  'format',
  'quality',
  'anchor',
  'template',
  'default_template',
  'variant',
  'templates',
  'fonts',
  'sections',
  'kinds',
];

const SLOT_KEYS = [
  'source',
  'key',
  'value',
  'prefix',
  'suffix',
  'case',
  'font',
  'metrics',
  'size',
  'color',
  'x',
  'y',
  'align',
  'width',
  'max_lines',
  'ellipsis',
  'overflow',
  'min_scale',
  'shrink_step',
  'safety',
  'width_factor',
  'line_height',
];

const OVERLAY_KEYS = ['source', 'src', 'key', 'match', 'width', 'opacity', 'anchor', 'x', 'y'];

const SOURCE_TOKENS = [
  'title',
  'description',
  'section',
  'section_title',
  'kind',
  'site_title',
  'domain',
  'date',
  'param',
  'literal',
];

test('the shipped defaults file states exactly the mechanical values, and no design value', () => {
  for (const [key, value] of SHIPPED_DEFAULTS) {
    assert.match(
      defaults,
      new RegExp(`^${key} = ${value.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')}$`, 'm'),
      `data/og-image/defaults.toml sets ${key} = ${value}`,
    );
  }
  // A default color, size or position would be a design decision, and the
  // module ships none: a slot key the site did not set is left out of the
  // option dict entirely so Hugo's own default applies.
  for (const key of ['color', 'size', 'x', 'y', 'font', 'line_height']) {
    assert.ok(
      !new RegExp(`^${key} =`, 'm').test(defaults),
      `data/og-image/defaults.toml must not ship a ${key}`,
    );
  }
});

test('the shipped width table carries the keys the text engine reads out of it', () => {
  for (const key of ['em', 'space', 'fallback']) {
    assert.match(metrics, new RegExp(`^${key} = `, 'm'), `metrics.toml declares ${key}`);
    assert.ok(partial('text/metrics.html').includes(`"${key}"`), `metrics.html reads ${key}`);
  }
  assert.match(metrics, /^\[fonts\.default\]$/m, 'and ships exactly one named table');
  assert.match(metrics, /^\[\[fonts\.default\.classes\]\]$/m);
});

test('every option the module reads is read by the template that owns it', () => {
  // The list cannot drift ahead of the module: a key removed from a template
  // fails here before it fails in a consumer's silent no-op.
  const config = partial('config.html');
  for (const key of MODULE_KEYS) {
    assert.ok(new RegExp(`"${key}"`).test(config), `config.html reads ogcard.${key}`);
  }
  const slots = partial('resolve/slots.html') + partial('resolve/source.html');
  for (const key of SLOT_KEYS) {
    assert.ok(new RegExp(`"${key}"`).test(slots), `the slot resolver reads ${key}`);
  }
  const overlays = partial('resolve/overlays.html');
  for (const key of OVERLAY_KEYS) {
    assert.ok(new RegExp(`"${key}"`).test(overlays), `the overlay resolver reads ${key}`);
  }
  const source = partial('resolve/source.html');
  for (const token of SOURCE_TOKENS) {
    assert.ok(new RegExp(`"${token}"`).test(source), `the source vocabulary includes ${token}`);
  }
});

test('the README is the og-image README and documents the shape of a card', () => {
  // Without this the locks below would pass just as happily on an empty file.
  assert.match(readme, /^# og-image$/m);
  assert.match(readme, /^## Installation$/m);
  assert.match(readme, /^## Requirements$/m);
  assert.match(readme, /ogcard/, 'and names the configuration namespace');
});

test('the README names the Hugo version the module declares', () => {
  const declared = read('hugo.toml').match(/min = "([0-9.]+)"/);
  assert.ok(declared, 'hugo.toml declares a minimum version');
  assert.ok(
    readme.includes(declared[1]),
    `the README states the declared minimum Hugo version ${declared[1]}`,
  );
});

test('the README documents every shipped default with the value that ships', () => {
  // A documented default that disagrees with the data file is worse than no
  // documentation: a consumer reasons from it and never sees the difference
  // until a card comes out the wrong size. Read out of the parameter table's
  // Default column rather than searched for in the document, so a value that
  // moved rows -- or a row that vanished -- is a failure rather than a hit
  // somewhere else in the prose.
  const parameters = section('Parameters');
  for (const [key, shipped, documented] of SHIPPED_DEFAULTS) {
    assert.match(
      defaults,
      new RegExp(`^${key} = ${shipped.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')}$`, 'm'),
      `the data file still ships ${key} = ${shipped}`,
    );
    const cell = documentedDefault(parameters, key);
    assert.ok(cell !== undefined, `the parameter table has a row for ${key}`);
    assert.ok(
      cell.includes(documented),
      `the README states the shipped ${key} default as ${documented}, not ${JSON.stringify(cell)}`,
    );
  }
});

test('the README documents every option a consumer can set', () => {
  // Scoped to the Parameters section and wrapped in backticks, because that is
  // the section whose only job is to name every key: a key documented anywhere
  // else is a key a consumer looking at the reference cannot find.
  const parameters = section('Parameters');
  assert.ok(
    parameters.length > 2000,
    `the Parameters section is still a reference: ${parameters.length} bytes`,
  );
  const missing = [];
  for (const key of [...new Set([...MODULE_KEYS, ...SLOT_KEYS, ...OVERLAY_KEYS])]) {
    if (!parameters.includes(`\`${key}\``)) missing.push(key);
  }
  assert.deepEqual(missing, [], 'configuration keys the Parameters section does not name');
});

test('the README documents the whole text source vocabulary', () => {
  // A source token nobody documents is a feature nobody can reach, and the
  // module warns and drops the slot for anything outside the list.
  const sources = section('Text sources');
  assert.ok(
    sources.length > 800,
    `the Text sources section is still a table: ${sources.length} bytes`,
  );
  const missing = SOURCE_TOKENS.filter((token) => !sources.includes(`\`${token}\``));
  assert.deepEqual(missing, [], 'source tokens the Text sources section does not name');
});
