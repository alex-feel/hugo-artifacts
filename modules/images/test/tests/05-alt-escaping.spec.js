// Escaping and URL-neutralization contract: hostile alt text appears only
// in escaped form, decorative images carry exactly alt="", hostile captions
// are stripped by goldmark's default security settings, and author-supplied
// javascript: URLs are neutralized by contextual auto-escaping.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, rawHtml} from './helpers.js';

const page = dom('bundle/index.html');
const raw = rawHtml('bundle/index.html');

test('hostile alt text appears only in escaped form', () => {
  assert.ok(
    raw.includes('alt="&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &#34; &amp; &#39;"'),
    'the hostile alt must be attribute-escaped',
  );
});

test('no raw script tag reaches the output anywhere on the page', () => {
  assert.ok(!raw.includes('<script'), 'raw <script must never appear');
});

test('a decorative image emits exactly alt=""', () => {
  const picture = page.querySelector('#sc-decorative');
  assert.match(picture.getAttribute('class'), /\bimage--decorative\b/);
  const img = picture.querySelector('img');
  assert.equal(img.getAttribute('alt'), '');
  assert.ok(raw.includes('alt="" loading='), 'the empty alt is emitted literally');
});

test('a hostile caption is stripped by goldmark (unsafe = false)', () => {
  const figure = page.querySelector('#sc-hostile-caption');
  const caption = figure.querySelector('.image__caption');
  assert.ok(caption, 'the caption element renders');
  assert.ok(!caption.innerHTML.includes('<script'), 'the script tag is stripped');
});

test('hostile URLs neutralize to #ZgotmplZ instead of a live javascript: scheme', () => {
  const license = page.querySelector('#sc-hostile-license .image__license');
  assert.equal(license.getAttribute('href'), '#ZgotmplZ');
  const hook = page.querySelectorAll('img').find((i) => i.getAttribute('alt') === 'x');
  assert.equal(hook.getAttribute('src'), '#ZgotmplZ');
  assert.ok(!raw.includes('javascript:'), 'no live javascript: URL survives');
});
