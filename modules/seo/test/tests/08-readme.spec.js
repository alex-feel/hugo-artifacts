/* global process */
// Documentation locks on the module README.
//
// A Hugo site has exactly ONE [outputs] table. A README that prints an
// [outputs] block as a standalone paste-in snippet therefore reads as a
// complete instruction while it is in fact a fragment: a reader who pastes a
// second [outputs] table gets "toml: table outputs already exists" and no
// site at all, and a reader who replaces the existing one silently loses
// every output format the other modules and the site itself declared -- an
// exit-0 build with missing documents and no warning. So every [outputs]
// example this README ships must be introduced as a MERGE into the table the
// site already has.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const readmePath = resolve(process.env.MODULE_README ?? '../README.md');
const readme = readFileSync(readmePath, 'utf8');

// Every fenced block plus the prose that introduces it.
function fencedBlocks(text) {
  const blocks = [];
  const lines = text.split(/\r?\n/);
  let open = null;
  for (const [i, line] of lines.entries()) {
    if (open === null) {
      if (/^\s*```/.test(line)) open = i;
      continue;
    }
    if (/^\s*```\s*$/.test(line)) {
      blocks.push({
        body: lines.slice(open + 1, i).join('\n'),
        lead: lines
          .slice(Math.max(0, open - 6), open)
          .join(' ')
          .toLowerCase(),
      });
      open = null;
    }
  }
  return blocks;
}

test('the README is read from disk and is the seo module README', () => {
  // Without this the locks below would pass just as happily on an empty file.
  assert.match(readme, /^# seo$/m);
  assert.match(readme, /^## Installation$/m);
  assert.ok(fencedBlocks(readme).length > 0, 'and it carries fenced examples');
});

test('every [outputs] example is introduced as a merge into the site table', () => {
  for (const block of fencedBlocks(readme)) {
    if (!/^\s*\[outputs\]/m.test(block.body)) continue;
    assert.match(
      block.lead,
      /merge|add .*to your existing|already has|single \[outputs\] table|one \[outputs\] table/,
      `an [outputs] example must be introduced as a merge into the site's single table, not as a standalone block: ${block.body.slice(0, 120)}`,
    );
  }
});

test('the module never tells a reader to configure outputs in the module', () => {
  // A module's own [outputs] table is inert: Hugo does not merge it into the
  // consumer configuration, so an instruction to set one there would describe
  // a step that changes nothing.
  const claims = readme
    .split(/\r?\n/)
    .filter((line) => /\[outputs\]/.test(line) && /module'?s? (own )?hugo\.toml/i.test(line))
    .filter((line) => !/inert|does not merge|never merges/i.test(line));
  assert.deepEqual(claims, [], 'no line may present a module-side [outputs] table as effective');
});
