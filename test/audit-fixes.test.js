import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const design = readFileSync(new URL('../design.md', import.meta.url), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function media(query) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`@media\\s*\\(${escaped}\\)\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
}

test('library panel is a tonal layer, not a second card', () => {
  const block = rule('.lists-panel');
  assert.match(block, /background:\s*var\(--color-paper-2\)/);
  assert.match(block, /border-radius:\s*var\(--radius-lg\)/);
  assert.ok(!/border:/.test(block), 'the outer panel should not add a border');
  assert.ok(!/box-shadow:/.test(block), 'the outer panel should not add a shadow');
});

test('gold hover links use the text-safe champion tone', () => {
  for (const selector of ['.podium-title:hover', '#results-list a:hover']) {
    const block = rule(selector);
    assert.match(block, /var\(--color-champion-text\)/, `${selector} should use champion-text`);
    assert.ok(!/champion-strong/.test(block), `${selector} must not use the 2.3:1 tone`);
  }
});

test('compact controls meet the 44px touch target', () => {
  for (const selector of [
    '.panel .controls button',
    '.panel .fallback .retry',
    '.editor-item-actions button',
  ]) {
    assert.match(rule(selector), /min-height:\s*44px/, `${selector} should be tappable`);
  }
});

test('CSV picker is a styled pill with a hidden native input', () => {
  const pill = rule('.load-csv');
  assert.match(pill, /min-height:\s*44px/);
  assert.match(pill, /border-radius:\s*var\(--radius-pill\)/);
  assert.match(pill, /border:\s*1px solid var\(--color-rule-strong\)/);

  const input = rule('.load-csv input');
  assert.match(input, /position:\s*absolute/);
  assert.match(input, /opacity:\s*0/);

  assert.match(css, /\.load-csv:focus-within\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/);
});

test('invalid editor fields are marked and described', () => {
  assert.match(js, /setAttribute\('aria-invalid',\s*'true'\)/);
  assert.match(js, /setAttribute\('aria-describedby',\s*'editor-status'\)/);
  assert.match(js, /removeAttribute\('aria-invalid'\)/);
});

test('blank titles are rejected in the editor instead of silently reverted', () => {
  const handler = js.match(/titleInput\.addEventListener\('change',[\s\S]*?\n  \}\);/)?.[0] ?? '';
  assert.match(handler, /sanitizeTitle\(titleInput\.value\)/, 'the typed title is checked first');
  assert.ok(
    handler.indexOf('A title cannot be empty.') !== -1 &&
      handler.indexOf('A title cannot be empty.') < handler.indexOf('updateItemTitle('),
    'the documented empty-title message must be reachable, before the list update',
  );
});

test('podium art loads eagerly so results do not pop in', () => {
  assert.ok(!/loading\s*=\s*'lazy'/.test(js), 'podium images are above the fold');
  assert.match(js, /fetchPriority\s*=\s*'high'/);
});

test('podium collapses to one column on narrow phones', () => {
  const block = media('max-width: 30rem');
  assert.match(block, /#podium\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(block, /\.podium-slot\s*\{[^}]*grid-area:\s*auto/);
});

test('panel hover changes border and shadow only', () => {
  const block = css.match(/\.panel:hover\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(block, /border-color:/);
  assert.match(block, /box-shadow:/);
  assert.ok(!/transform:/.test(block), 'the panel should not lift');
  assert.ok(!/background-color:/.test(block), 'the panel should not tint on hover');
});

test('disabled editor fields carry a cursor signal', () => {
  const block = css.match(/\.field input:disabled,[\s\S]*?\{([^}]*)\}/)?.[1] ?? '';
  assert.match(block, /cursor:\s*not-allowed/);
});

test('modals inert the page and focus their heading', () => {
  assert.match(js, /el\('app'\)\.inert\s*=\s*inert/, 'the helper toggles inert on the page');
  const opens = (js.match(/setPageInert\(true\)/g) || []).length;
  const closes = (js.match(/setPageInert\(false\)/g) || []).length;
  assert.equal(opens, 2, 'share and preview both inert the page when opened');
  assert.equal(closes, 2, 'share and preview both restore the page when closed');
  assert.match(js, /el\('share-title'\)\.focus\(\)/);
  assert.match(js, /el\('preview-title'\)\.focus\(\)/);
  assert.match(html, /id="share-title"[^>]*tabindex="-1"/);
  assert.match(html, /id="preview-title"[^>]*tabindex="-1"/);
});

test('vote meters expose their value to assistive tech', () => {
  assert.match(js, /setAttribute\('role',\s*'meter'\)/);
  assert.match(js, /aria-valuenow/);
  assert.match(js, /aria-valuemax/);
});

test('results header drops the decorative kicker', () => {
  assert.ok(!html.includes('Final standings'), 'the kicker repeated the heading');
});

test('playlist disclosure has a hover state and em breakpoints', () => {
  assert.match(css, /\.playlist-tool\s*>\s*summary:hover\s*\{[^}]*color:/);
  assert.ok(!/max-width:\s*720px/.test(css), 'breakpoints should use em');
  assert.ok(!/max-width:\s*560px/.test(css), 'breakpoints should use em');
  assert.match(css, /@media\s*\(max-width:\s*45em\)/);
  assert.match(css, /@media\s*\(max-width:\s*35em\)/);
});

test('the Hallmark stamp names every shipped screen', () => {
  assert.match(css.split('\n')[0], /Shelf \(Lists\)/);
});

test('design.md records the applied system changes', () => {
  assert.ok(!design.includes('lift 3px'), 'panel hover no longer lifts');
  assert.ok(!/kicker'd heading/.test(design), 'results no longer claims a kicker');
  assert.ok(!/panel \(`--radius-lg`, `--shadow-card`\)/.test(design), 'the library panel is now borderless');
  assert.match(design, /44\s*[×x*]\s*44|44\s?px/, 'the touch-target floor is documented');
});

test('duel screen establishes an h1 heading and h2 candidate headings', () => {
  assert.match(html, /<h1 class="hud-kicker">Duel<\/h1>/);
  assert.match(js, /const title = document\.createElement\('h2'\)/);
});

test('library and editor actions carry contextual aria-labels', () => {
  assert.match(js, /`Edit list \$\{entry\.name\}`/);
  assert.match(js, /`Share list \$\{entry\.name\}`/);
  assert.match(js, /`Move \$\{item\.title\} up`/);
  assert.match(js, /`Remove \$\{item\.title\} from list`/);
});

test('modals pair aria-describedby with their explanatory note', () => {
  assert.match(html, /id="share-modal"[^>]*aria-describedby="share-note"/);
  assert.match(html, /id="preview-modal"[^>]*aria-describedby="preview-note"/);
  assert.match(html, /id="preview-note"/);
});

test('theme toggle uses constant accessible name for toggle button', () => {
  assert.match(html, /id="theme-toggle"[^>]*aria-label="Dark theme"/);
  assert.match(js, /toggle\.setAttribute\('aria-label',\s*'Dark theme'\)/);
});

test('mobile landscape adapts duel spacing to short viewports', () => {
  assert.match(css, /@media\s*\(max-height:\s*32em\)/);
});

test('all podium thumbnails load with high priority above the fold', () => {
  assert.match(js, /img\.fetchPriority\s*=\s*'high'/);
  assert.ok(!/if\s*\(rank\s*===\s*1\)\s*img\.fetchPriority/.test(js), 'all podium places get high priority');
});

test('match screen rests on clean paper ground without muddy radial blobs', () => {
  const block = rule('#match-screen');
  assert.ok(!/radial-gradient/.test(block), 'match screen should not leak colored radial blobs into margins');
  assert.match(rule('.panel'), /box-shadow:\s*var\(--shadow-card\)/, 'panels are elevated cards on the arena ground');
});
