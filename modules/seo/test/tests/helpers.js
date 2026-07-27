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

export function buildLog(configured = false) {
  const p = configured ? process.env.HUGO_BUILD_LOG_CONFIGURED : process.env.HUGO_BUILD_LOG;
  return p ? readFileSync(resolve(p), 'utf8') : '';
}

export function warnCount(pattern, configured = false) {
  return buildLog(configured)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('WARN') && pattern.test(line)).length;
}

// Every page the fixture builds, in both trees.
export const PAGES = {
  home: 'index.html',
  page: 'page/index.html',
  blogSection: 'blog/index.html',
  blogPost: 'blog/post/index.html',
  author: 'authors/jane-doe/index.html',
  promo: 'promo/thing/index.html',
};
