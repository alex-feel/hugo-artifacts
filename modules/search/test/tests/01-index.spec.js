// The emitted per-language index: envelope shape, inclusion and exclusion
// filters, entity hygiene on the hostile corpus, and heading sub-records.
import {test, expect} from '@playwright/test';

test.describe('search index envelope', () => {
  test('en index: envelope, filters, hostile literals, headings', async ({request}) => {
    const res = await request.get('/searchindex.json');
    expect(res.ok()).toBeTruthy();
    const env = await res.json();
    expect(env.schemaVersion).toBe(1);
    expect(env.lang).toBe('en');
    expect(env.digest).toMatch(/^[0-9a-f]{16}$/);
    expect(env.docCount).toBe(env.docs.length);

    const hrefs = env.docs.map((d) => d.href);
    expect(hrefs).not.toContain('/excluded/');
    expect(hrefs).not.toContain('/promo/');
    expect(hrefs).toContain('/docs/guides/nested/');

    // The fixture spells the allow-list entry "Blog": matching is
    // case-insensitive, so /blog/... pages must stay in scope.
    expect(hrefs).toContain('/blog/quantum-notes/');

    // The dedicated search page is allow-listed ("search") yet drops itself
    // from the index: its own UI chrome must never surface as a result.
    expect(hrefs).not.toContain('/search/');

    // Hostile payloads reach the index as LITERAL text (index string fields
    // legitimately contain < as text after entity decoding).
    const hostile = env.docs.find((d) => d.href === '/hostile/');
    expect(hostile).toBeTruthy();
    expect(hostile.title).toBe('Tips & tricks — the <img src=x onerror=alert(1)> guide');
    expect(hostile.description).toContain('<script>alert("desc")</script>');
    expect(hostile.summary).toContain("<img src=x onerror=alert('body')>");
    expect(hostile.image).toBe('javascript:alert(1)');

    // No double-encoded sequences anywhere and no leaked entities in the
    // hostile page's displayed fields.
    const raw = await res.text();
    for (const bad of ['&amp;#', '&amp;lt;', '&amp;amp;']) {
      expect(raw).not.toContain(bad);
    }
    for (const field of ['title', 'description', 'summary']) {
      for (const leak of ['&amp;', '&mdash;', '&#39;']) {
        expect(hostile[field]).not.toContain(leak);
      }
    }

    // Heading sub-records: id/level/title present, titles free of markup.
    const quantum = env.docs.find((d) => d.href === '/blog/quantum-notes/');
    expect(Array.isArray(quantum.headings)).toBeTruthy();
    const entanglement = quantum.headings.find((h) => h.title === 'Entanglement basics');
    expect(entanglement).toMatchObject({id: 'entanglement-basics', level: 2});
    const codeHeading = quantum.headings.find((h) => h.id === 'using-config-values');
    expect(codeHeading.title).toBe('Using config values');
    for (const heading of quantum.headings) {
      expect(heading.id).toBeTruthy();
      expect(heading.level).toBeGreaterThanOrEqual(2);
      expect(heading.title).not.toMatch(/<[a-z/]/);
    }

    // The fixture's "keywords" taxonomy collides with the reserved record
    // field of the same name: the resolver skips it with a warning, so the
    // record keeps the author's search.keywords terms and the taxonomy's
    // terms never clobber them.
    expect(quantum.keywords).toEqual(['qubit-search-kw']);

    // A page WITHOUT search.keywords falls back to its standard keywords
    // front matter for the same boosted field (search.keywords wins when
    // present -- the quantum assertion above pins that side).
    const lighthouse = env.docs.find((d) => d.href === '/blog/lighthouse-post/');
    expect(lighthouse.keywords).toEqual(['pharos']);
  });

  test('map-shaped images entries contribute a path, never a stringified map', async ({
    request,
  }) => {
    const res = await request.get('/searchindex.json');
    expect(res.ok()).toBeTruthy();
    const env = await res.json();

    // images: [{src: ...}] contributes its src value, exactly as a plain
    // string entry would.
    const atlas = env.docs.find((d) => d.href === '/map-image/');
    expect(atlas).toBeTruthy();
    expect(atlas.image).toBe('/img/cover.png');

    // A map entry with no usable src/url/image key stays EMPTY, so the
    // page-bundle resource fallback still finds the bundle cover; a
    // stringified map would be truthy and suppress it.
    const harbor = env.docs.find((d) => d.href === '/bundle-image/');
    expect(harbor).toBeTruthy();
    expect(harbor.image).toBe('/bundle-image/cover.png');

    // And no record anywhere carries Go's stringified-map spelling.
    const raw = await res.text();
    expect(raw).not.toContain('map[');
  });

  test('present-but-unusable scalar image keys count as absent, so the bundle fallback runs', async ({
    request,
  }) => {
    const res = await request.get('/searchindex.json');
    expect(res.ok()).toBeTruthy();
    const env = await res.json();

    // images: [{src: false, url: 0, image: true}]: none of these scalars is
    // a path, so the walk must skip all three and let the page-bundle cover
    // land, instead of publishing "false" as the thumbnail path -- which
    // would also suppress that fallback.
    const meridian = env.docs.find((d) => d.href === '/falsy-image/');
    expect(meridian).toBeTruthy();
    expect(meridian.image).toBe('/falsy-image/cover.png');
  });

  test('a list-shaped first images entry contributes no thumbnail, so the bundle fallback runs', async ({
    request,
  }) => {
    const res = await request.get('/searchindex.json');
    expect(res.ok()).toBeTruthy();
    const env = await res.json();

    // images: [['/img/cover.png']]: the first entry is itself a list, which
    // has no path spelling, so the walk must leave the field empty and let
    // the page-bundle cover land instead of publishing a stringified list
    // -- a shape the universal map[ scan cannot catch.
    const quadrant = env.docs.find((d) => d.href === '/list-image/');
    expect(quadrant).toBeTruthy();
    expect(quadrant.image).toBe('/list-image/cover.png');

    // And no record anywhere opens its image with Go's stringified-slice
    // bracket spelling.
    const raw = await res.text();
    expect(raw).not.toContain('"image":"[');
  });

  test('unusable keywords shapes degrade to the fallback, never a stringified map', async ({
    request,
  }) => {
    const res = await request.get('/searchindex.json');
    expect(res.ok()).toBeTruthy();
    const env = await res.json();

    // search.keywords written as a MAP has no term spelling: the record
    // builder must ignore it and fall back to the standard keywords front
    // matter, exactly as if search.keywords were absent.
    const sextant = env.docs.find((d) => d.href === '/map-keywords/');
    expect(sextant).toBeTruthy();
    expect(sextant.keywords).toEqual(['fallback-kw']);

    // A map entry INSIDE a keywords list is skipped while the scalar entry
    // beside it still indexes.
    const astrolabe = env.docs.find((d) => d.href === '/mixed-keywords/');
    expect(astrolabe).toBeTruthy();
    expect(astrolabe.keywords).toEqual(['listed-kw']);
  });

  test('ru index: envelope and morphology corpus', async ({request}) => {
    const res = await request.get('/ru/searchindex.json');
    expect(res.ok()).toBeTruthy();
    const env = await res.json();
    expect(env.schemaVersion).toBe(1);
    expect(env.lang).toBe('ru');
    expect(env.digest).toMatch(/^[0-9a-f]{16}$/);
    expect(env.docCount).toBe(env.docs.length);
    const hrefs = env.docs.map((d) => d.href);
    expect(hrefs).toContain('/ru/blog/morfologiya/');
    expect(hrefs).toContain('/ru/docs/guides/nested/');
    expect(hrefs).not.toContain('/ru/search/');
    const morph = env.docs.find((d) => d.href === '/ru/blog/morfologiya/');
    expect(morph.content).toContain('ёлка');
    expect(morph.content).toContain('Компас');
  });

  test('every language SERVES its metadata before its payload', async ({request}) => {
    // The order over the wire, in both languages, on the document a client
    // actually fetches. The byte-level treatment lives in the serialization
    // spec; this one exists because a reader meets the index HERE, and
    // because the emitter builds the member list per render -- a language
    // whose branch diverged would still parse, and would still pass every
    // value assertion above.
    for (const path of ['/searchindex.json', '/ru/searchindex.json']) {
      const raw = await (await request.get(path)).text();
      // JSON member order carries no semantics, so a parser cannot see this
      // and no consumer can be broken by it -- but JSON.parse preserves
      // insertion order for string keys, which makes the order readable.
      expect(Object.keys(JSON.parse(raw)), `${path} member order`).toEqual([
        'schemaVersion',
        'generated',
        'lang',
        'digest',
        'docCount',
        'docs',
      ]);
      // Every record leads with what identifies it. Asserted over the whole
      // corpus rather than on one probe, because the member list varies per
      // record -- a page without a date, a description, an image or a
      // taxonomy term simply omits those members, and the order has to hold
      // for each shape.
      for (const doc of JSON.parse(raw).docs) {
        const keys = Object.keys(doc);
        expect(keys[0], `${doc.href} must lead with href`).toBe('href');
        expect(keys[1], `${doc.href} must name itself second`).toBe('title');
        if (keys.includes('content')) {
          expect(keys[keys.length - 1], `${doc.href} must trail with its body`).toBe('content');
        }
      }
      // At the byte level, for the first record: the array opens straight
      // onto an identity, which is what a reader sampling the front gets.
      expect(raw.slice(raw.indexOf('"docs":')).startsWith('"docs":[{"href":')).toBe(true);

      expect(raw.indexOf('"docs":'), `${path} puts docs last`).toBe(
        Math.max(
          ...['schemaVersion', 'generated', 'lang', 'digest', 'docCount', 'docs'].map((k) =>
            raw.indexOf(`"${k}":`),
          ),
        ),
      );
    }
  });
});
