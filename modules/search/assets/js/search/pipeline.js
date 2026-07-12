// search/pipeline.js: the shared language pipeline -- normalization, the
// conservative built-in stopword lists, and the processTerm factory applied
// SYMMETRICALLY to indexing and querying, so the index and every query
// always agree on term shape.
//
// Pipeline shape: NFC normalize -> lowercase -> fold ё -> е -> stopword
// check (dropping the term) -> terms shorter than 3 characters pass through
// unstemmed -> script dispatch: Cyrillic goes to the vendored Russian
// Snowball stemmer; Latin (after diacritics folding, so café matches cafe
// symmetrically) goes to the vendored English Porter2 stemmer; anything
// else passes through normalized. processTerm returns exactly ONE string
// (or null to drop): multi-term expansion is not a MiniSearch capability.
// Because folding is single-return and symmetric, exact-diacritic forms
// cannot receive a rank preference; results stay correct, only the
// preference is absent.

import EnglishStemmer from '../../snowball/english-stemmer.js';
import RussianStemmer from '../../snowball/russian-stemmer.js';

const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[a-z]/;
const DIACRITICS = /\p{Diacritic}/gu;

// The default MiniSearch tokenizer boundary, reused by the highlighter so
// page-side tokens match the indexed ones.
export const TOKEN_SPLIT = /[\n\r\p{Z}\p{P}]+/u;

// Conservative per-language stopword lists: pure function words only, so
// disabling them is rarely needed and enabling them never hides content
// words. The Russian list is pre-folded (е for ё).
export const STOPWORDS = {
  en: [
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'but',
    'by',
    'for',
    'from',
    'has',
    'have',
    'in',
    'is',
    'it',
    'of',
    'on',
    'or',
    'that',
    'the',
    'this',
    'to',
    'was',
    'were',
    'with',
  ],
  ru: [
    'и',
    'в',
    'во',
    'не',
    'на',
    'но',
    'что',
    'он',
    'она',
    'оно',
    'они',
    'мы',
    'вы',
    'я',
    'ты',
    'а',
    'же',
    'бы',
    'к',
    'у',
    'о',
    'об',
    'из',
    'за',
    'до',
    'по',
    'с',
    'со',
    'как',
    'это',
    'или',
  ],
};

const englishStemmer = new EnglishStemmer();
const russianStemmer = new RussianStemmer();

// NFC + lowercase + ё-fold; also the exact normalization the highlighter
// applies to displayed text before computing match offsets.
export function normalize(text) {
  return text.normalize('NFC').toLowerCase().replace(/ё/g, 'е');
}

// Stems one already-normalized token. Terms shorter than 3 characters pass
// through unstemmed (suffix stripping has nothing to strip and only
// destroys them).
export function stemToken(token) {
  if (token.length < 3) {
    return token;
  }
  if (CYRILLIC.test(token)) {
    return russianStemmer.stemWord(token);
  }
  const folded = token.normalize('NFD').replace(DIACRITICS, '');
  if (LATIN.test(folded)) {
    return englishStemmer.stemWord(folded);
  }
  return token;
}

// Builds the symmetric processTerm for the given backend options:
// {lang, stemming, stopwords, stopwordsExtra}. Returning null drops the
// term from both the index and the query.
export function createProcessTerm(options) {
  const opts = options || {};
  const stop = new Set();
  if (opts.stopwords !== false) {
    const list = STOPWORDS[String(opts.lang || '').slice(0, 2)] || [];
    for (const word of list) {
      stop.add(word);
    }
  }
  for (const word of opts.stopwordsExtra || []) {
    stop.add(normalize(String(word)));
  }
  const stemming = opts.stemming !== false;
  return function processTerm(term) {
    const t = normalize(term);
    if (!t) {
      return null;
    }
    if (stop.has(t)) {
      return null;
    }
    if (!stemming) {
      return t;
    }
    return stemToken(t);
  };
}
