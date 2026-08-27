// The public accordion/list.html partial: the surface a consuming LAYOUT
// calls, where no shortcode object exists to supply a position, an ordinal,
// or an argument map.
//
// The point of most of these assertions is EQUIVALENCE: a site must be able to
// move a widget between Markdown and a layout without its stylesheet
// changing, so the partial's markup has to be the same markup the shortcodes
// emit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, PAGES, read, items, containers, elements, attr} from './helpers.js';

for (const build of BUILDS) {
  test(`[${build.name}] the partial emits the same item markup the shortcode does`, () => {
    const layout = items(read(PAGES.layout, build.dir));
    const shortcode = items(read(PAGES.home, build.dir));
    assert.ok(
      layout.length >= 6,
      'the layout page published fewer items than the fixture calls for',
    );

    const shapeOf = (item) => ({
      classes: item.classes,
      hasSummary: Boolean(item.summary),
      hasTitleSpan: Boolean(item.title),
      hasBody: Boolean(item.body),
      hasIcon: Boolean(item.icon),
      summaryClasses: item.summary.classes,
      bodyClasses: item.body.classes,
    });
    assert.deepEqual(
      shapeOf(layout.find((i) => i.titleText === 'Open item')),
      shapeOf(shortcode.find((i) => i.titleText === 'Warranty')),
      'the partial and the shortcode disagree on the item shape',
    );
  });

  test(`[${build.name}] a string content value is Markdown and a template.HTML value passes through`, () => {
    // This is the one trap of the partial surface: Goldmark's default
    // unsafe = false strips raw HTML out of a STRING, so a layout that has
    // already rendered its markup must hand it over as template.HTML. Both
    // halves are asserted, because either alone would pass against a module
    // that treated every value the same way.
    const all = items(read(PAGES.layout, build.dir));
    const asString = all.find((i) => i.titleText === 'String content');
    const asTyped = all.find((i) => i.titleText === 'Typed content');
    assert.ok(asString && asTyped, 'the content-typing fixture items are missing');

    assert.match(
      asString.body.inner,
      /<strong>markdown<\/strong>/,
      'a string body did not render as Markdown',
    );
    // Whether the string's raw HTML survives is the SITE's markup setting, not
    // the module's, so each build asserts its own half: stripped at the
    // default, passed through once the site allows raw HTML. The typed value
    // is unconditional -- it never reaches Goldmark at all, which is exactly
    // what makes it the right vehicle for pre-rendered markup.
    assert.equal(
      elements(asString.body.inner, 'em').length,
      build.name === 'default' ? 0 : 1,
      `raw HTML in a string body did not follow the site's markup setting in the ${build.name} build`,
    );
    assert.equal(
      elements(asTyped.body.inner, 'em').length,
      1,
      'a template.HTML body did not pass through untouched',
    );
  });

  test(`[${build.name}] the partial honors exclusive, heading, icon, id and class`, () => {
    const html = read(PAGES.layout, build.dir);
    const exclusive = containers(html).find((c) => attr(c.openTag, 'id') === 'layout-exclusive');
    assert.ok(exclusive, 'the partial did not emit the requested container id');
    assert.ok(
      exclusive.classes.includes('accordion--exclusive'),
      'the partial did not mark an exclusive container',
    );
    assert.ok(exclusive.classes.includes('site-accordion'), 'the partial dropped the caller class');

    const inside = items(exclusive.inner);
    assert.equal(inside.length, 2, 'the exclusive partial call published the wrong item count');
    assert.ok(inside[0].group, 'the partial minted no group name');
    assert.equal(
      inside[0].group,
      inside[1].group,
      'the partial gave its items different group names',
    );
    for (const item of inside) {
      assert.ok(item.heading, 'heading=4 produced no heading element on the partial path');
      assert.match(
        item.heading.openTag,
        /^<h4\b/,
        'the partial ignored the requested heading level',
      );
      assert.equal(item.icon, null, 'icon=false still rendered an icon on the partial path');
    }
  });

  test(`[${build.name}] two exclusive calls on one page mint different group names`, () => {
    // The failure this catches is silent and total: a minter that ignored its
    // seed would hand every exclusive accordion on the partial path one
    // constant name, joining unrelated widgets into a single native group so
    // that opening an item in one closes an item in the other. One call
    // cannot see it -- the name is truthy and consistent either way -- so the
    // fixture renders two.
    const html = read(PAGES.layout, build.dir);
    const first = items(/<section id="exclusive">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '');
    const second = items(
      /<section id="exclusive-second">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '',
    );
    assert.equal(first.length, 2, 'the first exclusive partial call is missing');
    assert.equal(second.length, 2, 'the second exclusive partial call is missing');
    assert.ok(first[0].group && second[0].group, 'an exclusive partial call minted no group name');
    assert.notEqual(
      first[0].group,
      second[0].group,
      'two exclusive accordions rendered by one layout share a group name, so they close each other',
    );
    // And the name is derived from the caller's position rather than being any
    // constant: a name that ignored its input would still differ from nothing.
    assert.match(
      first[0].group,
      /exclusive/,
      'the minted group name does not derive from the caller position it was seeded with',
    );
    assert.match(
      second[0].group,
      /exclusive-second/,
      'the minted group name does not derive from the caller position it was seeded with',
    );
  });

  test(`[${build.name}] the partial's group name does not collide with the shortcode path's`, () => {
    // Both paths mint from a seed, and the seeds come from different worlds
    // (an ordinal path versus a caller-supplied position). A collision would
    // couple two unrelated accordions on a page that used both surfaces.
    const layoutGroups = new Set(
      items(read(PAGES.layout, build.dir))
        .map((i) => i.group)
        .filter(Boolean),
    );
    const shortcodeGroups = new Set(
      items(read(PAGES.groups, build.dir))
        .map((i) => i.group)
        .filter(Boolean),
    );
    assert.ok(layoutGroups.size > 0 && shortcodeGroups.size > 0, 'one of the group sets is empty');
    for (const g of layoutGroups) {
      assert.ok(
        !shortcodeGroups.has(g),
        `the group name ${JSON.stringify(g)} is minted on both paths`,
      );
    }
  });

  test(`[${build.name}] per-item open, id and class reach the markup`, () => {
    const all = items(read(PAGES.layout, build.dir));
    assert.equal(
      all.find((i) => i.titleText === 'Open item').open,
      true,
      'per-item open was dropped',
    );
    assert.equal(
      all.find((i) => i.titleText === 'Author id').bodyId,
      'layout-chosen',
      'a per-item id was not honored on the partial path',
    );
    assert.ok(
      all.find((i) => i.titleText === 'Extra class').classes.includes('site-item'),
      'a per-item class was not honored on the partial path',
    );
    assert.equal(
      all.find((i) => i.titleText === 'No content').body.inner,
      '',
      'an item with no content did not render an empty body',
    );
  });

  test(`[${build.name}] an empty items slice publishes nothing at all`, () => {
    const html = read(PAGES.layout, build.dir);
    const emptySection = /<section id="empty">([\s\S]*?)<\/section>/.exec(html);
    assert.ok(emptySection, 'the empty-items section is missing from the fixture page');
    assert.equal(
      emptySection[1].trim(),
      '',
      'an empty items slice published markup instead of nothing',
    );
  });
}
