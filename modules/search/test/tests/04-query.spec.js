// Query behavior on the dedicated page: recall in both languages, ranking,
// prefix and fuzzy matching, heading deep links, grouped rendering, and the
// ?q= round-trip.
/* global history, location */
import {test, expect} from '@playwright/test';

const RESULT_LINKS = '.search--page .search__results .search__result-link';

async function hrefs(page) {
  return page.locator(RESULT_LINKS).evaluateAll((els) => els.map((el) => el.getAttribute('href')));
}

test('english recall, title-over-body ranking, prefix, fuzzy, stemming', async ({page}) => {
  await page.goto('/search/');
  const input = page.locator('.search--page .search__input');

  await input.fill('gravity');
  await expect(page.locator(RESULT_LINKS)).toHaveCount(2);
  // A title-only hit ranks above a body-only hit.
  await expect(page.locator(RESULT_LINKS).first()).toHaveAttribute('href', '/blog/gravity-title/');
  expect(await hrefs(page)).toContain('/blog/spacetime-basics/');

  // Prefix on the final query term.
  await input.fill('grav');
  await expect.poll(async () => (await hrefs(page)).includes('/blog/gravity-title/')).toBeTruthy();

  // Fuzzy tolerates one typo.
  await input.fill('gravety');
  await expect.poll(async () => (await hrefs(page)).includes('/blog/gravity-title/')).toBeTruthy();

  // Stemming bridges inflection: "running" finds a page carrying "runs".
  await input.fill('running');
  await expect
    .poll(async () => (await hrefs(page)).includes('/blog/spacetime-basics/'))
    .toBeTruthy();
});

test('heading sub-records: anchor deep link plus the parent page', async ({page}) => {
  await page.goto('/search/');
  await page.locator('.search--page .search__input').fill('entanglement');
  await expect(
    page.locator(`${RESULT_LINKS}[href="/blog/quantum-notes/#entanglement-basics"]`),
  ).toHaveCount(1);
  await expect(page.locator(`${RESULT_LINKS}[href="/blog/quantum-notes/"]`)).toHaveCount(1);
});

test('group_by_section renders labeled groups with section and count hooks', async ({page}) => {
  await page.goto('/search/');
  await page.locator('.search--page .search__input').fill('beacon');
  const groups = page.locator('.search--page .search__group');
  await expect(groups).toHaveCount(2);
  for (const group of await groups.all()) {
    await expect(group.locator('h2.search__group-title')).toHaveCount(1);
    await expect(group.locator('span.search__group-count')).toHaveCount(1);
    await expect(group.locator('ul.search__list')).toHaveCount(1);
  }
  // Group order follows relevance, so the label set is asserted unordered.
  const titles = await page
    .locator('.search--page h2.search__group-title')
    .evaluateAll((els) => els.map((el) => el.textContent).sort());
  expect(titles).toEqual(['Blog', 'Documentation']);

  // Consumer interop hooks: the section key rides as data-search-section
  // and the rendered-result count as data-search-count plus the count
  // element's text.
  const blogGroup = page.locator('.search--page .search__group[data-search-section="blog"]');
  await expect(blogGroup).toHaveCount(1);
  await expect(blogGroup).toHaveAttribute('data-search-count', '1');
  await expect(blogGroup.locator('.search__group-count')).toHaveText('1');
});

test('a heading-less root-page group carries data attributes but no bare count', async ({page}) => {
  await page.goto('/search/');
  await page.locator('.search--page .search__input').fill('tricks');
  const rootGroup = page.locator('.search--page .search__group[data-search-section=""]');
  await expect(rootGroup).toHaveCount(1);
  await expect(rootGroup).toHaveAttribute('data-search-count', '1');
  // No section title means no heading -- and the visible count stays out
  // too, so the group never leads with a contextless number.
  await expect(rootGroup.locator('h2.search__group-title')).toHaveCount(0);
  await expect(rootGroup.locator('.search__group-count')).toHaveCount(0);
});

test('group counts track rendered results and grow with show more', async ({page}) => {
  // /search-chunked/ sets page_size: 1 in front matter; "gravity" matches
  // two blog pages, so the blog group renders 1, then 2 -- pinning that the
  // count is the RENDERED count, not the total match count.
  await page.goto('/search-chunked/');
  await page.locator('.search--page .search__input').fill('gravity');
  const blogGroup = page.locator('.search--page .search__group[data-search-section="blog"]');
  await expect(blogGroup).toHaveAttribute('data-search-count', '1');
  await expect(blogGroup.locator('.search__group-count')).toHaveText('1');
  await page.locator('.search--page .search__more').click();
  await expect(blogGroup).toHaveAttribute('data-search-count', '2');
  await expect(blogGroup.locator('.search__group-count')).toHaveText('2');
});

test('russian stemmed recall and yo folding', async ({page}) => {
  await page.goto('/ru/search/');
  const input = page.locator('.search--page .search__input');

  // Genitive query finds the page that carries only the nominative form.
  await input.fill('компаса');
  await expect(page.locator(`${RESULT_LINKS}[href="/ru/blog/morfologiya/"]`)).toHaveCount(1);

  // елка matches ёлка through the symmetric fold.
  await input.fill('елка');
  await expect(page.locator(`${RESULT_LINKS}[href="/ru/blog/morfologiya/"]`)).toHaveCount(1);

  await input.fill('поиска');
  await expect(page.locator(`${RESULT_LINKS}[href="/ru/blog/morfologiya/"]`)).toHaveCount(1);
});

test('?q= deep link, replaceState sync, immediate clear, popstate restore', async ({page}) => {
  await page.goto('/search/?q=gravity');
  const input = page.locator('.search--page .search__input');
  await expect(input).toHaveValue('gravity');
  await expect(page.locator(RESULT_LINKS)).toHaveCount(2);

  // history.replaceState syncs while typing.
  await input.fill('beacon');
  await expect.poll(() => page.url()).toContain('q=beacon');
  await expect(page.locator(`${RESULT_LINKS}[href="/docs/guides/nested/"]`)).toHaveCount(1);

  // Restore a known query, duplicate the history entry, clear, go back.
  await input.fill('gravity');
  await expect.poll(() => page.url()).toContain('q=gravity');
  await page.evaluate(() => history.pushState(null, '', location.href));

  // Emptying the input clears results and removes ?q= without waiting out
  // the debounce.
  await input.fill('');
  expect(await page.locator('.search--page .search__result').count()).toBe(0);
  expect(page.url()).not.toContain('q=');

  // Back and forward (popstate) restores the query and its results.
  await page.evaluate(() => history.back());
  await expect(input).toHaveValue('gravity');
  await expect(page.locator(RESULT_LINKS)).toHaveCount(2);
});
