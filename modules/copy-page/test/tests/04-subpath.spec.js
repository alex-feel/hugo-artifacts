/* global URL */
// Subpath deployment, and the same deployment with canonifyURLs on.
//
// Both are STATIC builds read off disk rather than driven through the server,
// because the served fixture sits at a domain root and a domain root cannot
// tell a correct URL derivation from a broken one: Hugo resolves a value that
// already starts with "/" against the protocol and host ONLY, discarding the
// baseURL's path, so at a root the two emit identical bytes.
//
// The second build adds canonifyURLs, under which Hugo absolutizes
// root-relative URLs in HTML output after the templates have run and, to keep
// that rewrite from doubling the base path, makes the whole Page family stop
// emitting the path in the first place. Measured at v0.164.0 under
// baseURL = "http://localhost:1616/docs/", a page's .RelPermalink comes back
// without the /docs segment. A RESOURCE's does not, and .Permalink is
// untouched.
//
// This module derives every URL it composes from a .Permalink -- the page's
// own, its Markdown twin's, the home page's llms.txt -- and its one
// .RelPermalink rides a `src` attribute the rewrite repairs anyway, so its
// output must not move. The reason a build is needed to say so is the
// fixture's Markdown twins: the widget renders into them too, and nothing
// post-processes a twin. A URL that lost the base path would be repaired in
// the HTML and would ship in the twin, which is the one place the two
// surfaces can be told apart.
import {test, expect} from '@playwright/test';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join, relative, sep} from 'node:path';

const SUBPATH_DIR = fileURLToPath(new URL('../fixture/public/subpath/', import.meta.url));
const CANONIFY_DIR = fileURLToPath(new URL('../fixture/public/subpath-canonify/', import.meta.url));

// Must stay in sync with fixture/subpath.toml.
const ORIGIN = 'http://localhost:1616';
const BASE_PATH = '/docs';

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8').replace(/\r\n/g, '\n');

function walk(dir) {
  const out = [];
  const visit = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  visit(dir);
  return out.sort();
}

// Every URL the widget states about the page it sits on, from both surfaces
// it renders into.
const widgetUrls = (text) =>
  [...text.matchAll(/data-copy-page-url="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

test.describe('static subpath build', () => {
  test('the widget states an absolute twin URL carrying the base path', () => {
    // The module resolves the twin through its output format's .Permalink, so
    // the URL is absolute and includes the base path exactly once. At a domain
    // root a derivation that dropped the path would look identical.
    const urls = widgetUrls(read(SUBPATH_DIR, 'docs/index.html'));
    expect(urls.length, 'the listing page renders widgets').toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith(`${ORIGIN}${BASE_PATH}/`), `${url} keeps the base path`).toBe(true);
      expect(url.includes(`${BASE_PATH}${BASE_PATH}/docs/`), `${url} repeats it`).toBe(false);
    }
  });

  test('no derived URL anywhere in the build drops the base path', () => {
    const bad = [];
    let scanned = 0;
    for (const rel of walk(SUBPATH_DIR)) {
      if (!/\.(html|md)$/.test(rel)) continue;
      for (const url of widgetUrls(read(SUBPATH_DIR, rel))) {
        scanned += 1;
        // A consumer-authored value is passed through verbatim by design, so
        // only the ones the module resolved are held to the base path.
        if (!url.startsWith(ORIGIN)) continue;
        if (!url.startsWith(`${ORIGIN}${BASE_PATH}/`)) bad.push(`${rel}: ${url}`);
      }
    }
    expect(scanned, 'the sweep must have inspected widget URLs').toBeGreaterThan(0);
    expect(bad, 'derived URLs that dropped the base path').toEqual([]);
  });
});

test.describe('static subpath build with canonifyURLs', () => {
  test('canonifyURLs is really on here, and off in the twin build', () => {
    // The control: the module's own script tag, whose src is a RESOURCE's
    // .RelPermalink -- root-relative in one build and absolutized by the
    // post-processor in the other, naming the same file either way. Without a
    // value that moves, every assertion below would pass just as well against
    // two identical builds.
    //
    // A page link would NOT do here, and the reason is a Hugo behavior worth
    // knowing: the post-processor consumes a leading segment matching the
    // baseURL path instead of doubling it, and it cannot tell that segment
    // from a content path that happens to begin the same way. This fixture's
    // section is literally named `docs` under a baseURL path of `/docs`, so
    // its page links come out one segment short -- measured at v0.164.0,
    // `/docs/docs/post-noformat/` is published as
    // `http://localhost:1616/docs/post-noformat/`, disagreeing with the
    // .Permalink of the very same page. That is Hugo's own arithmetic on a
    // root-relative value, reached by no code in this module, and it is
    // recorded in docs/upstream-issues.md; the assertions below stay clear of
    // it by reading only what the module itself states, which is absolute
    // before the post-processor ever sees it.
    const script = /<script[^>]*src="([^"]*copy-page[^"]*\.js)"/;
    const off = script.exec(read(SUBPATH_DIR, 'docs/index.html'))?.[1];
    const on = script.exec(read(CANONIFY_DIR, 'docs/index.html'))?.[1];
    expect(off, 'the module emits its script tag').toMatch(
      new RegExp(`^${BASE_PATH}/js/copy-page\\.[0-9a-f]+\\.js$`),
    );
    expect(on, 'and canonifyURLs absolutizes it onto the full baseURL').toBe(`${ORIGIN}${off}`);
  });

  test('both builds publish exactly the same set of files', () => {
    const off = walk(SUBPATH_DIR);
    expect(off.length, 'the subpath build published a tree').toBeGreaterThan(10);
    expect(walk(CANONIFY_DIR)).toEqual(off);
  });

  test('every Markdown twin is byte-identical, because nothing repairs one', () => {
    // The assertion this build exists for. A twin is not HTML, so Hugo's
    // post-processor never touches it: a URL that lost the base path here
    // would ship exactly as the template wrote it, while the same loss in the
    // HTML beside it would be silently repaired.
    let compared = 0;
    for (const rel of walk(SUBPATH_DIR)) {
      if (!rel.endsWith('.md')) continue;
      expect(read(CANONIFY_DIR, rel), `${rel}: a twin must not depend on canonifyURLs`).toBe(
        read(SUBPATH_DIR, rel),
      );
      compared += 1;
    }
    // A positive control: a build with no twins would make the loop above pass
    // having compared nothing.
    expect(compared, 'Markdown twins were compared').toBeGreaterThan(2);
  });

  test('and every derived widget URL in them still carries the base path', () => {
    // Equality with the other build would also hold if BOTH lost the path, so
    // the canonify build is checked against the baseURL on its own terms.
    const bad = [];
    let scanned = 0;
    for (const rel of walk(CANONIFY_DIR)) {
      if (!rel.endsWith('.md')) continue;
      for (const url of widgetUrls(read(CANONIFY_DIR, rel))) {
        scanned += 1;
        if (!url.startsWith(ORIGIN)) continue;
        if (!url.startsWith(`${ORIGIN}${BASE_PATH}/`)) bad.push(`${rel}: ${url}`);
      }
    }
    expect(scanned, 'the sweep must have inspected widget URLs in twins').toBeGreaterThan(0);
    expect(bad, 'derived URLs that dropped the base path').toEqual([]);
  });
});
