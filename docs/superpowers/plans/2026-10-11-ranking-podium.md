# Ranking Podium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a top-three podium (gold/silver/bronze crowns, thumbnails, titles) above the results list when a tournament finishes.

**Architecture:** A new pure, unit-tested module `src/podium.js` derives the top three entries and their thumbnails. `renderResults()` in `app.js` builds the podium DOM into a static `<ol id="podium">`; `styles.css` lays it out as the classic 2nd-left / 1st-center / 3rd-right arrangement with crown colors from new `tokens.css` tokens.

**Tech Stack:** Vanilla ES modules, Node's built-in test runner (`node --test`), plain CSS with custom-property tokens.

## Global Constraints

- No code comments (repo rule). The only comments allowed are in `styles.css`'s existing header stamp.
- Run tests with `node --test` (currently 67 tests, all must stay green).
- All colors come from `tokens.css` custom properties; never inline `oklch()`/hex in `styles.css`.
- Do **not** stage or commit `opening list.csv` (`git add` explicit paths only).
- Always commit after each task.
- Do **not** regress `test/styles.test.js` contracts: `.panel …` media selectors keep `flex: 1`/`min-height: 0` (and no `aspect-ratio`), and `#panels { flex-direction: column }` must remain the **first** rule inside the `@media (max-width: 720px)` block.
- Copy / Download CSV / Play again behavior and the existing `#results-list` are unchanged.

---

### Task 1: `podiumThumbnail`

**Files:**
- Create: `src/podium.js`
- Create: `test/podium.test.js`

**Interfaces:**
- Consumes: `parseYouTubeUrl(url) => string | null` from `src/resolve.js` (existing).
- Produces: `podiumThumbnail(url) => string | null` — a YouTube thumbnail URL, or `null`.

- [ ] **Step 1: Write the failing test**

Create `test/podium.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podiumThumbnail } from '../src/podium.js';

test('builds a thumbnail URL from a YouTube watch link', () => {
  assert.equal(
    podiumThumbnail('https://www.youtube.com/watch?v=wpsgc3m__zg'),
    'https://img.youtube.com/vi/wpsgc3m__zg/hqdefault.jpg',
  );
});

test('builds a thumbnail URL from a youtu.be link', () => {
  assert.equal(
    podiumThumbnail('https://youtu.be/WQ2NsVzqOow'),
    'https://img.youtube.com/vi/WQ2NsVzqOow/hqdefault.jpg',
  );
});

test('returns null for a non-YouTube link', () => {
  assert.equal(podiumThumbnail('https://animethemes.moe/anime/noragami/OP1-NCBD1080'), null);
});

test('returns null for malformed input', () => {
  assert.equal(podiumThumbnail(undefined), null);
  assert.equal(podiumThumbnail('not a url'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/podium.test.js`
Expected: FAIL — `Cannot find module '../src/podium.js'` (or `podiumThumbnail is not a function`).

- [ ] **Step 3: Write minimal implementation**

Create `src/podium.js`:

```js
import { parseYouTubeUrl } from './resolve.js';

export function podiumThumbnail(url) {
  const id = parseYouTubeUrl(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/podium.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/podium.js test/podium.test.js
git commit -m "Add podiumThumbnail helper"
```

---

### Task 2: `podiumEntries`

**Files:**
- Modify: `src/podium.js`
- Modify: `test/podium.test.js`

**Interfaces:**
- Consumes: `podiumThumbnail(url)` from Task 1.
- Produces: `podiumEntries(rankedItems) => Array<{ rank: number, item: object, thumbnail: string | null }>` — at most three entries, in rank order (`rank` = 1, 2, 3).

- [ ] **Step 1: Write the failing test**

Append to `test/podium.test.js` (add `podiumEntries` to the import):

```js
import { podiumEntries } from '../src/podium.js';
```

```js
const a = { id: 0, title: 'A', url: 'https://www.youtube.com/watch?v=wpsgc3m__zg' };
const b = { id: 1, title: 'B', url: 'https://animethemes.moe/anime/noragami/OP1-NCBD1080' };
const c = { id: 2, title: 'C', url: 'https://www.youtube.com/watch?v=WQ2NsVzqOow' };
const d = { id: 3, title: 'D', url: 'https://www.youtube.com/watch?v=j9xlqXCSBIc' };

test('returns the top three in rank order with ranks and thumbnails', () => {
  assert.deepEqual(podiumEntries([a, b, c, d]), [
    { rank: 1, item: a, thumbnail: 'https://img.youtube.com/vi/wpsgc3m__zg/hqdefault.jpg' },
    { rank: 2, item: b, thumbnail: null },
    { rank: 3, item: c, thumbnail: 'https://img.youtube.com/vi/WQ2NsVzqOow/hqdefault.jpg' },
  ]);
});

test('returns fewer than three when the ranking is short', () => {
  assert.deepEqual(podiumEntries([a]), [
    { rank: 1, item: a, thumbnail: 'https://img.youtube.com/vi/wpsgc3m__zg/hqdefault.jpg' },
  ]);
});

test('returns an empty array for an empty ranking', () => {
  assert.deepEqual(podiumEntries([]), []);
});

test('skips undefined entries', () => {
  assert.deepEqual(podiumEntries([a, undefined, c]), [
    { rank: 1, item: a, thumbnail: 'https://img.youtube.com/vi/wpsgc3m__zg/hqdefault.jpg' },
    { rank: 2, item: c, thumbnail: 'https://img.youtube.com/vi/WQ2NsVzqOow/hqdefault.jpg' },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/podium.test.js`
Expected: FAIL — `podiumEntries is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/podium.js`:

```js
export function podiumEntries(rankedItems) {
  const entries = [];
  for (const item of rankedItems) {
    if (!item) continue;
    entries.push({ rank: entries.length + 1, item, thumbnail: podiumThumbnail(item.url) });
    if (entries.length === 3) break;
  }
  return entries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/podium.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/podium.js test/podium.test.js
git commit -m "Add podiumEntries helper"
```

---

### Task 3: Render the podium

**Files:**
- Modify: `index.html:60` (after `<h1>Your ranking</h1>`)
- Modify: `app.js` (imports near line 13; `renderResults` at 690-709)
- Test: `test/podium.test.js` (existing — must stay green)

**Interfaces:**
- Consumes: `podiumEntries(items)` from Task 2.
- Produces: DOM — `<ol id="podium" class="podium">` containing `<li class="podium-slot podium-slot--{rank}">` slots, each with a `.podium-crown` SVG, an optional `.podium-figure > img.podium-thumb` (present only when a thumbnail exists; on image load failure it is replaced by a `.podium-show` text tile), and a `.podium-stand` holding `.podium-rank` + `a.podium-title` (a slot with no thumbnail has no figure — the title in the stand carries the show information).

- [ ] **Step 1: Add the container to `index.html`**

Find:
```html
        <h1>Your ranking</h1>
        <ol id="results-list"></ol>
```

Replace with:
```html
        <h1>Your ranking</h1>
        <ol id="podium" class="podium" aria-label="Top three"></ol>
        <ol id="results-list"></ol>
```

- [ ] **Step 2: Import the helper in `app.js`**

After the last `import { … } from './src/cache.js';` block (around line 13), add:

```js
import { podiumEntries } from './src/podium.js';
```

- [ ] **Step 3: Add `renderPodium` and call it from `renderResults`**

In `app.js`, replace `renderResults` (currently):

```js
function renderResults() {
  cleanupMedia('a');
  cleanupMedia('b');
  activeSide = null;
  lockedSide = null;
  const items = rankedItems();
  const list = el('results-list');
  list.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = item.title;
    li.appendChild(link);
    list.appendChild(li);
  }
  showScreen('results');
}
```

with:

```js
const CROWN_SVG =
  '<svg class="podium-crown" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7l5 4 4-6 4 6 5-4-1.5 11h-15L3 7z"/></svg>';

function podiumShowTile(title) {
  const span = document.createElement('span');
  span.className = 'podium-show';
  span.textContent = title;
  return span;
}

function renderPodium(items) {
  const podium = el('podium');
  podium.innerHTML = '';
  for (const { rank, item, thumbnail } of podiumEntries(items)) {
    const li = document.createElement('li');
    li.className = `podium-slot podium-slot--${rank}`;
    li.insertAdjacentHTML('beforeend', CROWN_SVG);

    if (thumbnail) {
      const figure = document.createElement('div');
      figure.className = 'podium-figure';
      const img = document.createElement('img');
      img.className = 'podium-thumb';
      img.src = thumbnail;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => figure.replaceWith(podiumShowTile(item.title)));
      figure.appendChild(img);
      li.appendChild(figure);
    }

    const stand = document.createElement('div');
    stand.className = 'podium-stand';
    const rankEl = document.createElement('span');
    rankEl.className = 'podium-rank';
    rankEl.textContent = String(rank);
    const title = document.createElement('a');
    title.className = 'podium-title';
    title.href = item.url;
    title.target = '_blank';
    title.rel = 'noopener';
    title.textContent = item.title;
    stand.append(rankEl, title);
    li.appendChild(stand);

    podium.appendChild(li);
  }
}

function renderResults() {
  cleanupMedia('a');
  cleanupMedia('b');
  activeSide = null;
  lockedSide = null;
  const items = rankedItems();
  renderPodium(items);
  const list = el('results-list');
  list.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = item.title;
    li.appendChild(link);
    list.appendChild(li);
  }
  showScreen('results');
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test`
Expected: PASS — 75 tests (67 existing + 8 from `test/podium.test.js`), 0 fail.

- [ ] **Step 5: Commit**

```bash
git add index.html app.js
git commit -m "Render ranking podium on the results screen"
```

---

### Task 4: Style the podium

**Files:**
- Modify: `tokens.css:21` (after `--color-scrim`)
- Modify: `styles.css` (insert after `#results-list a:hover` at line 400; append inside `@media (max-width: 720px)`)
- Test: `test/styles.test.js` (existing — must stay green)

**Interfaces:**
- Consumes: the DOM classes produced in Task 3 (`#podium`, `.podium-slot--{1,2,3}`, `.podium-crown`, `.podium-figure`, `.podium-thumb`, `.podium-show`, `.podium-stand`, `.podium-rank`, `.podium-title`).
- Produces: crown color tokens `--crown-gold`, `--crown-silver`, `--crown-bronze`.

- [ ] **Step 1: Add crown tokens to `tokens.css`**

Find:
```css
  --color-media: oklch(12% 0.008 45);
  --color-scrim: oklch(10% 0.010 45 / 0.62);
```

Replace with:
```css
  --color-media: oklch(12% 0.008 45);
  --color-scrim: oklch(10% 0.010 45 / 0.62);

  --crown-gold: oklch(85% 0.13 85);
  --crown-silver: oklch(85% 0.02 240);
  --crown-bronze: oklch(68% 0.10 55);
```

- [ ] **Step 2: Add the podium layout to `styles.css`**

Find:
```css
#results-list a:hover { color: var(--color-accent-strong); text-decoration: underline; }

.modal {
```

Replace with:
```css
#results-list a:hover { color: var(--color-accent-strong); text-decoration: underline; }

#podium {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: end;
  gap: var(--space-md);
  margin: var(--space-lg) 0 var(--space-md);
  padding: 0;
  list-style: none;
}
.podium-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  --podium-h: 6rem;
}
.podium-slot--1 { grid-area: 1 / 2; --podium-h: 11rem; }
.podium-slot--2 { grid-area: 1 / 1; --podium-h: 8rem; }
.podium-slot--3 { grid-area: 1 / 3; --podium-h: 6rem; }
.podium-crown { width: 2rem; height: 2rem; flex: 0 0 auto; }
.podium-slot--1 .podium-crown { color: var(--crown-gold); }
.podium-slot--2 .podium-crown { color: var(--crown-silver); }
.podium-slot--3 .podium-crown { color: var(--crown-bronze); }
.podium-figure,
.podium-show {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  background: var(--color-media);
}
.podium-thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.podium-show {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-sm);
  text-align: center;
  color: var(--color-ink-soft);
  font-size: var(--text-sm);
}
.podium-stand {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2xs);
  width: 100%;
  min-height: var(--podium-h);
  padding: var(--space-sm);
  text-align: center;
  background: var(--color-paper-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
}
.podium-slot--1 .podium-stand { border-color: var(--color-accent); }
.podium-rank {
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-variant-numeric: tabular-nums;
  color: var(--color-ink);
}
.podium-title { color: var(--color-ink); font-weight: 500; text-decoration: none; }
.podium-title:hover { color: var(--color-accent-strong); text-decoration: underline; }

.modal {
```

- [ ] **Step 3: Add the responsive tweaks**

Find (inside the existing `@media (max-width: 720px)` block):
```css
@media (max-width: 720px) {
  #panels { flex-direction: column; }
```

Replace with:
```css
@media (max-width: 720px) {
  #panels { flex-direction: column; }
  #podium { gap: var(--space-sm); }
  .podium-slot--1 { --podium-h: 8rem; }
  .podium-slot--2 { --podium-h: 6rem; }
  .podium-slot--3 { --podium-h: 4.5rem; }
  .podium-crown { width: 1.5rem; height: 1.5rem; }
  .podium-title { font-size: var(--text-sm); }
```

(Leave the rest of the block — `.vs-badge`, `.volume` — untouched, and keep `#panels { flex-direction: column; }` as the first rule.)

- [ ] **Step 4: Run the tests**

Run: `node --test`
Expected: PASS — 75 tests, 0 fail (crucially `test/styles.test.js` still green).

- [ ] **Step 5: Manual check**

Run the site (`python -m http.server 8000`, open `http://localhost:8000`), start a tournament with a small CSV, finish it, and confirm:
- 2nd is left, 1st is center on the tallest stand, 3rd is right on the shortest.
- Crowns are gold / silver / bronze.
- YouTube entries show thumbnails; animethemes entries (e.g. Noragami) show a title-only tile.
- The full numbered `#results-list` is still below the podium.

- [ ] **Step 6: Commit**

```bash
git add tokens.css styles.css
git commit -m "Style the ranking podium with crown tokens"
```

---

## Self-Review Notes

- **Spec coverage:** thumbnails (Task 1), top-three ordering + `<3`/undefined handling (Task 2), container + figure/fallback + `onerror` + ranks/titles (Task 3), crowns/tokens/layout/responsive (Task 4). The spec's "keep `styles.test.js` unchanged" holds — no podium contracts are added.
- **Type consistency:** `podiumEntries` returns `{ rank, item, thumbnail }`; Task 3 destructures exactly those names. Token names `--crown-gold/silver/bronze` match between Task 4's `tokens.css` and `styles.css`.
- **Test count:** 67 existing + 8 new (`test/podium.test.js`).

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.
