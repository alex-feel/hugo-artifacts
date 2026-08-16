/* global process */
// Shared helpers for the build-output assertion specs. The runner exports one
// FIXTURE_PUBLIC_* directory and one HUGO_BUILD_LOG_* file per environment,
// plus FIXTURE_DIR (the fixture source tree, which is where the committed
// hand-written rules live) and HUGO_VERSION.
//
// The central helper is publishedUrls(): it walks a build tree and turns every
// file into the URL that serves it. A manifest claim is checked against THAT
// rather than against a list someone remembered to update, which is the only
// way "every URL this build publishes" can be asserted rather than asserted
// about.
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {resolve, join} from 'node:path';

const dir = (name, fallback) => resolve(process.env[name] ?? fallback);

export const fixtureDir = dir('FIXTURE_DIR', 'fixture');
// [params.url_retirement] entirely absent: what a site that configured nothing
// gets.
export const baselineDir = dir('FIXTURE_PUBLIC_BASELINE', 'fixture/public/baseline');
// Every knob turned at once, and a build whose log has to be silent.
export const configuredDir = dir('FIXTURE_PUBLIC_CONFIGURED', 'fixture/public/configured');
// Every fault class at once, each on its own key.
export const degradedDir = dir('FIXTURE_PUBLIC_DEGRADED', 'fixture/public/degraded');
// enable = false: both documents are still published, and both are empty.
export const offDir = dir('FIXTURE_PUBLIC_OFF', 'fixture/public/off');
// Two languages writing one _redirects file and two manifests.
export const multilingualDir = dir('FIXTURE_PUBLIC_MULTILINGUAL', 'fixture/public/multilingual');
// A baseURL carrying a path: the only shape in which a rule that keeps the base
// segment and one that drops it are different bytes.
export const subpathDir = dir('FIXTURE_PUBLIC_SUBPATH', 'fixture/public/subpath');
// The same baseURL with canonifyURLs, under which .RelPermalink stops carrying
// that segment on its own. The two builds must agree byte for byte.
export const canonifyDir = dir('FIXTURE_PUBLIC_CANONIFY', 'fixture/public/canonify');

const LOG_KEYS = {
  baseline: 'HUGO_BUILD_LOG_BASELINE',
  configured: 'HUGO_BUILD_LOG_CONFIGURED',
  degraded: 'HUGO_BUILD_LOG_DEGRADED',
  off: 'HUGO_BUILD_LOG_OFF',
  multilingual: 'HUGO_BUILD_LOG_MULTILINGUAL',
  subpath: 'HUGO_BUILD_LOG_SUBPATH',
  canonify: 'HUGO_BUILD_LOG_CANONIFY',
  hostile: 'HUGO_BUILD_LOG_HOSTILE',
};

export function buildLog(which) {
  if (!Object.hasOwn(LOG_KEYS, which))
    throw new Error(`buildLog: unknown build ${JSON.stringify(which)}`);
  const p = process.env[LOG_KEYS[which]];
  return p ? readFileSync(resolve(p), 'utf8') : '';
}

// Every warning line the module emitted in a build. The module prefixes all of
// them with [url-retirement], which is what separates its diagnostics from
// Hugo's own.
export function moduleWarnings(which) {
  return buildLog(which)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('WARN') && line.includes('[url-retirement]'))
    .map((line) => line.slice(line.indexOf('[url-retirement]')));
}

export function readDoc(publicDir, rel) {
  return readFileSync(join(publicDir, rel), 'utf8');
}

export const docExists = (publicDir, rel) => existsSync(join(publicDir, rel));

// The rules of a _redirects file: comments and blank lines dropped, each
// remaining line split into its fields.
export function redirectRules(publicDir, rel = '_redirects') {
  return readDoc(publicDir, rel)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const [from, to, status] = line.split(/\s+/);
      return {from, to, status, line};
    });
}

// A manifest split into its comment header and its URL body.
export function manifest(publicDir, rel = 'url-manifest.txt') {
  const lines = readDoc(publicDir, rel).split(/\r?\n/);
  return {
    header: lines.filter((line) => line.startsWith('#')),
    urls: lines.filter((line) => line !== '' && !line.startsWith('#')),
  };
}

// Every URL a build tree serves, derived from the tree itself. `index.html` is
// the file behind a directory URL, so it collapses to the directory; every
// other file is served at its own path.
export function publishedUrls(publicDir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs).sort()) {
      const childAbs = join(abs, entry);
      const childRel = rel === '' ? entry : `${rel}/${entry}`;
      if (statSync(childAbs).isDirectory()) {
        walk(childAbs, childRel);
      } else if (entry === 'index.html') {
        out.push(rel === '' ? '/' : `/${rel}/`);
      } else {
        out.push(`/${childRel}`);
      }
    }
  };
  walk(publicDir, '');
  return out;
}

// The paths of the fixture's paginated list pages, which exist in no sitemap
// and in no page collection: only a walk of the build tree names them.
export const pagerUrls = (publicDir) =>
  publishedUrls(publicDir).filter((u) => /\/page\/\d+\/$/.test(u));

export const fixtureRules = () =>
  readFileSync(join(fixtureDir, 'assets', 'url-retirement', '_redirects'), 'utf8');
