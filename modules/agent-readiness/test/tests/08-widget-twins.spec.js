// The widget-twin structural contract.
//
// The widgets fixture imports every widget shortcode module next to
// agent-readiness, and its single regular page calls all eight widget
// shortcodes. Hugo's shortcode template lookup is output-format-aware, so
// the page's Markdown twin (built with .RenderShortcodes) must select each
// module's markdown output variant: compact Markdown citations instead of
// the widget BEM HTML with inline SVG that the default HTML templates emit.
// The structural predicate here -- no `<svg` and no widget BEM class markup
// anywhere in the twin -- is the same predicate consuming sites run in their
// own validators.
//
// NETWORK: the widgets build performs real remote fetches, and CI may be
// tokenless or rate-limited, which the modules degrade from with a warning
// rather than an error. Every assertion below therefore pins only the
// BASELINE lines each markdown variant derives from the shortcode
// parameters alone (citation links, the alert line, the image lines), never
// fetched-only enrichment (stars, likes, authors, metric sentences).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse as parseYaml} from 'yaml';
import {read, exists, widgetsDir, splitFrontMatter, markdownLinks} from './helpers.js';

// Strict YAML with duplicate-key detection, the parser behavior the twins
// exist to satisfy (mirrors 02-twins.spec.js).
const parseStrict = (text) => parseYaml(text, {uniqueKeys: true, strict: true});

const TWIN = 'widgets/demo/index.md';
const ORIGIN = 'https://widgets.example';

// The eight widget BEM blocks. `image` is a substring of `image-gallery`,
// so its check subsumes the gallery's, but the roster stays complete so a
// red result names the exact block that leaked.
const WIDGET_BLOCKS = [
  'github-repo',
  'github-profile',
  'hf-space',
  'arxiv-paper',
  'youtube-embed',
  'callout',
  'image',
  'image-gallery',
];

test('the widgets build publishes the demo page twin', () => {
  assert.ok(exists(TWIN, widgetsDir), `${TWIN} must be published beside the HTML page`);
});

test('the twin contains no inline SVG', () => {
  const text = read(TWIN, widgetsDir);
  assert.ok(!/<svg/i.test(text), 'a widget twin must never embed an <svg element');
});

test('the twin contains no widget BEM class markup', () => {
  const text = read(TWIN, widgetsDir);
  for (const block of WIDGET_BLOCKS) {
    const classAttr = new RegExp(`class=["'][^"']*${block}`);
    assert.ok(
      !classAttr.test(text),
      `the twin must carry no class= attribute naming the ${block} block`,
    );
  }
});

test('github-repo degrades to the owner/repo citation link', () => {
  const body = splitFrontMatter(read(TWIN, widgetsDir)).body;
  assert.ok(
    body.includes('[gohugoio/hugo](https://github.com/gohugoio/hugo)'),
    'the repo citation link derives from the url parameter alone',
  );
});

test('github-profile carries the profile link', () => {
  const body = splitFrontMatter(read(TWIN, widgetsDir)).body;
  assert.ok(
    markdownLinks(body).some((l) => l.url === 'https://github.com/alex-feel'),
    'the profile link derives from the user parameter alone',
  );
});

test('hf-space degrades to the owner/name citation link', () => {
  const body = splitFrontMatter(read(TWIN, widgetsDir)).body;
  assert.ok(
    body.includes('[gradio/hello_world](https://huggingface.co/spaces/gradio/hello_world)'),
    'the Space citation link derives from the id parameter alone',
  );
});

test('arxiv-paper degrades to the arXiv abs link', () => {
  const body = splitFrontMatter(read(TWIN, widgetsDir)).body;
  assert.ok(
    body.includes('[arXiv:1706.03762](https://arxiv.org/abs/1706.03762)'),
    'the abs-page link derives from the id parameter alone',
  );
});

test('youtube-embed emits the titled watch link with the bracketed title escaped', () => {
  const body = splitFrontMatter(read(TWIN, widgetsDir)).body;
  assert.ok(
    body.includes(
      '[Never Gonna Give You Up \\[Official Video\\]](https://www.youtube.com/watch?v=dQw4w9WgXcQ)',
    ),
    'the watch link derives from id and title alone, with the bracketed title escaped',
  );
  const link = markdownLinks(body).find(
    (l) => l.url === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  assert.ok(link, 'the escaped-bracket link must survive the markdownLinks sweep');
  assert.equal(link.text, 'Never Gonna Give You Up \\[Official Video\\]');
});

test('callout emits the GitHub-alert blockquote with title and body', () => {
  const body = splitFrontMatter(read(TWIN, widgetsDir)).body;
  assert.ok(body.includes('> [!WARNING] Mind the gap'), 'the alert line carries the title');
  assert.ok(body.includes('> A warning body with **bold** Markdown.'));
  assert.ok(body.includes('> - First hazard item'));
  assert.ok(body.includes('> - Second hazard item'));
});

test('image emits the image line with the caption directly below it', () => {
  const body = splitFrontMatter(read(TWIN, widgetsDir)).body;
  assert.ok(
    body.includes(`![A sample photo](${ORIGIN}/widgets/demo/photo.png)\nA sample photo caption`),
    'the image line and its caption derive from the bundle resource and parameters alone',
  );
});

test('image-gallery emits one image line per bundle resource', () => {
  const body = splitFrontMatter(read(TWIN, widgetsDir)).body;
  assert.ok(
    body.includes(
      `![First gallery image](${ORIGIN}/widgets/demo/gallery/one.png)\nGallery caption one`,
    ),
  );
  assert.ok(
    body.includes(
      `![Second gallery image](${ORIGIN}/widgets/demo/gallery/two.png)\nGallery caption two`,
    ),
  );
});

test('the twin still parses as front matter plus body', () => {
  const {frontMatter, body} = splitFrontMatter(read(TWIN, widgetsDir));
  assert.ok(frontMatter, 'the twin must open with a front-matter block');
  const fm = parseStrict(frontMatter);
  assert.equal(fm.title, 'Widget Demo');
  assert.equal(fm.canonical, `${ORIGIN}/widgets/demo/`, 'canonical is the page HTML URL');
  assert.ok(
    body.includes('Opening prose ahead of the widgets.'),
    'the surrounding Markdown prose survives .RenderShortcodes',
  );
  assert.ok(body.includes('Closing prose after the widgets.'));
});
