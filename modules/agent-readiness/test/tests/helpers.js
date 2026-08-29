/* global process */
// Shared helpers for the build-output assertion specs.
//
// The runner exports TWENTY-FOUR published trees, and every one of them is
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
// FIXTURE_PUBLIC_OFF (the master switch ALONE, false, with all five formats
// still wired -- the only shape that exercises the `enable` conjunct in any
// renderer), FIXTURE_PUBLIC_BADTABLES (the section arrays written as bare
// strings), FIXTURE_PUBLIC_NSOFF (the whole [params] agent namespace written
// as a bare value), FIXTURE_PUBLIC_NOSECTIONPAGES (the single key
// section_pages = false on top of the default configuration, the only build
// in which stripping the roster block from a baseline section twin must
// reproduce the published twin byte for byte), FIXTURE_PUBLIC_NOLINKMD (the
// single key link_markdown = false with the twins left on, the only build in
// which that conjunct alone decides whether llms.txt names a twin),
// FIXTURE_PUBLIC_NOBUILDTIME (the three per-surface build_time switches set
// false on top of the default configuration, the only build in which those
// switches decide a published byte),
// FIXTURE_PUBLIC_LLMSINDEXOFF (the single key llms_index.enable = false with
// the llmsindex format still wired, the only build in which that conjunct
// alone decides whether the complete index exists -- and the half of the
// contract that must stay SILENT, because the surface was switched off
// deliberately), FIXTURE_PUBLIC_UNWIRED (the complete index left enabled
// while llmsindex is absent from the [outputs] home list, which is the state
// every existing consumer lands in after upgrading, and the only build that
// must emit the wire-it-up warning),
// FIXTURE_PUBLIC_NOLINKINDEXES (NEITHER link-index format wired while both
// surfaces stay enabled -- the minimal-adoption shape, and the complement of
// `unwired`: it is the build that must stay SILENT about the complete index,
// while the twins' pointer section, having nothing left to name, is dropped
// with one warning of its own), FIXTURE_PUBLIC_NOCOMPACT (the mirror of
// `unwired` -- `llmsindex` wired while `llmstxt` is not, the only build in
// which the pointer section carries the complete index alone and the only one
// in which the compact index's own publish gate decides a byte),
// FIXTURE_PUBLIC_STRICTSKILLS (the single key
// skills_index.on_supporting_files = 'omit' over the default configuration,
// the only build in which a skill proven to ship supporting files is refused
// rather than published with a warning, so the whole omit branch executes
// nowhere else),
// FIXTURE_PUBLIC_SHADOW (a
// fixture that ships its own layouts/robots.txt), FIXTURE_PUBLIC_PAGINATED
// (a fixture whose single section spills past pagerSize, the only shape in
// which a surface can be caught enumerating pager shells alongside the pages
// they list), FIXTURE_PUBLIC_WIDGETS (a fixture importing every widget
// shortcode module, the only shape in which a page twin can be caught
// embedding widget BEM HTML or inline SVG instead of the compact Markdown
// citations the markdown shortcode variants emit), and FIXTURE_PUBLIC_EXTRA
// (a fixture carrying a consumer-authored twin-extra hook partial and an
// agent_sitemap_heading i18n override, the only shape in which the hook
// contract and the override-wins-over-both-defaults precedence can be
// proven together). It also
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
export const multihostDir = resolve(
  process.env.FIXTURE_PUBLIC_MULTIHOST ?? 'fixture/public/multihost',
);
export const llmsoffDir = resolve(process.env.FIXTURE_PUBLIC_LLMSOFF ?? 'fixture/public/llmsoff');
export const edgeDir = resolve(process.env.FIXTURE_PUBLIC_EDGE ?? 'fixture/public/edge');
// The same environment with canonifyURLs on. That setting makes the whole
// Page family stop emitting the baseURL path, and Hugo repairs the loss in
// HTML output only -- never in llms.txt, a Markdown twin, the facts document
// or the skills index, which is everything this module publishes. Every URL
// in them rides .Permalink or absURL, so this tree must match the one above.
export const edgeCanonifyDir = resolve(
  process.env.FIXTURE_PUBLIC_EDGE_CANONIFY ?? 'fixture/public/edge-canonify',
);
export const offDir = resolve(process.env.FIXTURE_PUBLIC_OFF ?? 'fixture/public/off');
export const nsoffDir = resolve(process.env.FIXTURE_PUBLIC_NSOFF ?? 'fixture/public/nsoff');
export const badtablesDir = resolve(
  process.env.FIXTURE_PUBLIC_BADTABLES ?? 'fixture/public/badtables',
);
export const nolinkmdDir = resolve(
  process.env.FIXTURE_PUBLIC_NOLINKMD ?? 'fixture/public/nolinkmd',
);
export const nosectionpagesDir = resolve(
  process.env.FIXTURE_PUBLIC_NOSECTIONPAGES ?? 'fixture/public/nosectionpages',
);
export const nobuildtimeDir = resolve(
  process.env.FIXTURE_PUBLIC_NOBUILDTIME ?? 'fixture/public/nobuildtime',
);
export const llmsindexoffDir = resolve(
  process.env.FIXTURE_PUBLIC_LLMSINDEXOFF ?? 'fixture/public/llmsindexoff',
);
export const unwiredDir = resolve(process.env.FIXTURE_PUBLIC_UNWIRED ?? 'fixture/public/unwired');
export const nolinkindexesDir = resolve(
  process.env.FIXTURE_PUBLIC_NOLINKINDEXES ?? 'fixture/public/nolinkindexes',
);
export const nocompactDir = resolve(
  process.env.FIXTURE_PUBLIC_NOCOMPACT ?? 'fixture/public/nocompact',
);
export const strictskillsDir = resolve(
  process.env.FIXTURE_PUBLIC_STRICTSKILLS ?? 'fixture/public/strictskills',
);
export const shadowDir = resolve(process.env.FIXTURE_PUBLIC_SHADOW ?? 'fixture-shadow/public');
export const paginatedDir = resolve(
  process.env.FIXTURE_PUBLIC_PAGINATED ?? 'fixture-paginated/public',
);
export const widgetsDir = resolve(process.env.FIXTURE_PUBLIC_WIDGETS ?? 'fixture-widgets/public');
export const extraDir = resolve(process.env.FIXTURE_PUBLIC_EXTRA ?? 'fixture-extra/public');

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

// All Markdown links in a document, as {text, url}. The text side tolerates
// backslash-escaped characters, because the module's link builder emits `\]`
// for a title carrying a bracket -- without that tolerance, every hostile-
// title line silently drops out of every URL sweep built on this helper and
// its URL is never resolution-checked.
export function markdownLinks(text) {
  return [...text.matchAll(/\[((?:\\.|[^\]\\])*)\]\(([^)]+)\)/g)].map((m) => ({
    text: m[1],
    url: m[2],
  }));
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

// A narrowed section of the compact llms.txt opens with one DISCLOSURE bullet
// rather than a page (agent-readiness/lib/llms-partial-notice.html), so every
// assertion about which pages a section lists has to separate the two. The
// separation lives here, once, because two spec files ask for it and two
// private copies would be free to disagree about what the notice looks like.
//
// The pattern matches both shapes the notice has: linked, when the complete
// index publishes, and linkless, when it does not. It matches the ENGLISH
// sentence, which every fixture that builds a section renders -- the Russian
// tree of the multilingual build carries no content and therefore no section.
const SELECTION_NOTICE = /^- (?:\[[^\]]*\]\([^)]*\): )?This section lists (\d+) of (\d+) pages;/;

// The section's bullets with the notice removed: the pages, and only them.
export function pageBullets(lines) {
  return (lines ?? []).filter((line) => !SELECTION_NOTICE.test(line));
}

// The notice itself, parsed, or null when the section carries none. Throws on
// a second one: two notices under one heading would be a renderer defect that
// every count-based assertion would otherwise absorb silently.
export function selectionNotice(lines) {
  const hits = (lines ?? []).filter((line) => SELECTION_NOTICE.test(line));
  if (hits.length === 0) return null;
  if (hits.length > 1) {
    throw new Error(`a section carries ${hits.length} selection notices, which is never right`);
  }
  const [, kept, total] = SELECTION_NOTICE.exec(hits[0]);
  return {
    line: hits[0],
    index: (lines ?? []).indexOf(hits[0]),
    kept: Number(kept),
    total: Number(total),
    url: markdownLinks(hits[0])[0]?.url ?? '',
  };
}

// The fixture-only `twindump` surface, parsed into its three blocks. It lives
// here rather than in one spec because two specs read it: 09 asserts the
// twin-url, surfaces and llms-url enumerations, 11 asserts the exposed build
// stamp. Two private copies of this parser would be free to drift from the one
// layout that writes the file.
//
// Every block is tab-separated, because a logical page path can carry any
// other character.
const SURFACES_MARKER = '== surfaces ==';
const LLMS_URL_MARKER = '== llms url ==';
const BUILD_TIME_MARKER = '== build time ==';

export function parseDump(rel, dir) {
  const lines = read(rel, dir).split('\n');
  const surfaces = lines.indexOf(SURFACES_MARKER);
  const llmsUrl = lines.indexOf(LLMS_URL_MARKER);
  const buildTime = lines.indexOf(BUILD_TIME_MARKER);
  if (surfaces === -1) throw new Error(`${rel} must carry the ${SURFACES_MARKER} line`);
  if (llmsUrl === -1) throw new Error(`${rel} must carry the ${LLMS_URL_MARKER} line`);
  if (buildTime === -1) throw new Error(`${rel} must carry the ${BUILD_TIME_MARKER} line`);
  const block = (slice) => {
    const out = new Map();
    for (const line of slice) {
      if (line === '') continue;
      const tab = line.indexOf('\t');
      if (tab === -1) throw new Error(`${rel}: ${JSON.stringify(line)} must be tab-separated`);
      out.set(line.slice(0, tab), line.slice(tab + 1));
    }
    return out;
  };
  return {
    twins: block(lines.slice(0, surfaces)),
    surfaces: block(lines.slice(surfaces + 1, llmsUrl)),
    // One entry per page, like `twins`, because llms-url.html is page-shaped
    // by contract and its answer is deliberately NOT filtered by the
    // membership rules that empty a twin -- a page withheld from the twins
    // still has a covering llms.txt. See the dump layout.
    llmsUrls: block(lines.slice(llmsUrl + 1, buildTime)),
    // The value agent-readiness/build-time.html EXPOSES, which is a different
    // observation from the values the module writes into its own documents:
    // the acceptance criterion is that the two agree. `store` is the
    // white-box probe of the module's own hugo.Store entry -- see the dump
    // layout for why an equality-only check cannot discriminate the
    // mechanism on a sub-second build.
    buildTime: block(lines.slice(buildTime + 1)).get('build_time'),
    buildTimeStore: block(lines.slice(buildTime + 1)).get('store'),
  };
}

// Every path the fixture origin was asked for, across every build of the run,
// as a Set. `serve-origin.mjs` truncates its log before opening the socket and
// appends one `<method> <path>` line per request; the method is dropped here
// because `resources.GetRemote` issues nothing but GET.
//
// A SET, not a list, and deliberately not a count. The log spans all
// twenty-four builds, so a per-build count is neither derivable from it nor
// stable -- request counts were measured varying run to run on one route.
// What IS stable,
// and what the assertions built on this need, is whether a path was EVER asked
// for: a guard that refuses to probe a candidate and a budget that stops after
// four both claim exactly that, and a published tree cannot show it.
//
// The path is fixed by the origin rather than passed in by a runner, so there
// is one place to keep it in step rather than three.
const ORIGIN_REQUEST_LOG = resolve(moduleRoot, 'test/fixture-origin-requests.log');

export function originRequestedPaths() {
  if (!existsSync(ORIGIN_REQUEST_LOG)) {
    // Throwing rather than returning an empty set: an absent log makes every
    // "was never requested" assertion pass while proving nothing, which is the
    // exact failure the buildLog map above throws for.
    throw new Error(
      `${ORIGIN_REQUEST_LOG} is missing. The fixture origin writes it as it starts, so the builds ran without one; drive the suite through run-tests.sh or run-tests.cmd.`,
    );
  }
  const paths = readFileSync(ORIGIN_REQUEST_LOG, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line !== '')
    .map((line) => line.slice(line.indexOf(' ') + 1));
  if (paths.length === 0) {
    throw new Error(
      `${ORIGIN_REQUEST_LOG} is empty, so no build fetched anything from the origin.`,
    );
  }
  return new Set(paths);
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
    'edge-canonify': 'HUGO_BUILD_LOG_EDGE_CANONIFY',
    off: 'HUGO_BUILD_LOG_OFF',
    badtables: 'HUGO_BUILD_LOG_BADTABLES',
    nsoff: 'HUGO_BUILD_LOG_NSOFF',
    nosectionpages: 'HUGO_BUILD_LOG_NOSECTIONPAGES',
    // `nolinkmd` was missing from this map although both runners export its
    // log and the spec suite exports its published tree, so buildLog('nolinkmd')
    // threw for a build that has existed since the environment was added.
    nolinkmd: 'HUGO_BUILD_LOG_NOLINKMD',
    nobuildtime: 'HUGO_BUILD_LOG_NOBUILDTIME',
    llmsindexoff: 'HUGO_BUILD_LOG_LLMSINDEXOFF',
    unwired: 'HUGO_BUILD_LOG_UNWIRED',
    nolinkindexes: 'HUGO_BUILD_LOG_NOLINKINDEXES',
    nocompact: 'HUGO_BUILD_LOG_NOCOMPACT',
    strictskills: 'HUGO_BUILD_LOG_STRICTSKILLS',
    shadow: 'HUGO_BUILD_LOG_SHADOW',
    paginated: 'HUGO_BUILD_LOG_PAGINATED',
    widgets: 'HUGO_BUILD_LOG_WIDGETS',
    extra: 'HUGO_BUILD_LOG_EXTRA',
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
