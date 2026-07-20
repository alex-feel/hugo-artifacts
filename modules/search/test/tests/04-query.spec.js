// Query behavior on the dedicated page: recall in both languages, ranking,
// prefix and fuzzy matching (including prefix = false), keywords-field
// recall, highlight scope, form submit semantics, heading deep links,
// grouped rendering, and the ?q= round-trip.
/* global document, history, location, MutationObserver */
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

test('standard keywords front matter matches through the boosted keywords field', async ({
  page,
}) => {
  // The lighthouse page carries keywords: ['pharos'] and no
  // search.keywords: without the record builder's fallback the term
  // reaches no indexed field and this query returns nothing.
  await page.goto('/search/');
  await page.locator('.search--page .search__input').fill('pharos');
  await expect(page.locator(`${RESULT_LINKS}[href="/blog/lighthouse-post/"]`)).toHaveCount(1);
});

test('a trailing stopword never prefix-marks unrelated words', async ({page}) => {
  // "of" is a stopword: the engine drops it from the query and runs no
  // prefix search for it, so the highlighter must not mark words that
  // merely start with it ("official", or every literal "of") -- only the
  // real term's matches carry marks.
  await page.goto('/search/');
  await page.locator('.search--page .search__input').fill('gravity of');
  await expect(page.locator(RESULT_LINKS)).toHaveCount(2);
  const marks = await page
    .locator('.search--page .search__results .search__mark')
    .evaluateAll((els) => els.map((el) => el.textContent.toLowerCase()));
  expect(marks.length).toBeGreaterThan(0);
  for (const mark of marks) {
    expect(mark.startsWith('of')).toBeFalsy();
  }
  expect(marks.some((m) => m.startsWith('gravity'))).toBeTruthy();
});

test('prefix = false disables the engine prefix search and prefix marking', async ({page}) => {
  // Patch the page root's options while the document is still parsing,
  // before the module script evaluates: with prefix off, a partial final
  // term matches nothing by prefix, and a query the default fuzzy still
  // bridges renders results without a single prefix mark.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const root = document.querySelector('.search--page');
      if (root) {
        const options = JSON.parse(root.dataset.searchOptions);
        options.prefix = false;
        root.dataset.searchOptions = JSON.stringify(options);
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/search/');
  const input = page.locator('.search--page .search__input');
  // "beac" prefix-matches "beacon" only when prefix is on; two edits away,
  // it is out of the default fuzzy's reach too.
  await input.fill('beac');
  await expect(page.locator('.search--page .search__alert')).toHaveText('No results for “beac”');
  // The default fuzzy bridges "gravit" to the indexed stem, so results
  // render -- but the final term must not prefix-mark "gravity" in them.
  await input.fill('gravit');
  await expect(page.locator(RESULT_LINKS)).toHaveCount(2);
  expect(await page.locator('.search--page .search__results .search__mark').count()).toBe(0);
});

test('form submit works after programmatic value restoration', async ({page}) => {
  // Form-state restoration and autofill set the input value without an
  // input event; Enter must still search instead of the stale-query guard
  // silently discarding the submit's own response.
  await page.goto('/search/');
  await expect(page.locator('.search--page')).toHaveClass(/search--enhanced/);
  await page.evaluate(() => {
    const root = document.querySelector('.search--page');
    root.querySelector('.search__input').value = 'gravity';
    root.querySelector('.search__form').requestSubmit();
  });
  await expect(page.locator(RESULT_LINKS)).toHaveCount(2);
  await expect.poll(() => page.url()).toContain('q=gravity');
});

test('a too-short submit explains itself through the status region', async ({page}) => {
  await page.goto('/search/');
  await expect(page.locator('.search--page')).toHaveClass(/search--enhanced/);
  await page.evaluate(() => {
    const root = document.querySelector('.search--page');
    root.querySelector('.search__input').value = 'g';
    root.querySelector('.search__form').requestSubmit();
  });
  await expect(page.locator('.search--page .search__status')).toHaveText(
    'Type at least 2 characters',
  );
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

test('group counts track rendered results, grow with show more, and honor count_pad', async ({
  page,
}) => {
  // /search-chunked/ sets page_size: 1 and count_pad: 2 in front matter;
  // "gravity" matches two blog pages, so the blog group renders 1, then 2
  // -- pinning that the count is the RENDERED count (not the total match
  // count) and that the element text is zero-padded while the data
  // attribute stays bare.
  await page.goto('/search-chunked/');
  await page.locator('.search--page .search__input').fill('gravity');
  const blogGroup = page.locator('.search--page .search__group[data-search-section="blog"]');
  await expect(blogGroup).toHaveAttribute('data-search-count', '1');
  await expect(blogGroup.locator('.search__group-count')).toHaveText('01');
  await page.locator('.search--page .search__more').click();
  await expect(blogGroup).toHaveAttribute('data-search-count', '2');
  await expect(blogGroup.locator('.search__group-count')).toHaveText('02');
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
