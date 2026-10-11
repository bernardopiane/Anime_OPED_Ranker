import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('match screen fills the viewport height', () => {
  assert.match(rule('#match-screen'), /min-height:\s*calc\(100dvh/);
});

test('app cap is raised for widescreen', () => {
  assert.match(rule('#app'), /max-width:\s*1800px/);
});

test('video is letterboxed with flexible sizing', () => {
  const block = rule('.panel video');
  assert.match(block, /object-fit:\s*contain/);
  assert.match(block, /flex:\s*1/);
  assert.match(block, /min-height:\s*0/);
});

test('every media region fills the panel and can shrink', () => {
  for (const selector of ['.panel .yt', '.panel iframe', '.panel .loading', '.panel .fallback']) {
    assert.match(rule(selector), /flex:\s*1/, `${selector} should flex to fill`);
    assert.match(rule(selector), /min-height:\s*0/, `${selector} should be allowed to shrink`);
  }
});

test('fixed 16:9 aspect ratios are removed from media regions', () => {
  for (const selector of ['.panel video', '.panel .yt', '.panel .loading', '.panel iframe']) {
    assert.ok(!/aspect-ratio/.test(rule(selector)), `${selector} should not force an aspect ratio`);
  }
});

test('phone stacking rule is preserved', () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*720px\)\s*\{[^}]*#panels\s*\{[^}]*flex-direction:\s*column/,
  );
});
