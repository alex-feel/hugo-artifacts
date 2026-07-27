// The OpenSearch description document: the query contract, the
// escaping contract, the default-off gate, and the one-document-per-site rule.
//
// This document originally shipped with no test of any kind, so nothing in CI
// rendered this template again after it was written. That is precisely how a
// document declared isPlainText -- Go's text/template, which escapes NOTHING --
// came to interpolate the site title raw.
//
// Three builds feed these assertions: the served fixture (opensearch enabled,
// for the live query contract), and two static overlay builds the runner
// produces beforehand, because a single served site cannot simultaneously have
// a hostile title and have the feature switched off.
/* global process, DOMParser */
import {test, expect} from '@playwright/test';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const hostileDir = process.env.OPENSEARCH_HOSTILE_DIR;
const offDir = process.env.OPENSEARCH_OFF_DIR;

test('the document is served, is well-formed XML, and declares the OpenSearch namespace', async ({
  page,
}) => {
  const res = await page.request.get('/opensearch.xml');
  expect(res.status()).toBe(200);
  const body = await res.text();

  expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(body.endsWith('\n')).toBe(true);

  // Parsed by a real XML parser rather than regex-matched: "well-formed" is
  // exactly the property a strict consumer enforces, and it is the property
  // an unescaped ampersand destroys.
  const doc = await page.evaluate((xml) => {
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    const error = parsed.querySelector('parsererror');
    return {
      error: error ? error.textContent : null,
      root: parsed.documentElement.nodeName,
      ns: parsed.documentElement.namespaceURI,
      shortName: parsed.querySelector('ShortName')?.textContent ?? null,
      description: parsed.querySelector('Description')?.textContent ?? null,
      encoding: parsed.querySelector('InputEncoding')?.textContent ?? null,
      urls: [...parsed.querySelectorAll('Url')].map((u) => ({
        type: u.getAttribute('type'),
        rel: u.getAttribute('rel'),
        template: u.getAttribute('template'),
      })),
    };
  }, body);

  expect(doc.error).toBeNull();
  expect(doc.root).toBe('OpenSearchDescription');
  expect(doc.ns).toBe('http://a9.com/-/spec/opensearch/1.1/');
  expect(doc.encoding).toBe('UTF-8');
  expect(doc.shortName).toBeTruthy();
  expect(doc.shortName.length).toBeLessThanOrEqual(16);
  expect(doc.description.length).toBeLessThanOrEqual(1024);

  const html = doc.urls.find((u) => u.type === 'text/html');
  expect(html).toBeTruthy();
  expect(html.template).toContain('{searchTerms}');

  const self = doc.urls.find((u) => u.rel === 'self');
  expect(self?.type).toBe('application/opensearchdescription+xml');
  expect(self?.template).toMatch(/\/opensearch\.xml$/);
});

test('the advertised template resolves to the real search page with the term pre-filled', async ({
  page,
}) => {
  // The value of this document is that
  // its query contract cannot drift from the module's own search page, so the
  // advertised URL is followed rather than merely inspected.
  const body = await (await page.request.get('/opensearch.xml')).text();
  const template = /<Url type="text\/html"[^>]*template="([^"]+)"/.exec(body)?.[1];
  expect(template).toBeTruthy();

  const target = template.replace('{searchTerms}', 'gravity');
  await page.goto(target);

  const input = page.locator('.search--page .search__input');
  await expect(input).toHaveValue('gravity');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
});

test('a hostile site title is XML-escaped rather than emitted raw', async () => {
  // The overlay build sets title = "R&D <Search> Fixture". Unescaped, the
  // bare ampersand is an undefined entity reference and the `<` opens a
  // bogus element -- either one makes the document unparseable.
  expect(hostileDir, 'the runner must export OPENSEARCH_HOSTILE_DIR').toBeTruthy();
  const xml = readFileSync(join(hostileDir, 'opensearch.xml'), 'utf8');

  expect(xml).toContain('&amp;');
  expect(xml).toContain('&lt;');
  // No bare markup-significant character may survive inside the text nodes.
  const shortName = /<ShortName>(.*?)<\/ShortName>/.exec(xml)?.[1] ?? '';
  const description = /<Description>(.*?)<\/Description>/.exec(xml)?.[1] ?? '';
  for (const value of [shortName, description]) {
    expect(value).not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/);
    expect(value).not.toMatch(/[<>]/);
  }

  // Truncation runs BEFORE escaping, so the 16-character cap counts REAL
  // characters rather than entity text: "R&D <Search> Fixture" truncates to
  // the 16 characters "R&D <Search> Fix" and only then escapes. Escaping
  // first would spend the budget on entity text and cut mid-title -- or, far
  // worse, cut an entity in half and emit "&am".
  expect(shortName).toBe('R&amp;D &lt;Search&gt; Fix');
});

test('the hostile-title document still parses as XML', async ({page}) => {
  const xml = readFileSync(join(hostileDir, 'opensearch.xml'), 'utf8');
  const error = await page.evaluate((text) => {
    const parsed = new DOMParser().parseFromString(text, 'application/xml');
    const el = parsed.querySelector('parsererror');
    return el ? el.textContent : null;
  }, xml);
  expect(error).toBeNull();
});

test('with the feature switched off, no document is published at all', async () => {
  // The overlay leaves `opensearch` in [outputs] home, so Hugo is still asked
  // to render the format; only the template's own gate stops it. An empty
  // file, or a shell with no Url, would both be worse than nothing -- a
  // client that fetches it would treat the site as advertising a search
  // endpoint it does not describe.
  expect(offDir, 'the runner must export OPENSEARCH_OFF_DIR').toBeTruthy();
  expect(existsSync(join(offDir, 'opensearch.xml'))).toBe(false);
});

test('a non-default language does not publish a second copy', async ({page}) => {
  // root = true pins ONE path for every language, so a per-language document
  // would overwrite that single path with the last writer winning -- and the
  // surviving copy would advertise the wrong language's search page. The
  // fixture declares en and ru, so this is a real two-language build rather
  // than a hypothetical.
  const ru = await page.request.get('/ru/opensearch.xml');
  expect(ru.status()).toBe(404);

  // And the one document that does exist points at the DEFAULT language's
  // search page, not at whichever language rendered last.
  const body = await (await page.request.get('/opensearch.xml')).text();
  expect(body).not.toContain('/ru/');
});
