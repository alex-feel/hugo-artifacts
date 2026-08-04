// The documentation half of the composition contract.
//
// Nothing on the module side can publish a consumer's [outputs] table: a
// module's own [outputs] is inert, so the merged list can only ever be
// written by hand in the consuming site. That makes each README's
// Installation section the mechanism, and a mechanism gets a lock like any
// other: these assertions hold all three READMEs to stating the rule and to
// showing the SAME merged example the fixture builds from, so a README whose
// example drifts out of sync with the format set the modules define fails
// here rather than in a consumer's silent, exit-0 build.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const modulesRoot = resolve(here, '..', '..');
// pwa joins the trio because it also requires a home output entry, and a
// module whose README shows a bare [outputs] block is exactly the trap this
// file exists to close: a consumer who wired the other three and then
// followed pwa literally lands on a second table (a load failure) or a
// replacing list (an exit-0 build that silently stops publishing).
const MODULES = ['seo', 'agent-readiness', 'search', 'pwa'];
const HEADING = '### Combining this module with other modules that wire output formats';

const readme = (moduleName) => readFileSync(join(modulesRoot, moduleName, 'README.md'), 'utf8');

// The union of every output format name the modules define, plus the built-in
// names a replacing list drops. Derived from the module configurations rather
// than hard-coded, so a module that adds a format fails every README that
// does not show it.
const requiredFormats = () => {
  const defined = MODULES.flatMap((moduleName) => {
    const config = readFileSync(join(modulesRoot, moduleName, 'hugo.toml'), 'utf8');
    return [...config.matchAll(/^\s*\[outputFormats\.([A-Za-z0-9_-]+)\]/gm)].map(
      (match) => match[1],
    );
  });
  assert.ok(defined.length >= 5, 'the modules must define at least five output formats');
  // webappmanifest is listed with the built-ins rather than derived: pwa
  // defines no [outputFormats] table because the format is one of Hugo's
  // own, so nothing in a module configuration can announce it.
  return [...defined, 'html', 'rss', 'markdown', 'webappmanifest'];
};

for (const moduleName of MODULES) {
  test(`the ${moduleName} README states the combined-usage rule in Installation`, () => {
    const text = readme(moduleName);
    const headingAt = text.indexOf(HEADING);
    assert.notEqual(headingAt, -1, `${moduleName}/README.md must carry "${HEADING}"`);
    // The rule belongs WITH the wiring it corrects: a reader copying an
    // [outputs] block has to meet it at that moment, not several sections
    // later. Stated as "the same top-level section as the first [outputs]
    // example" rather than "before ## Requirements", because that heading is
    // an artifact of one README shape -- pwa's leads with a Quick start and
    // has no Requirements section at all, so the proxy silently failed on
    // the one module whose README needed the rule most.
    const outputsAt = text.indexOf('[outputs]');
    assert.notEqual(outputsAt, -1, `${moduleName}/README.md must show an [outputs] block`);
    const nextSectionAt = text.indexOf('\n## ', outputsAt);
    assert.ok(
      nextSectionAt === -1 || headingAt < nextSectionAt,
      `${moduleName}/README.md must state the rule beside its [outputs] wiring, not in a later section`,
    );
    // The two shapes a consumer actually reaches: the loud one and the silent
    // one. Naming both is what stops the silent one from being read as a
    // formatting preference.
    assert.match(text.slice(headingAt), /table outputs already exists/);
    assert.match(text.slice(headingAt), /silently stops publishing/);
  });

  test(`the ${moduleName} README shows a merged home list carrying every format`, () => {
    const text = readme(moduleName);
    const section = text.slice(text.indexOf(HEADING));
    const home = /^\s*home = \[([^\]]*)\]/m.exec(section);
    assert.ok(home, `${moduleName}/README.md must show a merged [outputs] home list`);
    const listed = home[1].split(',').map((entry) => entry.trim().replace(/^'|'$/g, ''));
    for (const format of requiredFormats()) {
      assert.ok(
        listed.includes(format),
        `the ${moduleName} README merged example must carry ${format}`,
      );
    }
  });
}
