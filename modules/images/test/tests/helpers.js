/* global process */
// Shared helpers for the build-output assertion specs. The runner exports
// FIXTURE_PUBLIC (the fixture's public/ directory), HUGO_BUILD_LOG (the
// captured hugo build log), HUGO_VERSION (the building hugo's semver), and
// IMAGES_SUBPATH_PUBLIC plus IMAGES_CANONIFY_PUBLIC (the two overlay builds,
// published as subdirectories of FIXTURE_PUBLIC and read only by
// 11-subpath.spec.js).
import {readFileSync, existsSync, statSync, readdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {parse} from 'node-html-parser';

export const publicDir = resolve(process.env.FIXTURE_PUBLIC ?? 'fixture/public');

export const hugoVersion = (process.env.HUGO_VERSION ?? '0.0.0')
  .split('.')
  .map((n) => Number.parseInt(n, 10) || 0);

export function hugoAtLeast(major, minor) {
  const [M, m] = hugoVersion;
  return M > major || (M === major && m >= minor);
}

export function rawHtml(rel) {
  return readFileSync(join(publicDir, rel), 'utf8');
}

export function dom(rel) {
  return parse(rawHtml(rel));
}

// Resolves a site-relative URL (e.g. "/bundle/x_hu123.png") to its published file path.
export function publishedPath(url) {
  return join(publicDir, url.replace(/^\//, '').split('?')[0].split('#')[0]);
}

export function publishedNonEmpty(url) {
  const p = publishedPath(url);
  return existsSync(p) && statSync(p).size > 0;
}

export function srcsetEntries(srcset) {
  return srcset.split(',').map((e) => {
    const [url, desc] = e.trim().split(/\s+/);
    return {url, desc};
  });
}

export function buildLog() {
  const p = process.env.HUGO_BUILD_LOG;
  return p ? readFileSync(resolve(p), 'utf8') : '';
}

// Counts WARN lines in the build log whose text matches the pattern.
export function warnCount(pattern) {
  return buildLog()
    .split(/\r?\n/)
    .filter((line) => line.startsWith('WARN') && pattern.test(line)).length;
}

// The overlay builds are published INSIDE public/ (as public/subpath and
// public/canonify), which is what keeps the repository's public/-scoped
// ignore rules covering their output. Each is a FURTHER copy of the same
// site, so the recursive walk below must never count one as part of the
// default build's output.
const overlayBuildDirs = new Set(
  [process.env.IMAGES_SUBPATH_PUBLIC, process.env.IMAGES_CANONIFY_PUBLIC]
    .filter(Boolean)
    .map((dir) => resolve(dir)),
);

// Recursively lists all published files with the given extension.
export function publishedFilesWithExt(ext, dir = publicDir) {
  const out = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (overlayBuildDirs.has(resolve(p))) continue;
      out.push(...publishedFilesWithExt(ext, p));
    } else if (entry.name.endsWith(ext)) out.push(p);
  }
  return out;
}
