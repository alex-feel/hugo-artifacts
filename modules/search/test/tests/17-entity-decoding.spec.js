// Entity decoding across the whole record: an authored field written with an
// entity spelling must reach the index as the characters a reader sees.
//
// A result is a promise about the page it links to, so every displayed field
// has to read the way the page reads: a group label spelled "Instruments
// &amp; gauges" would put a raw entity in front of the reader, and a keyword
// left in its entity spelling would never match the decoded body text it
// describes. The record builder therefore decodes every text field it
// composes -- except taxonomy arrays, whose terms are Hugo's own title-cased
// .LinkTitle values and are emitted verbatim. This spec pins both sides of
// that contract for the authored fields the rendered-field assertions in
// 01-index.spec.js do not reach.
import {test, expect} from '@playwright/test';

async function record(request) {
  const res = await request.get('/searchindex.json');
  expect(res.ok()).toBeTruthy();
  const env = await res.json();
  const doc = env.docs.find((d) => d.href === '/instruments/marine-barometers/');
  expect(doc, 'the entity-spelled page must be indexed').toBeTruthy();
  return doc;
}

test('the authored title, description and group label carry decoded characters', async ({
  request,
}) => {
  const doc = await record(request);

  expect(doc.title).toBe('Aneroid & mercury barometers');
  expect(doc.description).toBe('Dials & bellows measured against silvered scales.');

  // The group label is the section's own front matter title, so it is an
  // authored string exactly like the page title beside it.
  expect(doc.sectionTitle).toBe('Instruments & gauges');
  expect(doc.section).toBe('instruments');
});

test('keyword terms carry decoded characters while taxonomy terms stay as Hugo spells them', async ({
  request,
}) => {
  const doc = await record(request);

  // Keywords are matching terms the module composes: left in their entity
  // spelling they would never meet the decoded body text a query is stemmed
  // against.
  expect(doc.keywords).toEqual(['aneroid & mercury']);

  // A taxonomy array carries Hugo's own .LinkTitle, which title-cases a term
  // Hugo derives from the front matter list, so the module emits it verbatim
  // rather than half-undoing a spelling it does not own. The numeric entity
  // makes the verbatim contract observable: title-casing leaves &#38; intact,
  // and decoding the array would collapse it to a bare ampersand.
  expect(doc.tags).toEqual(['Brass & Glass', 'Copper &#38; Oak']);
});

test('no entity spelling survives in any text field of any record', async ({request}) => {
  const res = await request.get('/searchindex.json');
  const env = await res.json();

  for (const doc of env.docs) {
    for (const value of [doc.title, doc.sectionTitle, doc.description, doc.summary]) {
      if (typeof value === 'string') {
        expect(value).not.toMatch(/&(amp|lt|gt|quot|#\d+);/);
      }
    }
    for (const term of doc.keywords ?? []) {
      expect(term).not.toMatch(/&(amp|lt|gt|quot|#\d+);/);
    }
  }
});
