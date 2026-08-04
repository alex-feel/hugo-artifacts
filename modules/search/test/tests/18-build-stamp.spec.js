// The index envelope's `generated` field: one value per BUILD, not one per
// render.
//
// WHAT THE FIELD IS FOR. `digest` answers "is this different"; it cannot
// answer "which one is newer". A client holding a cached index can hash what
// it has and see that the two disagree, but disagreement has no direction,
// and the direction is the whole question: is MY copy the stale one. Only a
// timestamp answers it, and a stale index fails silently in the worst way for
// this document in particular -- search returns confident results from a
// corpus that no longer exists.
//
// WHY EQUALITY ALONE PROVES NOTHING HERE, which is the trap this file exists
// to avoid. The fixture builds in well under a second while the stamp's
// precision is one second, so two independently computed `now` values print
// the SAME string: asserting that the en and ru envelopes agree stays green
// against the exact per-render defect the field has to rule out. That was
// measured on the sibling module, not assumed -- reducing its mechanism to a
// bare `now` left every equality assertion in its suite passing.
//
// So equality locks the CONTRACT and the fixture's white-box probe locks the
// MECHANISM: a build that never writes the hugo.Store key leaves the probe's
// attribute empty, whatever the published values happen to look like.
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const templateSource = (...parts) => readFileSync(join(moduleRoot, 'layouts', ...parts), 'utf8');

// Go template comment blocks, stripped before any source assertion: these
// templates are heavily commented and the prose legitimately contains the
// words this file searches for.
const code = (text) => text.replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, '');

// RFC 3339 with an offset, anchored end to end. A date-only value cannot
// answer "am I holding this morning's cached copy", and a value without the
// offset is ambiguous between machines.
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

test.describe('the index build stamp', () => {
  test('both languages of one build carry ONE RFC 3339 stamp', async ({request}) => {
    const en = await (await request.get('/searchindex.json')).json();
    const ru = await (await request.get('/ru/searchindex.json')).json();

    expect(en.generated).toMatch(RFC3339);
    expect(ru.generated).toMatch(RFC3339);
    // The index renders once per LANGUAGE, so this is the pair a per-render
    // clock splits first -- and where the sibling module measured a cached
    // `now` producing two values 21 ms apart.
    expect(ru.generated).toBe(en.generated);

    // The stamp is deliberately outside the digest's input: the digest is the
    // client's cache key for the CORPUS, so a rebuild that changed no content
    // must keep it stable even though the document's bytes moved.
    expect(en.digest).toMatch(/^[0-9a-f]{16}$/);
    expect(ru.digest).not.toBe(en.digest);
  });

  test('the stamp is written to the build-wide store, not computed per render', async ({page}) => {
    // The white-box probe. This fixture imports the search module ALONE, so
    // the resolver must take its FALLBACK path and write `search:build-time`;
    // a mechanism reduced to a per-render `now` never writes the key and
    // leaves this attribute empty while every value above still matches.
    await page.goto('/');
    const probe = page.locator('#build-stamp-probe');
    await expect(probe).toHaveCount(1);

    // getAttribute reads the parsed DOM, so the value arrives decoded.
    const stored = await probe.getAttribute('data-store');
    const resolved = await probe.getAttribute('data-resolved');
    const sibling = await probe.getAttribute('data-sibling-present');

    expect(sibling).toBe('false');
    expect(stored).toMatch(RFC3339);
    expect(resolved).toBe(stored);

    const env = await (await page.request.get('/searchindex.json')).json();
    expect(env.generated).toBe(stored);
  });

  test('the emitter and the resolver keep the shape one value per build needs', () => {
    // The published values cannot close this hole, and the probe above cannot
    // either: the probe CALLS the resolver, so it populates the store itself.
    // An index template that ignored the resolver and called `now` would land
    // in the same second, print the same string, and pass every assertion
    // above. The same blind spot bit the sibling module -- there, replacing an
    // emitter's call with a bare `now.Format` left its whole suite green.
    //
    // So the wiring is locked at the source, where it is exact.
    const index = code(templateSource('home.searchindex.json'));
    expect(index).toContain('partial "search/lib/build-time.html"');
    expect(index).not.toMatch(/\bnow\b/);
    expect(index).not.toMatch(/\btime\.Now\b/);

    // The resolver prefers the sibling module, which is what makes the two
    // agree BY CONSTRUCTION on a site running both. Deleting the probe leaves
    // two independent clocks that a fast fixture cannot tell apart.
    const resolver = code(templateSource('_partials', 'search', 'lib', 'build-time.html'));
    expect(resolver).toContain('templates.Exists "_partials/agent-readiness/build-time.html"');
    expect(resolver).toContain('partial "agent-readiness/build-time.html"');
    expect(resolver).toContain('partialCached "search/lib/build-time-value.html"');
    expect(resolver).not.toMatch(/\bnow\b/);

    // And the fallback is the measured shape: read the build-wide store,
    // then write it, with the one clock call in the module living there.
    const value = code(templateSource('_partials', 'search', 'lib', 'build-time-value.html'));
    const getAt = value.indexOf('hugo.Store.Get');
    const setAt = value.indexOf('hugo.Store.Set');
    expect(getAt).toBeGreaterThan(-1);
    expect(setAt).toBeGreaterThan(getAt);
    expect(value).toMatch(/\bnow\.Format\b/);
  });
});
