/* global process */
// Serialization structure: what the authored strings look like once they are
// written into an HTML attribute and into a JSON-LD document.
//
// Two fixture pages carry the same punctuation set -- quotation marks, angle
// brackets, ampersands, an embedded newline, backslashes, non-ASCII and one
// long unbroken run -- through title, description, tags, categories,
// seo.keywords, seo.image, seo.image_alt and seo.video. One resolves to
// VideoObject, the other to the article class, so both node shapes are
// covered.
//
// The authored values are read back OUT of the fixture front matter rather
// than restated here, so each assertion is literally "the emitted value equals
// what the author wrote" and cannot drift into agreeing with a typo.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {configuredDir, dom, graph, graphDir, publicDir, rawHtml, PAGES} from './helpers.js';

const EDGE_VIDEO = 'serialization-edge/index.html';
const EDGE_ARTICLE = 'blog/serialization-edge/index.html';

const contentRoot = resolve(process.env.FIXTURE_CONTENT ?? 'fixture/content');

// A deliberately small front-matter reader: the two edge pages are written in
// exactly three scalar forms -- a JSON-compatible double-quoted string, a
// single-quoted string, and a literal block whose newlines and backslashes
// are its own -- plus inline single-quoted lists. Keys are read FIRST-WINS,
// so a nested key of the same name (seo.video.name) never overwrites the
// top-level value the page authored.
function frontMatter(file) {
  const text = readFileSync(join(contentRoot, file), 'utf8');
  const block = text.split(/^---\s*$/m)[1];
  assert.ok(block, `${file} must open with a front-matter block`);
  const values = {};
  const lines = block.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    const m = /^\s*([A-Za-z_]+):\s*(\S.*)$/.exec(line);
    if (!m) continue;
    const [, key, raw] = m;
    if (Object.hasOwn(values, key)) continue;
    if (raw === '|-' || raw === '|') {
      const body = [];
      for (const next of lines.slice(i + 1)) {
        if (!/^\s{2,}\S/.test(next)) break;
        body.push(next.replace(/^\s{2}/, ''));
      }
      values[key] = body.join('\n');
    } else if (raw.startsWith('[')) {
      values[key] = [...raw.matchAll(/'([^']*)'/g)].map((x) => x[1]);
    } else if (raw.startsWith('"')) {
      values[key] = JSON.parse(raw);
    } else if (raw.startsWith("'")) {
      values[key] = raw.slice(1, raw.lastIndexOf("'"));
    }
  }
  return values;
}

const videoAuthored = frontMatter('serialization-edge.md');
const articleAuthored = frontMatter('blog/serialization-edge.md');

const jsonldBlocks = (rel, dir) =>
  dom(rel, dir)
    .querySelectorAll('script[type="application/ld+json"]')
    .map((el) => el.rawText);

const allPages = [...Object.values(PAGES), EDGE_VIDEO, EDGE_ARTICLE];

// Both JSON-LD container shapes. The `graph` build publishes the same content
// through the other serialization site in seo/head-jsonld.html -- one block
// per page holding a @graph array instead of one block per node -- so the
// structural assertions below cover both branches rather than only the
// default one.
const jsonldDirs = [publicDir, configuredDir, graphDir];

test('the fixture front matter really carries the punctuation set', () => {
  // Guards the reader above: had it silently returned nothing, every
  // containment assertion below would compare "" with "" and pass.
  for (const authored of [videoAuthored, articleAuthored]) {
    assert.match(authored.title, /"/);
    assert.match(authored.title, /[<>&]/);
    assert.ok(authored.description.includes('\n'), 'the description spans two lines');
    assert.ok(authored.description.includes('\\'), 'and carries a backslash');
    assert.ok(authored.tags.length >= 3 && authored.tags.some((t) => t.includes('"')));
    assert.ok(authored.keywords.some((k) => k.includes('<')));
  }
  assert.match(videoAuthored.image, /"/);
  assert.match(videoAuthored.content_url, /"/);
});

test('the graph build really publishes its nodes under one @graph key', () => {
  // Guards the two structural scans below: were the graph environment missing
  // or its container param ignored, those scans would read a second copy of
  // the default shape and report success for a branch they never visited.
  for (const rel of [EDGE_VIDEO, EDGE_ARTICLE]) {
    const blocks = jsonldBlocks(rel, graphDir);
    assert.equal(blocks.length, 1, `${rel} publishes exactly one JSON-LD block in graph mode`);
    const doc = JSON.parse(blocks[0]);
    assert.equal(doc['@context'], 'https://schema.org');
    assert.ok(
      Array.isArray(doc['@graph']) && doc['@graph'].length > 1,
      'the @graph array is filled',
    );
    // Same node set as the default container, so the punctuation set below
    // travels through both shapes.
    assert.deepEqual(
      doc['@graph'].map((n) => n['@type']).sort(),
      graph(rel)
        .map((n) => n['@type'])
        .sort(),
    );
  }
});

test('every JSON-LD block on every page parses as one JSON document', () => {
  let parsed = 0;
  for (const dir of jsonldDirs) {
    for (const rel of allPages) {
      for (const [i, block] of jsonldBlocks(rel, dir).entries()) {
        assert.doesNotThrow(() => JSON.parse(block), `${rel} block ${i} must parse`);
        parsed += 1;
      }
    }
  }
  assert.ok(parsed > 0, 'the scan actually visited JSON-LD blocks');
});

test('no JSON-LD block carries a character that would end the script element', () => {
  // A "<" written raw inside a script element ends the JSON document at the
  // first "</" the authored text happens to contain; Hugo's JSON encoder
  // writes that character as a numeric escape instead, and this is the
  // assertion that the module never routes a value around that encoder, in
  // either container shape.
  for (const dir of jsonldDirs) {
    for (const rel of allPages) {
      for (const [i, block] of jsonldBlocks(rel, dir).entries()) {
        assert.ok(!block.includes('<'), `${rel} block ${i} must carry no raw "<"`);
        assert.ok(!block.includes('>'), `${rel} block ${i} must carry no raw ">"`);
      }
    }
  }
});

test('the JSON-LD values equal the authored strings', () => {
  const videoGraph = graph(EDGE_VIDEO);
  const video = videoGraph.find((n) => n['@type'] === 'VideoObject');
  assert.ok(video, 'the VideoObject node is emitted');
  // The node name is the resolved page title (see jsonld/videoobject.html),
  // so this is the same authored string arriving through a second surface.
  assert.equal(video.name, videoAuthored.title);
  assert.equal(video.description, videoAuthored.description);
  assert.equal(video.contentUrl, videoAuthored.content_url);
  // thumbnailUrl is emitted as a list, which schema.org allows.
  assert.deepEqual([video.thumbnailUrl].flat(), [videoAuthored.thumbnail_url]);

  const webpage = videoGraph.find((n) => n['@type'] === 'WebPage');
  assert.equal(webpage.name, videoAuthored.title);
  assert.equal(webpage.description, videoAuthored.description);

  const article = graph(EDGE_ARTICLE).find((n) => n['@type'] === 'BlogPosting');
  assert.ok(article, 'the article-class node is emitted');
  assert.equal(article.headline, articleAuthored.title);
  assert.equal(article.description, articleAuthored.description);
  assert.equal(article.articleSection, articleAuthored.categories[0]);
  // keywords resolves to the page tags, comma-joined (see jsonld/article.html),
  // so each authored tag has to arrive whole: a value that lost or gained a
  // character on the way through the join shows up here.
  assert.equal(article.keywords, articleAuthored.tags.join(', '));
});

test('the head attribute values decode back to the authored strings', () => {
  const head = dom(EDGE_VIDEO).querySelector('head');
  const content = (selector) => head.querySelector(selector).getAttribute('content');
  assert.equal(content('meta[property="og:title"]'), videoAuthored.title);
  assert.equal(content('meta[property="og:description"]'), videoAuthored.description);
  assert.equal(content('meta[name="description"]'), videoAuthored.description);
  assert.equal(content('meta[property="og:image"]'), videoAuthored.image);
  assert.equal(content('meta[property="og:image:alt"]'), videoAuthored.image_alt);
  assert.equal(content('meta[property="og:video:url"]'), videoAuthored.content_url);
  assert.equal(head.querySelector('title').textContent, videoAuthored.title);

  const articleHead = dom(EDGE_ARTICLE).querySelector('head');
  const tags = articleHead
    .querySelectorAll('meta[property="article:tag"]')
    .map((el) => el.getAttribute('content'));
  assert.deepEqual(tags, articleAuthored.tags);
  assert.equal(
    articleHead.querySelector('meta[property="article:section"]').getAttribute('content'),
    articleAuthored.categories[0],
  );
});

test('no emitted head tag closes an attribute value early', () => {
  // Attribute-level structure, checked on the RAW bytes rather than through
  // the parser: a quotation mark written raw inside a value ends that value,
  // and everything after it is read as further attributes -- which a lenient
  // parser then hands back looking almost right.
  let scanned = 0;
  for (const dir of [publicDir, configuredDir]) {
    for (const rel of allPages) {
      const head = /<head[^>]*>([\s\S]*?)<\/head>/.exec(rawHtml(rel, dir))[1];
      for (const tag of head.match(/<(?:meta|link|title)\b[^>]*>/g) ?? []) {
        // Strip every well-formed name="value" pair; a well-formed tag leaves
        // only its own name, attribute-less tokens and whitespace behind.
        const residue = tag.replaceAll(/\s[A-Za-z][\w:.-]*="[^"<>]*"/g, '');
        assert.ok(
          !residue.includes('"'),
          `${dir}/${rel}: ${tag.slice(0, 120)} carries an unbalanced quotation mark`,
        );
        assert.ok(
          !/[<>]/.test(residue.slice(1, -1)),
          `${dir}/${rel}: ${tag.slice(0, 120)} carries a raw angle bracket`,
        );
        scanned += 1;
      }
    }
  }
  assert.ok(scanned > 0, 'the scan actually visited head tags');
});
