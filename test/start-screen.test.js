import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('start screen groups hero, card, and streamer tools', () => {
  assert.match(html, /<header class="start-hero">/, 'the wordmark sits in its own hero block');
  assert.match(html, /<div class="start-options">/, 'the run options share a ruled row');
  assert.match(html, /<div class="start-aux">/, 'the streamer tools share a stack');

  const aux = html.slice(html.indexOf('class="start-aux"'), html.indexOf('class="meta"'));
  assert.ok(aux.includes('twitch-card'), 'the Twitch card lives in the aux stack');
  assert.ok(aux.includes('playlist-tool'), 'the playlist tool lives in the aux stack');
  assert.ok(
    aux.indexOf('twitch-card') < aux.indexOf('playlist-tool'),
    'the aux stack keeps the Twitch card first',
  );
});

test('the start card is the primary surface', () => {
  const card = rule('.start-card');
  assert.match(card, /border-block-start:\s*3px solid var\(--color-accent\)/, 'accent top rail');
  assert.match(card, /background:\s*var\(--color-paper-2\)/);

  const options = rule('.start-options');
  assert.match(options, /border-block:\s*1px solid var\(--color-rule\)/, 'the options row is ruled');
  assert.match(options, /flex-wrap:\s*wrap/, 'the options row wraps on narrow screens');
});

test('the primary call to action is a 48px hero button', () => {
  const block = rule('.start-main-btn');
  assert.match(block, /min-height:\s*48px/);
  assert.match(block, /font-size:\s*var\(--text-md\)/);
});

test('reset is de-emphasised but stays reachable', () => {
  const block = rule('button.subtle');
  assert.match(block, /color:\s*var\(--color-muted\)/);
  assert.match(block, /border-color:\s*var\(--color-rule\)/);
  assert.match(block, /margin-inline-start:\s*auto/, 'reset is pushed to the end of the row');
});

test('the start status pill reflects its state', () => {
  const pill = rule('#status');
  assert.match(pill, /border-radius:\s*var\(--radius-pill\)/);
  assert.match(css, /#status\.is-error::before\s*\{[^}]*background:\s*var\(--color-danger\)/);

  assert.match(js, /function setStartStatus\(/, 'one helper owns both text and state');
  assert.match(js, /classList\.toggle\('is-error',\s*Boolean\(isError\)\)/);
  assert.match(js, /setStartStatus\([^)]*true\)/, 'failures are marked as errors');

  const label = js.match(/function updateSourceLabel\(\)[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(label, /setStartStatus\(/, 'the ready state goes through the helper');
  assert.ok(!/el\('status'\)\.textContent/.test(label), 'the ready state clears the error class');
});

test('the start card animation only staggers real children', () => {
  const delays = [...css.matchAll(/#start-screen \.start-card > \*:nth-child\((\d+)\)/g)].map((m) =>
    Number(m[1]),
  );
  const cardChildren = (html.match(/class="start-card"[\s\S]*?<\/div>\s*\n\s*<div class="start-aux"/)?.[0] ?? '')
    .split('\n')
    .filter((line) => /^ {10}<(div|p|form|section|header|ul|ol)\b/.test(line)).length;
  assert.ok(cardChildren >= 3, `expected at least 3 card children, found ${cardChildren}`);
  assert.ok(
    Math.max(...delays) <= cardChildren,
    `delays target children ${delays.join(', ')} but the card only has ${cardChildren}`,
  );
});
