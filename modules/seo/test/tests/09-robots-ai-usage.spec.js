// The robots directive survives the module's own opinions about it.
//
// The resolver used to carry a list of tokens it believed dead and delete them
// from the consumer's string. Google retired noarchive and nocache, so the list
// held both; Bing did not retire them, having repurposed the pair in September
// 2023 so that noarchive keeps a page out of Bing Chat answers and out of
// training Microsoft's generative-AI models, while nocache allows the URL,
// title and snippet only. The list therefore deleted the only meta-robots
// control a consumer has over that, and the same slice gated the per-bot loop,
// so even the `<meta name="bingbot">` form Bing documents never reached the
// page -- while the warn told the consumer to remove the directive.
//
// The list is gone rather than corrected: which tokens are dead is a per-vendor
// judgment that goes stale silently, and a token a crawler does not read costs
// nothing. So these assertions pin PASS-THROUGH, including for a token no
// engine reads, which is the case a narrowed list would still get wrong.
//
// Asserted on the baseline build because it is the only production one: every
// named environment force-adds noindex, nofollow, which would bury the tokens
// under a directive the page never asked for.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, warnCount, PAGES} from './helpers.js';

const AUTHORED = 'noarchive, nocache, nositelinkssearchbox';

function metaContent(name) {
  return dom(PAGES.robotsAiUsage)
    .querySelectorAll('head meta')
    .filter((el) => el.getAttribute('name') === name)
    .map((el) => el.getAttribute('content'));
}

test('the all-bots directive is the authored token list, in order', () => {
  // Exact equality rather than three substring matches: it catches a token
  // silently dropped, a token reordered, and a token invented, at once.
  const robots = metaContent('robots');
  assert.equal(robots.length, 1, 'exactly one generic robots tag');
  assert.equal(robots[0], AUTHORED);
});

test('a per-bot directive carries the same tokens', () => {
  // The per-bot loop reduces its own copy of the sources, so it filtered
  // against the same list and needs its own proof. This is the spelling Bing's
  // documentation recommends for scoping the pair to Bing alone.
  const bing = metaContent('bingbot');
  assert.equal(bing.length, 1, 'exactly one bingbot tag');
  assert.equal(bing[0], AUTHORED);
});

test('nothing warns about the tokens and nothing is deleted', () => {
  // The absence assertion is the point: any future re-introduction of a
  // liveness list would announce itself here rather than in a consumer's
  // silently shortened directive.
  assert.match(metaContent('robots')[0], /\bnositelinkssearchbox\b/);
  assert.equal(warnCount(/robots directive on/), 0);
});
