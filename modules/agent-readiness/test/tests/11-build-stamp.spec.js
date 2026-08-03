// The build stamp: the ONE timestamp a build carries into every surface it
// publishes, and the value the PUBLIC agent-readiness/build-time.html partial
// hands a consuming site so it can stamp its own surfaces with the same one.
//
// What makes this suite worth writing at all is the failure mode it guards.
// The stamp exists so a reader holding two documents can decide "same deploy
// or not" by comparing strings. If the module ever produced two DIFFERENT
// values within one build -- which is exactly what a per-call `now`, a bare
// hugo.Store check-then-set, or a partialCached without the store all do --
// then the field would report drift that is not there, which is strictly
// worse than shipping no field. Presence assertions cannot see that: a spec
// that merely greps each document for a timestamp passes against a build in
// which every document carries a different one.
//
// So every assertion below is an EQUALITY between values extracted from
// SEPARATE documents of one build, never a per-document match. The
// multilingual build is the sharp case: partialCached keeps a separate cache
// per language, so a language-split value shows there and nowhere else.
//
// EQUALITY IS NECESSARY BUT NOT SUFFICIENT, and pretending otherwise would be
// the very trap this file exists to close. These fixtures build in well under
// a second, and the stamp's precision is one second -- so a mechanism reduced
// to a bare per-call `now` emits the SAME string everywhere and satisfies
// every equality assertion here. That was measured, not assumed: replacing
// the partial's body with `now.Format` left all eight tests green. Equality
// therefore locks the CONTRACT; the two mechanism tests at the end lock the
// IMPLEMENTATION, through a white-box probe of the store entry a racing
// mechanism never writes and a structural check of the two partials
// themselves.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parse as parseYaml} from 'yaml';
import {
  read,
  exists,
  moduleRoot,
  publicDir,
  configuredDir,
  minimalDir,
  multilingualDir,
  nobuildtimeDir,
  parseDump,
  publishedTwins,
  splitFrontMatter,
  warnCount,
} from './helpers.js';

// RFC 3339 with an offset, anchored end to end. Anchoring matters: an
// unanchored pattern would accept a date-only value with trailing text, and
// a date alone cannot answer "am I holding a cached copy", which is the whole
// reason this field is not `last_updated`.
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

// The literal line the two generated documents carry. No trailing period: the
// value's purpose is byte extraction, and a period would land inside a naive
// trailing capture.
const BUILD_LINE = /^> Build time: (.+)$/m;

const stampFromTwin = (rel, dir) =>
  parseYaml(splitFrontMatter(read(rel, dir)).frontMatter, {uniqueKeys: true, strict: true})
    .build_time;

function stampFromDocument(rel, dir) {
  const match = BUILD_LINE.exec(read(rel, dir));
  return match ? match[1] : undefined;
}

// Every stamp the build wrote or exposed, gathered from every channel that
// carries one, as {label, value} so a failure names the surface that
// disagreed rather than reporting two anonymous strings.
function allStamps(dir, {dumps = ['twindump.txt'], docs = ['llms.txt', 'about.md']} = {}) {
  const out = [];
  for (const twin of publishedTwins(dir)) {
    out.push({label: `twin ${twin}`, value: stampFromTwin(twin.replace(/^\//, ''), dir)});
  }
  for (const rel of docs) {
    out.push({label: rel, value: stampFromDocument(rel, dir)});
  }
  for (const rel of dumps) {
    out.push({label: `${rel} exposed value`, value: parseDump(rel, dir).buildTime});
  }
  return out;
}

test('every twin, llms.txt, about.md and the exposed value carry ONE stamp', () => {
  // The cross-document comparison the acceptance criteria ask for, at full
  // width: not two independent regex matches that would both pass against
  // different values, but one distinct-value count over every surface of the
  // build at once.
  for (const [name, dir] of [
    ['baseline', publicDir],
    ['configured', configuredDir],
    ['minimal', minimalDir],
  ]) {
    const stamps = allStamps(dir);
    assert.ok(stamps.length > 3, `${name}: the build must carry several stamped surfaces`);
    for (const {label, value} of stamps) {
      assert.ok(value !== undefined, `${name}: ${label} carries no stamp at all`);
      assert.match(value, RFC3339, `${name}: ${label} is not RFC 3339 with an offset`);
    }
    const distinct = new Set(stamps.map((s) => s.value));
    assert.equal(
      distinct.size,
      1,
      `${name}: one build must produce ONE stamp, got ${[...distinct].join(' | ')} across ${stamps
        .map((s) => `${s.label}=${s.value}`)
        .join(', ')}`,
    );
  }
});

test('the twins carry the stamp the module EXPOSES, not a second value of their own', () => {
  // The distinction the issue turns on: a consuming site stamps its own HTML
  // meta tag from build-time.html, and the comparison the field exists to
  // enable only works if the module writes that exact string into its
  // documents. Only the dump can observe the exposed value.
  const exposed = parseDump('twindump.txt', publicDir).buildTime;
  assert.match(exposed, RFC3339, 'the public partial must return an RFC 3339 stamp');
  for (const twin of publishedTwins(publicDir)) {
    assert.equal(
      stampFromTwin(twin.replace(/^\//, ''), publicDir),
      exposed,
      `${twin} must carry the exposed stamp byte for byte`,
    );
  }
  assert.equal(stampFromDocument('llms.txt', publicDir), exposed, 'llms.txt must carry it too');
  assert.equal(stampFromDocument('about.md', publicDir), exposed, 'about.md must carry it too');
});

test('the multilingual build carries one stamp across BOTH language trees', () => {
  // What this proves: both language trees publish their own documents and all
  // of them, plus both languages' exposed values, carry ONE string.
  //
  // What it does NOT prove, stated so nobody re-derives false confidence from
  // it. The per-language partial cache is the mechanism that splits the value
  // on a multilingual site -- partialCached keeps a separate cache per
  // language, so a cached `now` without the hugo.Store collapse executes once
  // per language. But that split was MEASURED at about 21 ms, and this stamp
  // is formatted to one-second precision, so the two values print the same
  // string except when they happen to straddle a second boundary. This
  // assertion therefore cannot detect the split it describes, and neither can
  // any value comparison at this precision.
  //
  // The real guards against it are the two structural tests below and the
  // `store` probe in the twindump, which a cache-only mechanism never writes.
  // Raising the precision to make the split observable was rejected: the value
  // has to stay the same string a consuming site puts in its own HTML meta.
  const stamps = allStamps(multilingualDir, {
    dumps: ['twindump.txt', 'ru/twindump.txt'],
    docs: ['llms.txt', 'about.md', 'ru/llms.txt', 'ru/about.md'],
  });
  // Both language trees must actually be represented, or the equality below
  // would hold vacuously over one language's files.
  assert.ok(exists('ru/llms.txt', multilingualDir), 'the ru tree must publish its own llms.txt');
  assert.ok(exists('ru/index.md', multilingualDir), 'the ru tree must publish its own home twin');
  for (const {label, value} of stamps) {
    assert.ok(value !== undefined, `multilingual: ${label} carries no stamp at all`);
  }
  const distinct = new Set(stamps.map((s) => s.value));
  assert.equal(
    distinct.size,
    1,
    `multilingual: both languages must share ONE stamp, got ${[...distinct].join(' | ')} across ${stamps
      .map((s) => `${s.label}=${s.value}`)
      .join(', ')}`,
  );
});

test('build_time sits at the fixed position, and last_updated is untouched beside it', () => {
  // The two fields answer different questions -- content time versus build
  // time -- and the issue's central warning is against conflating them. This
  // is the assertion that they coexist: a twin carrying both, with the
  // content stamp still the page's Lastmod date and the build stamp a full
  // timestamp.
  const raw = splitFrontMatter(read('blog/post-one/index.md')).frontMatter;
  assert.match(raw, /^last_updated: "2026-06-15"$/m, 'the content stamp is unchanged');
  assert.match(
    raw,
    /^build_time: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})"$/m,
    'the build stamp is jsonify-quoted RFC 3339 on its own line',
  );
  const lines = raw.split('\n').map((l) => l.split(':')[0]);
  assert.equal(
    lines.indexOf('build_time'),
    lines.indexOf('last_updated') + 1,
    'build_time follows last_updated immediately, keeping the time fields adjacent',
  );
});

test('a section vocabulary naming build_time is refused, never emitted twice', () => {
  // The duplicate-key guard reserves build_time UNCONDITIONALLY, outside its
  // own emission branch. Without that, a consumer listing it in
  // [params.agent.frontmatter.<section>] would get it twice with the switch
  // on -- two equal keys in one YAML mapping node, which makes every twin in
  // that section unreadable to the strict parsers twins exist for -- and once
  // as an ordinary per-section key with the switch off. The fixture declares
  // it in the `projects` vocabulary for exactly this, so both builds below
  // enter the guard.
  assert.equal(
    warnCount(/Skipping the "build_time" key/),
    1,
    'exactly one deduplicated warning naming the reserved key',
  );
  assert.equal(
    warnCount(/Skipping the "build_time" key/, 'nobuildtime'),
    1,
    'the reservation holds with the switch off too, where the key is not emitted at all',
  );
  for (const dir of [publicDir, nobuildtimeDir]) {
    for (const twin of publishedTwins(dir)) {
      const {frontMatter} = splitFrontMatter(read(twin.replace(/^\//, ''), dir));
      const count = frontMatter.split('\n').filter((l) => l.startsWith('build_time:')).length;
      assert.ok(count <= 1, `${twin} carries ${count} build_time lines`);
      assert.doesNotThrow(
        () => parseYaml(frontMatter, {uniqueKeys: true, strict: true}),
        `${twin} front matter must parse under duplicate-key detection`,
      );
    }
  }
});

test('with the switches off, no surface carries a stamp and nothing else moves', () => {
  // The `nobuildtime` build sets the three per-surface switches false and
  // nothing else, so it is the only build in which those conjuncts decide a
  // published byte.
  for (const twin of publishedTwins(nobuildtimeDir)) {
    const {frontMatter} = splitFrontMatter(read(twin.replace(/^\//, ''), nobuildtimeDir));
    assert.ok(!/^build_time:/m.test(frontMatter), `${twin} must carry no build_time key`);
    // The content stamp is a DIFFERENT switch and must survive: a guard
    // wired to the wrong key would delete it here and nowhere else.
    assert.ok(frontMatter.length > 0, `${twin} must still carry its other front matter`);
  }
  assert.match(
    splitFrontMatter(read('blog/post-one/index.md', nobuildtimeDir)).frontMatter,
    /^last_updated: "2026-06-15"$/m,
    'last_updated is governed by its own switch and is untouched here',
  );
  for (const rel of ['llms.txt', 'about.md']) {
    assert.ok(
      !BUILD_LINE.test(read(rel, nobuildtimeDir)),
      `${rel} must carry no build-time line with the switch off`,
    );
  }
});

test('the switches govern what is WRITTEN, not what the public partial returns', () => {
  // A consuming site that stamps its own surfaces must keep getting a value
  // even when it told the module not to stamp the module's own documents --
  // the keys are output switches, not a kill switch on the computation. A
  // guard mistakenly placed inside build-time.html rather than at its callers
  // would return the empty string here and pass every other assertion.
  const exposed = parseDump('twindump.txt', nobuildtimeDir).buildTime;
  assert.match(exposed, RFC3339, 'the public partial still returns the build stamp');
});

// ---- The mechanism, not just the contract ----
//
// Everything above compares published values. Nothing above can fail against
// a build that computes `now` afresh at every call site, because these
// fixtures finish inside one second and the stamp's precision is one second.
// The next two tests are what actually guard the mechanism.

test('the module writes its stamp into the build-wide store, in every build', () => {
  // The white-box probe. A mechanism that returns a per-call `now`, or one
  // that caches without the store, never writes this key -- so the dump line
  // is empty and this fails, while every equality assertion above still
  // passes. It is also what proves the store branch is LIVE rather than dead
  // code the wrapper routes around.
  for (const [name, dir, dumps] of [
    ['baseline', publicDir, ['twindump.txt']],
    ['multilingual', multilingualDir, ['twindump.txt', 'ru/twindump.txt']],
    ['nobuildtime', nobuildtimeDir, ['twindump.txt']],
  ]) {
    for (const rel of dumps) {
      const {buildTime, buildTimeStore} = parseDump(rel, dir);
      assert.match(
        buildTimeStore ?? '',
        RFC3339,
        `${name}/${rel}: the build-wide store must hold the stamp; an empty value means the mechanism computed it per call instead of storing it once`,
      );
      assert.equal(
        buildTimeStore,
        buildTime,
        `${name}/${rel}: the stored value and the returned value must be the same string`,
      );
    }
  }
});

test('the stamp partials keep the shape that makes one value per build possible', () => {
  // A structural lock on the exact regression the partial's own docstring
  // warns about, because the behavioral assertions cannot see it: the public
  // wrapper must reach its value through partialCached and must never compute
  // a timestamp itself, and the inner partial must read the store before
  // writing it. Dropping either half restores the racing version -- measured
  // to produce two different values in 6 of 12 builds of a four-language,
  // 1200-file site -- while a fast fixture stays green on values alone.
  const partialsDir = join(moduleRoot, 'layouts', '_partials', 'agent-readiness');
  const wrapper = readFileSync(join(partialsDir, 'build-time.html'), 'utf8');
  const value = readFileSync(join(partialsDir, 'lib', 'build-time-value.html'), 'utf8');

  const wrapperBody = wrapper.slice(wrapper.lastIndexOf('*/}}'));
  assert.match(
    wrapperBody,
    /partialCached\s+"agent-readiness\/lib\/build-time-value\.html"/,
    'the public partial must reach its value through partialCached, or every caller re-executes it',
  );
  assert.ok(
    !/\bnow\b/.test(wrapperBody),
    'the public partial must not compute a timestamp of its own; the cached inner partial owns that',
  );

  const valueBody = value.slice(value.lastIndexOf('*/}}'));
  const getAt = valueBody.indexOf('hugo.Store.Get');
  const setAt = valueBody.indexOf('hugo.Store.Set');
  assert.ok(getAt !== -1, 'the value partial must READ the build-wide store');
  assert.ok(setAt !== -1, 'the value partial must WRITE the build-wide store');
  assert.ok(getAt < setAt, 'it must read before writing, or every caller overwrites the value');
  assert.match(valueBody, /\bnow\.Format\b/, 'and it is the one place a timestamp is computed');
});

test('every stamped surface reads the exposed value instead of timing itself', () => {
  // The companion structural lock, and the one that closes the wider hole: the
  // test above proves the MECHANISM produces a single value, but nothing stops
  // an emitter from ignoring it and calling `now` itself. That regression is
  // invisible to every equality assertion in this file, because the fixtures
  // build in well under a second while the stamp's precision is one second, so
  // two independently computed timestamps print the same string. It was
  // confirmed by mutation: replacing the twin builder's call with a bare
  // `now.Format` left the whole suite green.
  //
  // So each emitter is checked at the source: it must route through the public
  // partial, and it must contain no timestamp call of its own. Comment blocks
  // are stripped first -- the module's templates are heavily commented and
  // prose legitimately contains the word "now".
  const partialsDir = join(moduleRoot, 'layouts', '_partials', 'agent-readiness');
  const emitters = ['markdown-front-matter.html', 'llms.html', 'facts.html'];

  for (const name of emitters) {
    const source = readFileSync(join(partialsDir, name), 'utf8');
    const code = source.replace(/\{\{-?\/\*[\s\S]*?\*\/-?\}\}/g, '');

    assert.ok(
      code.includes('partial "agent-readiness/build-time.html"'),
      `${name} must take its stamp from the exposed partial, not from a clock of its own`,
    );
    assert.ok(
      !/\bnow\b/.test(code),
      `${name} must not compute a timestamp itself; a second clock is exactly the drift the stamp exists to rule out`,
    );
    assert.ok(
      !/\btime\.Now\b/.test(code),
      `${name} must not reach the clock through time.Now either`,
    );
  }
});

test('each stamped surface obeys its OWN build_time switch', () => {
  // The three switches are independent on purpose, and `nobuildtime` -- the one
  // environment that sets any of them -- sets all three together, so every
  // surface loses its stamp there whichever key it actually read. Cross-wiring
  // is therefore invisible to the published bytes: mutating llms.html to gate
  // on the Markdown twins' switch instead of its own left the whole suite
  // green. Splitting the environments to separate three switches behaviorally
  // costs two more Hugo builds and still only distinguishes them pairwise, so
  // the wiring is locked at the source instead, where it is exact.
  const partialsDir = join(moduleRoot, 'layouts', '_partials', 'agent-readiness');
  const owners = [
    ['markdown-front-matter.html', 'markdown', /\$md\.build_time|\$cfg\.markdown\.build_time/],
    ['llms.html', 'llms', /\$llms\.build_time|\$cfg\.llms\.build_time/],
    ['facts.html', 'facts', /\$facts\.build_time|\$cfg\.facts\.build_time/],
  ];

  for (const [file, own, ownPattern] of owners) {
    const code = readFileSync(join(partialsDir, file), 'utf8').replace(
      /\{\{-?\/\*[\s\S]*?\*\/-?\}\}/g,
      '',
    );
    assert.match(
      code,
      ownPattern,
      `${file} must gate its stamp on the ${own} surface's own switch`,
    );

    for (const [, other] of owners.filter(([, o]) => o !== own)) {
      assert.ok(
        !code.includes(`${other}.build_time`),
        `${file} must not read the ${other} surface's build_time switch; the three are independent`,
      );
    }
  }
});

test('the stamped documents keep their structure around the new line', () => {
  // The line joins the one structural slot the llmstxt.org convention leaves
  // free -- after the H1 and the blockquote summary, before the first H2 --
  // so it must not have introduced a heading or displaced the license line.
  const text = read('llms.txt', configuredDir);
  const lines = text.split('\n');
  const licenseAt = lines.findIndex((l) => l.startsWith('> Content licensed under '));
  const buildAt = lines.findIndex((l) => l.startsWith('> Build time: '));
  const firstHeadingAt = lines.findIndex((l) => l.startsWith('## '));
  assert.ok(licenseAt !== -1, 'the configured build carries its license line');
  assert.ok(buildAt > licenseAt, 'the build-time line follows the license line');
  assert.ok(buildAt < firstHeadingAt, 'and precedes the first section heading');
  assert.equal(
    lines.filter((l) => l.startsWith('# ')).length,
    1,
    'the document still carries exactly one H1',
  );
  assert.equal(
    lines.filter((l) => l.startsWith('> Build time: ')).length,
    1,
    'exactly one build-time line',
  );

  const about = read('about.md', configuredDir).split('\n');
  const aboutBuildAt = about.findIndex((l) => l.startsWith('> Build time: '));
  assert.ok(aboutBuildAt !== -1, 'about.md carries the line too');
  assert.ok(
    aboutBuildAt < about.findIndex((l) => l.startsWith('## ')),
    'about.md places it before its first H2',
  );
  assert.equal(
    about.filter((l) => l.startsWith('> Build time: ')).length,
    1,
    'exactly one build-time line in about.md',
  );
});
