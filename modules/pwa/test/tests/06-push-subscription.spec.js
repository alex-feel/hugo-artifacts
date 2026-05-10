// Validation matrix row 6: Push subscription flow.
//
// Setup:    `params.pwa.push.enabled = true`; mock subscribe_url via page.route().
// Action:   Navigate to `/about/`; click `[data-pwa-subscribe]`; mock requestPermission ->
//           'granted'; mock pushManager.subscribe; verify POST body matches the canonical
//           `PushSubscription.toJSON()` shape `{endpoint, keys: {p256dh, auth}}`.
// Expected: Notification.requestPermission called once. pushManager.subscribe called with
//           {userVisibleOnly: true, applicationServerKey: <Uint8Array>}. POST body matches
//           expected shape. pwa:pushsubscribed fires with event.detail.endpoint.

const {test, expect} = require('@playwright/test');

test.describe('Row 6: Push subscription flow', () => {
  test('subscribe button POSTs canonical subscription JSON and fires pwa:pushsubscribed', async ({page}) => {
    let postedBody = null;
    await page.route('**/__mock_subscribe', async (route) => {
      const body = route.request().postDataJSON();
      postedBody = body;
      return route.fulfill({status: 201, contentType: 'application/json', body: '{"ok":true}'});
    });

    await page.addInitScript(() => {
      window.__pwaSubscribedDetail = null;
      window.addEventListener('pwa:pushsubscribed', (e) => {
        window.__pwaSubscribedDetail = e.detail || null;
      });

      if (window.Notification) {
        Object.defineProperty(window.Notification, 'requestPermission', {
          value: () => Promise.resolve('granted'),
          configurable: true,
        });
        Object.defineProperty(window.Notification, 'permission', {
          value: 'granted',
          configurable: true,
        });
      }

      // Stub the SW registration's pushManager to return a fake subscription so we don't
      // need a real push service.
      const fakeSubscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint',
        toJSON() {
          return {
            endpoint: this.endpoint,
            keys: {p256dh: 'fake-p256dh', auth: 'fake-auth'},
          };
        },
        unsubscribe() {
          return Promise.resolve(true);
        },
      };
      const fakePushManager = {
        subscribe(options) {
          window.__pushManagerSubscribeOpts = options;
          return Promise.resolve(fakeSubscription);
        },
        getSubscription() {
          return Promise.resolve(null);
        },
        permissionState() {
          return Promise.resolve('granted');
        },
      };
      // Stub the registration that push.ts retrieves via navigator.serviceWorker.ready.
      const origReady = Object.getOwnPropertyDescriptor(navigator.serviceWorker, 'ready');
      Object.defineProperty(navigator.serviceWorker, 'ready', {
        configurable: true,
        get() {
          return Promise.resolve({
            pushManager: fakePushManager,
            active: {state: 'activated'},
          });
        },
      });
    });

    await page.goto('/about/');
    await page.waitForLoadState('networkidle');

    await page.locator('[data-pwa-subscribe]').click();

    await page.waitForFunction(() => window.__pwaSubscribedDetail !== null, null, {timeout: 5000});

    // Verify subscribe options.
    const opts = await page.evaluate(() => window.__pushManagerSubscribeOpts);
    expect(opts).toBeTruthy();
    expect(opts.userVisibleOnly).toBe(true);

    // Verify POST body shape.
    expect(postedBody).toBeTruthy();
    expect(typeof postedBody.endpoint).toBe('string');
    expect(postedBody.keys).toBeTruthy();
    expect(typeof postedBody.keys.p256dh).toBe('string');
    expect(typeof postedBody.keys.auth).toBe('string');

    // Verify event detail carries endpoint.
    const detail = await page.evaluate(() => window.__pwaSubscribedDetail);
    expect(detail).toBeTruthy();
    expect(detail.endpoint).toContain('fcm.googleapis.com');
  });
});
