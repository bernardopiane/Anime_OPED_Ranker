# Krisgo Opening List Ranking Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local static website that reads `krisgo opening list.csv` and ranks all 100 anime openings/endings into a definitive Top 100 through a merge-sort tournament of pairwise picks with embedded video previews.

**Architecture:** Plain static site with ES modules and no build step. Pure logic (CSV parsing, tournament, video matching) lives in `src/` modules importable by both the browser and Node's test runner. `app.js` handles only DOM wiring, screen state, and persistence.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML, CSS. Node's built-in test runner (`node --test`) with zero dependencies. Public `api.animethemes.moe` API for resolving direct `.webm` video URLs.

## Global Constraints

- No build step and **zero npm dependencies**; `package.json` exists only for `"type": "module"` and scripts.
- The site must be served over HTTP (CSV `fetch` + API won't work over `file://`).
- Videos are embedded as native `<video>` elements, **muted by default**, looping, autoplay; sound only via an explicit per-panel Unmute toggle.
- Every matchup must produce a winner (no ties, no skips).
- Ranking is a **true sort** via merge-sort tournament (~565 comparisons for 100 items).
- Titles may contain commas; parse CSV by splitting at the **last comma**.
- Each item's `id` is its zero-based position in the parsed list.
- Anime page URLs cannot be iframed (`X-Frame-Options: SAMEORIGIN`); always use native `<video>` with the direct `v.animethemes.moe` link.
- Efficient, DRY, YAGNI. Commit after every task.

---

## File Structure

```
index.html              markup; loads app.js as type="module"
styles.css              layout & styling
app.js                  UI wiring: screens, video players, events, persistence
src/csv.js              parseCsv(text) -> items[]
src/resolve.js          parseCsvUrl, pickVideo, fetchVideoForItem
src/tournament.js       pure, deterministic merge-sort comparison engine
src/storage.js          localStorage load/save/clear
test/csv.test.js        node --test
test/tournament.test.js node --test
test/resolve.test.js    node --test
package.json            { "type": "module" }, scripts: test, serve
serve.ps1               local server launcher
README.md               how to run and use
```

---

## Task 1: Project scaffold + CSV parser

**Files:**
- Create: `package.json`
- Create: `serve.ps1`
- Create: `README.md`
- Create: `src/csv.js`
- Test: `test/csv.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCsv(text: string) -> Array<{ id: number, title: string, url: string }>`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "krisgo-opening-list",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "serve": "python -m http.server 8000"
  }
}
```

- [ ] **Step 2: Create `serve.ps1`**

```powershell
param([int]$Port = 8000)
Write-Host "Serving $PSScriptRoot on http://localhost:$Port"
python -m http.server $Port
```

- [ ] **Step 3: Create `README.md`**

```markdown
# Krisgo Opening List

Ranks the 100 anime openings/endings in `krisgo opening list.csv` into a Top 100
through a merge-sort tournament of pairwise picks, with embedded video previews.

## Run

The site must be served over HTTP (opening it as `file://` will not work).

    python -m http.server 8000

or on Windows:

    ./serve.ps1

Then open http://localhost:8000

## Test

    node --test
```

- [ ] **Step 4: Write the failing test**

Create `test/csv.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/csv.js';

test('parses a simple line into title and url', () => {
  const items = parseCsv('Noragami,https://animethemes.moe/anime/noragami/OP1-NCBD1080');
  assert.deepEqual(items, [
    { id: 0, title: 'Noragami', url: 'https://animethemes.moe/anime/noragami/OP1-NCBD1080' },
  ]);
});

test('preserves commas inside titles', () => {
  const items = parseCsv('Chi.: Chikyuu no Undou ni Tsuite,https://x/y');
  assert.equal(items[0].title, 'Chi.: Chikyuu no Undou ni Tsuite');
  assert.equal(items[0].url, 'https://x/y');
});

test('skips blank lines', () => {
  const items = parseCsv('\n\nA,http://a\n\n');
  assert.equal(items.length, 1);
});

test('parses the real CSV file into 100 items', () => {
  const text = readFileSync(new URL('../krisgo opening list.csv', import.meta.url), 'utf8');
  const items = parseCsv(text);
  assert.equal(items.length, 100);
  assert.equal(items[0].title, 'Noragami');
  assert.equal(items[99].title, 'Bishounen Tanteidan');
  assert.ok(items.every((i) => i.url.startsWith('https://animethemes.moe/')));
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `node --test test/csv.test.js`
Expected: FAIL — `Cannot find module '../src/csv.js'`.

- [ ] **Step 6: Create `src/csv.js`**

```js
export function parseCsv(text) {
  const items = [];
  let id = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const comma = line.lastIndexOf(',');
    if (comma === -1) continue;
    const title = line.slice(0, comma).trim();
    const url = line.slice(comma + 1).trim();
    if (title === '' || url === '') continue;
    items.push({ id, title, url });
    id += 1;
  }
  return items;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `node --test test/csv.test.js`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json serve.ps1 README.md src/csv.js test/csv.test.js
git commit -m "feat: scaffold project and add CSV parser"
```

---

## Task 2: Tournament engine core

**Files:**
- Create: `src/tournament.js`
- Test: `test/tournament.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createTournament(ids: number[]) -> { ids: number[], winners: number[] }`
  - `nextMatchup(state) -> { a: number, b: number, round: number } | null`
  - `recordWinner(state, winnerId: number) -> state` (new object)
  - `getRanking(state) -> number[] | null` (null until complete)
  - `isComplete(state) -> boolean`
  - `getProgress(state) -> { done, total, percent, round, totalRounds, complete }`
  - `undo(state) -> state` (new object)

- [ ] **Step 1: Write the failing test**

Create `test/tournament.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTournament,
  nextMatchup,
  recordWinner,
  getRanking,
  getProgress,
  isComplete,
  undo,
} from '../src/tournament.js';

const choose = (a, b) => (a < b ? a : b);

function playAll(ids) {
  let s = createTournament(ids);
  let m;
  while ((m = nextMatchup(s))) s = recordWinner(s, choose(m.a, m.b));
  return s;
}

test('sorts ids into ascending preference order', () => {
  const ids = [5, 3, 9, 1, 7, 2, 8, 0, 6, 4];
  const sorted = getRanking(playAll(ids));
  assert.deepEqual(sorted, [...ids].sort((a, b) => a - b));
});

test('handles an odd number of items', () => {
  const ids = [4, 1, 3, 2, 5];
  const sorted = getRanking(playAll(ids));
  assert.deepEqual(sorted, [1, 2, 3, 4, 5]);
});

test('reports completion and returns null matchup when done', () => {
  let s = createTournament([3, 1, 2]);
  assert.equal(isComplete(s), false);
  s = playAll([3, 1, 2]);
  assert.equal(isComplete(s), true);
  assert.equal(nextMatchup(s), null);
});

test('recordWinner rejects a winner that is not in the matchup', () => {
  const s = createTournament([1, 2, 3]);
  assert.throws(() => recordWinner(s, 999), /Winner must be one of the current matchup/);
});

test('undo reverts the last decision', () => {
  let s = createTournament([3, 1, 2]);
  const m = nextMatchup(s);
  s = recordWinner(s, m.a);
  const before = s.winners.length;
  s = undo(s);
  assert.equal(s.winners.length, before - 1);
  assert.deepEqual(nextMatchup(s), m);
});

test('resume from partial winners reproduces the same next matchup', () => {
  const ids = [4, 1, 3, 2, 7, 6, 5];
  let a = createTournament(ids);
  const first = nextMatchup(a);
  a = recordWinner(a, choose(first.a, first.b));
  const saved = JSON.parse(JSON.stringify(a));
  const rebuilt = { ids: saved.ids, winners: saved.winners };
  assert.deepEqual(nextMatchup(rebuilt), nextMatchup(a));
});

test('progress starts at zero with a positive total estimate', () => {
  const p = getProgress(createTournament(Array.from({ length: 100 }, (_, i) => i)));
  assert.equal(p.done, 0);
  assert.equal(p.percent, 0);
  assert.ok(p.total >= 100);
  assert.equal(p.complete, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/tournament.test.js`
Expected: FAIL — `Cannot find module '../src/tournament.js'`.

- [ ] **Step 3: Create `src/tournament.js`**

```js
function merge(left, right, compare) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const winner = compare(left[i], right[j]);
    if (winner === left[i]) out.push(left[i++]);
    else out.push(right[j++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

function sortRuns(ids, compare) {
  let runs = ids.map((id) => [id]);
  while (runs.length > 1) {
    const next = [];
    for (let i = 0; i < runs.length; i += 2) {
      next.push(i + 1 < runs.length ? merge(runs[i], runs[i + 1], compare) : runs[i]);
    }
    runs = next;
  }
  return runs[0] || [];
}

function replay(state) {
  const totalRounds = state.ids.length <= 1 ? 1 : Math.ceil(Math.log2(state.ids.length));
  let wi = 0;
  let round = 1;
  let pending = null;
  const compare = (a, b) => {
    if (wi < state.winners.length) {
      const winner = state.winners[wi++];
      if (winner !== a && winner !== b) throw new Error('Corrupt winner history');
      return winner;
    }
    if (!pending) pending = { a, b, round };
    return a;
  };

  let runs = state.ids.map((id) => [id]);
  while (runs.length > 1) {
    const next = [];
    for (let i = 0; i < runs.length; i += 2) {
      next.push(i + 1 < runs.length ? merge(runs[i], runs[i + 1], compare) : runs[i]);
    }
    runs = next;
    round += 1;
  }

  return { pending, ranking: runs[0] || [], totalRounds, round: Math.min(round, totalRounds) };
}

function estimateTotal(ids) {
  let count = 0;
  const compare = (a) => {
    count += 1;
    return a;
  };
  sortRuns(ids, compare);
  return count;
}

export function createTournament(ids) {
  return { ids: [...ids], winners: [] };
}

export function nextMatchup(state) {
  return replay(state).pending;
}

export function recordWinner(state, winnerId) {
  const m = nextMatchup(state);
  if (!m) throw new Error('Tournament is already complete');
  if (winnerId !== m.a && winnerId !== m.b) throw new Error('Winner must be one of the current matchup');
  return { ids: state.ids, winners: [...state.winners, winnerId] };
}

export function undo(state) {
  return { ids: state.ids, winners: state.winners.slice(0, -1) };
}

export function isComplete(state) {
  return replay(state).pending === null;
}

export function getRanking(state) {
  const r = replay(state);
  return r.pending ? null : r.ranking;
}

export function getProgress(state) {
  const r = replay(state);
  const total = Math.max(1, estimateTotal(state.ids));
  const done = state.winners.length;
  return {
    done,
    total,
    percent: state.ids.length <= 1 ? 100 : Math.min(100, Math.round((done / total) * 100)),
    round: r.pending ? r.pending.round : r.totalRounds,
    totalRounds: r.totalRounds,
    complete: r.pending === null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/tournament.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tournament.js test/tournament.test.js
git commit -m "feat: add merge-sort tournament engine"
```

---

## Task 3: Video URL resolution helpers

**Files:**
- Create: `src/resolve.js`
- Test: `test/resolve.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseCsvUrl(url: string) -> { slug: string, theme: string, tags: string } | null`
  - `pickVideo(anime: object, theme: string, tags: string) -> string | null` (returns a direct video link)
  - `fetchVideoForItem(item: { url: string }) -> Promise<{ videoUrl: string|null, pageUrl: string }>`

- [ ] **Step 1: Write the failing test**

Create `test/resolve.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvUrl, pickVideo } from '../src/resolve.js';

test('parses slug, theme and tags from a page URL', () => {
  assert.deepEqual(parseCsvUrl('https://animethemes.moe/anime/noragami/OP1-NCBD1080'), {
    slug: 'noragami',
    theme: 'OP1',
    tags: 'NCBD1080',
  });
});

test('parses a theme with no tags', () => {
  assert.deepEqual(parseCsvUrl('https://animethemes.moe/anime/sousou-no-frieren/OP1'), {
    slug: 'sousou-no-frieren',
    theme: 'OP1',
    tags: '',
  });
});

test('parses an ED theme', () => {
  const parsed = parseCsvUrl('https://animethemes.moe/anime/fate-zero-2nd-season/ED3-BD1080');
  assert.equal(parsed.theme, 'ED3');
  assert.equal(parsed.tags, 'BD1080');
});

test('returns null for a non-animethemes URL', () => {
  assert.equal(parseCsvUrl('https://example.com/foo'), null);
});

const anime = {
  animethemes: [
    {
      slug: 'OP1',
      animethemeentries: [
        {
          videos: [
            { tags: 'NCBD1080', link: 'https://v.animethemes.moe/Noragami-OP1.webm' },
            { tags: 'NCBD720', link: 'https://v.animethemes.moe/Noragami-OP1-720.webm' },
          ],
        },
      ],
    },
    { slug: 'ED1', animethemeentries: [{ videos: [{ tags: 'NCBD1080', link: 'https://v.animethemes.moe/Noragami-ED1.webm' }] }] },
  ],
};

test('picks the video whose tags match exactly', () => {
  assert.equal(pickVideo(anime, 'OP1', 'NCBD1080'), 'https://v.animethemes.moe/Noragami-OP1.webm');
});

test('falls back to the first video of the theme when tags do not match', () => {
  assert.equal(pickVideo(anime, 'OP1', 'UNKNOWN'), 'https://v.animethemes.moe/Noragami-OP1.webm');
});

test('returns null for an unknown theme', () => {
  assert.equal(pickVideo(anime, 'OP9', 'NCBD1080'), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/resolve.test.js`
Expected: FAIL — `Cannot find module '../src/resolve.js'`.

- [ ] **Step 3: Create `src/resolve.js`**

```js
export function parseCsvUrl(url) {
  const m = url.match(/animethemes\.moe\/anime\/([^/]+)\/([^/?#]+)/i);
  if (!m) return null;
  const slug = m[1];
  const rest = m[2];
  const dash = rest.indexOf('-');
  const theme = dash === -1 ? rest : rest.slice(0, dash);
  const tags = dash === -1 ? '' : rest.slice(dash + 1);
  return { slug, theme, tags };
}

export function pickVideo(anime, theme, tags) {
  const themes = (anime && anime.animethemes) || [];
  const match = themes.find((t) => t.slug === theme);
  if (!match) return null;
  const videos = [];
  for (const entry of match.animethemeentries || []) {
    for (const video of entry.videos || []) videos.push(video);
  }
  if (videos.length === 0) return null;
  if (tags) {
    const exact = videos.find((v) => v.tags === tags);
    if (exact) return exact.link;
  }
  return videos[0].link;
}

export async function fetchVideoForItem(item) {
  const parsed = parseCsvUrl(item.url);
  if (!parsed) return { videoUrl: null, pageUrl: item.url };
  try {
    const res = await fetch(
      `https://api.animethemes.moe/anime/${parsed.slug}?include=animethemes.animethemeentries.videos`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const link = pickVideo(json.anime, parsed.theme, parsed.tags);
    return { videoUrl: link || null, pageUrl: item.url };
  } catch {
    return { videoUrl: null, pageUrl: item.url };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/resolve.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/resolve.js test/resolve.test.js
git commit -m "feat: add animethemes video URL resolution helpers"
```

---

## Task 4: Storage module

**Files:**
- Create: `src/storage.js`
- Test: (covered indirectly; no dedicated test — thin localStorage wrapper)

**Interfaces:**
- Consumes: browser `localStorage`.
- Produces:
  - `save(data: object) -> void`
  - `load() -> object | null`
  - `clear() -> void`

- [ ] **Step 1: Create `src/storage.js`**

```js
const KEY = 'krisgo-opening-list/v1';

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/storage.js
git commit -m "feat: add localStorage persistence wrapper"
```

---

## Task 5: Markup and styles

**Files:**
- Create: `index.html`
- Create: `styles.css`

**Interfaces:**
- Consumes: nothing.
- Produces: DOM element ids used by `app.js`: `#app`, `#start-screen`, `#match-screen`, `#results-screen`, `#resume-btn`, `#start-btn`, `#reset-btn`, `#progress-bar`, `#progress-label`, `#panels`, `#undo-btn`, `#panel-a`, `#panel-b`, `#results-list`, `#copy-btn`, `#download-btn`, `#again-btn`, `#status`.

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Krisgo Opening List — Top 100</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main id="app">
      <section id="start-screen" class="screen">
        <h1>Krisgo Opening List</h1>
        <p id="status">Loading…</p>
        <div class="actions">
          <button id="start-btn" class="primary">Start</button>
          <button id="resume-btn" class="primary hidden">Resume</button>
          <button id="reset-btn">Reset</button>
        </div>
      </section>

      <section id="match-screen" class="screen hidden">
        <header class="progress">
          <div class="bar"><div id="progress-bar"></div></div>
          <span id="progress-label"></span>
        </header>
        <div id="panels">
          <div id="panel-a" class="panel" role="button" tabindex="0"></div>
          <div id="panel-b" class="panel" role="button" tabindex="0"></div>
        </div>
        <footer class="match-footer">
          <button id="undo-btn">Undo</button>
          <span class="hint">Click a panel or press ← / → to pick · U to unmute</span>
        </footer>
      </section>

      <section id="results-screen" class="screen hidden">
        <h1>Your Top 100</h1>
        <ol id="results-list"></ol>
        <div class="actions">
          <button id="copy-btn">Copy</button>
          <button id="download-btn">Download CSV</button>
          <button id="again-btn">Play again</button>
        </div>
      </section>
    </main>
    <script type="module" src="app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `styles.css`**

```css
:root {
  --bg: #101014;
  --panel: #1b1b22;
  --panel-hover: #26262f;
  --text: #f2f2f5;
  --muted: #9a9aa8;
  --accent: #ff5a7a;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}

#app { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }

.hidden { display: none !important; }

h1 { font-size: 1.6rem; }

button {
  font: inherit;
  color: var(--text);
  background: var(--panel);
  border: 1px solid #33333d;
  border-radius: 8px;
  padding: 0.5rem 1rem;
  cursor: pointer;
}
button:hover { background: var(--panel-hover); }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }

.actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem; }

.progress { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.progress .bar { flex: 1; height: 10px; background: var(--panel); border-radius: 999px; overflow: hidden; }
.progress .bar > div { height: 100%; width: 0; background: var(--accent); transition: width 0.2s; }
#progress-label { color: var(--muted); white-space: nowrap; font-size: 0.9rem; }

#panels { display: flex; gap: 1rem; }
.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  text-align: left;
  background: var(--panel);
}
.panel video { width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 6px; }
.panel .title { font-weight: 600; }
.panel .controls { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.panel .controls button { padding: 0.25rem 0.6rem; }
.panel .fallback { color: var(--muted); font-size: 0.85rem; }
.panel .fallback a { color: var(--accent); }

.match-footer { display: flex; align-items: center; gap: 1rem; margin-top: 1rem; }
.hint { color: var(--muted); font-size: 0.85rem; }

#results-list { line-height: 1.9; }
#results-list a { color: var(--muted); text-decoration: none; }
#results-list a:hover { color: var(--accent); }

@media (max-width: 720px) {
  #panels { flex-direction: column; }
}
```

- [ ] **Step 3: Verify markup loads (manual sanity check)**

Run: `python -m http.server 8000`, open http://localhost:8000.
Expected: the Start screen renders (with a "Loading…" status, since `app.js` is not written yet the console will show a module-not-found error — that is expected at this step).

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "feat: add page markup and styles"
```

---

## Task 6: App — load data, start/resume, screen switching

**Files:**
- Create: `app.js`
- Modify: `README.md` (usage section only if needed)

**Interfaces:**
- Consumes: `parseCsv` (Task 1), `createTournament` (Task 2), `save`/`load`/`clear` (Task 4).
- Produces: global `state` object and functions used by later tasks: `showScreen(name)`, `ready()`, and the persistence key shape `{ items, winners, version: 1 }`.

- [ ] **Step 1: Create `app.js` with data loading and screen management**

```js
import { parseCsv } from './src/csv.js';
import { createTournament } from './src/tournament.js';
import { save, load, clear } from './src/storage.js';

const CSV_URL = 'krisgo%20opening%20list.csv';

const state = {
  items: [],
  tournament: null,
};

const el = (id) => document.getElementById(id);

function showScreen(name) {
  for (const screen of ['start', 'match', 'results']) {
    el(`${screen}-screen`).classList.toggle('hidden', screen !== name);
  }
}

function persist() {
  save({ items: state.items, winners: state.tournament.winners, version: 1 });
}

async function loadItems() {
  const res = await fetch(CSV_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load CSV (HTTP ${res.status})`);
  return parseCsv(await res.text());
}

function idsOf(items) {
  return items.map((i) => i.id);
}

async function init() {
  try {
    state.items = await loadItems();
  } catch (err) {
    el('status').textContent = `Error: ${err.message}. Serve the site over HTTP.`;
    return;
  }

  const saved = load();
  const resumable = saved && saved.items && saved.items.length === state.items.length;
  state.tournament = createTournament(idsOf(state.items));
  if (resumable && saved.winners && saved.winners.length > 0) {
    state.tournament.winners = saved.winners;
    el('resume-btn').classList.remove('hidden');
  }

  el('status').textContent = `${state.items.length} openings ready.`;

  el('start-btn').addEventListener('click', () => {
    state.tournament = createTournament(idsOf(state.items));
    persist();
    showScreen('match');
    renderMatch();
  });

  el('resume-btn').addEventListener('click', () => {
    showScreen('match');
    renderMatch();
  });

  el('reset-btn').addEventListener('click', () => {
    if (!confirm('Clear all progress?')) return;
    clear();
    state.tournament = createTournament(idsOf(state.items));
    el('resume-btn').classList.add('hidden');
    el('status').textContent = `${state.items.length} openings ready.`;
    showScreen('start');
  });

  el('undo-btn').addEventListener('click', () => {
    state.tournament.winners = state.tournament.winners.slice(0, -1);
    persist();
    renderMatch();
  });

  showScreen('start');
}

// Placeholders implemented in later tasks.
function renderMatch() {}
function renderResults() {}

init();
```

- [ ] **Step 2: Manual verification**

Run the server, open the site.
Expected: status reads `100 openings ready.`, Start/Reset buttons work, Start switches to the (empty) match screen, and the console has no errors. Reload after starting shows a "Resume" button.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: load CSV, start/resume, and screen switching"
```

---

## Task 7: App — match screen with video players and picking

**Files:**
- Modify: `app.js` (implement `renderMatch`, add resolution cache and panel rendering)

**Interfaces:**
- Consumes: `nextMatchup`, `recordWinner`, `getProgress` (Task 2); `fetchVideoForItem` (Task 3); `state`, `persist`, `showScreen` (Task 6).
- Produces: functions `renderMatch()`, `renderPanel(side, item)`, `ensureResolved(item)`, `pick(side)`; calls `renderResults()` when the tournament is complete.

- [ ] **Step 1: Add imports and match logic to `app.js`**

Note: place all new code from this and later tasks **above** the final `init();` call so the file reads top-to-bottom as declarations followed by a single `init()` invocation.

Add to the import block at the top of `app.js`:

```js
import { nextMatchup, recordWinner, getProgress, isComplete } from './src/tournament.js';
import { fetchVideoForItem } from './src/resolve.js';
```

Add the resolution cache and replace the `renderMatch` placeholder with:

```js
const resolved = new Map(); // item.id -> { videoUrl, pageUrl }
const resolving = new Set();

async function ensureResolved(item) {
  if (resolved.has(item.id) || resolving.has(item.id)) return;
  resolving.add(item.id);
  const data = await fetchVideoForItem(item);
  resolved.set(item.id, data);
  resolving.delete(item.id);
}

function itemById(id) {
  return state.items.find((i) => i.id === id);
}

function renderPanel(side, item) {
  const panel = el(`panel-${side}`);
  panel.dataset.id = String(item.id);
  const info = resolved.get(item.id);
  const muted = panel.dataset.muted !== 'false';
  panel.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = item.title;
  panel.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'controls';

  if (info && info.videoUrl) {
    const video = document.createElement('video');
    video.src = info.videoUrl;
    video.muted = muted;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.addEventListener('error', () => {
      video.replaceWith(fallback(item));
    });
    panel.appendChild(video);

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.textContent = 'Play/Pause';
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (video.paused) video.play();
      else video.pause();
    });

    const unmuteBtn = document.createElement('button');
    unmuteBtn.type = 'button';
    unmuteBtn.textContent = muted ? 'Unmute' : 'Mute';
    unmuteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.dataset.muted = panel.dataset.muted === 'false' ? 'true' : 'false';
      video.muted = panel.dataset.muted === 'true';
      unmuteBtn.textContent = video.muted ? 'Unmute' : 'Mute';
    });

    controls.append(playBtn, unmuteBtn);
    panel.appendChild(controls);
  } else {
    panel.appendChild(fallback(item));
    panel.appendChild(controls);
  }

  if (!info) {
    ensureResolved(item).then(() => renderPanel(side, item));
  }
}

function fallback(item) {
  const box = document.createElement('div');
  box.className = 'fallback';
  const link = document.createElement('a');
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Open on animethemes.moe';
  box.textContent = 'Preview unavailable — ';
  box.appendChild(link);
  return box;
}

function pick(side) {
  const panel = el(`panel-${side}`);
  const id = Number(panel.dataset.id);
  state.tournament = recordWinner(state.tournament, id);
  persist();
  if (isComplete(state.tournament)) renderResults();
  else renderMatch();
}

function renderMatch() {
  if (isComplete(state.tournament)) {
    renderResults();
    return;
  }
  const matchup = nextMatchup(state.tournament);
  const a = itemById(matchup.a);
  const b = itemById(matchup.b);
  renderPanel('a', a);
  renderPanel('b', b);

  const progress = getProgress(state.tournament);
  el('progress-bar').style.width = `${progress.percent}%`;
  el('progress-label').textContent =
    `Round ${progress.round}/${progress.totalRounds} · ${progress.done}/${progress.total}`;
}

el('panel-a').addEventListener('click', () => pick('a'));
el('panel-b').addEventListener('click', () => pick('b'));

document.addEventListener('keydown', (e) => {
  if (el('match-screen').classList.contains('hidden')) return;
  if (e.key === 'ArrowLeft') pick('a');
  else if (e.key === 'ArrowRight') pick('b');
  else if (e.key.toLowerCase() === 'u') {
    const panel = el('panel-a');
    panel.querySelector('.controls button:last-child')?.click();
  }
});
```

- [ ] **Step 2: Manual verification**

Run the server, click Start.
Expected: two panels appear, each showing a title and (after a moment) a muted, looping video; the progress label shows `Round 1/7 · 0/<total>`. Clicking a panel or pressing ← / → advances to the next matchup; Undo steps back; the Unmute button toggles sound for that panel only.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: match screen with embedded video players and picking"
```

---

## Task 8: App — results screen, copy and download

**Files:**
- Modify: `app.js` (implement `renderResults`, wire Copy/Download/Play-again)

**Interfaces:**
- Consumes: `getRanking` (Task 2); `state`, `showScreen`, `persist` (Task 6).
- Produces: `renderResults()`, `toCsv(items)`, `toText(items)`.

- [ ] **Step 1: Implement results in `app.js`**

Update the tournament import so its final form is:

```js
import { nextMatchup, recordWinner, getProgress, isComplete, getRanking } from './src/tournament.js';
```

Then replace the `renderResults` placeholder with:

```js
function rankedItems() {
  return getRanking(state.tournament).map(itemById);
}

function toCsv(items) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = items.map((item, i) => `${i + 1},${esc(item.title)},${esc(item.url)}`);
  return ['rank,title,url', ...rows].join('\n');
}

function toText(items) {
  return items.map((item, i) => `${i + 1}. ${item.title}`).join('\n');
}

function renderResults() {
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

el('copy-btn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(toText(rankedItems()));
  el('copy-btn').textContent = 'Copied!';
  setTimeout(() => (el('copy-btn').textContent = 'Copy'), 1500);
});

el('download-btn').addEventListener('click', () => {
  const blob = new Blob([toCsv(rankedItems())], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'krisgo-top-100.csv';
  a.click();
  URL.revokeObjectURL(url);
});

el('again-btn').addEventListener('click', () => {
  if (!confirm('Clear progress and start over?')) return;
  clear();
  state.tournament = createTournament(state.items.map((i) => i.id));
  el('resume-btn').classList.add('hidden');
  showScreen('start');
});
```

- [ ] **Step 2: Manual verification (fast path)**

Temporarily reduce the dataset to a few items to reach the end quickly, OR run the full tournament. On completion:
Expected: the results screen lists ranks 1..N as links; Copy puts `1. Title` lines on the clipboard; Download saves `krisgo-top-100.csv`; Play again returns to the start screen with cleared progress.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: results screen with copy and CSV download"
```

---

## Task 9: Final verification and docs

**Files:**
- Modify: `README.md` (only if instructions need refinement)

- [ ] **Step 1: Run the full test suite**

Run: `node --test`
Expected: all tests pass (CSV, tournament, resolve).

- [ ] **Step 2: Full end-to-end manual run**

With a method to finish quickly verified in Task 8, confirm on the real 100-item set that:
- The start screen reports 100 openings.
- Every matchup shows two playable, muted videos.
- Progress increases and Round advances 1→7.
- Undo works mid-run.
- Reloading restores the exact matchup.
- Completing yields a 100-item ranked list that can be copied and downloaded.

- [ ] **Step 3: Commit any doc tweaks**

```bash
git add -A
git commit -m "docs: finalize README after verification"
```

---

## Self-Review

**Spec coverage:**
- Read CSV at runtime → Task 1 (`parseCsv`) + Task 6 (`loadItems`).
- Two embedded, muted, non-intrusive players → Task 5 (markup) + Task 7 (players).
- True sort via merge-sort tournament → Task 2.
- Progress/resume/reset → Task 4 (storage) + Task 6 (init/resume/reset).
- Results + copy + download → Task 8.
- Video resolution via API with fallback link → Task 3 + Task 7 (`fallback`).
- Errors (CSV fetch failure, video failure, storage failure) → Task 6 (status message), Task 3/Task 7 (fallback), Task 4 (try/catch).
- Serving over HTTP + tests → Task 1 (scripts, README) + Task 9.
- No ties → Task 2 (`recordWinner` requires a valid winner; no tie path).

**Placeholder scan:** all steps contain concrete code/commands; no TBD/TODO.

**Type consistency:** `{ id, title, url }` items and `number[]` ids are used consistently; tournament state is `{ ids, winners }` throughout; progress fields `done/total/percent/round/totalRounds/complete` match between Task 2 and Task 7; resolution shape `{ videoUrl, pageUrl }` matches Task 3 and Task 7.
