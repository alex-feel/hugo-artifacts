// Scalar values written where the module's two table-valued config keys
// belong: boost and opensearch. Go's `with` treats false, 0 and "" as
// absent, and a truthy scalar falls through a map check with no diagnostic,
// so the resolver tests presence with `ne nil`, warns once per key, and
// keeps the shipped defaults. A static overlay build feeds these assertions
// because the served fixture configures both keys correctly, and the runner
// captures the build log so the warnings can be counted.
/* global process */
import {test, expect} from '@playwright/test';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const scalarDir = process.env.SCALAR_TABLES_DIR;

test('a scalar boost warns exactly once and keeps every shipped weight', async () => {
  expect(scalarDir, 'the runner must export SCALAR_TABLES_DIR').toBeTruthy();
  const log = readFileSync(scalarDir + '.log', 'utf8');
  const warnings = log.match(/Ignoring a search boost value/g) ?? [];
  expect(warnings).toHaveLength(1);

  // The shipped weights survive the ignored scalar: the surfaces still
  // deliver the default field weighting to the client.
  const html = readFileSync(join(scalarDir, 'index.html'), 'utf8');
  const attr = /data-search-options="([^"]*)"/.exec(html)?.[1];
  expect(attr).toBeTruthy();
  const options = JSON.parse(attr.replaceAll('&#34;', '"').replaceAll('&amp;', '&'));
  expect(options.boost).toEqual({
    title: 5,
    headings: 3,
    description: 2,
    keywords: 2,
    tags: 1.5,
    content: 1,
  });
});

test('a scalar opensearch warns exactly once and the document stays unpublished', async () => {
  expect(scalarDir, 'the runner must export SCALAR_TABLES_DIR').toBeTruthy();
  const log = readFileSync(scalarDir + '.log', 'utf8');
  const warnings = log.match(/Ignoring \[params\.search\] opensearch/g) ?? [];
  expect(warnings).toHaveLength(1);
  // The scalar spells "true", but the shipped default-off gate is retained:
  // `opensearch` stays in [outputs] home, so only the template's own gate
  // stops the file.
  expect(existsSync(join(scalarDir, 'opensearch.xml'))).toBe(false);
});
