/* global process */
// Shared helpers for the build-output assertion specs.
//
// The runner exports three published trees, and all three are load-bearing:
// FIXTURE_PUBLIC (every content-license key unset), FIXTURE_PUBLIC_CONFIGURED
// (the license table filled and both switches on), and FIXTURE_PUBLIC_SHADOW
// (a fixture that ships its own layouts/robots.txt). It also exports the
// captured build logs, so warning-count assertions read what Hugo actually
// said rather than re-deriving it.
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
export const shadowDir = resolve(process.env.FIXTURE_PUBLIC_SHADOW ?? 'fixture-shadow/public');

export function read(rel, dir = publicDir) {
  return readFileSync(join(dir, rel), 'utf8');
}

export function exists(rel, dir = publicDir) {
  return existsSync(join(dir, rel));
}

// Resolves a site-relative URL to its published file path, tolerating both
// the directory form (/blog/post/) and the file form (/blog/post/index.md).
export function publishedPath(url, dir = publicDir) {
  const clean = url
    .split('?')[0]
    .split('#')[0]
    .replace(/^https?:\/\/[^/]+/, '');
  const rel = clean.replace(/^\//, '');
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
  const key = {
    baseline: 'HUGO_BUILD_LOG',
    configured: 'HUGO_BUILD_LOG_CONFIGURED',
    shadow: 'HUGO_BUILD_LOG_SHADOW',
  }[which];
  const p = process.env[key];
  return p ? readFileSync(resolve(p), 'utf8') : '';
}

export function warnCount(pattern, which = 'baseline') {
  return buildLog(which)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('WARN') && pattern.test(line)).length;
}

export const BASE_URL = 'https://fixture.example';
