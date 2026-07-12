// AVIF version gate: below Hugo 0.163.0 the avif token is dropped with
// exactly one build warning, zero .avif files are published, and the avif
// page still gets WebP plus the original format; at 0.163.0+ real .avif
// derivatives exist and the avif source precedes the webp source.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, hugoAtLeast, warnCount, publishedFilesWithExt} from './helpers.js';

const picture = dom('avif/index.html').querySelector('#avif-img');
const gatePassed = hugoAtLeast(0, 163);

test('the avif page renders a full picture either way', () => {
  assert.ok(picture, 'expected #avif-img');
  assert.equal(picture.tagName, 'PICTURE');
  assert.ok(picture.querySelector('source[type="image/webp"]'), 'the WebP chain is present');
  assert.match(picture.querySelector('img').getAttribute('src'), /\.png$/);
});

test(`AVIF gate behavior for the building Hugo (gate passed: ${gatePassed})`, () => {
  if (gatePassed) {
    assert.equal(warnCount(/\[images\] AVIF output requires Hugo 0\.163\.0\+/), 0);
    const sources = picture.querySelectorAll('source');
    const types = sources.map((s) => s.getAttribute('type'));
    assert.ok(types.includes('image/avif'), 'the avif chain is emitted');
    assert.ok(
      types.indexOf('image/avif') < types.indexOf('image/webp'),
      'avif sources precede webp sources',
    );
    assert.ok(publishedFilesWithExt('.avif').length > 0, 'avif derivatives are published');
  } else {
    assert.equal(
      warnCount(/\[images\] AVIF output requires Hugo 0\.163\.0\+/),
      1,
      'exactly one deduplicated gate warning',
    );
    assert.equal(publishedFilesWithExt('.avif').length, 0, 'no avif files below the gate');
    for (const s of picture.querySelectorAll('source')) {
      assert.notEqual(s.getAttribute('type'), 'image/avif');
    }
  }
});
