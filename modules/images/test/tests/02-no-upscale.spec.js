// No-upscale clamping: a 500px source keeps 480w and gains its own 500w top
// candidate but never exceeds 500; a source width exactly equal to the
// ladder top keeps that rung (the equality case); fixed layout emits only
// the densities the source can cover, with no sizes attribute.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, srcsetEntries} from './helpers.js';

const page = dom('bundle/index.html');

function descs(el) {
  return srcsetEntries(el.getAttribute('srcset')).map((e) => e.desc);
}

test('tiny source clamps the ladder and appends its own width once', () => {
  const picture = page.querySelector('#sc-tiny');
  assert.equal(picture.tagName, 'PICTURE');
  const chains = [...picture.querySelectorAll('source'), picture.querySelector('img')];
  for (const el of chains) {
    const d = descs(el);
    assert.equal(d.filter((x) => x === '500w').length, 1, `exactly one 500w in ${d}`);
    for (const x of d) {
      assert.ok(Number.parseInt(x, 10) <= 500, `candidate ${x} exceeds the 500px source`);
    }
  }
});

test('a source width exactly equal to a ladder rung keeps that rung', () => {
  const picture = page.querySelector('#sc-exact');
  const chains = [...picture.querySelectorAll('source'), picture.querySelector('img')];
  for (const el of chains) {
    assert.deepEqual(descs(el), ['480w', '800w']);
  }
});

test('fixed layout emits x-descriptors capped by the source width and no sizes', () => {
  const picture = page.querySelector('#sc-fixed');
  assert.equal(picture.getAttribute('data-layout'), 'fixed');
  const source = picture.querySelector('source');
  const img = picture.querySelector('img');
  assert.deepEqual(descs(source), ['1x', '2x']);
  assert.deepEqual(descs(img), ['1x', '2x']);
  assert.equal(source.getAttribute('sizes'), undefined);
  assert.equal(img.getAttribute('sizes'), undefined);
  assert.equal(img.getAttribute('width'), '256', 'fixed layout displays at the 1x size');
  assert.equal(img.getAttribute('height'), '256');
});
