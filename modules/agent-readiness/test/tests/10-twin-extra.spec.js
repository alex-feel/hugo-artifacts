// The twin-extra hook contract, and the consumer-side agent_sitemap_heading
// override that wins over both of the module's target-derived defaults.
//
// The module ships no layouts/_partials/agent-readiness/twin-extra.html of
// its own -- the extra fixture is the one place a real hook partial exists,
// so it is the only build in which the hook's placement (between the body
// and the roster/pointer sections), its membership gating (inherited from
// the renderer, so an excluded page's twin stays entirely unpublished), and
// its trim/pad discipline (TrimSpace'd, prefixed with exactly one blank
// line when non-empty) can all be proven at once. The fixture also ships an
// i18n/en.toml agent_sitemap_heading override, so the same build proves the
// consumer-side override wins over BOTH agent_sitemap_heading_sitemap and
// agent_sitemap_heading_llms in agent-readiness/config.html -- this fixture
// never touches markdown.sitemap_section_target, so the module's default
// target ("llms") is the one the override must beat.
import {test as nodeTest} from 'node:test';
import assert from 'node:assert/strict';
import {read, exists, extraDir, splitFrontMatter, warnCount} from './helpers.js';

// Mutation-to-test attribution rests entirely on test titles: a red result
// must trace to exactly one test, so a reused title makes it untraceable.
const registeredTitles = [];
function test(title, fn) {
  registeredTitles.push(title);
  return nodeTest(title, fn);
}

const ORIGIN = 'https://extra.example';

// The hook's own output, after strings.TrimSpace -- exactly what
// layouts/_partials/agent-readiness/twin-extra.html in this fixture emits.
// "Search page" reads $cfg.search_page_path, untouched by this fixture's
// configuration, so its value is the shipped default "/search".
const hookBlock = (title) => `## Extra facts\n\n- Page: ${title}\n- Search page: /search`;

// The trailing pointer block, byte-exact: the consumer's agent_sitemap_heading
// override ("Custom heading") in place of either shipped default.
const POINTER = `\n\n## Custom heading\n\n- [llms.txt](${ORIGIN}/llms.txt)\n`;

test('the extra build produces zero warnings', () => {
  // Every guard this build could trip is deliberately absent: the fixture
  // configures nothing malformed, so a red result here means the hook itself,
  // or the override, introduced an unexpected warning path.
  assert.equal(warnCount(/./, 'extra'), 0, 'the extra build must warn about nothing');
});

test('the included page twin carries the hook output exactly once, between body and trailer', () => {
  const text = read('extra/included/index.md', extraDir);
  const block = hookBlock('Included Page');
  const first = text.indexOf(block);
  const last = text.lastIndexOf(block);
  assert.notEqual(first, -1, 'the hook block must appear in the twin');
  assert.equal(first, last, 'the hook block must appear exactly once');

  const pagesHeading = text.indexOf('## Pages');
  const trailerHeading = text.indexOf('## Custom heading');
  assert.ok(trailerHeading !== -1, 'the trailer heading must appear');
  assert.ok(first < trailerHeading, 'the hook block must precede the trailer heading');
  if (pagesHeading !== -1) {
    assert.ok(first < pagesHeading, 'the hook block must precede any roster heading');
  }

  // Prose content precedes the hook block, so the hook is genuinely AFTER
  // the body rather than merely present somewhere in the document.
  const bodyIndex = text.indexOf('Included page prose.');
  assert.ok(bodyIndex !== -1 && bodyIndex < first, 'the body must precede the hook block');
});

test('the section twin carries the hook output', () => {
  const text = read('blog/index.md', extraDir);
  assert.ok(text.includes(hookBlock('Blog')), 'the Blog section twin must carry the hook block');
});

test('the home twin carries the hook output', () => {
  const text = read('index.md', extraDir);
  assert.ok(
    text.includes(hookBlock('Extra Fixture Home')),
    'the home twin must carry the hook block',
  );
});

test('the excluded page has no twin file', () => {
  // Membership is inherited from the renderer's outer if: the hook runs only
  // for pages that publish a twin at all, so an `agent: false` page must stay
  // entirely unpublished, hook or no hook.
  assert.ok(
    !exists('extra/excluded/index.md', extraDir),
    'no twin may exist for the excluded page',
  );
  assert.ok(
    exists('extra/excluded/index.html', extraDir),
    'the HTML page must still build; only the twin is withheld',
  );
});

test("the front-matter-only page's twin body is byte-exact", () => {
  // No description, no date, no per-section frontmatter keys, and an empty
  // .RenderShortcodes body -- so the body is exactly the hook's own \n\n
  // prefix, its trimmed block, and the trailing pointer section.
  const text = read('extra/frontmatter-only/index.md', extraDir);
  const {frontMatter, body} = splitFrontMatter(text);
  assert.ok(frontMatter, 'the twin must still carry a front-matter block');
  assert.match(frontMatter, /^title: "Front Matter Only Page"$/m);

  const expectedBody = `\n\n${hookBlock('Front Matter Only Page')}${POINTER}`;
  assert.equal(body, expectedBody, "the body must be exactly the hook's output plus the trailer");
});

test("every fixture-extra twin's trailer heading is the consumer override", () => {
  for (const rel of [
    'index.md',
    'blog/index.md',
    'blog/post-one/index.md',
    'extra/included/index.md',
    'extra/frontmatter-only/index.md',
  ]) {
    const text = read(rel, extraDir);
    assert.ok(text.endsWith(POINTER), `${rel} must end with the override-heading pointer block`);
    assert.ok(
      !text.includes('## Site index'),
      `${rel} must not carry the shipped llms-target default`,
    );
    assert.ok(
      !text.includes('## Sitemap\n'),
      `${rel} must not carry the shipped sitemap-target default`,
    );
  }
});

test('every test title in this file is unique', () => {
  assert.equal(
    new Set(registeredTitles).size,
    registeredTitles.length,
    'a duplicated title makes a red result untraceable to the assertion that produced it',
  );
});
