/* global process */
// Shared helpers for the build-output assertion specs. The runner exports one
// FIXTURE_PUBLIC_* directory and one HUGO_BUILD_LOG_* file per environment,
// plus FIXTURE_DIR (the fixture source tree, which is where the committed
// rasters and fonts live) and HUGO_VERSION.
//
// Everything a spec needs about a page is reached through its RECORD, the
// JSON sidecar layouts/_partials/fixture/record.html publishes beside the
// site: what the module was handed, what it resolved, and which cards it
// returned. The pages themselves are enumerated from a module-independent
// inventory the home page writes out of Hugo's own page set, so a claim about
// what got no card is made against everything Hugo built rather than against
// a list someone remembered to update.
import {readFileSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {decodePng} from './lib/raster.js';

const dir = (name, fallback) => resolve(process.env[name] ?? fallback);

export const fixtureDir = dir('FIXTURE_DIR', 'fixture');
// [params.ogcard] entirely absent: the only build that can tell "inert when
// unconfigured" from "works".
export const baselineDir = dir('FIXTURE_PUBLIC_BASELINE', 'fixture/public/baseline');
// The working card set, and the only build whose log has to be silent.
export const configuredDir = dir('FIXTURE_PUBLIC_CONFIGURED', 'fixture/public/configured');
// Every fault class at once, each on its own section, template or slot.
export const degradedDir = dir('FIXTURE_PUBLIC_DEGRADED', 'fixture/public/degraded');
// Two languages, so a configuration read through the page's own language and
// one read through the rendering language stop agreeing.
export const multilingualDir = dir('FIXTURE_PUBLIC_MULTILINGUAL', 'fixture/public/multilingual');
// A baseURL carrying a path, which is the only shape in which a card URL that
// keeps the base path and one that drops it are different bytes.
export const subpathDir = dir('FIXTURE_PUBLIC_SUBPATH', 'fixture/public/subpath');
// The only build that sets default_template, the tier `configured` proves the
// opposite statement about.
export const routingDir = dir('FIXTURE_PUBLIC_ROUTING', 'fixture/public/routing');

const LOG_KEYS = {
  baseline: 'HUGO_BUILD_LOG_BASELINE',
  configured: 'HUGO_BUILD_LOG_CONFIGURED',
  degraded: 'HUGO_BUILD_LOG_DEGRADED',
  multilingual: 'HUGO_BUILD_LOG_MULTILINGUAL',
  subpath: 'HUGO_BUILD_LOG_SUBPATH',
  routing: 'HUGO_BUILD_LOG_ROUTING',
};

export function buildLog(which) {
  if (!Object.hasOwn(LOG_KEYS, which))
    throw new Error(`buildLog: unknown build ${JSON.stringify(which)}`);
  const p = process.env[LOG_KEYS[which]];
  return p ? readFileSync(resolve(p), 'utf8') : '';
}

// Every warning line the module emitted in a build. The module prefixes all of
// them with [og-image], which is what separates its diagnostics from Hugo's.
export function moduleWarnings(which) {
  return buildLog(which)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('WARN') && line.includes('[og-image]'))
    .map((line) => line.slice(line.indexOf('[og-image]')));
}

export function inventory(publicDir, lang = 'en') {
  return JSON.parse(readFileSync(join(publicDir, 'inventory', lang, 'pages.json'), 'utf8')).pages;
}

export function crossLanguage(publicDir, renderedBy) {
  return JSON.parse(readFileSync(join(publicDir, 'crosslang', renderedBy, 'pages.json'), 'utf8'))
    .pages;
}

export function record(publicDir, page) {
  return JSON.parse(readFileSync(join(publicDir, page.sidecar), 'utf8'));
}

// Every page of a build with its record attached, keyed by the page's logical
// path, which is the identity a spec names a page by.
export function records(publicDir, lang = 'en') {
  const out = new Map();
  for (const page of inventory(publicDir, lang))
    out.set(page.path, {page, ...record(publicDir, page)});
  return out;
}

// A published card URL turned into the file it names. Under a baseURL that
// carries a path the URL keeps that path and the file does not, which is what
// `basePath` strips.
export function cardPath(publicDir, url, basePath = '') {
  const rel = basePath && url.startsWith(basePath) ? url.slice(basePath.length) : url;
  return join(publicDir, rel.replace(/^\//, ''));
}

export function cardBytes(publicDir, url, basePath = '') {
  return readFileSync(cardPath(publicDir, url, basePath));
}

export function cardImage(publicDir, url, basePath = '') {
  return decodePng(cardBytes(publicDir, url, basePath));
}

export function cardExists(publicDir, url, basePath = '') {
  return existsSync(cardPath(publicDir, url, basePath));
}

export function fixtureAsset(rel) {
  return readFileSync(join(fixtureDir, 'assets', rel));
}

// The regions the two configured text slots draw in. Reading a slot inside its
// own box is what keeps the title assertions from measuring the description,
// and keeps both of them away from the overlay's corner.
export const TITLE_REGION = {x: 60, y: 100, width: 1050, height: 300};
export const DESCRIPTION_REGION = {x: 60, y: 400, width: 1000, height: 170};

// The flat colors the fixture's committed rasters carry. One color per
// template is what makes "which background was composited" a corner pixel
// rather than a guess.
export const BACKGROUNDS = {
  home: {r: 0x0a, g: 0x14, b: 0x1e},
  post: {r: 0x1e, g: 0x0a, b: 0x14},
  german: {r: 0x0a, g: 0x1e, b: 0x14},
  wrongSize: {r: 0x14, g: 0x32, b: 0x0a},
};

export const BADGE = {r: 0xfa, g: 0x00, b: 0x00};
export const TITLE_COLOR = {r: 0xff, g: 0xd4, b: 0x00};
export const DESCRIPTION_COLOR = {r: 0x33, g: 0xcc, b: 0xff};

// The title slot's box in the configured environment, in canvas pixels. Every
// wrapping expectation is derived from these three numbers and the 600 per
// mille monospace width table, never read off a rendered card.
export const TITLE_BOX = {x: 72, y: 120, width: 1040, size: 64, lineHeight: 1.4, maxLines: 3};

// Go Mono advances every glyph by 1229/2048 of the em, so at the title slot's
// base size the advance is 64 * 0.60009765625, which rounds to the 38.4 the
// calibration page measures.
export const MONO_EM_RATIO = 1229 / 2048;

// The distance between two band tops, which is the pitch the engine drew at
// and therefore the size it fitted at. Taken end to end rather than pairwise
// because a band's top is set by the tallest glyph on its line, so a single
// gap can be a pixel out while the span across all of them is not.
export function bandPitch(bands) {
  if (bands.length < 2) return null;
  return (bands[bands.length - 1].top - bands[0].top) / (bands.length - 1);
}

export const expectedPitch = (size, lineHeight = TITLE_BOX.lineHeight) =>
  Math.round(size * lineHeight);
