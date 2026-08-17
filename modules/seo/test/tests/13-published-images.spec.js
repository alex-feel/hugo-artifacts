// Reading an image's URL is what PUBLISHES it, so a resolver that answers in
// URLs writes a file for every candidate it ever considers -- the loser of a
// precedence race, the un-cropped source of a page that emits only the crop,
// the second card of a page kind whose node carries one image. None of that
// is visible in any assertion about what a document SAYS: the markup is
// correct either way, and only the output directory knows.
//
// So this spec asserts the property directly, over every build: an image
// file this module put in the tree is named by something the tree publishes.
// It is deliberately whole-tree and environment-wide rather than a list of
// known cases, because the cases are exactly what nobody thinks to enumerate.
//
// Two classes of published file are NOT this module's doing and are excluded
// by construction: everything under static/, which Hugo copies wholesale,
// and every non-page file inside a content bundle, which Hugo publishes with
// its page whether or not a template ever touches it (measured: an
// unreferenced .png dropped into a leaf bundle lands in public/). Both keep
// their exact file name, while anything the module creates is either a Hugo
// derivative (`name_hu_<hash>.ext`) or a resource copied to a name of its
// own -- so the source file NAMES are the exclusion set, read from the
// fixture rather than listed here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {
  badtypesDir,
  configuredDir,
  generatedDir,
  graphDir,
  hometitleDir,
  multilingualDir,
  offswitchDir,
  paginationDir,
  publicDir,
  sitenameDir,
  subpathDir,
} from './helpers.js';

const TREES = [
  ['baseline', publicDir],
  ['configured', configuredDir],
  ['subpath', subpathDir],
  ['badtypes', badtypesDir],
  ['offswitch', offswitchDir],
  ['multilingual', multilingualDir],
  ['pagination', paginationDir],
  ['graph', graphDir],
  ['sitename', sitenameDir],
  ['generated', generatedDir],
  ['hometitle', hometitleDir],
];

const IMAGE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const DOCUMENT = /\.(html|json|xml|txt|md)$/i;

// The fixture SOURCE tree, beside the built ones the helpers point at.
const fixtureRoot = resolve('fixture');

function filesUnder(dir) {
  return readdirSync(dir, {recursive: true, withFileTypes: true})
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

// The names Hugo copies verbatim: static/ plus every content root. A name
// here is a file the site shipped, not one the module minted.
function copiedNames() {
  const roots = readdirSync(fixtureRoot, {withFileTypes: true})
    .filter((e) => e.isDirectory() && (e.name === 'static' || e.name.startsWith('content')))
    .map((e) => join(fixtureRoot, e.name));
  const names = new Set();
  for (const root of roots)
    for (const file of filesUnder(root)) names.add(file.split(/[/\\]/).pop());
  return names;
}

for (const [name, dir] of TREES) {
  test(`every image this module publishes into the ${name} tree is named by it`, () => {
    const copied = copiedNames();
    const published = filesUnder(dir);
    const documents = published
      .filter((file) => DOCUMENT.test(file))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    const orphans = published
      .filter((file) => IMAGE.test(file))
      .map((file) => ({
        file,
        url: `/${file
          .slice(dir.length + 1)
          .split('\\')
          .join('/')}`,
      }))
      .filter(({url}) => !copied.has(url.split('/').pop()))
      .filter(({url}) => !documents.includes(url))
      .map(({url}) => url);

    assert.deepEqual(
      orphans.sort(),
      [],
      `published for nobody: reading a URL is the publish, so each of these cost a file`,
    );
  });
}

test('the exclusion set does not swallow the images this spec exists to watch', () => {
  // The rule above excludes a published file whose NAME also exists in the
  // fixture's source tree. That is exact for a Hugo copy and for a Hugo
  // derivative, but it would also excuse a module-minted file that happened
  // to reuse a source name -- so the cards, which are minted, are checked to
  // be inside the watched set rather than assumed to be.
  const copied = copiedNames();
  const cards = filesUnder(generatedDir)
    .map((file) =>
      file
        .slice(generatedDir.length + 1)
        .split('\\')
        .join('/'),
    )
    .filter((rel) => rel.startsWith('cards/') && IMAGE.test(rel));
  assert.ok(cards.length > 0, 'the generated tree carries cards at all');
  for (const rel of cards) {
    assert.ok(!copied.has(rel.split('/').pop()), `${rel} is excluded from the orphan check`);
  }
});
