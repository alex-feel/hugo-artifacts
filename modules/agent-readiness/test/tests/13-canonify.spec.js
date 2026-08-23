// The `edge` environment rebuilt with canonifyURLs on.
//
// With that setting Hugo rewrites root-relative URLs in HTML output into
// fully absolute ones after the templates have run, and to stop the rewrite
// from doubling the baseURL path it makes the whole Page family stop emitting
// the path in the first place. Measured at v0.164.0 under
// baseURL = https://example.org/docs/: a page's .RelPermalink comes back as
// "/" rather than "/docs/", and an output format's as "/llms.txt" rather than
// "/docs/llms.txt". A RESOURCE's .RelPermalink keeps the path, and .Permalink
// is untouched entirely.
//
// The rewrite runs on HTML output formats ONLY -- and this module publishes
// almost nothing else. llms.txt, llms-index.txt, every page's Markdown twin,
// the agent facts document, the Agent Skills index and robots.txt are plain
// text or JSON, so whatever the template wrote is what ships, unrepaired and
// unreported. Every URL in them is derived from .Permalink, from an output
// format's .Permalink or from absURL, so this build must publish the same
// bytes as its twin. That is the property asserted here; it is not a defect
// hunt.
//
// The comparison is whole-tree rather than a list of tags, because the list
// would need keeping in step with a module that publishes six document kinds
// and adds more. Only the build stamp is exempted, and only by normalizing
// it: the two builds run a second apart, and 11-build-stamp.spec.js is what
// holds the stamp itself to account.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {edgeDir, edgeCanonifyDir} from './helpers.js';

const BASE = 'https://example.org';
const BASE_PATH = '/docs';

// Everything the module publishes that Hugo's HTML post-processor never
// touches. The extensions are the module's own output formats plus the twins.
const UNREPAIRED = /\.(txt|md|json|xml)$/i;

function walk(dir) {
  const out = [];
  const visit = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  visit(dir);
  return out.sort();
}

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8').replace(/\r\n/g, '\n');

// The one value that legitimately differs: the two builds are a second apart
// and both stamp themselves. Normalized rather than skipped, so a file whose
// ONLY difference is the stamp still has the rest of its bytes compared.
const RFC3339 = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g;
const withoutStamp = (text) => text.replace(RFC3339, '<stamp>');

test('canonifyURLs is really on in this build, and off in its twin', () => {
  // The control, taken from the FIXTURE's own section listing rather than
  // from the module: those links are authored root-relative, so the setting
  // rewrites them and its absence leaves them alone. Without a value that
  // moves, every assertion below would pass just as well against two builds
  // where the setting had never been applied.
  const rel = 'blog/index.html';
  const link = /<a href="([^"]*blog\/post-one\/)"/;
  const off = link.exec(read(edgeDir, rel))?.[1];
  const on = link.exec(read(edgeCanonifyDir, rel))?.[1];
  assert.equal(off, `${BASE_PATH}/blog/post-one/`, 'the listing links to its members');
  assert.equal(on, `${BASE}${BASE_PATH}/blog/post-one/`, 'and canonifyURLs absolutizes that link');
});

test('both builds publish exactly the same set of files', () => {
  const off = walk(edgeDir);
  const on = walk(edgeCanonifyDir);
  assert.ok(off.length > 20, `the edge build published a tree: ${off.length} files`);
  assert.deepEqual(on, off, 'canonifyURLs must not add or remove a published document');
});

test('every document the post-processor never reaches is byte-identical', () => {
  // The assertion this build exists for. A URL that lost the baseURL path in
  // any of these files is published exactly as the template wrote it: no
  // rewrite, no warning, no failing build -- just an agent following a link
  // to a page that does not exist.
  let compared = 0;
  for (const rel of walk(edgeDir)) {
    if (!UNREPAIRED.test(rel)) continue;
    assert.equal(
      withoutStamp(read(edgeCanonifyDir, rel)),
      withoutStamp(read(edgeDir, rel)),
      `${rel}: this document must not depend on canonifyURLs`,
    );
    compared += 1;
  }
  // A positive control: a tree with no unrepaired document would make the
  // loop above pass having compared nothing at all.
  assert.ok(compared > 10, `unrepaired documents were compared: ${compared}`);
});

test('and every URL in them still carries the baseURL path', () => {
  // Equality with the other build would also hold if BOTH lost the path, so
  // the canonify build is checked against the baseURL on its own terms too.
  const bad = [];
  let scanned = 0;
  for (const rel of walk(edgeCanonifyDir)) {
    if (!UNREPAIRED.test(rel)) continue;
    const text = read(edgeCanonifyDir, rel);
    for (const match of text.matchAll(/https:\/\/example\.org(\/[^\s"'<>)\]]*)?/g)) {
      scanned += 1;
      const path = match[1] ?? '';
      if (!path.startsWith(`${BASE_PATH}/`) && path !== BASE_PATH) bad.push(`${rel}: ${match[0]}`);
      if (path.startsWith(`${BASE_PATH}${BASE_PATH}/`)) bad.push(`${rel}: doubled -- ${match[0]}`);
    }
  }
  assert.ok(scanned > 10, `absolute URLs were inspected: ${scanned}`);
  assert.deepEqual(bad, [], 'URLs that lost or repeated the baseURL path');
});
