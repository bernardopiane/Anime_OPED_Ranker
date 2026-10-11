# Playlist → CSV Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Start-screen tool that turns a YouTube playlist into a `title,link` CSV, which the user can download and/or load straight into the ranker.

**Architecture:** A new pure module `src/playlist.js` holds all parsing/formatting logic (unit-tested, no DOM, no real network). `app.js` adds a `initPlaylistTool()` controller that wires the Start-screen disclosure to the module and reuses the existing `useItems()` path. Markup goes in `index.html`; styles use existing tokens in `styles.css`.

**Tech Stack:** Vanilla ES modules, zero dependencies, `node --test` for tests, static site served over HTTP.

## Global Constraints

- **Zero dependencies**; no build step; ES modules only.
- **Tests:** `node --test` must stay green (76 existing tests + new ones). Run a single file with `node --test test/playlist.test.js`.
- **No inline colours/fonts in `styles.css`** — use `tokens.css` variables only.
- **CSV format:** plain `title,url` rows, **no header, no quoting** (the app's `parseCsv` splits on the last comma).
- **API key:** optional, `type="password"`; stored in `localStorage` under `oped-yt-key` only when "Remember key on this device" is ticked; never logged.
- **Do not stage or commit** `opening list.csv` or `opening list - Copy.csv`.
- **Commit after every task** with a concise message; do not push.
- Video links are `https://www.youtube.com/watch?v=<11-char id>`.

---

### Task 1: `src/playlist.js` — link parsing, link builder, CSV formatter

**Files:**
- Create: `src/playlist.js`
- Test: `test/playlist.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parsePlaylistId(input: string): string | null`
  - `watchUrl(videoId: string): string`
  - `toPlaylistCsv(items: { title: string, url: string }[]): string`

- [ ] **Step 1: Write the failing test**

Create `test/playlist.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaylistId, watchUrl, toPlaylistCsv } from '../src/playlist.js';
import { parseCsv } from '../src/csv.js';

test('parsePlaylistId reads the list param from a playlist URL', () => {
  assert.equal(
    parsePlaylistId('https://www.youtube.com/playlist?list=PLabcDEF1234567890'),
    'PLabcDEF1234567890',
  );
});

test('parsePlaylistId reads list from youtu.be, mobile, and music hosts', () => {
  assert.equal(parsePlaylistId('https://youtu.be/xyz?list=PLfoo123'), 'PLfoo123');
  assert.equal(parsePlaylistId('https://m.youtube.com/playlist?list=PLbar456'), 'PLbar456');
  assert.equal(parsePlaylistId('https://music.youtube.com/playlist?list=PLbaz789'), 'PLbaz789');
});

test('parsePlaylistId reads list from a watch URL that carries one', () => {
  assert.equal(
    parsePlaylistId('https://www.youtube.com/watch?v=aaaaaaaaaaa&list=PLwatch01'),
    'PLwatch01',
  );
});

test('parsePlaylistId accepts a bare playlist id', () => {
  assert.equal(parsePlaylistId('  PLbareID123  '), 'PLbareID123');
});

test('parsePlaylistId returns null when there is no usable id', () => {
  assert.equal(parsePlaylistId('https://www.youtube.com/watch?v=aaaaaaaaaaa'), null);
  assert.equal(parsePlaylistId('https://example.com/playlist?list=x%20y'), null);
  assert.equal(parsePlaylistId('not a url'), null);
  assert.equal(parsePlaylistId(''), null);
  assert.equal(parsePlaylistId(undefined), null);
});

test('watchUrl builds a standard watch link', () => {
  assert.equal(watchUrl('aaaaaaaaaaa'), 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
});

test('toPlaylistCsv emits title,link rows with no header', () => {
  const csv = toPlaylistCsv([
    { title: 'First OP', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'Second OP', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
  ]);
  assert.equal(
    csv,
    'First OP,https://www.youtube.com/watch?v=aaaaaaaaaaa\n' +
      'Second OP,https://www.youtube.com/watch?v=bbbbbbbbbbb',
  );
});

test('a comma in a title survives a round-trip through parseCsv', () => {
  const url = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
  const csv = toPlaylistCsv([{ title: 'Naruto, Opening 1', url }]);
  assert.deepEqual(parseCsv(csv), [{ id: 0, title: 'Naruto, Opening 1', url }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/playlist.test.js`
Expected: FAIL — `Cannot find module '../src/playlist.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/playlist.js`:

```js
const ID_RE = /^[A-Za-z0-9_-]{2,60}$/;

export function parsePlaylistId(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;
  if (ID_RE.test(trimmed)) return trimmed;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const id = url.searchParams.get('list');
  return id && ID_RE.test(id) ? id : null;
}

export function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function toPlaylistCsv(items) {
  return items.map((item) => `${item.title},${item.url}`).join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/playlist.test.js`
Expected: PASS (all Task 1 tests).

- [ ] **Step 5: Commit**

```bash
git add src/playlist.js test/playlist.test.js
git commit -m "Add playlist link parsing and CSV formatting helpers"
```

---

### Task 2: `src/playlist.js` — extract videos from a saved page

**Files:**
- Modify: `src/playlist.js`
- Test: `test/playlist.test.js`

**Interfaces:**
- Consumes: `watchUrl` (Task 1).
- Produces: `extractFromHtml(html: string): { title: string, url: string }[]` — deduped by video id, document order, `[]` when nothing is found.

- [ ] **Step 1: Write the failing test**

Append to `test/playlist.test.js`:

```js
import { extractFromHtml } from '../src/playlist.js';

test('extractFromHtml reads playlistVideoRenderer nodes in order', () => {
  const html =
    '<script>var ytInitialData = {"contents":{"items":[' +
    '{"playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"runs":[{"text":"First OP"}]}}},' +
    '{"playlistVideoRenderer":{"videoId":"bbbbbbbbbbb","title":{"runs":[{"text":"Second OP, Remix"}]}}}' +
    ']}};</script>';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'First OP', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'Second OP, Remix', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
  ]);
});

test('extractFromHtml reads newer lockupViewModel nodes', () => {
  const html =
    '<script>window["ytInitialData"] = {"a":{"b":[' +
    '{"lockupViewModel":{"contentId":"ccccccccccc","contentType":"LOCKUP_CONTENT_TYPE_VIDEO",' +
    '"metadata":{"lockupMetadataViewModel":{"title":{"content":"Third OP"}}}}}' +
    ']}};</script>';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'Third OP', url: 'https://www.youtube.com/watch?v=ccccccccccc' },
  ]);
});

test('extractFromHtml de-duplicates repeated video ids', () => {
  const html =
    '<script>var ytInitialData = {"items":[' +
    '{"playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"simpleText":"Once"}}},' +
    '{"playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"simpleText":"Once"}}}' +
    ']};</script>';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'Once', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
  ]);
});

test('extractFromHtml falls back to raw video ids when ytInitialData is absent', () => {
  const html = 'x "videoId":"ddddddddddd" y "videoId":"eeeeeeeeeee"';
  assert.deepEqual(extractFromHtml(html), [
    { title: 'ddddddddddd', url: 'https://www.youtube.com/watch?v=ddddddddddd' },
    { title: 'eeeeeeeeeee', url: 'https://www.youtube.com/watch?v=eeeeeeeeeee' },
  ]);
});

test('extractFromHtml returns an empty array when there are no videos', () => {
  assert.deepEqual(extractFromHtml('<html><body>nothing</body></html>'), []);
  assert.deepEqual(extractFromHtml(''), []);
  assert.deepEqual(extractFromHtml(undefined), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/playlist.test.js`
Expected: FAIL — `extractFromHtml is not a function` (or `is not exported`).

- [ ] **Step 3: Write minimal implementation**

Append to `src/playlist.js`:

```js
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function extractJsonFrom(text, startBrace) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startBrace; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(startBrace, i + 1);
    }
  }
  return null;
}

function findInitialData(html) {
  const marker = html.indexOf('ytInitialData');
  if (marker === -1) return null;
  const brace = html.indexOf('{', marker);
  if (brace === -1) return null;
  const jsonText = extractJsonFrom(html, brace);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function titleText(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs) && node.runs.length) {
    return node.runs.map((run) => run.text || '').join('');
  }
  if (typeof node.content === 'string') return node.content;
  return null;
}

function pushVideo(out, seen, videoId, title) {
  if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) return;
  if (seen.has(videoId)) return;
  seen.add(videoId);
  const clean = typeof title === 'string' ? title.trim() : '';
  out.push({ title: clean || videoId, url: watchUrl(videoId) });
}

function collectVideos(node, out, seen) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectVideos(child, out, seen);
    return;
  }
  for (const key of ['playlistVideoRenderer', 'videoRenderer', 'gridVideoRenderer']) {
    const renderer = node[key];
    if (renderer && renderer.videoId) pushVideo(out, seen, renderer.videoId, titleText(renderer.title));
  }
  const lockup = node.lockupViewModel;
  if (lockup && lockup.contentId && lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
    const meta = lockup.metadata && lockup.metadata.lockupMetadataViewModel;
    pushVideo(out, seen, lockup.contentId, meta && meta.title ? titleText(meta.title) : null);
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (value && typeof value === 'object') collectVideos(value, out, seen);
  }
}

function decodeJsonString(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

function extractByRegex(html) {
  const ids = [];
  const seen = new Set();
  const idRe = /"videoId":"([A-Za-z0-9_-]{11})"/g;
  let match;
  while ((match = idRe.exec(html))) {
    if (!seen.has(match[1])) { seen.add(match[1]); ids.push(match[1]); }
  }
  if (ids.length === 0) return [];
  const titles = [];
  const titleRe = /"title":\{(?:"runs":\[\{"text":"((?:[^"\\]|\\.)*)"|"simpleText":"((?:[^"\\]|\\.)*)")/g;
  while ((match = titleRe.exec(html))) {
    titles.push(decodeJsonString(match[1] != null ? match[1] : match[2]));
  }
  return ids.map((id, i) => ({ title: titles[i] || id, url: watchUrl(id) }));
}

export function extractFromHtml(html) {
  if (typeof html !== 'string' || html.trim() === '') return [];
  const out = [];
  const seen = new Set();
  const data = findInitialData(html);
  if (data) collectVideos(data, out, seen);
  if (out.length > 0) return out;
  return extractByRegex(html);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/playlist.test.js`
Expected: PASS (Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/playlist.js test/playlist.test.js
git commit -m "Extract videos from a saved YouTube playlist page"
```

---

### Task 3: `src/playlist.js` — YouTube Data API client

**Files:**
- Modify: `src/playlist.js`
- Test: `test/playlist.test.js`

**Interfaces:**
- Consumes: `watchUrl` (Task 1).
- Produces:
  - `mapApiItems(page: object): { items: { title, url }[], nextPageToken: string | null, skipped: number }`
  - `fetchPlaylist(playlistId: string, apiKey: string, options?: { fetchImpl?: Function }): Promise<{ items: { title, url }[], skipped: number }>` — rejects with an `Error` carrying `.code` in `{ MISSING_KEY, BAD_KEY, FORBIDDEN, NOT_FOUND, NETWORK, HTTP_ERROR }`.

- [ ] **Step 1: Write the failing test**

Append to `test/playlist.test.js`:

```js
import { mapApiItems, fetchPlaylist } from '../src/playlist.js';

test('mapApiItems builds links and skips unavailable entries', () => {
  const page = {
    nextPageToken: 'p2',
    items: [
      { snippet: { title: 'A' }, contentDetails: { videoId: 'aaaaaaaaaaa' } },
      { snippet: { title: 'Deleted video' }, contentDetails: {} },
      { snippet: { title: 'B', resourceId: { videoId: 'bbbbbbbbbbb' } }, contentDetails: {} },
    ],
  };
  assert.deepEqual(mapApiItems(page), {
    items: [
      { title: 'A', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
      { title: 'B', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' },
    ],
    nextPageToken: 'p2',
    skipped: 1,
  });
});

test('fetchPlaylist paginates, aggregates, and counts skips', async () => {
  const pages = {
    first: {
      nextPageToken: 'p2',
      items: [
        { snippet: { title: 'A' }, contentDetails: { videoId: 'aaaaaaaaaaa' } },
        { snippet: { title: 'Private video' }, contentDetails: {} },
      ],
    },
    p2: {
      items: [{ snippet: { title: 'C' }, contentDetails: { videoId: 'ccccccccccc' } }],
    },
  };
  const fetchImpl = async (url) => {
    const token = new URL(url).searchParams.get('pageToken');
    const body = token ? pages[token] : pages.first;
    return { ok: true, status: 200, json: async () => body };
  };
  const result = await fetchPlaylist('PLtest', 'KEY', { fetchImpl });
  assert.deepEqual(result.items, [
    { title: 'A', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { title: 'C', url: 'https://www.youtube.com/watch?v=ccccccccccc' },
  ]);
  assert.equal(result.skipped, 1);
});

test('fetchPlaylist maps HTTP error statuses to codes', async () => {
  const withStatus = (status) => async () => ({ ok: false, status, json: async () => ({}) });
  await assert.rejects(fetchPlaylist('PL', 'K', { fetchImpl: withStatus(400) }), (e) => e.code === 'BAD_KEY');
  await assert.rejects(fetchPlaylist('PL', 'K', { fetchImpl: withStatus(403) }), (e) => e.code === 'FORBIDDEN');
  await assert.rejects(fetchPlaylist('PL', 'K', { fetchImpl: withStatus(404) }), (e) => e.code === 'NOT_FOUND');
});

test('fetchPlaylist flags a missing key and network failures', async () => {
  await assert.rejects(fetchPlaylist('PL', '', {}), (e) => e.code === 'MISSING_KEY');
  const boom = async () => { throw new Error('down'); };
  await assert.rejects(fetchPlaylist('PL', 'K', { fetchImpl: boom }), (e) => e.code === 'NETWORK');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/playlist.test.js`
Expected: FAIL — `fetchPlaylist is not a function` (or `is not exported`).

- [ ] **Step 3: Write minimal implementation**

Append to `src/playlist.js`:

```js
const API_BASE = 'https://www.googleapis.com/youtube/v3/playlistItems';
const UNAVAILABLE_TITLES = new Set(['Deleted video', 'Private video']);

function codedError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

export function mapApiItems(page) {
  const items = [];
  const seen = new Set();
  let skipped = 0;
  const list = (page && page.items) || [];
  for (const entry of list) {
    const snippet = (entry && entry.snippet) || {};
    const details = (entry && entry.contentDetails) || {};
    const videoId = details.videoId || (snippet.resourceId && snippet.resourceId.videoId);
    const title = typeof snippet.title === 'string' ? snippet.title : '';
    if (!videoId || UNAVAILABLE_TITLES.has(title)) { skipped += 1; continue; }
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    items.push({ title: title || videoId, url: watchUrl(videoId) });
  }
  return { items, nextPageToken: (page && page.nextPageToken) || null, skipped };
}

export async function fetchPlaylist(playlistId, apiKey, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  if (!playlistId) throw codedError('INVALID_PLAYLIST');
  if (!apiKey) throw codedError('MISSING_KEY');
  const items = [];
  const seen = new Set();
  let skipped = 0;
  let pageToken = '';
  for (let page = 0; page < 100; page += 1) {
    const url =
      `${API_BASE}?part=snippet%2CcontentDetails&maxResults=50` +
      `&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    let res;
    try {
      res = await fetchImpl(url);
    } catch {
      throw codedError('NETWORK');
    }
    if (!res.ok) {
      if (res.status === 400) throw codedError('BAD_KEY');
      if (res.status === 403) throw codedError('FORBIDDEN');
      if (res.status === 404) throw codedError('NOT_FOUND');
      throw codedError('HTTP_ERROR');
    }
    const mapped = mapApiItems(await res.json());
    for (const item of mapped.items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
    }
    skipped += mapped.skipped;
    pageToken = mapped.nextPageToken;
    if (!pageToken) break;
  }
  return { items, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/playlist.test.js`
Expected: PASS (all Task 1–3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/playlist.js test/playlist.test.js
git commit -m "Add YouTube Data API playlist client"
```

---

### Task 4: Start-screen markup and styles

**Files:**
- Modify: `index.html` (inside `#start-screen`)
- Modify: `styles.css` (add a Playlist-tool section before `/* ---- Duel ---- */`)

**Interfaces:**
- Consumes: nothing.
- Produces: DOM ids used by Task 5 — `#playlist-tool`, `#playlist-url`, `#playlist-key`, `#playlist-remember`, `#playlist-api-btn`, `#playlist-html`, `#playlist-file`, `#playlist-html-btn`, `#playlist-status`, `#playlist-download-btn`, `#playlist-use-btn`.

- [ ] **Step 1: Add the disclosure markup**

In `index.html`, immediately after the closing `</div>` of `.start-card` (the block that contains `#status`, `#shuffle`, `#file-input`, and the `.actions` buttons) and before `<p class="meta">`, insert:

```html
        <details id="playlist-tool" class="playlist-tool">
          <summary>Turn a YouTube playlist into a CSV</summary>
          <div class="playlist-body">
            <label class="playlist-field">
              <span>Playlist link</span>
              <input id="playlist-url" type="url" placeholder="https://www.youtube.com/playlist?list=…" />
            </label>

            <div class="playlist-route">
              <p class="playlist-route-title">Fetch with a YouTube API key</p>
              <label class="playlist-field">
                <span>API key (optional)</span>
                <input id="playlist-key" type="password" autocomplete="off" placeholder="AIza…" />
              </label>
              <label class="shuffle-toggle">
                <input id="playlist-remember" type="checkbox" />
                <span>Remember key on this device</span>
              </label>
              <button id="playlist-api-btn" type="button">Fetch videos</button>
            </div>

            <div class="playlist-route">
              <p class="playlist-route-title">No key? Use the saved page</p>
              <p class="playlist-help">Open the playlist, save the page (Ctrl+S) or copy its source, then paste or upload it here.</p>
              <textarea id="playlist-html" aria-label="Playlist page source" placeholder="Paste the playlist page source here…"></textarea>
              <label class="load-csv">
                <span>Upload the saved page</span>
                <input id="playlist-file" type="file" accept=".html,.htm,.txt,text/html" />
              </label>
              <button id="playlist-html-btn" type="button">Extract videos</button>
            </div>

            <p id="playlist-status" class="playlist-status" role="status" aria-live="polite"></p>

            <div class="actions">
              <button id="playlist-download-btn" type="button" disabled>Download CSV</button>
              <button id="playlist-use-btn" class="primary" type="button" disabled>Use this list</button>
            </div>
          </div>
        </details>
```

- [ ] **Step 2: Add the styles**

In `styles.css`, immediately before the `/* ----------------------------------------------------------------- Duel ---- */` comment, insert:

```css
/* ------------------------------------------------------- Playlist tool ---- */

.playlist-tool {
  margin-block-start: var(--space-lg);
  background: var(--color-paper-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}
.playlist-tool > summary {
  cursor: pointer;
  padding: var(--space-md);
  color: var(--color-ink);
  font-weight: 600;
  list-style: none;
}
.playlist-tool > summary::-webkit-details-marker { display: none; }
.playlist-tool > summary::before { content: "+ "; color: var(--color-accent); }
.playlist-tool[open] > summary::before { content: "– "; }
.playlist-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: 0 var(--space-md) var(--space-md);
}
.playlist-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-3xs);
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.playlist-field input,
.playlist-body textarea {
  font: inherit;
  font-size: var(--text-sm);
  color: var(--color-ink);
  background: var(--color-paper);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  padding: var(--space-2xs) var(--space-xs);
}
.playlist-body textarea {
  min-height: 7rem;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.playlist-route {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
}
.playlist-route-title { margin: 0; font-weight: 700; font-size: var(--text-sm); }
.playlist-help { margin: 0; color: var(--color-muted); font-size: var(--text-sm); }
.playlist-status { min-height: 1.25rem; margin: 0; color: var(--color-muted); font-size: var(--text-sm); }
.playlist-status.is-error { color: var(--color-danger); }
```

- [ ] **Step 3: Verify it renders**

Run: `node --test`
Expected: PASS (all existing 76 tests; this task adds no tests).

Then start the site (`python -m http.server 8000`) and open `http://localhost:8000`. Expected: a collapsed "Turn a YouTube playlist into a CSV" disclosure appears below the start card; clicking it expands the two route blocks and the disabled Download/Use buttons.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "Add the playlist-to-CSV panel to the start screen"
```

---

### Task 5: Wire the tool in `app.js`

**Files:**
- Modify: `app.js` (top import; functions near the bottom; call inside `init()`)

**Interfaces:**
- Consumes: `parsePlaylistId`, `toPlaylistCsv`, `extractFromHtml`, `fetchPlaylist` (Tasks 1–3); the DOM ids (Task 4); existing `el(id)` and `useItems(items, sourceName)`.
- Produces: a working tool; already-`disabled` buttons become enabled after extraction.

- [ ] **Step 1: Add the import**

In `app.js`, add to the import block at the top:

```js
import { parsePlaylistId, toPlaylistCsv, extractFromHtml, fetchPlaylist } from './src/playlist.js';
```

- [ ] **Step 2: Add the controller functions**

In `app.js`, just before the final `initTheme();` line at the bottom of the file, add:

```js
const KEY_STORAGE = 'oped-yt-key';
let pendingPlaylistItems = null;

function playlistStatus(message, isError) {
  const node = el('playlist-status');
  node.textContent = message;
  node.classList.toggle('is-error', Boolean(isError));
}

function showExtracted(result) {
  const items = result.items || [];
  pendingPlaylistItems = items.length ? items : null;
  const has = Boolean(pendingPlaylistItems);
  el('playlist-download-btn').disabled = !has;
  el('playlist-use-btn').disabled = !has;
  if (!has) {
    playlistStatus('No videos found.', true);
    return;
  }
  const noun = items.length === 1 ? 'video' : 'videos';
  const base = `Found ${items.length} ${noun}`;
  playlistStatus(result.skipped ? `${base}, skipped ${result.skipped} unavailable.` : `${base}.`);
}

function playlistErrorMessage(err) {
  switch (err && err.code) {
    case 'MISSING_KEY': return 'Enter your YouTube API key, or use the saved page.';
    case 'BAD_KEY': return 'The API key was rejected.';
    case 'FORBIDDEN': return "Quota exceeded, or the YouTube Data API isn't enabled for that key.";
    case 'NOT_FOUND': return "That playlist wasn't found.";
    case 'NETWORK': return "Couldn't reach YouTube. Check your connection, or use the saved page.";
    default: return 'Something went wrong. Try again, or use the saved page.';
  }
}

async function runPlaylistApiRoute() {
  const id = parsePlaylistId(el('playlist-url').value);
  if (!id) {
    playlistStatus("That doesn't look like a playlist link.", true);
    return;
  }
  const key = el('playlist-key').value.trim();
  if (!key) {
    playlistStatus('Enter your YouTube API key, or use the saved page.', true);
    return;
  }
  playlistStatus('Fetching…');
  try {
    const result = await fetchPlaylist(id, key);
    try {
      if (el('playlist-remember').checked) localStorage.setItem(KEY_STORAGE, key);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {}
    showExtracted(result);
  } catch (err) {
    playlistStatus(playlistErrorMessage(err), true);
  }
}

function runPlaylistHtmlRoute(html) {
  if (typeof html !== 'string' || html.trim() === '') {
    playlistStatus('Paste or upload the saved playlist page first.', true);
    return;
  }
  const items = extractFromHtml(html);
  if (items.length === 0) {
    playlistStatus("Couldn't find videos in that page — save the playlist page, not the home page.", true);
    return;
  }
  showExtracted({ items, skipped: 0 });
}

function initPlaylistTool() {
  if (!el('playlist-tool')) return;
  try {
    const savedKey = localStorage.getItem(KEY_STORAGE);
    if (savedKey) {
      el('playlist-key').value = savedKey;
      el('playlist-remember').checked = true;
    }
  } catch {}

  el('playlist-api-btn').addEventListener('click', runPlaylistApiRoute);

  el('playlist-html-btn').addEventListener('click', () => {
    runPlaylistHtmlRoute(el('playlist-html').value);
  });

  el('playlist-file').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch {
      playlistStatus('Could not read that file.', true);
      return;
    }
    runPlaylistHtmlRoute(text);
  });

  el('playlist-download-btn').addEventListener('click', () => {
    if (!pendingPlaylistItems) return;
    const blob = new Blob([toPlaylistCsv(pendingPlaylistItems)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yt-playlist.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  el('playlist-use-btn').addEventListener('click', () => {
    if (!pendingPlaylistItems) return;
    useItems(pendingPlaylistItems, 'YouTube playlist');
  });
}
```

- [ ] **Step 3: Call it from `init()`**

In `app.js` inside `async function init()`, immediately before the final `showScreen('start');` line, add:

```js
  initPlaylistTool();
```

- [ ] **Step 4: Verify syntax and tests**

Run: `node --check app.js`
Expected: no output (success).

Run: `node --test`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Wire the playlist-to-CSV tool on the start screen"
```

---

### Task 6: End-to-end verification

**Files:**
- Test: manual + headless DOM check (no source changes unless a bug is found).

**Interfaces:**
- Consumes: the whole feature.
- Produces: evidence that the offline route loads a list into the app.

- [ ] **Step 1: Run the full test suite**

Run: `node --test`
Expected: PASS — 76 existing tests plus the new `test/playlist.test.js` tests, 0 failures.

- [ ] **Step 2: Drive the offline route headlessly**

Serve the site on a spare port and drive it with headless Chrome via the Chrome DevTools Protocol (Node ≥ 22 has a global `WebSocket`). Save this as a temp script (outside the repo) and run it while Chrome runs with `--headless=old --remote-debugging-port=9222` pointed at the served page:

```js
const page = (await (await fetch('http://localhost:9222/json')).json())
  .find((t) => t.type === 'page' && t.url.includes('index.html'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
const evalx = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;
await new Promise((r) => setTimeout(r, 1500));
const fixture = '<script>var ytInitialData = {"items":[{"playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"runs":[{"text":"First OP"}]}}},{"playlistVideoRenderer":{"videoId":"bbbbbbbbbbb","title":{"runs":[{"text":"Second OP"}]}}}]};</script>';
await evalx(`document.getElementById('playlist-tool').open = true; document.getElementById('playlist-html').value = ${JSON.stringify(fixture)}; document.getElementById('playlist-html-btn').click(); 'ok'`);
await new Promise((r) => setTimeout(r, 300));
console.log('AFTER EXTRACT:', await evalx("JSON.stringify({status: document.getElementById('playlist-status').textContent, downloadDisabled: document.getElementById('playlist-download-btn').disabled, useDisabled: document.getElementById('playlist-use-btn').disabled})"));
await evalx("document.getElementById('playlist-use-btn').click(); 'ok'");
await new Promise((r) => setTimeout(r, 300));
console.log('AFTER USE:', await evalx("JSON.stringify({source: document.getElementById('status').textContent, startVisible: !document.getElementById('start-screen').classList.contains('hidden')})"));
ws.close();
```

Expected output:
- `AFTER EXTRACT:` status `Found 2 videos.`, both buttons `disabled:false`.
- `AFTER USE:` source `2 openings loaded from YouTube playlist.`, `startVisible:true`.

- [ ] **Step 3: Confirm the download filename and content**

In the same session (before clicking Use), evaluate `toPlaylistCsv` output indirectly by clicking `#playlist-download-btn` and confirming no error is thrown, or verify with a unit-level check that `toPlaylistCsv` matches the fixture (already covered by Task 1 tests). No extra file needed.

- [ ] **Step 4: Commit any fix (only if Steps 1–3 found a problem)**

```bash
git add src/playlist.js test/playlist.test.js index.html styles.css app.js
git commit -m "Fix playlist-to-CSV issues found in end-to-end verification"
```

Never `git add -A` / `git add .` — the untracked `opening list.csv` must not be staged. If nothing needed fixing, make no commit.

---

## Notes for the implementer

- The app must be served over HTTP (`python -m http.server 8000`); `file://` blocks ES modules and `fetch`.
- `useItems()` already resets progress, persists the custom source, updates the status label, and returns to the start screen — do not duplicate that logic.
- `#playlist-file` reuses the `.load-csv` label style so the native file input stays visually consistent with the existing "Load your own CSV" control.
- The API route only touches the network when the user clicks "Fetch videos"; the offline route never does.
