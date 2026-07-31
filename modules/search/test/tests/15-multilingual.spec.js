// Per-language configuration: one index and one set of surfaces per
// language, resolved from that language's own params block.
//
// The index is emitted once per language and every surface reads its own
// language's configuration, so a [languages.<lang>.params.search] block must
// reach that language alone. The failure mode this locks out is a resolver
// that reads the DEFAULT language's params while rendering another language:
// it would publish a ru index scoped by en's allow-list, and ru surfaces
// pointed at en's index.
//
// A static overlay build feeds this: the served fixture's ru assertions run
// against the inherited configuration, so the override cannot live there.
/* global process */
import {test, expect} from '@playwright/test';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.env.MULTILINGUAL_DIR;

function envelope(...parts) {
  return JSON.parse(readFileSync(join(dir, ...parts), 'utf8'));
}

// The surface's opening tag is emitted across several lines, so it is sliced
// out by position rather than matched with a single-line pattern.
function attributes(html, selectorClass) {
  const at = html.indexOf(selectorClass);
  expect(at, `the ${selectorClass} surface must be rendered`).toBeGreaterThan(-1);
  const tag = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at));
  return Object.fromEntries(
    [...tag.matchAll(/(data-search-[a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
}

test('each language publishes its own index envelope with its own documents', () => {
  expect(dir, 'the runner must export MULTILINGUAL_DIR').toBeTruthy();
  const en = envelope('searchindex.json');
  const ru = envelope('ru', 'searchindex.json');

  expect(en.lang).toBe('en');
  expect(ru.lang).toBe('ru');
  expect(en.docCount).toBe(en.docs.length);
  expect(ru.docCount).toBe(ru.docs.length);

  // No document crosses the language boundary in either direction.
  expect(ru.docs.every((d) => d.href.startsWith('/ru/'))).toBe(true);
  expect(en.docs.some((d) => d.href.startsWith('/ru/'))).toBe(false);
});

test('a language-scoped sections override narrows that language alone', () => {
  const en = envelope('searchindex.json');
  const ru = envelope('ru', 'searchindex.json');

  // The overlay allow-lists only "blog" for ru, while en keeps the fixture's
  // much wider list: the two counts must not coincide, and every ru document
  // must sit in the section the override names.
  expect(ru.docCount).not.toBe(en.docCount);
  expect(ru.docCount).toBeGreaterThan(0);
  expect(ru.docs.every((d) => d.href.startsWith('/ru/blog/'))).toBe(true);

  // en is untouched by the ru block: sections it allow-lists outside blog are
  // still indexed.
  expect(en.docs.some((d) => d.href.startsWith('/docs/'))).toBe(true);
});

test('each language surface points at its own index and carries its own limit', () => {
  const ruHtml = readFileSync(join(dir, 'ru', 'search', 'index.html'), 'utf8');
  const ruPage = attributes(ruHtml, 'search--page');
  expect(ruPage['data-search-index-url']).toBe('/ru/searchindex.json');
  expect(ruPage['data-search-lang']).toBe('ru');
  expect(ruPage['data-search-page-url']).toBe('/ru/search/');

  // results_limit caps the modal and inline surfaces; the dedicated page
  // surface pages its results instead, so the override is read from the
  // modal that the same document carries.
  const ruModal = attributes(ruHtml, 'search--modal');
  expect(ruModal['data-search-limit']).toBe('3');
  expect(ruModal['data-search-index-url']).toBe('/ru/searchindex.json');

  const enHtml = readFileSync(join(dir, 'search', 'index.html'), 'utf8');
  const enPage = attributes(enHtml, 'search--page');
  expect(enPage['data-search-index-url']).toBe('/searchindex.json');
  expect(enPage['data-search-lang']).toBe('en');
  // The ru results_limit override must not have leaked into en.
  expect(attributes(enHtml, 'search--modal')['data-search-limit']).not.toBe('3');
});

test('the two-language build still publishes exactly one OpenSearch document', () => {
  // The document pins ONE path for every language (root = true), so a
  // per-language copy would overwrite it with the last writer winning, and
  // the surviving copy would advertise the wrong language's search page.
  expect(existsSync(join(dir, 'opensearch.xml'))).toBe(true);
  expect(existsSync(join(dir, 'ru', 'opensearch.xml'))).toBe(false);

  const xml = readFileSync(join(dir, 'opensearch.xml'), 'utf8');
  const template = /<Url type="text\/html"[^>]*template="([^"]+)"/.exec(xml)?.[1];
  expect(template).toBeTruthy();
  expect(template).toContain('/search/?q={searchTerms}');
  expect(template).not.toContain('/ru/');
});
