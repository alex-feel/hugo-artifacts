// The markup contract: what the module publishes for every item, on every
// authoring surface, in both builds.
//
// These assertions are the module's public promise to a consuming site's
// stylesheet, so they are written against the published bytes rather than a
// normalized DOM: a bare `open` attribute, an id on the body rather than on
// the details element, and the complete absence of ARIA are all things a
// parser would smooth over.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, PAGES, read, items, containers, byClass, attr, hasBareAttr} from './helpers.js';

const HTML_PAGES = Object.entries(PAGES).filter(([, rel]) => rel.endsWith('.html'));

for (const build of BUILDS) {
  test(`[${build.name}] every item is a native details/summary pair`, () => {
    for (const [name, rel] of HTML_PAGES) {
      const html = read(rel, build.dir);
      const found = items(html);
      assert.ok(found.length > 0, `${name}: the page publishes no accordion items`);
      for (const item of found) {
        assert.ok(item.summary, `${name}: an item has no accordion__summary`);
        assert.ok(item.title, `${name}: an item has no accordion__title`);
        assert.ok(item.body, `${name}: an item has no accordion__body`);
        // The summary must be the details element's FIRST child element, which
        // is what makes it the disclosure control rather than ordinary
        // content.
        assert.match(
          item.inner.trimStart(),
          /^<summary/,
          `${name}: the summary is not the first child of its details element`,
        );
      }
    }
  });

  test(`[${build.name}] the module emits no ARIA state and no role, anywhere`, () => {
    // Zero ARIA is the module's central design decision: native
    // details/summary already carries the disclosure semantics, and an ARIA
    // overlay on a summary measurably degrades it. A regression here would be
    // invisible to every other assertion in this suite.
    //
    // The ONE aria attribute the module is allowed to emit is aria-hidden on
    // the decorative icon, which is the house icon contract and the opposite
    // of an overlay -- it removes a glyph from the accessibility tree rather
    // than adding semantics. So the sweep runs over the item with its icons
    // removed, which keeps it a real absence check rather than a whitelist
    // that any future aria-hidden could hide behind.
    for (const [name, rel] of HTML_PAGES) {
      for (const item of items(read(rel, build.dir))) {
        const withoutIcons = item.outer.replace(/<svg\b[\s\S]*?<\/svg>/g, '');
        assert.doesNotMatch(
          withoutIcons,
          /\saria-[a-z-]+\s*=/i,
          `${name}: an item carries an aria-* attribute outside its icon`,
        );
        assert.doesNotMatch(
          withoutIcons,
          /\srole\s*=/i,
          `${name}: an item carries a role attribute`,
        );
      }
    }
  });

  test(`[${build.name}] open is a bare boolean attribute, never open="true"`, () => {
    for (const [name, rel] of HTML_PAGES) {
      const html = read(rel, build.dir);
      for (const item of items(html)) {
        assert.equal(attr(item.openTag, 'open'), null, `${name}: open carries a value`);
      }
      const opened = items(html).filter((i) => i.open);
      for (const item of opened) {
        assert.ok(
          hasBareAttr(item.openTag, 'open'),
          `${name}: an open item lost its bare attribute`,
        );
      }
    }
    // A positive control: without at least one open item anywhere, the
    // assertion above would hold vacuously.
    const home = items(read(PAGES.home, build.dir));
    assert.equal(
      home
        .filter((i) => i.open)
        .map((i) => i.titleText)
        .join(),
      'Returns',
      'the home page must publish exactly one open item, or the open assertions prove nothing',
    );
  });

  test(`[${build.name}] every item lives inside an accordion container block`, () => {
    // BEM: an accordion__item element never appears outside an accordion
    // block, which is what lets a site scope its rules to .accordion.
    for (const [name, rel] of HTML_PAGES) {
      const html = read(rel, build.dir);
      const insideContainers = containers(html)
        .map((c) => items(c.inner).length)
        .reduce((a, b) => a + b, 0);
      // Nested accordions make an item countable twice through its outer
      // container, so the container total is a floor rather than an equality.
      assert.ok(
        insideContainers >= items(html).length,
        `${name}: ${items(html).length} items but only ${insideContainers} inside a container`,
      );
    }
  });

  test(`[${build.name}] a standalone item renders its own container`, () => {
    const html = read(PAGES.home, build.dir);
    const standalone = items(html).find((i) => i.titleText === 'Standalone');
    assert.ok(standalone, 'the standalone item is missing');
    const owning = containers(html).filter((c) => c.inner.includes(standalone.outer));
    assert.equal(owning.length, 1, 'the standalone item is not wrapped in exactly one container');
    assert.equal(
      items(owning[0].inner).length,
      1,
      'the standalone container holds more than its one item',
    );
  });

  test(`[${build.name}] the icon is an inheritable inline SVG, and icon=false suppresses it`, () => {
    const home = items(read(PAGES.home, build.dir));
    const withIcon = home.find((i) => i.titleText === 'Shipping');
    assert.ok(withIcon?.icon, 'the default item has no icon');
    const svg = withIcon.icon.openTag;
    assert.equal(attr(svg, 'width'), '1em', 'the icon does not scale with the font size');
    assert.equal(attr(svg, 'height'), '1em', 'the icon does not scale with the font size');
    assert.equal(attr(svg, 'stroke'), 'currentColor', 'the icon does not inherit the text color');
    assert.equal(attr(svg, 'aria-hidden'), 'true', 'the icon is exposed to assistive technology');
    assert.equal(attr(svg, 'focusable'), 'false', 'the icon is focusable');
    assert.doesNotMatch(svg, /\s(fill|stroke)\s*=\s*["']?#/, 'the icon ships a literal color');

    const suppressed = items(read(PAGES.degrade, build.dir)).find((i) => i.titleText === 'No icon');
    assert.ok(suppressed, 'the icon=false item is missing');
    assert.equal(suppressed.icon, null, 'icon=false still rendered an icon');
  });

  test(`[${build.name}] heading mode wraps the title alone, at the requested level`, () => {
    const item = items(read(PAGES.home, build.dir)).find((i) => i.titleText === 'Heading item');
    assert.ok(item, 'the heading-mode item is missing');
    assert.ok(item.heading, 'heading="3" produced no heading element');
    assert.match(item.heading.openTag, /^<h3\b/, 'the heading is not an h3');
    // The icon stays OUTSIDE the heading, so heading navigation announces the
    // title text and nothing else.
    assert.equal(
      byClass(item.heading.inner, 'svg', 'accordion__icon').length,
      0,
      'the icon was wrapped inside the heading',
    );
    assert.ok(
      byClass(item.heading.inner, 'span', 'accordion__title').length === 1,
      'the heading does not wrap the title span',
    );

    // Default mode: a plain span, no heading at all.
    const plain = items(read(PAGES.home, build.dir)).find((i) => i.titleText === 'Shipping');
    assert.equal(plain.heading, null, 'the default item grew a heading');
  });

  test(`[${build.name}] the title renders as inline markdown and the body as blocks`, () => {
    const home = read(PAGES.home, build.dir);
    const shipping = items(home).find((i) => i.titleText === 'Shipping');
    assert.match(
      shipping.body.inner,
      /<p>Ships in <strong>two<\/strong> days\.<\/p>/,
      'the body is not block markdown',
    );

    const returns = items(home).find((i) => i.titleText === 'Returns');
    assert.equal(
      (returns.body.inner.match(/<p>/g) ?? []).length,
      2,
      'a two-paragraph body did not render two paragraphs',
    );

    const inlineTitle = items(read(PAGES.ids, build.dir)).find((i) =>
      i.title.inner.includes('<code>'),
    );
    assert.ok(inlineTitle, 'no title rendered inline markdown');
    assert.match(
      inlineTitle.title.inner,
      /<code>code<\/code>/,
      'inline code did not render in a title',
    );
    assert.match(
      inlineTitle.title.inner,
      /<strong>bold<\/strong>/,
      'inline emphasis did not render in a title',
    );
    // Inline display: a title never grows a block wrapper.
    assert.doesNotMatch(inlineTitle.title.inner, /<p>/, 'the title rendered as a block');
  });

  test(`[${build.name}] an empty body renders an empty body element rather than failing`, () => {
    const item = items(read(PAGES.degrade, build.dir)).find((i) => i.titleText === 'Empty body');
    assert.ok(item, 'the empty-body item is missing');
    assert.equal(item.body.inner, '', 'the empty body is not empty');
  });

  test(`[${build.name}] id and class reach the markup from the shortcode surface too`, () => {
    // The partial path asserts these separately. Without this, a break in the
    // container's or the item's own argument wiring would ship green, because
    // nothing else on the Markdown surface passes either one.
    const html = read(PAGES.home, build.dir);
    const container = containers(html).find((c) => attr(c.openTag, 'id') === 'authored-container');
    assert.ok(container, 'the container shortcode did not emit the requested id');
    assert.ok(
      container.classes.includes('site-accordion'),
      'the container shortcode dropped the extra class',
    );
    const item = items(container.inner).find((i) => i.titleText === 'Item with a class');
    assert.ok(item, 'the class-carrying item is missing');
    assert.ok(item.classes.includes('site-item'), 'the item shortcode dropped the extra class');
    assert.ok(item.classes.includes('accordion__item'), 'the extra class replaced the block class');
  });

  test(`[${build.name}] the module ships no CSS and no script`, () => {
    for (const [name, rel] of HTML_PAGES) {
      const html = read(rel, build.dir);
      assert.doesNotMatch(html, /<style\b/i, `${name}: a style element reached the output`);
      assert.doesNotMatch(html, /<script\b/i, `${name}: a script element reached the output`);
      for (const item of items(html)) {
        assert.doesNotMatch(
          item.openTag,
          /\sstyle\s*=/i,
          `${name}: an item carries an inline style`,
        );
        assert.doesNotMatch(
          item.summary.openTag,
          /\sstyle\s*=/i,
          `${name}: a summary carries an inline style`,
        );
      }
    }
  });
}
