// Pagination: what a paginated section does to the emitted index and to the
// surfaces on the pager outputs.
//
// Hugo renders the SAME list page once per pager, so two failure modes exist
// at once. The index must not gain a document per pager -- a pager shell has
// no identity of its own, and indexing one publishes a result whose href
// points at a slice of a list rather than at a page. And the surfaces must
// survive the repeat render: a once-per-page sentinel would deliver a working
// modal on the first output and a broken one on every output after it.
//
// The served fixture's blog section paginates (its list layout calls
// .Paginate .Pages 2), so this runs against the served site.
/* global URL */
import {test, expect} from '@playwright/test';

test('the section paginates, so the pager outputs really exist', async ({request}) => {
  const res = await request.get('/blog/page/2/');
  expect(res.status()).toBe(200);
});

test('no pager shell is indexed and no page identity is duplicated', async ({request}) => {
  const env = await (await request.get('/searchindex.json')).json();
  const hrefs = env.docs.map((d) => d.href);

  // A pager URL carries a /page/<n>/ segment; none may appear as a document.
  expect(hrefs.filter((h) => /\/page\/\d+\//.test(h))).toEqual([]);

  // The list page itself is indexed at most once, under its own URL, and no
  // href repeats: a duplicated record id degrades the client engine.
  expect(new Set(hrefs).size).toBe(hrefs.length);
  expect(env.docCount).toBe(hrefs.length);

  // The count is the count of regular pages, invariant under pagination: the
  // blog section's own pages are all present exactly once.
  const blog = hrefs.filter((h) => h.startsWith('/blog/'));
  expect(blog.length).toBeGreaterThan(2);
  expect(new Set(blog).size).toBe(blog.length);
});

test('every pager output carries exactly one usable modal', async ({page}) => {
  // Walked over EVERY pager rather than the first, because the failure mode
  // is a per-page sentinel that fires on the first render and starves the
  // rest: with two outputs, testing only one of them proves nothing.
  await page.goto('/blog/');
  const pagerHrefs = await page
    .locator('a[href*="/blog/page/"]')
    .evaluateAll((links) => [...new Set(links.map((a) => new URL(a.href).pathname))]);
  expect(pagerHrefs.length).toBeGreaterThan(0);

  for (const href of ['/blog/', ...pagerHrefs]) {
    await page.goto(href);
    const modal = page.locator('.search--modal');
    await expect(modal, `one modal on ${href}`).toHaveCount(1);
    await expect(modal.locator('.search__dialog'), `one dialog on ${href}`).toHaveCount(1);
    await expect(modal.locator('.search__input'), `one input on ${href}`).toHaveCount(1);

    // The trigger is the modal's only entry point, and it stays visible only
    // while the surface is structurally intact.
    await expect(modal.locator('.search__trigger')).toBeVisible();
  }
});
