import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('match screen fills the viewport height', () => {
  const block = css.match(/#match-screen\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(block, /min-height:\s*calc\(100dvh/);
});

test('app cap is raised for widescreen', () => {
  const block = css.match(/#app\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(block, /max-width:\s*1800px/);
});

test('video uses object-fit contain with flexible sizing', () => {
  const block = css.match(/\.panel\s+video\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(block, /object-fit:\s*contain/);
  assert.match(block, /flex:\s*1/);
});

test('fixed 16:9 aspect ratios are removed in favour of height-fill', () => {
  assert.ok(!css.includes('aspect-ratio: 16 / 9'));
});
