// Exclusive groups: the native <details name> channel, the per-container
// name minting, and the modifier class that follows it.
//
// The minting is the part worth pinning. Two exclusive accordions on ONE page
// must not share a name, or opening an item in the first would silently close
// one in the second -- and because a nested item re-derives its container's
// settings independently, the container and its items must arrive at the same
// name from two separate derivations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, PAGES, read, items, containers} from './helpers.js';

for (const build of BUILDS) {
  test(`[${build.name}] two exclusive containers on one page mint different group names`, () => {
    const html = read(PAGES.groups, build.dir);
    const all = items(html);
    const alpha = all.find((i) => i.titleText === 'Alpha');
    const beta = all.find((i) => i.titleText === 'Beta');
    const gamma = all.find((i) => i.titleText === 'Gamma');
    const delta = all.find((i) => i.titleText === 'Delta');
    assert.ok(alpha && beta && gamma && delta, 'the exclusive fixture items are missing');

    assert.ok(alpha.group, 'the first exclusive container minted no group name');
    assert.equal(
      alpha.group,
      beta.group,
      'siblings of one exclusive container disagree on the name',
    );
    assert.ok(gamma.group, 'the second exclusive container minted no group name');
    assert.equal(
      gamma.group,
      delta.group,
      'siblings of one exclusive container disagree on the name',
    );
    assert.notEqual(
      alpha.group,
      gamma.group,
      'two exclusive containers on one page share a group name, so they would close each other',
    );
  });

  test(`[${build.name}] an explicit group joins containers that are not siblings`, () => {
    const all = items(read(PAGES.groups, build.dir));
    const one = all.find((i) => i.titleText === 'Shared one');
    const two = all.find((i) => i.titleText === 'Shared two');
    assert.ok(one && two, 'the shared-group fixture items are missing');
    assert.equal(one.group, 'faq', 'an explicit group name was not emitted verbatim');
    assert.equal(two.group, 'faq', 'the second container did not join the explicit group');
  });

  test(`[${build.name}] the exclusive modifier class tracks the group, and only it`, () => {
    const html = read(PAGES.groups, build.dir);
    const exclusiveContainers = containers(html).filter((c) =>
      c.classes.includes('accordion--exclusive'),
    );
    assert.equal(
      exclusiveContainers.length,
      5,
      'the modifier class does not mark every grouped container on the groups page',
    );
    for (const c of exclusiveContainers) {
      for (const item of items(c.inner)) {
        assert.ok(item.group, 'a container marked exclusive holds an item with no group name');
      }
    }

    // The negative control: the plain containers elsewhere carry neither.
    const plain = read(PAGES.home, build.dir);
    assert.equal(
      containers(plain).filter((c) => c.classes.includes('accordion--exclusive')).length,
      0,
      'a container that asked for nothing was marked exclusive',
    );
    for (const item of items(plain)) {
      assert.equal(item.group, null, 'an ungrouped item carries a name attribute');
    }
  });

  test(`[${build.name}] a group name is a legal, readable attribute value`, () => {
    for (const item of items(read(PAGES.groups, build.dir))) {
      if (!item.group) continue;
      assert.match(
        item.group,
        /^[A-Za-z0-9_-]+$/,
        `the group name ${JSON.stringify(item.group)} carries characters an attribute value should not`,
      );
    }
  });

  test(`[${build.name}] a second open item in one group still publishes, warning aside`, () => {
    // The module warns (05-warnings.spec.js asserts that), but it never
    // rewrites the author's markup: both items keep their open attribute and
    // the browser applies its own first-wins rule.
    const all = items(read(PAGES.groups, build.dir)).filter((i) => i.group === 'multi-open');
    assert.equal(all.length, 2, 'the multi-open fixture group is not two items');
    assert.deepEqual(
      all.map((i) => i.open),
      [true, true],
      'the module dropped an author-supplied open attribute',
    );
  });
}
