// Markdown output variants: with the built-in `markdown` output format wired
// for the page kind, .RenderShortcodes selects image.markdown.md and
// image-gallery.markdown.md, so every Markdown twin (index.md beside
// index.html) carries compact pure-Markdown image lines -- the ORIGINAL
// resource's absolute permalink, the raw URL for remote sources, absURL for
// static paths -- with caption lines below their image lines, deterministic
// gallery ordering, and zero HTML: no picture/img/svg tags and no
// image/image-gallery BEM class attributes. Adding the output format only
// ADDS .md files; the HTML render contract is untouched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rawHtml, dom, publishedNonEmpty} from './helpers.js';

const ORIGIN = 'http://localhost:1515';

// The twin is plain text; normalize line endings so the shape assertions
// hold regardless of the platform hugo wrote the file on.
function twin(rel) {
  return rawHtml(rel).replace(/\r\n/g, '\n');
}

const md = twin('markdown-variants/index.md');

test('the twin renders each image shortcode as one absolute-URL Markdown image line', () => {
  assert.ok(
    md.includes(`![A page-resource markdown scene](${ORIGIN}/markdown-variants/local-photo.png)`),
    'page resource emits the original absolute permalink',
  );
  assert.ok(
    md.includes(`![A global markdown scene](${ORIGIN}/images/global-1200.png)`),
    'global resource emits the original absolute permalink',
  );
  assert.ok(
    md.includes('![A remote markdown scene](https://example.com/remote-photo.jpg)'),
    'remote source emits the raw URL verbatim',
  );
  assert.ok(
    md.includes(`![A static markdown icon](${ORIGIN}/static-icon.png)`),
    'static path emits its absolute site URL',
  );
  assert.ok(
    md.includes(`![A positional markdown scene](${ORIGIN}/markdown-variants/local-photo.png)`),
    'the two-positional shorthand renders',
  );
});

test('a caption becomes a plain-text line directly below its image line', () => {
  assert.ok(
    md.includes(
      `![A captioned markdown scene](${ORIGIN}/markdown-variants/local-photo.png)\nA *fine* caption`,
    ),
  );
});

test('decorative images render the empty label', () => {
  assert.ok(md.includes(`![](${ORIGIN}/markdown-variants/local-photo.png)`));
});

test('square brackets in alt text are backslash-escaped in the label', () => {
  assert.ok(
    md.includes(`![A \\[bracketed\\] alt probe](${ORIGIN}/markdown-variants/local-photo.png)`),
  );
});

test('the gallery emits one image line per matched resource, in match order, with captions', () => {
  const expected = [
    `![Amber tile one](${ORIGIN}/markdown-variants/mdgallery/m1.png)\nAmber caption one`,
    `![Amber tile two](${ORIGIN}/markdown-variants/mdgallery/m2.png)`,
    `![Amber tile three](${ORIGIN}/markdown-variants/mdgallery/m3.png)\nAmber caption three`,
  ].join('\n\n');
  assert.ok(md.includes(expected), 'ordered blocks, blank-line separated, captions only where set');
});

test('every same-origin destination in the twin resolves to a published file', () => {
  const destinations = [...md.matchAll(/\]\((http:\/\/localhost:1515\/[^)]+)\)/g)].map((m) =>
    m[1].slice(ORIGIN.length),
  );
  assert.ok(destinations.length >= 7, 'the twin carries the expected same-origin URLs');
  for (const url of destinations) {
    assert.ok(publishedNonEmpty(url), `expected a published file behind ${url}`);
  }
});

test('the twin is pure Markdown: no picture/img/svg tags, no module BEM class attributes', () => {
  assert.doesNotMatch(md, /<picture\b/i);
  assert.doesNotMatch(md, /<img\b/i);
  assert.doesNotMatch(md, /<svg\b/i);
  assert.doesNotMatch(md, /<figure\b/i);
  assert.ok(!md.includes('class="image'), 'no image block class attribute');
  assert.ok(!md.includes('image__'), 'no image element class');
  assert.ok(!md.includes('image--'), 'no image modifier class');
  assert.ok(!md.includes('image-gallery'), 'no gallery block or element class');
});

test('the enable kill switch changes nothing in the twin: the neutral form is already Markdown', () => {
  const disabled = twin('disabled/index.md');
  assert.ok(
    disabled.includes(`![A disabled-pipeline image](${ORIGIN}/images/global-1200.png)`),
    'the shortcode still emits the original-URL image line under img.enable=false',
  );
  assert.ok(
    disabled.includes('![Disabled markdown image](images/global-1200.png)'),
    'surrounding Markdown (a hook-only image) passes through .RenderShortcodes untouched',
  );
});

test('a gallery item without alt metadata degrades to the empty label, in order', () => {
  const bundle = twin('bundle/index.md');
  const expected = [
    `![Purple rectangle one](${ORIGIN}/bundle/gallery/g1.png)\nGallery one`,
    `![Blue rectangle two](${ORIGIN}/bundle/gallery/g2.png)\nGallery two`,
    `![](${ORIGIN}/bundle/gallery/g3.png)\nGallery three`,
  ].join('\n\n');
  assert.ok(bundle.includes(expected), 'the alt-less third item renders the empty label');
});

test('the added output format leaves the HTML render of the same page intact', () => {
  const page = dom('markdown-variants/index.html');
  assert.ok(page.querySelectorAll('picture').length >= 1, 'processed pictures still render');
  assert.ok(page.querySelector('ol.image-gallery'), 'the HTML gallery still renders');
});
