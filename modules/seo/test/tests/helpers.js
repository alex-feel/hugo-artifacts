/* global process */
// Shared helpers for the build-output assertion specs. The runner exports
// FIXTURE_PUBLIC (the baseline build, with those config blocks unset),
// FIXTURE_PUBLIC_CONFIGURED (the build with all three blocks set), the two
// captured hugo build logs, and HUGO_VERSION.
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
// The config shapes that used to stop the build or silently disable a surface.
export const badtypesDir = resolve(
  process.env.FIXTURE_PUBLIC_BADTYPES ?? 'fixture/public/badtypes',
);
// The module switched off the way a consumer actually reaches for it.
export const offswitchDir = resolve(
  process.env.FIXTURE_PUBLIC_OFFSWITCH ?? 'fixture/public/offswitch',
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
    badtypes: 'HUGO_BUILD_LOG_BADTYPES',
    offswitch: 'HUGO_BUILD_LOG_OFFSWITCH',
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
  home: 'index.html',
  page: 'page/index.html',
  blogSection: 'blog/index.html',
  blogPost: 'blog/post/index.html',
  author: 'authors/jane-doe/index.html',
  promo: 'promo/thing/index.html',
};
