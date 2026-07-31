/* global process */
// Shared helpers for the build-output assertion specs.
//
// The runner exports TWELVE published trees, and every one of them is
// load-bearing:
// FIXTURE_PUBLIC (every content-license key unset), FIXTURE_PUBLIC_CONFIGURED
// (the license table filled and both switches on, plus the bots_allow with
// bots_disallow pair), FIXTURE_PUBLIC_MINIMAL (almost nothing configured --
// the shape a consumer gets on import, and the only one that reaches the
// unconfigured robots.txt, the zero-skills gate and the sectionless facts
// document), FIXTURE_PUBLIC_NOTWINS (twins off site-wide while the markdown
// format stays wired, the only shape in which a link emitter can be caught
// advertising a file that was never written), FIXTURE_PUBLIC_MULTILINGUAL
// (two languages, the only shape in which the agent-skills default-language
// gate does anything), FIXTURE_PUBLIC_LLMSOFF (llms.txt off while its format
// stays wired, plus the scalar-for-a-sub-table shapes), FIXTURE_PUBLIC_EDGE
// (a subpath baseURL plus the misconfigurations no other build reaches),
// FIXTURE_PUBLIC_OFF (the master switch ALONE, false, with all four formats
// still wired -- the only shape that exercises the `enable` conjunct in any
// renderer), FIXTURE_PUBLIC_BADTABLES (the section arrays written as bare
// strings), FIXTURE_PUBLIC_NSOFF (the whole [params] agent namespace written
// as a bare value), FIXTURE_PUBLIC_SHADOW (a fixture that ships its own
// layouts/robots.txt), and FIXTURE_PUBLIC_PAGINATED (a fixture whose single
// section spills past pagerSize, the only shape in which a surface can be
// caught enumerating pager shells alongside the pages they list). It also
// exports the captured build logs, so
// warning-count assertions read what Hugo actually said rather than
// re-deriving it.
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const moduleRoot = resolve(here, '../..');
export const publicDir = resolve(process.env.FIXTURE_PUBLIC ?? 'fixture/public/baseline');
export const configuredDir = resolve(
  process.env.FIXTURE_PUBLIC_CONFIGURED ?? 'fixture/public/configured',
);
export const minimalDir = resolve(process.env.FIXTURE_PUBLIC_MINIMAL ?? 'fixture/public/minimal');
export const notwinsDir = resolve(process.env.FIXTURE_PUBLIC_NOTWINS ?? 'fixture/public/notwins');
export const multilingualDir = resolve(
  process.env.FIXTURE_PUBLIC_MULTILINGUAL ?? 'fixture/public/multilingual',
);
export const llmsoffDir = resolve(process.env.FIXTURE_PUBLIC_LLMSOFF ?? 'fixture/public/llmsoff');
export const edgeDir = resolve(process.env.FIXTURE_PUBLIC_EDGE ?? 'fixture/public/edge');
export const offDir = resolve(process.env.FIXTURE_PUBLIC_OFF ?? 'fixture/public/off');
export const nsoffDir = resolve(process.env.FIXTURE_PUBLIC_NSOFF ?? 'fixture/public/nsoff');
export const badtablesDir = resolve(
  process.env.FIXTURE_PUBLIC_BADTABLES ?? 'fixture/public/badtables',
);
export const shadowDir = resolve(process.env.FIXTURE_PUBLIC_SHADOW ?? 'fixture-shadow/public');
export const paginatedDir = resolve(
  process.env.FIXTURE_PUBLIC_PAGINATED ?? 'fixture-paginated/public',
);

export function read(rel, dir = publicDir) {
  return readFileSync(join(dir, rel), 'utf8');
}

export function exists(rel, dir = publicDir) {
  return existsSync(join(dir, rel));
}

// Strips the origin, query and fragment from a URL, leaving the site-relative
// path. The module emits ABSOLUTE URLs in its machine-read documents, while
// the published tree is addressed by path, so comparisons between the two go
// through here rather than through an ad-hoc regex per spec.
export function siteRelative(url) {
  return url
    .split('?')[0]
    .split('#')[0]
    .replace(/^https?:\/\/[^/]+/, '');
}

// Resolves a site-relative URL to its published file path, tolerating both
// the directory form (/blog/post/) and the file form (/blog/post/index.md).
export function publishedPath(url, dir = publicDir) {
  const rel = siteRelative(url).replace(/^\//, '');
  const direct = join(dir, rel);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const indexed = join(dir, rel, 'index.html');
  if (existsSync(indexed)) return indexed;
  return direct;
}

export function urlResolves(url, dir = publicDir) {
  const p = publishedPath(url, dir);
  return existsSync(p) && statSync(p).isFile();
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// Every published Markdown twin, as site-relative URLs.
export function publishedTwins(dir = publicDir) {
  const out = [];
  const walk = (d, prefix) => {
    for (const entry of readdirSync(d, {withFileTypes: true})) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p, `${prefix}${entry.name}/`);
      else if (entry.name === 'index.md') out.push(`/${prefix}index.md`);
    }
  };
  walk(dir, '');
  return out.sort();
}

// Splits a generated Markdown document into its front-matter block and body.
export function splitFrontMatter(text) {
  if (!text.startsWith('---\n')) return {frontMatter: null, body: text};
  const end = text.indexOf('\n---\n', 3);
  if (end === -1) return {frontMatter: null, body: text};
  return {frontMatter: text.slice(4, end + 1), body: text.slice(end + 5)};
}

// All Markdown links in a document, as {text, url}.
export function markdownLinks(text) {
  return [...text.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)].map((m) => ({text: m[1], url: m[2]}));
}

// Top-level bullets under each `## ` heading, keyed by heading text. A nested
// bullet is indented, so this is exactly the count the facts document's
// per-section page count must equal.
export function sectionsWithTopLevelBullets(text) {
  const out = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      current = heading[1];
      out.set(current, []);
    } else if (current && /^- /.test(line)) {
      out.get(current).push(line);
    }
  }
  return out;
}

export function buildLog(which = 'baseline') {
  const keys = {
    baseline: 'HUGO_BUILD_LOG',
    configured: 'HUGO_BUILD_LOG_CONFIGURED',
    minimal: 'HUGO_BUILD_LOG_MINIMAL',
    notwins: 'HUGO_BUILD_LOG_NOTWINS',
    multilingual: 'HUGO_BUILD_LOG_MULTILINGUAL',
    llmsoff: 'HUGO_BUILD_LOG_LLMSOFF',
    edge: 'HUGO_BUILD_LOG_EDGE',
    off: 'HUGO_BUILD_LOG_OFF',
    badtables: 'HUGO_BUILD_LOG_BADTABLES',
    nsoff: 'HUGO_BUILD_LOG_NSOFF',
    shadow: 'HUGO_BUILD_LOG_SHADOW',
    paginated: 'HUGO_BUILD_LOG_PAGINATED',
  };
  // Throwing rather than returning '' is deliberate. A missing build name
  // used to resolve process.env[undefined] to undefined and yield an empty
  // log, so every warnCount against it returned 0 and any assertion built on
  // it passed while proving nothing.
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

export const BASE_URL = 'https://fixture.example';
