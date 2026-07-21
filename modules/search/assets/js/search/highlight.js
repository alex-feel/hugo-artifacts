// search/highlight.js: text-node-splitting <mark> highlighter. User input
// NEVER reaches new RegExp or innerHTML: matching runs on a normalized copy
// of each text node, every candidate match is verified against the original
// text, and the original node is split with Text.splitText() so the DOM can
// never be corrupted -- worst case a mark is skipped, never misplaced.
/* global document */

import {normalize, TOKEN_SPLIT} from './pipeline.js';

// Token scanner: the complement of the shared tokenizer boundary, so
// page-side tokens match the indexed ones.
const TOKEN_SCAN = /[^\n\r\p{Z}\p{P}]+/gu;

export function createHighlighter(processTerm, prefix) {
  // Derives the stemmed query-term set plus the normalized final term for
  // plain prefix marking. lastToken approximates the engine's last-term
  // prefix search from the safe side, never exactly: when prefix matching
  // is disabled the engine runs none, so lastToken stays empty; and when
  // the pipeline drops the final term (a stopword), lastToken stays empty
  // too -- marking its prefixes would highlight words the query cannot
  // have matched ("gravity of" must not mark "office") -- even though the
  // engine, whose prefix flag rides its PROCESSED terms, still
  // prefix-searches the surviving last stem. The deliberate trade is
  // under-marking: a prefix-only match of that surviving stem goes
  // unmarked rather than risk marking a non-match.
  function queryTerms(query) {
    const tokens = normalize(query).split(TOKEN_SPLIT).filter(Boolean);
    const stems = new Set();
    for (const token of tokens) {
      const stem = processTerm(token);
      if (stem) {
        stems.add(stem);
      }
    }
    const last = tokens.length ? tokens[tokens.length - 1] : '';
    return {stems, lastToken: prefix && last && processTerm(last) ? last : ''};
  }

  function markTextNode(node, terms) {
    const original = node.data;
    const norm = normalize(original);
    // Rare non-length-preserving case folds make offsets unmappable; skip
    // the whole node (results stay correct, only the mark is absent).
    if (norm.length !== original.length) {
      return;
    }
    const matches = [];
    TOKEN_SCAN.lastIndex = 0;
    let m;
    while ((m = TOKEN_SCAN.exec(norm)) !== null) {
      const token = m[0];
      const stem = processTerm(token);
      const hit =
        (stem && terms.stems.has(stem)) || (terms.lastToken && token.startsWith(terms.lastToken));
      if (!hit) {
        continue;
      }
      const start = m.index;
      const end = start + token.length;
      // The length-equality guard alone misses net-zero shifts (one
      // length-growing case fold plus one length-shrinking NFC composition
      // in the same node), so each original segment must normalize back to
      // the matched token; on mismatch the individual match is skipped.
      if (normalize(original.slice(start, end)) !== token) {
        continue;
      }
      matches.push([start, end]);
    }
    // Split from the end so earlier offsets stay valid.
    for (let i = matches.length - 1; i >= 0; i--) {
      const start = matches[i][0];
      const end = matches[i][1];
      node.splitText(end);
      const middle = node.splitText(start);
      const mark = document.createElement('mark');
      mark.className = 'search__mark';
      node.parentNode.insertBefore(mark, middle);
      mark.appendChild(middle);
    }
  }

  // Wraps matched words inside the element's direct text nodes.
  function highlight(el, terms) {
    const nodes = [];
    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        nodes.push(child);
      }
    }
    for (const node of nodes) {
      markTextNode(node, terms);
    }
  }

  return {queryTerms, highlight};
}
