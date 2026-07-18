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
});
