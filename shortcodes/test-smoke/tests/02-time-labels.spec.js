/* global process */
// Time-label assertions for the three modules that render a human-visible
// time label: github-repo, hf-space and arxiv-paper.
//
// WHAT THIS SPEC LOCKS. A static build renders once and is served for at
// least a day, so the modules' shared contract is that no human-visible time
// phrase carries sub-day precision: the relative ladder starts at "today" and
// counts calendar days, every shown label sits inside a <time> element whose
// datetime attribute carries the raw ISO 8601 value, and the display mode
// parameter offers "relative", "date" (localized absolute date, never stale)
// and "none" (no element).
//
// WHY IT ASSERTS AGAINST PROBES RATHER THAN THE LIVE WIDGETS. The widgets'
// timestamps come from remote APIs, so their exact labels are environment,
// not code. The fixture's home layout therefore calls the partials directly
// with inputs derived from the build's own clock in the UTC frame (see
// fixture/layouts/home.html), which makes every expected label a build-time
// constant this spec can assert byte for byte, with or without network, on
// any machine in any timezone.
//
// The "today" probes are the ones that separate the calendar-day ladder from
// its hours-based predecessor: an input of `now` produced "just now" under
// the old ladder and produces "today" under this one, so a reverted ladder
// fails here even though every multi-day probe would render the same either
// way. The days-max/months-min and months-max/years-min pairs sit on the
// ladder's 30- and 365-day branch boundaries, so a moved threshold fails
// exactly there.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(process.env.FIXTURE_PUBLIC ?? join(here, '..', 'fixture', 'public'));
const modulesDir = resolve(join(here, '..', '..'));

const html = () => readFileSync(join(publicDir, 'index.html'), 'utf8');

const probeAttr = (name) => {
  const match = new RegExp(`data-${name}="([^"]*)"`).exec(html());
  assert.ok(match, `the time probe must carry data-${name}`);
  return match[1];
};

const container = (id) => {
  const match = new RegExp(`<div id="${id}">([\\s\\S]*?)</div>\\n`).exec(html());
  assert.ok(match, `the ${id} container must render`);
  return match[1];
};

// The variant probes wrap a whole <article>, which contains nested <div>s, so
// their capture runs to the article's own closing tag instead of the first
// </div> the way the flat element-probe containers can.
const variantContainer = (id) => {
  const match = new RegExp(`<div id="${id}">([\\s\\S]*?)</article>`).exec(html());
  assert.ok(match, `the ${id} container must render its article`);
  return match[1];
};

// One row per ladder rung, identical for all three modules: the exact label
// the build must have produced for that probe input.
const RUNGS = [
  ['today', 'today'],
  ['future', 'today'],
  ['yesterday', 'yesterday'],
  ['days', '5 days ago'],
  ['days-max', '29 days ago'],
  ['months-min', '1 month ago'],
  ['months', '2 months ago'],
  ['months-max', '12 months ago'],
  ['years-min', '1 year ago'],
  ['years', '2 years ago'],
  ['bad', ''],
  ['empty', ''],
  ['date', 'Jan 27, 2023'],
  ['date-bad', ''],
  ['none', ''],
];
const MODULE_PREFIXES = ['gr', 'hf', 'ax'];

for (const prefix of MODULE_PREFIXES) {
  for (const [rung, expected] of RUNGS) {
    test(`time probe ${prefix}-${rung} renders ${expected === '' ? 'nothing' : `"${expected}"`}`, () => {
      assert.equal(probeAttr(`${prefix}-${rung}`), expected);
    });
  }
}

// The rendered element form per module: the <time> element pairs the raw ISO
// datetime with the localized label, mode "none" renders no element at all,
// and an unrevised arxiv paper renders nothing whatever the mode.
const ISO = '2023-01-27T10:00:00Z';
const ELEMENTS = [
  {
    id: 'time-probe-updated',
    noneId: 'time-probe-updated-none',
    metaClass: 'class="github-repo__meta-item github-repo__meta-item--updated"',
    time: `updated <time class="github-repo__time" datetime="${ISO}">Jan 27, 2023</time>`,
  },
  {
    id: 'time-probe-hf-updated',
    noneId: 'time-probe-hf-updated-none',
    metaClass: 'class="hf-space__meta-item hf-space__meta-item--updated"',
    time: `<time class="hf-space__time" datetime="${ISO}">Jan 27, 2023</time>`,
  },
  {
    id: 'time-probe-ax-revised',
    noneId: 'time-probe-ax-revised-none',
    metaClass: 'class="arxiv-paper__meta-item arxiv-paper__meta-item--revised"',
    time: `Revised <time class="arxiv-paper__time" datetime="${ISO}">Jan 27, 2023</time>`,
  },
];

for (const {id, noneId, metaClass, time} of ELEMENTS) {
  test(`${id} carries the meta classes and the raw ISO datetime`, () => {
    const body = container(id);
    assert.ok(
      body.includes(metaClass),
      'the meta item must carry its element and modifier classes',
    );
    assert.ok(
      body.includes(time),
      'the <time> element must pair the raw ISO datetime with the localized label',
    );
  });

  test(`${noneId} renders no element at all, not a hidden one`, () => {
    assert.equal(container(noneId).trim(), '', 'mode "none" must leave the container empty');
  });
}

test('an unrevised paper renders no revised element whatever the mode', () => {
  assert.equal(container('time-probe-ax-revised-equal').trim(), '');
});

// The variant-partial probes: the only deterministic proof that each
// time-bearing variant reads the display mode under the key its entry
// template merges (updatedMode / revisedMode), and the only execution of the
// hf-space and arxiv-paper hero templates anywhere in this repository.
const VARIANTS = [
  {module: 'github-repo', timeClass: 'github-repo__time'},
  {module: 'hf-space', timeClass: 'hf-space__time'},
  {module: 'arxiv-paper', timeClass: 'arxiv-paper__time'},
];
const VARIANT_IDS = {'github-repo': 'gr', 'hf-space': 'hf', 'arxiv-paper': 'ax'};

for (const {module, timeClass} of VARIANTS) {
  const short = VARIANT_IDS[module];
  test(`the ${module} variant renders its <time> element under mode "date"`, () => {
    const body = variantContainer(`variant-probe-${short}-date`);
    assert.ok(
      body.includes(`<time class="${timeClass}" datetime="${ISO}">Jan 27, 2023</time>`),
      `the variant must render ${timeClass} with the raw ISO datetime and the absolute-date label`,
    );
  });

  test(`the ${module} variant renders no <time> element under mode "none"`, () => {
    assert.ok(
      !variantContainer(`variant-probe-${short}-none`).includes(timeClass),
      'mode "none" must omit the time element from the variant output',
    );
  });
}

// The i18n surface: both shipped languages of each module must carry the
// calendar-day vocabulary and must NOT carry the retired sub-day vocabulary.
// Both directions matter -- a key present in one language and missing in the
// other silently falls back to English on the language that lost it, and a
// retired key that survives keeps dead vocabulary alive for translators to
// copy. Presence is asserted at line anchors, not by substring, so a renamed
// key cannot satisfy the check with a prefix match. arxiv-paper additionally
// locks the full UI-label key set that makes its README's "all UI strings
// resolve through i18n keys" claim true.
const I18N = [
  {module: 'github-repo', prefix: 'github_repo', extraScalars: ['updated'], extraTables: []},
  {module: 'hf-space', prefix: 'hf_space', extraScalars: [], extraTables: []},
  {
    module: 'arxiv-paper',
    prefix: 'arxiv_paper',
    extraScalars: [
      'submitted',
      'revised',
      'code',
      'view_on_arxiv',
      'cite_label',
      'published_version',
      'et_al',
      'stat_subject',
      'stat_authors',
      'stat_version',
      'stat_citations',
      'stat_upvotes',
    ],
    extraTables: ['authors_count'],
  },
];
const LANGS = [
  {file: 'en.toml', plurals: ['one', 'other']},
  {file: 'ru.toml', plurals: ['one', 'few', 'many', 'other']},
];

const tableBody = (source, key) => {
  const match = new RegExp(`^\\[${key}\\]\\r?\\n([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, 'm').exec(
    source,
  );
  return match ? match[1] : null;
};

for (const {module, prefix, extraScalars, extraTables} of I18N) {
  for (const {file, plurals} of LANGS) {
    test(`${module} ${file} ships the calendar-day vocabulary and none of the sub-day one`, () => {
      const source = readFileSync(join(modulesDir, module, 'i18n', file), 'utf8');
      for (const scalar of ['today', 'yesterday', ...extraScalars]) {
        assert.match(
          source,
          new RegExp(`^${prefix}_${scalar}\\s*=`, 'm'),
          `${file} must define ${prefix}_${scalar}`,
        );
      }
      for (const unit of ['days_ago', 'months_ago', 'years_ago', ...extraTables]) {
        const body = tableBody(source, `${prefix}_${unit}`);
        assert.ok(body, `${file} must define the [${prefix}_${unit}] plural table`);
        for (const category of plurals) {
          assert.match(
            body,
            new RegExp(`^${category}\\s*=`, 'm'),
            `[${prefix}_${unit}] in ${file} must carry the "${category}" plural category`,
          );
        }
      }
      for (const retired of [`${prefix}_just_now`, `${prefix}_hours_ago`]) {
        assert.ok(
          !new RegExp(`\\b${retired}\\b`).test(source),
          `${file} must not carry the retired ${retired} key`,
        );
      }
    });
  }
}
