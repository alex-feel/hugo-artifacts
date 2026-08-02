// Filesystem assertions over the multilingual overlay build exported by the
// runner (fixture/public/multilingual, built from hugo.toml plus
// ../multilingual.toml): /ru/gallery/ is a carousel-bearing page whose
// i18n-routed accessible names resolve through i18n/ru.toml rather than the
// English default, proving live T resolution for a non-default language.
/* global process */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {test, expect} from '@playwright/test';

test.describe('multilingual build (fixture/public/multilingual)', () => {
  function readRuGalleryHtml() {
    const publicDir = process.env.CAROUSEL_MULTILINGUAL_PUBLIC;
    expect(publicDir, 'the runner must export CAROUSEL_MULTILINGUAL_PUBLIC').toBeTruthy();
    return readFileSync(join(publicDir, 'ru', 'gallery', 'index.html'), 'utf8');
  }

  test('the ru carousel region carries the ru aria-roledescription', () => {
    const html = readRuGalleryHtml();
    expect(html).toContain('aria-roledescription="карусель"');
  });

  test('the ru previous-button accessible name resolves through i18n/ru.toml', () => {
    const html = readRuGalleryHtml();
    expect(html).toContain('aria-label="Предыдущий слайд"');
  });

  test('the ru slide roledescription and "i of N" label also resolve through i18n/ru.toml', () => {
    const html = readRuGalleryHtml();
    expect(html).toContain('aria-roledescription="слайд"');
    expect(html).toContain('aria-label="1 из 4"');
  });
});
