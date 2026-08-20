/* global process */
// The README is a consumer surface, and a key that exists in the shipped
// defaults but not in the README is a setting nobody can find. The expectation
// is DERIVED from the data file, so adding a key without documenting it is a
// red suite rather than a documentation gap somebody notices later.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const moduleRoot = resolve(process.env.MODULE_ROOT ?? '..');
const readme = () => readFileSync(join(moduleRoot, 'README.md'), 'utf8');
const defaults = () =>
  readFileSync(join(moduleRoot, 'data', 'url-retirement', 'defaults.toml'), 'utf8');

// Every assignment in the data file, ignoring its comment lines.
const shippedKeys = () =>
  defaults()
    .split(/\r?\n/)
    .filter((line) => /^\s*[a-z_]+\s*=/.test(line))
    .map((line) => line.trim().split('=')[0].trim());

test('the data file ships the keys this module is configured with', () => {
  assert.deepEqual(shippedKeys().sort(), [
    'enable',
    'enable',
    'enable',
    'exclude',
    'extra',
    'output_formats',
    'pagination_path',
    'rules',
    'status',
    'trailing_slash',
  ]);
});

test('every shipped key is documented in the README', () => {
  const body = readme();
  for (const key of new Set(shippedKeys()))
    assert.ok(body.includes(key), `${key} is shipped but absent from the README`);
});

// Three separate settings suppress three different stubs, and a consumer who
// sets two of them still publishes the third. A switch missing from the README
// is one nobody sets, and the rule that replaces its stub then never fires.
test('the README documents all three stub switches a consumer has to set', () => {
  const body = readme();
  assert.match(body, /disableAliases/);
  assert.match(body, /pagination/);
  assert.match(body, /disableDefaultSiteRedirect/);
});

test('the README states that the module cannot set them itself', () => {
  assert.match(readme(), /\[outputs\]/, 'the outputs wiring step is undocumented');
});
