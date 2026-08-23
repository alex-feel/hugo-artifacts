/* global process */
// Shared helpers for the build-output assertion specs. The runner exports
// FIXTURE_PUBLIC (the baseline build, with those config blocks unset),
// FIXTURE_PUBLIC_CONFIGURED (the build with all three blocks set), one
// FIXTURE_PUBLIC_* variable per remaining environment, the captured hugo
// build logs, and HUGO_VERSION.
import {readFileSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {parse} from 'node-html-parser';

export const publicDir = resolve(process.env.FIXTURE_PUBLIC ?? 'fixture/public/baseline');
export const configuredDir = resolve(
  process.env.FIXTURE_PUBLIC_CONFIGURED ?? 'fixture/public/configured',
);
// The same configured surfaces under a baseURL that carries a PATH. At a
// domain root a correct URL absolutization and a broken one emit identical
// bytes, so this tree is the only place the difference is visible.
export const subpathDir = resolve(process.env.FIXTURE_PUBLIC_SUBPATH ?? 'fixture/public/subpath');
// The same environment with canonifyURLs on, the setting that makes the whole
// relURL family stop emitting the baseURL path while Hugo repairs that
// afterwards in HTML attributes only. The module derives every URL from absURL
// or .Permalink, so this tree must match the one above byte for byte; a
// derivation that started routing through relURL would break the tags the
// post-processor never reaches, and nothing else in this suite would say so.
export const subpathCanonifyDir = resolve(
  process.env.FIXTURE_PUBLIC_SUBPATH_CANONIFY ?? 'fixture/public/subpath-canonify',
);
// The config shapes that used to stop the build or silently disable a surface.
export const badtypesDir = resolve(
  process.env.FIXTURE_PUBLIC_BADTYPES ?? 'fixture/public/badtypes',
);
// The module switched off the way a consumer actually reaches for it.
export const offswitchDir = resolve(
  process.env.FIXTURE_PUBLIC_OFFSWITCH ?? 'fixture/public/offswitch',
);
// A second language whose params set a noindex robots baseline: the only
// build in which a per-language params read and a rendering-language one
// produce different bytes.
export const multilingualDir = resolve(
  process.env.FIXTURE_PUBLIC_MULTILINGUAL ?? 'fixture/public/multilingual',
);
// A two-language site whose `posts` section is split across pagers: the only
// build in which a document is served from a URL that is not the page's own
// .Permalink, so it is the only place a self-referential URL can be checked.
export const paginationDir = resolve(
  process.env.FIXTURE_PUBLIC_PAGINATION ?? 'fixture/public/pagination',
);
// The same environment under a baseURL that carries a PATH. Pagination and a
// subpath deploy meet nowhere else, and seo/resolve/pager.html only claims the
// pager URL while the pager URL still extends the page's own RelPermalink --
// both of which change shape when the baseURL gains a path.
export const paginationSubpathDir = resolve(
  process.env.FIXTURE_PUBLIC_PAGINATION_SUBPATH ?? 'fixture/public/pagination-subpath',
);
// The baseline content published through the other JSON-LD container:
// seo.jsonld_container = 'graph' collapses every page's nodes into one
// <script> holding a @graph array, which is a serialization site no other
// build reaches.
export const graphDir = resolve(process.env.FIXTURE_PUBLIC_GRAPH ?? 'fixture/public/graph');
// The site's name and its publisher's name set to DIFFERENT strings: the only
// build in which the two ends of the site-name chain are distinguishable, and
// therefore the only one that can tell og:site_name, WebSite.name and the
// OpenSearch title apart if they ever stop agreeing again.
export const sitenameDir = resolve(
  process.env.FIXTURE_PUBLIC_SITENAME ?? 'fixture/public/sitename',
);
// The generated-image hook wired to a fixture partial, alongside a site
// default image: the only build in which a per-page composed card and the
// site-wide banner both exist, so the one that actually reached og:image
// says which tier of the cascade answered.
export const generatedDir = resolve(
  process.env.FIXTURE_PUBLIC_GENERATED ?? 'fixture/public/generated',
);
// A home page that states its own SEO title, in both the current and the
// legacy spelling, under a site-wide title suffix: the only build in which
// either branch of resolve/title.html renders. Everywhere else no suffix is
// configured and no home page declares a headline, so the home <title> lands
// on the site title whether the rule is right or wrong.
export const hometitleDir = resolve(
  process.env.FIXTURE_PUBLIC_HOMETITLE ?? 'fixture/public/hometitle',
);

export function rawHtml(rel, dir = publicDir) {
  return readFileSync(join(dir, rel), 'utf8');
}

export function dom(rel, dir = publicDir) {
  return parse(rawHtml(rel, dir));
}

export function exists(rel, dir = publicDir) {
  return existsSync(join(dir, rel));
}

// Every JSON-LD node emitted on a page, flattened out of @graph wrappers.
export function graph(rel, dir = publicDir) {
  const nodes = [];
  for (const el of dom(rel, dir).querySelectorAll('script[type="application/ld+json"]')) {
    const parsed = JSON.parse(el.rawText);
    if (Array.isArray(parsed['@graph'])) nodes.push(...parsed['@graph']);
    else nodes.push(parsed);
  }
  return nodes;
}

export function nodesOfType(rel, type, dir = publicDir) {
  return graph(rel, dir).filter((n) => n['@type'] === type);
}

// The fixture's jsonld-extra hook publishes $seo.ids.person as the
// description of a probe node, which is the only way a spec can observe the
// value the module hands consumers.
export function personAnchor(rel, dir = publicDir) {
  const probe = graph(rel, dir).find((n) => n.name === 'person-id-probe');
  return probe ? probe.description : undefined;
}

export function linkRels(rel, dir = publicDir) {
  return dom(rel, dir)
    .querySelectorAll('head link')
    .map((el) => ({
      rel: el.getAttribute('rel'),
      type: el.getAttribute('type'),
      href: el.getAttribute('href'),
      title: el.getAttribute('title'),
    }));
}

export function buildLog(which = 'baseline') {
  const keys = {
    baseline: 'HUGO_BUILD_LOG',
    configured: 'HUGO_BUILD_LOG_CONFIGURED',
    subpath: 'HUGO_BUILD_LOG_SUBPATH',
    'subpath-canonify': 'HUGO_BUILD_LOG_SUBPATH_CANONIFY',
    badtypes: 'HUGO_BUILD_LOG_BADTYPES',
    offswitch: 'HUGO_BUILD_LOG_OFFSWITCH',
    multilingual: 'HUGO_BUILD_LOG_MULTILINGUAL',
    pagination: 'HUGO_BUILD_LOG_PAGINATION',
    'pagination-subpath': 'HUGO_BUILD_LOG_PAGINATION_SUBPATH',
    graph: 'HUGO_BUILD_LOG_GRAPH',
    sitename: 'HUGO_BUILD_LOG_SITENAME',
    generated: 'HUGO_BUILD_LOG_GENERATED',
    hometitle: 'HUGO_BUILD_LOG_HOMETITLE',
  };
  // A key map that throws, rather than a two-state boolean: the boolean form
  // had no path to the third log at all, so a warning assertion against the
  // subpath build would have silently read the baseline one.
  if (typeof which === 'boolean') which = which ? 'configured' : 'baseline';
  if (!Object.hasOwn(keys, which)) {
    throw new Error(`buildLog: unknown build ${JSON.stringify(which)}`);
  }
  const p = process.env[keys[which]];
  return p ? readFileSync(resolve(p), 'utf8') : '';
}

export function warnCount(pattern, which = 'baseline') {
  return buildLog(which)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('WARN') && pattern.test(line)).length;
}

// Every page the fixture builds, in both trees.
export const PAGES = {
  scalarTaxonomies: 'blog/scalar-taxonomies/index.html',
  scalarSubtables: 'blog/scalar-subtables/index.html',
  scalarSeoBlock: 'blog/scalar-seo-block/index.html',
  falsySeoBlock: 'blog/falsy-seo-block/index.html',
  keywordsFallback: 'blog/keywords-fallback/index.html',
  robotsAiUsage: 'blog/robots-ai-usage/index.html',
  home: 'index.html',
  page: 'page/index.html',
  blogSection: 'blog/index.html',
  blogPost: 'blog/post/index.html',
  author: 'authors/jane-doe/index.html',
  promo: 'promo/thing/index.html',
  undecodableRaster: 'undecodable-raster/index.html',
  avifCover: 'avif-cover/index.html',
  decodableRaster: 'decodable-raster/index.html',
  mapImages: 'map-images/index.html',
  mapTaxonomies: 'blog/map-taxonomies/index.html',
  tableCanonical: 'blog/table-canonical/index.html',
  breadcrumbTrails: 'blog/breadcrumb-trails/index.html',
};
