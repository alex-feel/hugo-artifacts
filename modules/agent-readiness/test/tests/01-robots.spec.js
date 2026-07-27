// The generated robots.txt, and the shadowing hazard.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {read, exists, minimalDir, shadowDir, warnCount, moduleRoot} from './helpers.js';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

const robots = () => read('robots.txt');

test('the DEFAULT robots.txt is byte-exact', () => {
  // Regression lock for the defect commit d0bdfe7 fixed: with no bots, no
  // extra lines and no Content-Signal -- the commonest shape of all, and the
  // one a consumer gets on import -- the document emitted a doubled blank
  // line and no trailing newline. That fix shipped with no test, because
  // both existing environments deliberately configure everything.
  //
  // Asserted as whole-file equality on purpose. The Sitemap assertion further
  // down uses an /m regex, whose ^ and $ are line anchors, so it passes
  // identically with one blank line, two blank lines, or none, and with or
  // without a terminating newline -- it cannot see this class of defect at
  // all. Only byte equality can.
  assert.equal(
    read('robots.txt', minimalDir),
    'User-agent: *\nAllow: /\n\nSitemap: https://fixture.example/sitemap.xml\n',
  );
});

test('the catch-all group carries the Content-Signal line inside it', () => {
  const text = robots();
  const lines = text.split('\n');
  const star = lines.indexOf('User-agent: *');
  assert.ok(star >= 0, 'a User-agent: * group must exist');

  // The next group boundary is the following blank line.
  const rest = lines.slice(star + 1);
  const groupEnd = rest.findIndex((l) => l.trim() === '');
  const group = rest.slice(0, groupEnd === -1 ? rest.length : groupEnd);

  assert.ok(
    group.some((l) => l === 'Content-Signal: search=yes, ai-train=yes, ai-input=yes'),
    'Content-Signal belongs INSIDE the catch-all group, per the contentsignals.org convention',
  );
  assert.ok(group.includes('Allow: /'));
});

test('one group per configured token, resolved through the registry', () => {
  const text = robots();
  for (const token of ['GPTBot', 'ClaudeBot', 'CCBot']) {
    const matches = text.split('\n').filter((l) => l === `User-agent: ${token}`);
    assert.equal(matches.length, 1, `exactly one User-agent group for ${token}`);
  }
});

test('an unknown registry key is skipped, never emitted as a literal', () => {
  // A registry key in a User-agent line matches no crawler and silently does
  // nothing, which is strictly worse than the group being absent.
  assert.ok(!robots().includes('not-a-real-bot-key'));
  assert.equal(warnCount(/unknown robots bot key/), 1, 'exactly one deduplicated warning');
});

test('no retired token ever reaches the served file', () => {
  const text = robots();
  assert.ok(!text.includes('Claude-Web'));
  assert.ok(!text.includes('anthropic-ai'));
});

test('extra lines are emitted verbatim and the sitemap is absolute', () => {
  const text = robots();
  assert.ok(text.includes('# fixture extra line'));
  assert.match(text, /^Sitemap: https:\/\/fixture\.example\/sitemap\.xml$/m);
});

test('the default fixture ships NO layouts/robots.txt', () => {
  // If the fixture ever acquires one, every robots
  // assertion above would pass for the wrong reason -- against the fixture's
  // own file rather than the module's generator.
  assert.ok(
    !existsSync(join(moduleRoot, 'test', 'fixture', 'layouts', 'robots.txt')),
    'the default fixture must not ship a layouts/robots.txt',
  );
});

test('a site-level layouts/robots.txt silently shadows the module', () => {
  // The documented hazard, proven rather than asserted in prose: the
  // site-level file WINS with no warning and no build error, so a consumer
  // who forgets to delete theirs gets a silently disabled generator.
  const shadow = read('robots.txt', shadowDir);
  assert.ok(shadow.includes('AGENT-READINESS-SHADOW-SENTINEL'), 'the site file must win');
  assert.ok(!shadow.includes('Content-Signal'), 'none of the module output may survive');
  assert.ok(!shadow.includes('User-agent: GPTBot'));
  assert.ok(!shadow.includes('User-agent: *'));
  assert.ok(!shadow.includes('Sitemap:'));
});

test('the shadowed build emits no warning about it', () => {
  // This is the hazard's whole shape: it is invisible. If Hugo ever starts
  // reporting it, this assertion should be revisited and the README relaxed.
  assert.equal(warnCount(/robots/i, 'shadow'), 0);
});

test('robots.txt needs no outputs wiring', () => {
  // enableRobotsTXT alone drives it: the built-in robots output format is
  // appended to the home page independently of the outputs.home list.
  assert.ok(exists('robots.txt'));
});
