// Server-rendered markup: exact hrefs (including the encoding matrix), link
// attributes per scheme, and the no-JavaScript baseline (action buttons stay
// hidden, intent links fully work).
import {test, expect} from '@playwright/test';

const BASE = 'http://localhost:1414';

test.use({javaScriptEnabled: false});

test.describe('plain post (default configuration)', () => {
  const pageUrl = `${BASE}/blog/post-plain/`;
  const encUrl = encodeURIComponent(pageUrl);
  const encTitle = encodeURIComponent('Plain Post');
  const encTitleUrl = encodeURIComponent(`Plain Post ${pageUrl}`);

  test('renders the default bar with correct intent links', async ({page}) => {
    await page.goto('/blog/post-plain/');
    const nav = page.locator('nav.social-share');
    await expect(nav).toHaveAttribute('aria-label', 'Share this page');
    await expect(nav).toHaveAttribute('data-share-url', pageUrl);
    await expect(nav).toHaveAttribute('data-share-title', 'Plain Post');
    await expect(nav.locator('li.social-share__item')).toHaveCount(12);

    // Site params supply via/hashtags; the module strips the leading @ / #.
    await expect(nav.locator('a[data-share-network="x"]')).toHaveAttribute(
      'href',
      `https://x.com/intent/post?hashtags=hugo%2Csharing&text=${encTitle}&url=${encUrl}&via=example`,
    );
    await expect(nav.locator('a[data-share-network="facebook"]')).toHaveAttribute(
      'href',
      `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`,
    );
    await expect(nav.locator('a[data-share-network="linkedin"]')).toHaveAttribute(
      'href',
      `https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}`,
    );
    await expect(nav.locator('a[data-share-network="reddit"]')).toHaveAttribute(
      'href',
      `https://www.reddit.com/submit?title=${encTitle}&type=LINK&url=${encUrl}`,
    );
    await expect(nav.locator('a[data-share-network="bluesky"]')).toHaveAttribute(
      'href',
      `https://bsky.app/intent/compose?text=${encTitleUrl}`,
    );
    await expect(nav.locator('a[data-share-network="threads"]')).toHaveAttribute(
      'href',
      `https://www.threads.com/intent/post?text=${encTitle}&url=${encUrl}`,
    );
    await expect(nav.locator('a[data-share-network="telegram"]')).toHaveAttribute(
      'href',
      `https://t.me/share/url?text=${encTitle}&url=${encUrl}`,
    );
    await expect(nav.locator('a[data-share-network="whatsapp"]')).toHaveAttribute(
      'href',
      `https://wa.me/?text=${encTitleUrl}`,
    );
  });

  test('mastodon uses the official sharer with a fragment, never a query', async ({page}) => {
    await page.goto('/blog/post-plain/');
    const href = await page.locator('a[data-share-network="mastodon"]').getAttribute('href');
    expect(href).toBe(`https://share.joinmastodon.org/#text=${encTitleUrl}`);
    expect(href).not.toContain('?');
  });

  test('external links carry rel, target, and a hidden new-tab hint', async ({page}) => {
    await page.goto('/blog/post-plain/');
    const x = page.locator('a[data-share-network="x"]');
    await expect(x).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    await expect(x).toHaveAttribute('target', '_blank');
    await expect(x.locator('.social-share__hint')).toHaveText('(opens in a new window)');
  });

  test('mailto links carry neither target nor rel', async ({page}) => {
    await page.goto('/blog/post-plain/');
    const email = page.locator('a[data-share-network="email"]');
    await expect(email).toHaveAttribute('href', `mailto:?body=${encTitleUrl}&subject=${encTitle}`);
    await expect(email).not.toHaveAttribute('target', /.+/);
    await expect(email).not.toHaveAttribute('rel', /.+/);
  });

  test('action buttons stay hidden without JavaScript', async ({page}) => {
    await page.goto('/blog/post-plain/');
    await expect(page.locator('li.social-share__item--webshare')).toBeHidden();
    await expect(page.locator('li.social-share__item--copy')).toBeHidden();
    await expect(page.locator('nav.social-share')).not.toHaveClass(/social-share--enhanced/);
  });
});

test.describe('encoding matrix post', () => {
  const pageUrl = `${BASE}/blog/post-encoding/`;
  const encUrl = encodeURIComponent(pageUrl);
  const nastyTitle = 'Tips & Tricks: 50% off + more \u{1F680} <"quoted"> second line‮';
  const nastyDescription = 'Ampersand & percent % plus + emoji \u{1F680} line break';
  const encTitle = encodeURIComponent(nastyTitle);
  const encTitleUrl = encodeURIComponent(`${nastyTitle} ${pageUrl}`);
  const encDescription = encodeURIComponent(nastyDescription);

  test('newlines collapse and every special character encodes exactly once', async ({page}) => {
    await page.goto('/blog/post-encoding/');
    const nav = page.locator('nav.social-share');
    // The raw title contains a newline; the attribute must carry the
    // collapsed single-line form.
    await expect(nav).toHaveAttribute('data-share-title', nastyTitle);
    await expect(nav.locator('a[data-share-network="bluesky"]')).toHaveAttribute(
      'href',
      `https://bsky.app/intent/compose?text=${encTitleUrl}`,
    );
    await expect(nav.locator('a[data-share-network="email"]')).toHaveAttribute(
      'href',
      `mailto:?body=${encTitleUrl}&subject=${encTitle}`,
    );
  });

  test('scheme links survive contextual autoescaping via safeURL', async ({page}) => {
    await page.goto('/blog/post-encoding/');
    const viber = await page.locator('a[data-share-network="viber"]').getAttribute('href');
    expect(viber).toBe(`viber://forward?text=${encTitleUrl}`);
    const sms = await page.locator('a[data-share-network="sms"]').getAttribute('href');
    expect(sms).toBe(`sms:?body=${encTitleUrl}`);
  });

  test('image-aware and instance-backed targets resolve correctly', async ({page}) => {
    await page.goto('/blog/post-encoding/');
    const encMedia = encodeURIComponent(`${BASE}/img/cover.png`);
    await expect(page.locator('a[data-share-network="pinterest"]')).toHaveAttribute(
      'href',
      `https://www.pinterest.com/pin/create/button/?description=${encDescription}&media=${encMedia}&url=${encUrl}`,
    );
    await expect(page.locator('a[data-share-network="lemmy"]')).toHaveAttribute(
      'href',
      `https://lemmy.world/create_post?title=${encTitle}&url=${encUrl}`,
    );
    await expect(page.locator('a[data-share-network="farcaster"]')).toHaveAttribute(
      'href',
      `https://farcaster.xyz/~/compose?embeds%5B%5D=${encUrl}&text=${encTitle}`,
    );
  });

  test('a networks_extra endpoint with its own query joins with an ampersand', async ({page}) => {
    await page.goto('/blog/post-encoding/');
    await expect(page.locator('a[data-share-network="customq"]')).toHaveAttribute(
      'href',
      `https://example.com/share?v=1&t=${encTitle}&u=${encUrl}`,
    );
  });
});

test.describe('networks post (front matter overrides plus shortcode)', () => {
  test('renders two distinctly labeled bars', async ({page}) => {
    await page.goto('/blog/post-networks/');
    const navs = page.locator('nav.social-share');
    await expect(navs).toHaveCount(2);
    // The shortcode bar sits inside the article content, before the
    // layout-level partial bar.
    await expect(navs.nth(0)).toHaveAttribute('aria-label', 'Share via messengers');
    await expect(navs.nth(0)).toHaveClass(/content-share/);
    await expect(navs.nth(0).locator('a[data-share-network]')).toHaveCount(2);
    await expect(navs.nth(1)).toHaveAttribute('aria-label', 'Share this page');
  });

  test('front matter disables new_tab and renders the markdown heading', async ({page}) => {
    await page.goto('/blog/post-networks/');
    const x = page.locator('a[data-share-network="x"]');
    await expect(x).not.toHaveAttribute('target', /.+/);
    await expect(x.locator('.social-share__hint')).toHaveCount(0);
    const heading = page.locator('nav.social-share').nth(1).locator('.social-share__heading');
    await expect(heading).toHaveText('Share this post');
    await expect(heading.locator('strong')).toHaveText('this');
  });

  test('exactly one module script is emitted for two bars', async ({page}) => {
    await page.goto('/blog/post-networks/');
    const scripts = page.locator('script[src*="social-share"]');
    await expect(scripts).toHaveCount(1);
    await expect(scripts).toHaveAttribute('integrity', /^sha256-/);
  });
});
