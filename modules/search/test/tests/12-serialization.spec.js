// Index serialization: the authored characters of a page's front matter, as
// they arrive in searchindex.json.
//
// A result label is a promise about the page it links to, so a field that
// loses characters between the front matter and the index makes the label
// describe a page that does not exist. The fields divide in two: `title`,
// `description` and `keywords` are AUTHORED STRINGS and must round-trip
// character for character, while `summary` is RENDERED MARKUP and legitimately
// arrives typographically normalized with its tags stripped, and taxonomy
// terms arrive as Hugo's own term titles.
//
// A static overlay build feeds these assertions rather than the served
// fixture: the overlay swaps in a one-page corpus whose vocabulary would
// otherwise perturb the query-count assertions the served fixture backs.
// Every value is read through JSON.parse, never by substring matching, so a
// field that merely CONTAINS the authored text cannot pass for one that
// equals it.
/* global process */
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const serializationDir = process.env.SERIALIZATION_DIR;

// The authored front matter of fixture/content-serialize/blog/serialize.md,
// repeated here as the independent expectation.
const AUTHORED = {
  title: 'Serialization probe: dquote " squote \' angle <b> amp & backslash \\ dash — ünïcödé',
  description: 'Line one "q" & <t>\nLine two after newline \\ back é',
  keywords: ['kw "one"', 'kw & <two>', 'kw\\three'],
};
const RUN = 'serializationrun'.repeat(200).slice(0, 3000);

function record() {
  expect(serializationDir, 'the runner must export SERIALIZATION_DIR').toBeTruthy();
  const envelope = JSON.parse(readFileSync(join(serializationDir, 'searchindex.json'), 'utf8'));
  expect(envelope.docCount).toBe(envelope.docs.length);
  const doc = envelope.docs.find((d) => d.href === '/blog/serialize/');
  expect(doc, 'the probe page must be indexed').toBeTruthy();
  return doc;
}

test('the authored title and description reach the index character for character', () => {
  const doc = record();

  // Both fields are front matter STRINGS, never rendered markup, so nothing
  // in them is a tag to strip: an angle-bracket run is text the author typed,
  // and a newline is a line the author broke.
  expect(doc.title).toBe(AUTHORED.title);
  expect(doc.description).toBe(AUTHORED.description);

  // Stated separately from the equality above, because these are exactly the
  // characters a tag-stripping pass deletes -- an equality failure alone
  // would not say WHICH characters went missing.
  expect(doc.title).toContain('<b>');
  expect(doc.description).toContain('<t>');
  expect(doc.description).toContain('\n');
});

test('quotes, ampersands, backslashes and non-ASCII survive in every stored field', () => {
  const doc = record();

  expect(doc.keywords).toEqual(AUTHORED.keywords);

  // The taxonomy arrays carry Hugo's own term titles (.LinkTitle), which is
  // why the expectation is title-cased rather than the authored casing; the
  // MARKUP-significant characters must still arrive intact.
  expect(doc.tags).toEqual(['Tag & Co', 'Tag <Two>']);
  expect(doc.categories).toEqual(['Cat "Quoted"']);

  // The summary is rendered markup: Hugo's typographer curls the straight
  // quotes, and the module strips tags from it by design. What must survive
  // is the ampersand, the backslash and the non-ASCII run.
  expect(doc.summary).toBe('Summary with “q”, amp & backslash \\ and ünïcödé');

  // Nothing anywhere in the record was stringified through Go's debug form.
  expect(JSON.stringify(doc)).not.toContain('map[');
});

test('a 3000-character unbroken run is carried whole', () => {
  const doc = record();
  expect(RUN).toHaveLength(3000);
  expect(doc.content).toContain(RUN);
});

test('the emitted index is valid JSON with no double encoding', () => {
  expect(serializationDir, 'the runner must export SERIALIZATION_DIR').toBeTruthy();
  const raw = readFileSync(join(serializationDir, 'searchindex.json'), 'utf8');

  // JSON.parse already proved the document is well formed; these check that
  // the encoder ran exactly once, so a reader does not have to unescape
  // twice to recover the author's text.
  //
  // These are also what makes the envelope's hand-written frame safe. The
  // template emits its six members in a fixed order rather than serializing
  // one Go map, because a map cannot carry an order -- but every VALUE still
  // goes through the encoder, and this corpus of quotes, ampersands,
  // backslashes, newlines and non-ASCII is precisely the input that would
  // expose a frame that started escaping by hand.
  for (const bad of ['&amp;#', '&amp;lt;', '&amp;amp;', '\\\\"q\\\\"']) {
    expect(raw).not.toContain(bad);
  }
});

// The number of leading bytes a reader should have to spend to learn what
// this document is and when it was built. The real document is a quarter of
// a megabyte; the metadata is a fixed-size prefix regardless.
const HEAD_BUDGET = 200;

test('the document describes itself BEFORE it delivers itself', () => {
  expect(serializationDir, 'the runner must export SERIALIZATION_DIR').toBeTruthy();
  const raw = readFileSync(join(serializationDir, 'searchindex.json'), 'utf8');

  // Position, not presence -- and the distinction is the whole test. The
  // fields were present all along, sixty-five bytes from the end of a
  // quarter-megabyte document, and capable readers inspected it three times
  // between them and reported the build stamp missing. A large JSON document
  // gets sampled from the front: a curl piped to head, a truncated preview,
  // a streaming parser surfacing early keys, an agent reading a prefix under
  // a context budget. Every one of those found `digest` and `docCount` and
  // stopped. A presence assertion passes against all of it.
  const docsAt = raw.indexOf('"docs":');
  expect(docsAt).toBeGreaterThan(0);
  expect(docsAt, `the whole metadata block must fit in ${HEAD_BUDGET} bytes`).toBeLessThan(
    HEAD_BUDGET,
  );
  for (const key of ['schemaVersion', 'generated', 'lang', 'digest', 'docCount']) {
    const at = raw.indexOf(`"${key}":`);
    expect(at, `"${key}" must be present`).toBeGreaterThan(0);
    expect(at, `"${key}" must precede the payload`).toBeLessThan(docsAt);
  }

  // And the guard that keeps the budget meaningful: a document short enough
  // to fit inside it would satisfy the assertions above no matter where its
  // members sat. This corpus carries a 3000-character run for that reason.
  expect(raw.length).toBeGreaterThan(HEAD_BUDGET * 10);

  // `docs` is the LAST member. JSON.parse preserves insertion order for
  // string keys, so the parsed key list IS the emitted order -- which also
  // states, in one line, that nothing new may be appended after the payload.
  expect(Object.keys(JSON.parse(raw))).toEqual([
    'schemaVersion',
    'generated',
    'lang',
    'digest',
    'docCount',
    'docs',
  ]);
  expect(raw.trimEnd().endsWith(']}'), 'the document must close on the docs array').toBe(true);
});
