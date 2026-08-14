/* global process, Buffer */
// Shared helpers for the build-output assertion specs.
//
// The runner publishes the SAME fixture twice -- FIXTURE_PUBLIC (a plain
// build) and FIXTURE_PUBLIC_MINIFIED (the same fixture built with --minify) --
// because the defect this suite pins is invisible in the plain build. Hugo's
// minifier collapses each run of whitespace to a single character and then
// deletes any whitespace that immediately follows it, even across a tag
// boundary, so a newline-plus-indent sitting just inside a wrapper's closing
// tag eats the LEADING space of the separator element that follows. Only the
// minified tree can see that, and only the plain tree proves the markup was
// well-formed before the minifier touched it. Both captured build logs are
// exported too, so log assertions read what Hugo actually said rather than
// re-deriving it.
//
// The parsing below is deliberately byte-level rather than DOM-level. The
// defect is a whitespace RELOCATION: a parsed DOM normalizes exactly the thing
// that broke, so a DOM assertion would pass against the broken output.
import {readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';

export const normalDir = resolve(process.env.FIXTURE_PUBLIC ?? 'fixture/public/normal');
export const minifiedDir = resolve(
  process.env.FIXTURE_PUBLIC_MINIFIED ?? 'fixture/public/minified',
);

// Every spec that must hold in both trees ranges over this, so a new build
// never has to be wired into each spec by hand.
export const BUILDS = [
  {name: 'normal', dir: normalDir, logKey: 'HUGO_BUILD_LOG'},
  {name: 'minified', dir: minifiedDir, logKey: 'HUGO_BUILD_LOG_MINIFIED'},
];

export function read(rel, dir = normalDir) {
  return readFileSync(join(dir, rel), 'utf8');
}

// A published page, read as text rather than parsed. Defaults to the home
// page, which is what every spec but the language-scope one asserts against.
export function page(dir, rel = 'index.html') {
  return read(rel, dir);
}

// The fixture's second page: the same widget under language-scope="worked-in".
export const WORKED_IN_PAGE = 'languages-worked-in/index.html';

// The fixture's fourth page: the worked-in widget after a FAILED authorship
// request (a front-matter flag the canned-data seam reads), publishing the
// row derive.html computes from its fallback numerators.
export const AUTHORSHIP_DEGRADED_PAGE = 'languages-worked-in-degraded/index.html';

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

// Every tag and comment in a fragment, with its byte span. The minifier drops
// attribute quotes (class=github-profile__metric) and Hugo's plain build keeps
// them, so nothing here may assume a quoted value.
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
    out.push({
      kind: closing ? 'close' : selfClosing ? 'self' : 'open',
      name,
      raw,
      start: lt,
      end,
    });
    i = end;
  }
  return out;
}

// The class tokens of an opening tag, tolerating the minifier's unquoted
// single-token form as well as the quoted multi-token form.
function classTokens(rawTag) {
  const m = /\sclass\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawTag);
  if (!m) return [];
  return (m[2] ?? m[3] ?? m[4] ?? '').split(/\s+/).filter(Boolean);
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

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

// Hugo's plain build escapes the rank level as A&#43; while the minifier
// leaves A+ alone, so the two trees only compare after decoding.
export function decodeEntities(text) {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    const key = body.toLowerCase();
    return Object.hasOwn(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : whole;
  });
}

// An element's text layer, exactly as written: no whitespace normalization,
// because the whitespace IS the thing under test.
export function textOf(fragment) {
  return decodeEntities(stripTags(fragment));
}

// The first element whose opening tag carries `classToken`, returned as raw
// byte slices. `inner` is what sits between the opening and closing tags, so
// an assertion can look at the bytes immediately before a closing tag.
export function element(source, classToken) {
  const tokens = scanTags(source);
  for (let i = 0; i < tokens.length; i += 1) {
    const open = tokens[i];
    if (open.kind !== 'open' || !classTokens(open.raw).includes(classToken)) continue;
    let depth = 1;
    for (let j = i + 1; j < tokens.length; j += 1) {
      const t = tokens[j];
      if (t.kind === 'open' && t.name === open.name) depth += 1;
      else if (t.kind === 'close' && t.name === open.name) {
        depth -= 1;
        if (depth === 0) {
          return {
            name: open.name,
            classes: classTokens(open.raw),
            openTag: open.raw,
            outer: source.slice(open.start, t.end),
            inner: source.slice(open.end, t.start),
          };
        }
      }
    }
    break;
  }
  return null;
}

// The direct children of a fragment: element nodes with their raw byte slices,
// and the text nodes between them. Nothing is normalized or dropped here --
// the extractor below decides what an HTML-to-text reader would keep.
export function childNodes(fragment) {
  const nodes = [];
  let depth = 0;
  let cursor = 0;
  let openTag = null;
  let elementStart = 0;
  for (const t of scanTags(fragment)) {
    if (depth === 0 && t.start > cursor) {
      nodes.push({type: 'text', raw: fragment.slice(cursor, t.start)});
      cursor = t.start;
    }
    if (t.kind === 'open') {
      if (depth === 0) {
        openTag = t;
        elementStart = t.start;
      }
      depth += 1;
    } else if (t.kind === 'close') {
      depth -= 1;
      if (depth === 0) {
        nodes.push({
          type: 'element',
          name: openTag.name,
          classes: classTokens(openTag.raw),
          openTag: openTag.raw,
          outer: fragment.slice(elementStart, t.end),
          inner: fragment.slice(openTag.end, t.start),
        });
        cursor = t.end;
      }
    } else if (depth === 0 && (t.kind === 'self' || t.kind === 'comment')) {
      if (t.kind === 'self') {
        nodes.push({
          type: 'element',
          name: t.name,
          classes: classTokens(t.raw),
          openTag: t.raw,
          outer: t.raw,
          inner: '',
        });
      }
      cursor = t.end;
    }
  }
  if (cursor < fragment.length) nodes.push({type: 'text', raw: fragment.slice(cursor)});
  return nodes;
}

// True when an element wraps other elements rather than carrying literal text
// on its own.
export function isWrapper(node) {
  return scanTags(node.inner).some((t) => t.kind === 'open' || t.kind === 'self');
}

// Every element in a fragment, at any depth, outermost first.
export function allElements(fragment) {
  const out = [];
  for (const node of childNodes(fragment)) {
    if (node.type !== 'element') continue;
    out.push(node);
    out.push(...allElements(node.inner));
  }
  return out;
}

export function elementsByClass(fragment, classToken) {
  return allElements(fragment).filter((n) => n.classes.includes(classToken));
}

// A single attribute value off an opening tag, tolerating the minifier's
// unquoted single-token form; null when the attribute is absent, so a spec
// asserts presence with its own message.
export function attrValue(openTag, name) {
  const match = new RegExp(`${name}="?([^"\\s>]+)"?`).exec(openTag);
  return match ? match[1] : null;
}

// The language row of a published page: the list, the visible title beside
// it, and the three per-item surfaces. Null at the first missing piece.
//
// Both lookups run INSIDE the languages section rather than from the top of
// the document. The home page renders org-rollup first and it carries a
// section title of its own, so a page-wide lookup finds that one and
// compares the wrong heading.
export function languageRow(dir, rel) {
  const section = element(page(dir, rel), 'github-profile__section--languages');
  if (!section) return null;
  const list = element(section.inner, 'github-profile__languages');
  if (!list) return null;
  return {
    list,
    title: element(section.inner, 'github-profile__section-title'),
    items: elementsByClass(list.inner, 'github-profile__lang').map((li) => ({
      name: attrValue(li.openTag, 'data-lang'),
      pct: attrValue(li.openTag, 'data-pct'),
      text: textOf(element(li.inner, 'github-profile__lang-pct').inner),
    })),
  };
}

// The UTF-8 bytes of a string, as an array, so an assertion failure prints the
// byte sequence rather than a rendered em dash that looks identical either way.
export function bytesOf(text) {
  return [...Buffer.from(text, 'utf8')];
}

// What an HTML-to-text extractor reads off a strip of inline elements.
//
// Four behaviors, and every one of them matters for the defect this suite
// pins. (a) A WRAPPER's text is trimmed, because the indentation a wrapper
// carries around its children is layout noise; this is the step that made the
// original defect visible, since it discards the newline that was silently
// standing in for the separator's deleted space. (b) A LEAF element carrying
// nothing but literal text is emitted verbatim, because that text IS the
// content -- the module's separator elements exist for no other reason than to
// push ", " and " — " into this layer, and trimming them would discard the
// very bytes under test. (c) A whitespace-only text node BETWEEN two children
// is a word separator rather than content, so it collapses to one space -- the
// calendar summary separates its total from its window with exactly such a
// node, and dropping it outright would report that pair as glued even when it
// is not. (d) The joined result then has its whitespace runs collapsed, which
// is what makes the plain and minified trees read IDENTICALLY: the plain tree's
// pretty printing is normalized away, and nothing in this step can invent a
// space that the published bytes do not contain.
export function extractedText(fragment) {
  let out = '';
  for (const node of childNodes(fragment)) {
    if (node.type === 'text') {
      out += /\S/.test(node.raw) ? node.raw : ' ';
    } else {
      const text = textOf(node.inner);
      out += isWrapper(node) ? text.trim() : text;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

// The headline metric strip, the element the defect lives in.
export function headline(dir) {
  const found = element(page(dir), 'github-profile__section--headline');
  if (!found) throw new Error(`no headline section in the published page under ${dir}`);
  return found;
}

// The calendar summary paragraph, the second live instance of the same defect.
export function calendarSummary(dir) {
  const found = element(page(dir), 'github-profile__calendar-summary');
  if (!found) throw new Error(`no calendar summary in the published page under ${dir}`);
  return found;
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

export function logLines(which) {
  return buildLog(which).split(/\r?\n/);
}
