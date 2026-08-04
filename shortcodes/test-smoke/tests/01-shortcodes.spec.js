/* global process */
// Build-output assertions for the five shortcode modules that ship no suite of
// their own: arxiv-paper, callout, github-repo, hf-space and youtube-embed.
//
// WHAT THIS SUITE IS FOR. Until it existed, nothing in this repository
// rendered these modules' templates except one fixture belonging to another
// module, and nothing asserted a single byte of their output. A parse error, a
// call to a partial that no longer exists, or a rendering that silently lost
// its identity attributes reached consumers with every check green.
//
// WHY IT ASSERTS SO LITTLE PER MODULE, which is the design decision worth
// stating. Every one of these modules fetches remote data at build time, so
// what they emit is not one shape but two: an ENRICHED rendering when the
// fetch succeeded and a DEGRADED one when it did not. Which one a build
// produces is not a property of the code -- it depends on whether the runner
// has network, whether an intercepting proxy answers, and whether Hugo's
// resource cache already holds a response. Asserting the enriched shape would
// make this suite fail on an offline machine; asserting the degraded shape
// would make it fail on a connected one. Both would be assertions about the
// environment wearing the costume of assertions about the code.
//
// So every assertion here holds in BOTH modes. That means the block class and
// the identity attribute -- the one each module derives from its own
// PARAMETER rather than from a response -- plus the absence of the artifacts a
// broken template leaves behind. The variant modifier is deliberately not
// asserted: `--card` and `--inline` are exactly the pair that differs.
//
// The one exception is deliberate and is the point of the second callout call:
// an icon URL under `.invalid`, a TLD RFC 2606 reserves as never resolvable.
// That fetch fails on any runner, immediately rather than by timeout, which
// makes it the only remote failure this fixture can PIN -- and pinning one is
// what turns "the module degrades gracefully" from a claim in a README into
// something a build proves.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(process.env.FIXTURE_PUBLIC ?? join(here, '..', 'fixture', 'public'));
const buildLog = resolve(process.env.HUGO_BUILD_LOG ?? join(here, '..', 'hugo-build.log'));

const html = () => readFileSync(join(publicDir, 'index.html'), 'utf8');
const markdown = () => readFileSync(join(publicDir, 'index.md'), 'utf8');
const log = () => readFileSync(buildLog, 'utf8');

// One row per module: the BEM block it must render, the attribute it derives
// from its own parameter, and the line its Markdown variant emits from that
// same parameter. Nothing here comes from a fetched response.
const MODULES = [
  {
    name: 'github-repo',
    block: 'github-repo',
    identity: 'data-repo="gohugoio/hugo"',
    markdownLine: '[gohugoio/hugo](https://github.com/gohugoio/hugo)',
  },
  {
    name: 'hf-space',
    block: 'hf-space',
    identity: 'data-space="gradio/hello_world"',
    markdownLine: '[gradio/hello_world](https://huggingface.co/spaces/gradio/hello_world)',
  },
  {
    name: 'arxiv-paper',
    block: 'arxiv-paper',
    identity: 'data-arxiv-id="1706.03762"',
    markdownLine: '[arXiv:1706.03762](https://arxiv.org/abs/1706.03762)',
  },
  {
    name: 'youtube-embed',
    block: 'youtube-embed',
    identity: 'data-video-id="dQw4w9WgXcQ"',
    markdownLine: '[Watch on YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)',
  },
  {
    name: 'callout',
    block: 'callout',
    identity: 'data-callout-type="note"',
    markdownLine: '> [!NOTE]',
  },
];

// True when some element carries `block` as a whole class TOKEN. Written as a
// split rather than a pattern because the block name is a prefix of its own
// element and modifier classes: a substring match would accept
// `github-repo__name` as evidence that `github-repo` rendered.
const hasBlock = (source, block) => {
  for (const match of source.matchAll(/class="([^"]*)"/g)) {
    if (match[1].split(/\s+/).includes(block)) return true;
  }
  return false;
};

for (const module of MODULES) {
  test(`${module.name} renders its block and its own identity`, () => {
    const page = html();
    assert.ok(hasBlock(page, module.block), `no element carries the ${module.block} block class`);
    assert.ok(
      page.includes(module.identity),
      `${module.name} must carry ${module.identity}, which it derives from its parameter rather than from a response`,
    );
  });

  test(`${module.name} renders its Markdown variant`, () => {
    // The Markdown twins are the half of each module that only a markdown
    // output format reaches, and no other build in this repository renders
    // them for these five. The asserted line is parameter-derived, so it is
    // present whether or not the fetch that would enrich it succeeded.
    assert.ok(
      markdown().includes(module.markdownLine),
      `the Markdown twin must carry ${module.markdownLine}`,
    );
  });
}

test('no rendering leaks a Go template artifact', () => {
  // The shapes a broken template leaves in published output: a stringified Go
  // map, an unresolved value, a printf verb that met the wrong type, and
  // Hugo's own marker for a value it refused to interpolate. Each is invisible
  // to a build that exits 0.
  for (const [label, source] of [
    ['index.html', html()],
    ['index.md', markdown()],
  ]) {
    for (const artifact of ['map[', '<no value>', 'ZgotmplZ', '%!']) {
      assert.ok(!source.includes(artifact), `${label} must not contain ${artifact}`);
    }
  }
});

test('the build reports no error and no deprecation', () => {
  // WARN is not gated here, unlike every other suite in this repository: a
  // degraded fetch is these modules' documented contract and it warns by
  // design, so a blanket WARN gate would make this suite pass or fail on
  // whether the runner had network. The specific warning that must appear is
  // asserted below; ERROR and deprecation are absolute either way.
  const lines = log().split(/\r?\n/);
  assert.deepEqual(
    lines.filter((line) => /(^|\s)ERROR\s/.test(line)),
    [],
  );
  assert.deepEqual(
    lines.filter((line) => /deprecat/i.test(line)),
    [],
  );
});

test('an unreachable icon degrades the callout instead of failing the build', () => {
  // The graceful-degradation contract, pinned rather than assumed. The icon
  // URL is under `.invalid`, which RFC 2606 reserves as never resolvable, so
  // this failure happens on every runner regardless of network.
  const warnings = log()
    .split(/\r?\n/)
    .filter((line) => line.includes('[callout] Remote icon'));
  assert.equal(warnings.length, 1, 'exactly one warning, deduplicated per icon URL');
  assert.match(warnings[0], /icons\.invalid/);
  assert.match(warnings[0], /Rendering without an icon/);

  // And the rendering itself: the callout is still there, still carries its
  // type, and simply has no image icon.
  const page = html();
  const tip = /<div class="callout callout--tip"[\s\S]*?<\/div>\s*<\/div>/.exec(page);
  assert.ok(tip, 'the tip callout must still render');
  assert.ok(
    !tip[0].includes('callout__icon--image'),
    'the unfetchable icon must be absent rather than emitted broken',
  );
  assert.ok(tip[0].includes('data-callout-type="tip"'));
});

test('every module is actually invoked, so this suite cannot pass vacuously', () => {
  // The failure mode this guards is silent: a fixture that stopped invoking a
  // module would make every assertion above trivially true for it, because
  // each one is a substring search over a page that no longer contains it.
  // Stated as a count over the content source rather than the output, so it
  // names the fixture as the thing that broke.
  const content = readFileSync(join(here, '..', 'fixture', 'content', '_index.md'), 'utf8');
  for (const module of MODULES) {
    assert.ok(
      new RegExp(`\\{\\{<\\s*${module.name}[\\s"]`).test(content),
      `the fixture must invoke ${module.name}`,
    );
  }
});
