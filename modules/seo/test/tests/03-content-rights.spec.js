// The license property on the JSON-LD content nodes.
//
// `license` is a schema.org CreativeWork property. Attaching it to a Person,
// an Organization, a WebSite or a BreadcrumbList would assert that an entity
// or a navigational aid is licensed, which is meaningless, so the negative
// assertions here matter as much as the positive ones.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredDir, graph, nodesOfType, PAGES} from './helpers.js';

const ccByUrl = 'https://creativecommons.org/licenses/by/4.0/';
const neverLicensed = ['Person', 'Organization', 'WebSite', 'BreadcrumbList'];

test('unset config emits no license property anywhere in the graph', () => {
  for (const [name, rel] of Object.entries(PAGES)) {
    for (const node of graph(rel)) {
      assert.ok(
        !('license' in node),
        `${name}: ${node['@type']} must carry no license when content_license is unset`,
      );
    }
  }
});

test('configured: WebPage carries the license', () => {
  const nodes = nodesOfType(PAGES.page, 'WebPage', configuredDir);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].license, ccByUrl);
});

test('configured: CollectionPage carries the license', () => {
  const nodes = nodesOfType(PAGES.blogSection, 'CollectionPage', configuredDir);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].license, ccByUrl);
});

test('configured: BlogPosting carries the license', () => {
  const nodes = nodesOfType(PAGES.blogPost, 'BlogPosting', configuredDir);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].license, ccByUrl);
});

test('configured: entity and navigational nodes never carry a license', () => {
  for (const [name, rel] of Object.entries(PAGES)) {
    for (const node of graph(rel, configuredDir)) {
      if (neverLicensed.includes(node['@type'])) {
        assert.ok(
          !('license' in node),
          `${name}: a ${node['@type']} node must never carry a license property`,
        );
      }
    }
  }
});

test('configured: every emitted license value equals the configured URL', () => {
  let seen = 0;
  for (const rel of Object.values(PAGES)) {
    for (const node of graph(rel, configuredDir)) {
      if ('license' in node) {
        assert.equal(node.license, ccByUrl);
        seen += 1;
      }
    }
  }
  assert.ok(seen > 0, 'the configured build must emit at least one license property');
});
