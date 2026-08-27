/* global process */
// Shared helpers for the accordion build-output assertion specs.
//
// The runner publishes the SAME fixture twice: FIXTURE_PUBLIC (Hugo's default
// Markdown settings) and FIXTURE_PUBLIC_UNSAFE (the same fixture with
// markup.goldmark.renderer.unsafe on). Both captured build logs are exported
// too, so log assertions read what Hugo actually said rather than re-deriving
// it.
//
// The parsing is deliberately hand-rolled rather than DOM-based: several
// assertions are about what the published BYTES contain -- a bare `open`
// attribute rather than open="true", the absence of any aria-* attribute, an
// id on the body element rather than on the details element -- and a parsed
// DOM normalizes some of exactly that.
import {readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';

export const defaultDir = resolve(process.env.FIXTURE_PUBLIC ?? 'fixture/public/default');
export const unsafeDir = resolve(process.env.FIXTURE_PUBLIC_UNSAFE ?? 'fixture/public/unsafe');

// Every spec that must hold in both trees ranges over this, so a new build
// never has to be wired into each spec by hand.
export const BUILDS = [
  {name: 'default', dir: defaultDir, logKey: 'HUGO_BUILD_LOG'},
  {name: 'unsafe', dir: unsafeDir, logKey: 'HUGO_BUILD_LOG_UNSAFE'},
];

// The fixture's published documents, by the surface each one covers.
export const PAGES = {
  home: 'index.html',
  groups: 'groups/index.html',
  ids: 'ids/index.html',
  nesting: 'nesting/index.html',
  degrade: 'degrade/index.html',
  idCollision: 'id-collision/index.html',
  layout: 'layout-path/index.html',
  rerender: 'rerender/index.html',
  markdownTwin: 'index.md',
};

// The second HTML-family rendering of PAGES.rerender. It is kept out of PAGES
// because the specs that sweep every HTML page would then read the same page
// twice; 08-rerender.spec.js reads it deliberately, as the pair.
export const AMP_RERENDER = 'amp/rerender/index.html';

export function read(rel, dir = defaultDir) {
  return readFileSync(join(dir, rel), 'utf8');
}

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

// The index just past the '>' that closes the tag starting at `at`. Quote
// aware, so a '>' inside an attribute value cannot end the tag early.
function tagEnd(source, at) {
  let quote = null;
  for (let i = at + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i + 1;
    }
  }
  return source.length;
}

// Every tag and comment in a fragment, with its byte span.
function scanTags(source) {
  const out = [];
  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) break;
    if (source.startsWith('<!--', lt)) {
      const close = source.indexOf('-->', lt);
      const end = close === -1 ? source.length : close + 3;
      out.push({kind: 'comment', name: '', raw: source.slice(lt, end), start: lt, end});
      i = end;
      continue;
    }
    const end = tagEnd(source, lt);
    const raw = source.slice(lt, end);
    const named = /^<\/?\s*([a-zA-Z][^\s/>]*)/.exec(raw);
    if (!named) {
      i = end;
      continue;
    }
    const name = named[1].toLowerCase();
    const closing = raw.startsWith('</');
    const selfClosing = /\/>$/.test(raw) || VOID_ELEMENTS.has(name);
    out.push({kind: closing ? 'close' : selfClosing ? 'self' : 'open', name, raw, start: lt, end});
    i = end;
  }
  return out;
}

// A single attribute value off an opening tag; null when the attribute is
// absent, so a spec asserts presence with its own message. Bare boolean
// attributes (`open`) are NOT reported here -- hasBareAttr covers those.
export function attr(openTag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(openTag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

// True when the opening tag carries `name` as a valueless boolean attribute,
// which is the only shape the module is allowed to emit `open` in.
export function hasBareAttr(openTag, name) {
  return new RegExp(`\\s${name}(?=[\\s>/])`, 'i').test(openTag);
}

export function classesOf(openTag) {
  return (attr(openTag, 'class') ?? '').split(/\s+/).filter(Boolean);
}

// Every element of `tagName` in a fragment, at any depth, in document order,
// each with its raw opening tag, its inner bytes, and its outer bytes.
export function elements(fragment, tagName) {
  const tokens = scanTags(fragment);
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const open = tokens[i];
    if (open.kind !== 'open' || open.name !== tagName) continue;
    let depth = 1;
    for (let j = i + 1; j < tokens.length; j += 1) {
      const t = tokens[j];
      if (t.kind === 'open' && t.name === tagName) depth += 1;
      else if (t.kind === 'close' && t.name === tagName) {
        depth -= 1;
        if (depth === 0) {
          out.push({
            openTag: open.raw,
            classes: classesOf(open.raw),
            inner: fragment.slice(open.end, t.start),
            outer: fragment.slice(open.start, t.end),
            start: open.start,
          });
          break;
        }
      }
    }
  }
  return out;
}

export function byClass(fragment, tagName, classToken) {
  return elements(fragment, tagName).filter((e) => e.classes.includes(classToken));
}

// The module's own structures, resolved together so a spec reads one item as
// a whole rather than re-deriving the relationship between its parts.
export function items(html) {
  return elements(html, 'details')
    .filter((d) => d.classes.includes('accordion__item'))
    .map((d) => {
      const summary = byClass(d.inner, 'summary', 'accordion__summary')[0] ?? null;
      // The body is the FIRST accordion__body inside this details element; a
      // nested accordion contributes its own, deeper ones.
      const body = byClass(d.inner, 'div', 'accordion__body')[0] ?? null;
      const heading = summary
        ? (elements(summary.inner, 'h2')
            .concat(
              elements(summary.inner, 'h3'),
              elements(summary.inner, 'h4'),
              elements(summary.inner, 'h5'),
              elements(summary.inner, 'h6'),
            )
            .filter((h) => h.classes.includes('accordion__heading'))[0] ?? null)
        : null;
      const title = summary
        ? (byClass(summary.inner, 'span', 'accordion__title')[0] ?? null)
        : null;
      return {
        openTag: d.openTag,
        classes: d.classes,
        inner: d.inner,
        outer: d.outer,
        open: hasBareAttr(d.openTag, 'open'),
        group: attr(d.openTag, 'name'),
        summary,
        heading,
        title,
        titleText: title ? stripTags(title.inner).trim() : null,
        body,
        bodyId: body ? attr(body.openTag, 'id') : null,
        icon: summary ? (byClass(summary.inner, 'svg', 'accordion__icon')[0] ?? null) : null,
      };
    });
}

export function containers(html) {
  return elements(html, 'div').filter((d) => d.classes.includes('accordion'));
}

export function stripTags(fragment) {
  let out = '';
  let cursor = 0;
  for (const t of scanTags(fragment)) {
    out += fragment.slice(cursor, t.start);
    cursor = t.end;
  }
  return out + fragment.slice(cursor);
}

// Throwing on an unknown build name is deliberate. Returning '' instead would
// make every log assertion pass against an empty string while proving nothing.
export function buildLog(which) {
  const build = BUILDS.find((b) => b.name === which);
  if (!build) throw new Error(`buildLog: unknown build ${JSON.stringify(which)}`);
  const p = process.env[build.logKey];
  if (!p) throw new Error(`buildLog: ${build.logKey} is unset; run the suite through run-tests.sh`);
  return readFileSync(resolve(p), 'utf8');
}

// The module's own WARN lines, in log order, with the multi-line Hugo
// suggestion blocks and every non-accordion line dropped.
export function accordionWarnings(which) {
  return buildLog(which)
    .split(/\r?\n/)
    .filter((line) => /^WARN\s+\[accordion]/.test(line))
    .map((line) => line.replace(/^WARN\s+/, ''));
}
