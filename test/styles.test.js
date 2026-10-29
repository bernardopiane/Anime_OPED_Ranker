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
    /@media\s*\(max-width:\s*45em\)\s*\{[^}]*#panels\s*\{[^}]*flex-direction:\s*column/,
  );
});

test('library screen is centred and capped', () => {
  const block = rule('#lists-screen');
  assert.match(block, /max-width:\s*52rem/);
  assert.match(block, /margin-inline:\s*auto/);
});

test('library and editor panels reuse the tonal surface without a second card', () => {
  const block = rule('.lists-panel');
  assert.match(block, /background:\s*var\(--color-paper-2\)/);
  assert.match(block, /border-radius:\s*var\(--radius-lg\)/);
  assert.ok(!/border:/.test(block), 'the panel is a layer, not a card');
});

test('the active list card is outlined with the accent colour', () => {
  const block = rule('.list-card.is-active');
  assert.match(block, /border-color:\s*var\(--color-accent\)/);
  assert.match(block, /box-shadow:/);
});

test('list counts and card headings can wrap long names', () => {
  assert.match(rule('.list-card-head h2'), /overflow-wrap:\s*anywhere/);
  assert.match(rule('.list-count'), /font-variant-numeric:\s*tabular-nums/);
});

test('form fields keep a 44px target and use shared tokens', () => {
  const block = css.match(/\.field input,\s*\.field textarea\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(block, /min-height:\s*44px/);
  assert.match(block, /background:\s*var\(--color-paper\)/);
  assert.match(block, /border:\s*1px solid var\(--color-rule-strong\)/);
});

test('editor rows are a numbered grid with wrapping actions', () => {
  const block = rule('.editor-item');
  assert.match(block, /counter-increment:\s*item/);
  assert.match(block, /grid-template-columns:\s*2rem minmax\(0,\s*1fr\) auto/);
  assert.match(rule('.editor-item::before'), /content:\s*counter\(item\)/);
  assert.match(rule('.editor-item-actions'), /flex-wrap:\s*wrap/);
});

test('the share modal is wider than the preview modal but still bounded', () => {
  assert.match(rule('#share-modal .modal-card'), /width:\s*min\(42rem,\s*100%\)/);
});

test('destructive list actions use the danger colour', () => {
  assert.match(rule('button.danger'), /color:\s*var\(--color-danger\)/);
  assert.match(rule('button.danger'), /border-color:\s*var\(--color-danger\)/);
});

test('library and editor stack cleanly on narrow phones', () => {
  const block = css.match(/@media\s*\(max-width:\s*35em\)\s*\{([^@]*?)\n\}/s)?.[1] ?? '';
  assert.match(block, /\.lists-panel\s*\{[^}]*padding:\s*var\(--space-md\)/);
  assert.match(block, /\.editor-item\s*\{[^}]*grid-template-columns:\s*2rem minmax\(0,\s*1fr\)/);
  assert.match(block, /\.editor-item-actions\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
});
