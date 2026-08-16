// Two states at the ends of the module's range: switched off it writes nothing
// at all, and handed an alias that would corrupt the file format it stops the
// build rather than publishing it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {offDir, docExists, buildLog} from './helpers.js';

// Hugo writes no file for a template that produces no output, so a disabled
// module leaves the publish directory exactly as it found it. On the hosts
// these documents are written for a deployment is a complete upload rather than
// a patch, so an absent file leaves nothing stale behind.
test('a disabled module publishes neither document', () => {
  assert.ok(!docExists(offDir, '_redirects'));
  assert.ok(!docExists(offDir, 'url-manifest.txt'));
});

test('the site itself is unaffected by the module being off', () => {
  assert.ok(docExists(offDir, 'index.html'));
  assert.ok(docExists(offDir, 'posts/post-1/index.html'));
});

// Whitespace ends a field in this format. Hugo neither sanitizes nor rejects
// such an alias -- it publishes a directory with a space in its name -- so the
// alternative to failing is a rule that redirects somewhere nobody asked for.
test('an alias containing whitespace fails the build', () => {
  const log = buildLog('hostile');
  assert.match(log, /\[url-retirement\]/);
  assert.match(log, /contains whitespace/);
});

test('and the failure names both the alias and the page carrying it', () => {
  const log = buildLog('hostile');
  assert.match(log, /bad alias/, 'the offending alias is not quoted');
  assert.match(log, /hostile/, 'the page is not named');
});
