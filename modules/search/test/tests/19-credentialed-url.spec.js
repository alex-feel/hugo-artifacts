// A page navigated with credentials embedded in the URL (the
// https://user:pass@host/ form that sites behind shared basic auth are
// opened with) keeps those credentials in the document's base URL, and the
// Fetch standard rejects any request whose resolved URL carries them. The
// backend therefore absolutizes the index URL through location.href -- which
// never exposes userinfo -- before fetching, and this spec locks that: a
// credentialed navigation must still produce results, never the error
// alert. The auth-demanding proxy below is load-bearing twice over: against
// a server that never sends 401, Chromium commits a credential-STRIPPED
// document URL and the failure cannot occur, and a route-fulfilled 401
// bypasses the browser's real HTTP auth machinery, so only a genuine
// network-level challenge makes the browser answer from the URL's userinfo
// and commit the URL with it intact. The worker=false patch is load-bearing
// too: inside a Web Worker the fetch resolves against the worker SCRIPT's
// credential-free URL, so worker mode never trips the failure and only the
// main-thread backend exercises the document base this spec exists to cover.
/* global URL, process, Buffer, fetch, document, MutationObserver */
import http from 'node:http';
import {test, expect} from '@playwright/test';

const FIXTURE = process.env.FIXTURE_URL || 'http://localhost:1515';
let proxy;
let proxyPort;

test.beforeAll(async () => {
  proxy = http.createServer(async (req, res) => {
    if (!req.headers.authorization) {
      res.writeHead(401, {'WWW-Authenticate': 'Basic realm="fixture"'});
      res.end();
      return;
    }
    const upstream = await fetch(FIXTURE + req.url);
    const body = Buffer.from(await upstream.arrayBuffer());
    const headers = Object.fromEntries(upstream.headers.entries());
    // fetch already decompressed the body, so the encoding headers would
    // describe bytes that no longer exist.
    delete headers['content-encoding'];
    delete headers['content-length'];
    res.writeHead(upstream.status, headers);
    res.end(body);
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  proxyPort = proxy.address().port;
});

test.afterAll(async () => {
  await new Promise((resolve) => proxy.close(resolve));
});

test('search works on a page opened with credentials embedded in the URL', async ({page}) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const inline = document.querySelector('.search--inline');
      if (inline) {
        const options = JSON.parse(inline.dataset.searchOptions || '{}');
        options.worker = false;
        inline.dataset.searchOptions = JSON.stringify(options);
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto(`http://user:pass@127.0.0.1:${proxyPort}/`);
  expect(new URL(page.url()).username).toBe('user');

  const root = page.locator('.search--inline');
  await expect(root).toHaveClass(/search--enhanced/);
  const input = root.locator('.search__input');

  await input.fill('gravity');
  await expect(root.locator('.search__option')).toHaveCount(2);
  await expect(root.locator('.search__alert')).toBeEmpty();
});
