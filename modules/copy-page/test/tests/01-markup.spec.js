// Server-rendered markup: root data attributes, the dual-hidden JS-only copy
// controls, exact row hrefs (including the encoding matrix), rel/target
// policy per row origin, row resolution (llms drop and resolve, rows_extra,
// the https-only gate, unknown slugs), kill switches, the self-gate, and the
// shortcode. JavaScript stays disabled: this is the no-JS baseline.
/* global URL */
import {readFileSync} from 'node:fs';
import {test, expect} from '@playwright/test';

const BASE = 'http://localhost:1616';

test.use({javaScriptEnabled: false});

test.describe('plain post (default configuration)', () => {
  const mdUrl = `${BASE}/docs/post-plain/index.md`;

  test('renders root data attributes and the disclosure structure', async ({page}) => {
    await page.goto('/docs/post-plain/');
    const root = page.locator('.copy-page');
    await expect(root).toHaveCount(1);
    // The URL derives from the page's markdown output format: no explicit
    // "url" argument anywhere on this page.
    await expect(root).toHaveAttribute('data-copy-page-url', mdUrl);
    await expect(root).toHaveAttribute('data-copy-page-copied-label', 'Page copied as Markdown');
    await expect(root).toHaveAttribute('data-copy-page-error-label', "Couldn't copy the page");

    const menu = root.locator('details.copy-page__menu');
    await expect(menu).toHaveCount(1);
    const toggle = menu.locator('summary.copy-page__toggle');
    await expect(toggle).toHaveCount(1);
    await expect(toggle.locator('.copy-page__toggle-label')).toHaveText(
      'More ways to use this page',
    );
    await expect(toggle.locator('.copy-page__icon--chevron')).toHaveCount(1);
    // Default rows: copy + view.
    await expect(menu.locator('ul.copy-page__list > li.copy-page__item')).toHaveCount(2);
    // has_copy is true, so the live region ships.
    await expect(root.locator('.copy-page__status')).toHaveCount(1);
    await expect(root.locator('.copy-page__status')).toHaveAttribute('role', 'status');
  });

  test('ships both JS-only copy controls dual-hidden', async ({page}) => {
    await page.goto('/docs/post-plain/');
    // The fixture's consumer CSS sets display:inline-block on __copy and
    // __item, which would defeat the weak [hidden] UA rule; the inline
    // display:none must keep both controls invisible without JavaScript.
    const primary = page.locator('button.copy-page__copy');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveAttribute('hidden', '');
    await expect(primary).toHaveAttribute('style', 'display:none');
    await expect(primary).toBeHidden();

    const copyItem = page.locator('li.copy-page__item--copy');
    await expect(copyItem).toHaveCount(1);
    await expect(copyItem).toHaveAttribute('hidden', '');
    await expect(copyItem).toHaveAttribute('style', 'display:none');
    await expect(copyItem.locator('button.copy-page__row--copy')).toHaveAttribute(
      'data-copy-page-action',
      'copy',
    );
  });

  test('view row follows the same-origin link policy', async ({page}) => {
    await page.goto('/docs/post-plain/');
    const view = page.locator('a.copy-page__row--view');
    await expect(view).toHaveAttribute('href', mdUrl);
    await expect(view).toHaveAttribute('data-copy-page-row', 'view');
    // new_tab defaults to true; same-origin rows carry NO rel.
    await expect(view).toHaveAttribute('target', '_blank');
    expect(await view.getAttribute('rel')).toBeNull();
    await expect(view.locator('.copy-page__external')).toHaveCount(1);
    await expect(view.locator('.copy-page__newtab')).toHaveText('(opens in a new window)');
    await expect(view.locator('.copy-page__title')).toHaveText('View as Markdown');
    await expect(view.locator('.copy-page__desc')).toHaveText('View this page as plain text');
  });
});

test.describe('encoding matrix (provider rows)', () => {
  const pageUrl = `${BASE}/docs/enc-[matrix]-42/`;
  const mdUrl = `${pageUrl}index.md`;
  const prompt = 'Summarize {url} & explain 50% off + more [deal]';
  // The module encodes via querify with the "+" to "%20" rewrite, which for
  // these characters is exactly encodeURIComponent: %20-not-plus spaces,
  // %2B pluses, %26 ampersands, %25 percents, %5B/%5D brackets.
  const enc = (target) => encodeURIComponent(prompt.replace('{url}', target));

  test('renders every provider row with its exact percent-encoded href', async ({page}) => {
    await page.goto('/docs/enc-[matrix]-42/');
    const root = page.locator('.copy-page');
    // ChatGPT is the one html-target row: it receives the page's own
    // permalink; every other provider receives the Markdown URL.
    await expect(root.locator('a.copy-page__row--chatgpt')).toHaveAttribute(
      'href',
      `https://chatgpt.com/?hints=search&q=${enc(pageUrl)}`,
    );
    await expect(root.locator('a.copy-page__row--claude')).toHaveAttribute(
      'href',
      `https://claude.ai/new?q=${enc(mdUrl)}`,
    );
    await expect(root.locator('a.copy-page__row--perplexity')).toHaveAttribute(
      'href',
      `https://www.perplexity.ai/search?q=${enc(mdUrl)}`,
    );
    await expect(root.locator('a.copy-page__row--grok')).toHaveAttribute(
      'href',
      `https://grok.com/?q=${enc(mdUrl)}`,
    );
    await expect(root.locator('a.copy-page__row--aistudio')).toHaveAttribute(
      'href',
      `https://aistudio.google.com/prompts/new_chat?prompt=${enc(mdUrl)}`,
    );
    // Belt and suspenders on the encoding discipline itself: spaces become
    // %20 (never a raw +) and brackets are escaped.
    const href = await root.locator('a.copy-page__row--claude').getAttribute('href');
    expect(href).toContain('%20');
    expect(href).toContain('%2B');
    expect(href).toContain('%5B');
    expect(href).toContain('%5D');
    expect(href).not.toContain('+');
  });

  test('each provider row names the surface it hands the assistant', async ({page}) => {
    // The reason this exists: the five provider rows do not agree about what
    // they send -- chatgpt carries the page's permalink, the other four carry
    // the Markdown twin -- and while that pairing is deliberate, it used to be
    // invisible, because every row repeated the same description over a
    // different href. A reader comparing two rows had to leave the widget to
    // find out why. These assertions pin the fix at the place the difference
    // is visible.
    await page.goto('/docs/enc-[matrix]-42/');
    const root = page.locator('.copy-page');
    const descOf = (slug) => root.locator(`a.copy-page__row--${slug} .copy-page__desc`);

    // The one html-target row also names WHY it is the odd one out.
    await expect(descOf('chatgpt')).toHaveText('Search mode, which reads the live page');
    for (const slug of ['claude', 'perplexity', 'grok', 'aistudio']) {
      await expect(descOf(slug)).toHaveText('Ask questions about the Markdown version');
    }
    // The asymmetry in the hrefs is matched by an asymmetry in the copy: if
    // these two ever read the same again, the report this fix closed is back.
    expect(await descOf('chatgpt').textContent()).not.toBe(await descOf('claude').textContent());
  });

  test('external rows carry the full rel/target policy', async ({page}) => {
    await page.goto('/docs/enc-[matrix]-42/');
    const providers = ['chatgpt', 'claude', 'perplexity', 'grok', 'aistudio'];
    for (const slug of providers) {
      const row = page.locator(`a.copy-page__row--${slug}`);
      await expect(row).toHaveAttribute('rel', 'noopener noreferrer nofollow');
      await expect(row).toHaveAttribute('target', '_blank');
    }
    // Same-origin view row on the same page: target without rel.
    const view = page.locator('a.copy-page__row--view');
    await expect(view).toHaveAttribute('href', mdUrl);
    await expect(view).toHaveAttribute('target', '_blank');
    expect(await view.getAttribute('rel')).toBeNull();
  });

  test('llms row drops when no llmstxt home format and no llms_url resolve', async ({page}) => {
    await page.goto('/docs/enc-[matrix]-42/');
    const root = page.locator('.copy-page');
    // copy + view + five providers survive; the llms row drops silently.
    await expect(root.locator('li.copy-page__item')).toHaveCount(7);
    await expect(root.locator('li.copy-page__item--llms')).toHaveCount(0);
  });
});

test.describe('llms resolution and rows without copy', () => {
  test('llms_url resolves the row; no copy row means no primary half', async ({page}) => {
    await page.goto('/docs/post-llms/');
    const root = page.locator('.copy-page');
    await expect(root).toHaveCount(1);
    // rows = [view, llms]: a plain disclosure menu with no copy action.
    await expect(root.locator('button.copy-page__copy')).toHaveCount(0);
    await expect(root.locator('li.copy-page__item--copy')).toHaveCount(0);
    // No copy action, no live region.
    await expect(root.locator('.copy-page__status')).toHaveCount(0);
    // The menu itself still works: a native details/summary pair with both
    // link rows in order.
    await expect(root.locator('details.copy-page__menu summary.copy-page__toggle')).toHaveCount(1);
    const items = root.locator('li.copy-page__item');
    await expect(items).toHaveCount(2);
    await expect(root.locator('a.copy-page__row--llms')).toHaveAttribute('href', '/llms.txt');
    await expect(root.locator('a.copy-page__row--llms .copy-page__title')).toHaveText('llms.txt');
    // llms is same-origin: target per new_tab, never rel.
    await expect(root.locator('a.copy-page__row--llms')).toHaveAttribute('target', '_blank');
    expect(await root.locator('a.copy-page__row--llms').getAttribute('rel')).toBeNull();
  });
});

test.describe('rows_extra (consumer extension rows)', () => {
  const mdUrl = `${BASE}/docs/post-extra/index.md`;

  test('renders the extra row, enforces https-only, drops unknown slugs', async ({page}) => {
    await page.goto('/docs/post-extra/');
    const root = page.locator('.copy-page');
    // Only view + youcom survive: insecure fails the https gate and bogus
    // is an unknown slug (both drop with a deduplicated warning).
    await expect(root.locator('li.copy-page__item')).toHaveCount(2);
    await expect(root.locator('li.copy-page__item--insecure')).toHaveCount(0);
    await expect(root.locator('li.copy-page__item--bogus')).toHaveCount(0);

    // youcom's endpoint already ends at its "=": only the percent-encoded
    // default-prompt value is appended -- no extra joining characters.
    const defaultPrompt = `Read from ${mdUrl} so I can ask questions about it.`;
    const youcom = root.locator('a.copy-page__row--youcom');
    await expect(youcom).toHaveAttribute(
      'href',
      `https://you.com/search?q=${encodeURIComponent(defaultPrompt)}`,
    );
    await expect(youcom).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    await expect(youcom.locator('.copy-page__title')).toHaveText('Open in You.com');
    // The default description follows the row's own prompt target, and that
    // derivation reaches rows_extra rows too: youcom declares a target of
    // "Markdown", so it describes the Markdown surface without the consumer
    // writing any copy of their own. The mis-cased value is the point -- the
    // target is case-folded once and the normalized form feeds both the href
    // asserted above and this description, so the two can never disagree over
    // a capital letter.
    await expect(youcom.locator('.copy-page__desc')).toHaveText(
      'Ask questions about the Markdown version',
    );

    // new_tab = false via front matter: no target, no external glyph, no
    // new-tab hint on ANY link row.
    expect(await youcom.getAttribute('target')).toBeNull();
    expect(await root.locator('a.copy-page__row--view').getAttribute('target')).toBeNull();
    await expect(root.locator('.copy-page__external')).toHaveCount(0);
    await expect(root.locator('.copy-page__newtab')).toHaveCount(0);
  });
});

test.describe('kill switches', () => {
  test('front matter disable (boolean form) renders nothing', async ({page}) => {
    await page.goto('/docs/post-kill/');
    await expect(page.locator('.copy-page')).toHaveCount(0);
    await expect(page.locator('script[src*="copy-page"]')).toHaveCount(0);
  });

  test('front matter disable (string form) renders nothing', async ({page}) => {
    await page.goto('/docs/post-kill-string/');
    await expect(page.locator('.copy-page')).toHaveCount(0);
    await expect(page.locator('script[src*="copy-page"]')).toHaveCount(0);
  });

  test('the site-wide enable switch strips every widget and script from the build', () => {
    // The killed overlay (hugo --config hugo.toml,killed.toml with
    // params.copy_page.enable = false, built by the runner into
    // fixture/public/killed) must carry no widget root, no widget data
    // attribute, and no widget script on ANY page -- filesystem assertions,
    // because a second server for one switch would be wasteful. The pages
    // checked cover every render path: a default page, the widget-heavy
    // encoding page, the section list, and the paginated output.
    const killedDir = new URL('../fixture/public/killed/', import.meta.url);
    for (const rel of [
      'docs/post-plain/index.html',
      'docs/enc-[matrix]-42/index.html',
      'docs/index.html',
      'docs/page/2/index.html',
    ]) {
      const html = readFileSync(new URL(rel, killedDir), 'utf8');
      expect(html, `${rel} must carry no widget root`).not.toContain('class="copy-page');
      expect(html, `${rel} must carry no widget data attribute`).not.toContain(
        'data-copy-page-url',
      );
      expect(html, `${rel} must carry no widget script`).not.toMatch(/copy-page[^"']*\.js/);
    }
  });
});

test.describe('self-gate (no URL resolves)', () => {
  test('renders nothing when the page drops the markdown format', async ({page}) => {
    await page.goto('/docs/post-noformat/');
    await expect(page.locator('.copy-page')).toHaveCount(0);
    await expect(page.locator('script[src*="copy-page"]')).toHaveCount(0);
  });

  test('renders nothing on the home page (format not wired for the kind)', async ({page}) => {
    await page.goto('/');
    await expect(page.locator('.copy-page')).toHaveCount(0);
    await expect(page.locator('script[src*="copy-page"]')).toHaveCount(0);
  });
});

test.describe('shortcode', () => {
  test('named params: explicit url, rows, toggle label, id', async ({page}) => {
    await page.goto('/docs/post-404/');
    const root = page.locator('#copy-404');
    await expect(root).toHaveCount(1);
    // The explicit url argument wins over format derivation, verbatim.
    await expect(root).toHaveAttribute('data-copy-page-url', '/docs/no-such-twin/index.md');
    await expect(root.locator('.copy-page__toggle-label')).toHaveText('Use this page');
    // rows="copy,view" as a comma-separated string: primary half plus both
    // rows, the copy pair dual-hidden exactly like the partial's.
    const primary = root.locator('button.copy-page__copy');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveAttribute('hidden', '');
    await expect(primary).toHaveAttribute('style', 'display:none');
    await expect(root.locator('li.copy-page__item')).toHaveCount(2);
    await expect(root.locator('a.copy-page__row--view')).toHaveAttribute(
      'href',
      '/docs/no-such-twin/index.md',
    );
  });

  test('positional shorthand: rows only, URL derived from the format', async ({page}) => {
    await page.goto('/docs/post-404/');
    const root = page.locator('.copy-page:not(#copy-404)');
    await expect(root).toHaveCount(1);
    await expect(root).toHaveAttribute('data-copy-page-url', `${BASE}/docs/post-404/index.md`);
    await expect(root.locator('button.copy-page__copy')).toHaveCount(0);
    await expect(root.locator('li.copy-page__item')).toHaveCount(1);
    await expect(root.locator('a.copy-page__row--view')).toHaveAttribute(
      'href',
      `${BASE}/docs/post-404/index.md`,
    );
  });
});

test.describe('section list page', () => {
  test('derives the section twin URL for the widget on /docs/', async ({page}) => {
    await page.goto('/docs/');
    const root = page.locator('.copy-page');
    await expect(root).toHaveCount(1);
    await expect(root).toHaveAttribute('data-copy-page-url', `${BASE}/docs/index.md`);
  });
});
