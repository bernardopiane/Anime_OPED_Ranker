# Playlist → CSV Tool — Design

- **Date:** 2026-10-11
- **Status:** Implemented; import flow revised 2026-10-12
- **Feature:** Turn a YouTube playlist into a `title,link` CSV from the Start screen, so
  users can build their own list and immediately rank it.

## Problem

The app can already rank a list loaded from a `title,link` CSV via the "Load your own CSV"
file input. Building that CSV from scratch is tedious. Users often have their OP/ED picks
in a **YouTube playlist** and want a one-step way to turn it into a rankable list.

## Current implementation (2026-10-12)

The browser cannot read YouTube's page DOM from the ranker because of the same-origin
policy. The tool now opens a validated YouTube playlist in a separate tab and uses a
user-saved bookmarklet, run on that tab, to extract currently rendered videos from
`.ytItemSectionRendererHost` whose links carry the active playlist ID and a positive
playlist index. This avoids including suggested or otherwise unrelated videos from the
same page. The bookmarklet sends the records back with `postMessage`;
if YouTube has severed the opener, it opens a ranker tab with the extracted data in its
URL fragment instead. The ranker validates incoming records before making them available
to download or use directly.

CSV downloads follow the supplied extractor's `video title,url` header and quoted fields.
The ranker's CSV importer ignores this header so the downloaded file can be loaded back
into the app. The user may need to scroll/load more items before running the bookmarklet;
it only extracts videos currently rendered on the playlist page.

The sections below document the original design and are retained as history; where they
conflict with this current implementation, the current implementation takes precedence.

Browsers cannot read `youtube.com` directly (CORS), so the feature needs a sanctioned
network route and an offline route.

## Requirements

1. A tool on the **Start screen** that accepts a **YouTube playlist** and produces the
   individual video links as CSV rows in the template **`title,link`**.
2. Two extraction routes, both supported:
   - **API route:** the official **YouTube Data API v3**, using a user-supplied API key.
   - **Offline route:** the user supplies the **saved playlist page HTML** (paste or
     upload); the app parses it locally with no network.
3. The generated CSV must match the app's own input format (`title,link`, no header,
   no quoting) so it can be loaded straight back in.
4. After extraction the user can **download the CSV** and/or **use the list directly**
   (load it into the app and return to Start), mirroring the file-input path.
5. The API key is optional and may be **remembered in `localStorage`** behind an opt-in
   checkbox. It is never logged.
6. The tool lives in a **collapsed disclosure** below the start card so the Start screen
   stays clean.
7. CSV titles are the **raw YouTube video titles**, unmodified.
8. Duplicate videos are de-duplicated by video ID, preserving playlist order.
9. Unavailable entries (deleted/private) are **skipped and counted**.

## Non-goals (YAGNI)

Channel-upload extraction, name/title search, any server or third-party CORS proxy,
OAuth, storing the fetched list beyond the existing custom-source record, and any UI
beyond the single disclosure.

## Approach (chosen: hybrid extraction)

Pure, unit-tested logic in a new module, DOM/network wiring in `app.js` — matching the
repo's existing pattern (`src/csv.js`, `src/podium.js` are pure + tested; `app.js` is the
controller).

- **`src/playlist.js` (new):** pure logic + injectable-fetch API client.
- **`app.js`:** `initPlaylistTool()` wiring; reuses `useItems()`.
- **`index.html`:** the `<details id="playlist-tool">` markup.
- **`styles.css`:** styling with existing tokens; **no new colours**.
- **`test/playlist.test.js` (new):** unit tests, no real network.

For the offline route, extract via a **hybrid** strategy: parse the `ytInitialData` JSON
blob and deep-walk it (handling both classic `playlistVideoRenderer` and newer
`lockupViewModel` shapes), and if that yields nothing, fall back to regexing 11-char video
IDs and pairing them with titles; if a title still can't be paired, use the ID as the
title so no video is lost. Rejected: regex-only (unreliable title pairing) and
`ytInitialData`-only (brittle when YouTube changes the payload).

## Components

### `src/playlist.js` (new)

Pure functions plus one injectable-fetch client:

```js
export function parsePlaylistId(input)      // URL or bare ID → id | null
export function watchUrl(videoId)           // → https://www.youtube.com/watch?v=<id>
export function toPlaylistCsv(items)        // [{title,url}] → "title,link" lines (no header)
export function extractFromHtml(html)       // saved page → [{ title, url }]
export function mapApiItems(page)           // one API page → { items, nextPageToken }
export async function fetchPlaylist(id, key, { fetchImpl = fetch } = {})
```

- `parsePlaylistId(input)`:
  - Trims input.
  - If it matches a bare playlist ID, return it.
  - Else parse as a URL and return the `list` query parameter. Handles `youtube.com`,
    `www.`, `m.`, `music.`, and `youtu.be` hosts, and returns the ID for `watch` URLs that
    carry a `list` parameter (e.g. a share link while viewing a playlist).
  - Returns `null` when there is no usable `list` parameter.
- `watchUrl(videoId)`: `https://www.youtube.com/watch?v=${videoId}`.
- `toPlaylistCsv(items)`:
  - `items.map((i) => `${i.title},${i.url}`).join('\n')`.
  - **No header row and no quoting**, so `parseCsv` round-trips it. The app's parser splits
    on the **last** comma, so titles containing commas are safe (the URL is comma-free and
    last on the line).
- `extractFromHtml(html)`:
  - Locate and JSON-parse the `ytInitialData` blob, deep-walk for video nodes, and collect
    `{ title, url }` in document order; support `playlistVideoRenderer` and
    `lockupViewModel` shapes.
  - Fallback: regex 11-char `videoId`s; pair with titles when possible; otherwise title =
    video ID.
  - De-duplicate by video ID, preserving first-seen order. Returns `[]` when nothing is
    found.
- `mapApiItems(page)`:
  - Reads `page.items[].snippet.title` + `contentDetails.videoId` (falling back to
    `snippet.resourceId.videoId`).
  - Skips entries whose title is `Deleted video` / `Private video` or that have no video ID.
  - Returns `{ items: [{ title, url }], nextPageToken: page.nextPageToken ?? null }`.
- `fetchPlaylist(id, key, { fetchImpl })`:
  - Calls `https://www.googleapis.com/youtube/v3/playlistItems` with `part=snippet,contentDetails`,
    `maxResults=50`, the `playlistId`, the `key`, and the current `pageToken`.
  - Loops on `nextPageToken`, aggregating items, de-duplicating by video ID and counting
    skipped entries.
  - Returns `{ items, skipped }`; throws errors with a `.code` for the UI to map to a
    friendly message. `fetchImpl` is injectable so tests never touch the network.

### `index.html`

A disclosure on the Start screen, below `.start-card`:

```html
<details id="playlist-tool" class="playlist-tool">
  <summary>Turn a YouTube playlist into a CSV</summary>
  <div class="playlist-body">
    <!-- shared -->
    <label class="playlist-field">
      <span>Playlist link</span>
      <input id="playlist-url" type="url" placeholder="https://www.youtube.com/playlist?list=…" />
    </label>

    <!-- API route -->
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
      <button id="playlist-api-btn">Fetch videos</button>
    </div>

    <!-- offline route -->
    <div class="playlist-route">
      <p class="playlist-route-title">No key? Use the saved page</p>
      <p class="playlist-help">Open the playlist, save the page (Ctrl+S) or copy its source, then paste or upload it here.</p>
      <textarea id="playlist-html" placeholder="Paste the playlist page source here…"></textarea>
      <label class="load-csv">
        <span>Upload the saved page</span>
        <input id="playlist-file" type="file" accept=".html,.htm,.txt,text/html" />
      </label>
      <button id="playlist-html-btn">Extract videos</button>
    </div>

    <p id="playlist-status" class="playlist-status" role="status" aria-live="polite"></p>

    <div class="actions">
      <button id="playlist-download-btn" disabled>Download CSV</button>
      <button id="playlist-use-btn" class="primary" disabled>Use this list</button>
    </div>
  </div>
</details>
```

### `app.js`

`initPlaylistTool()` (called from `init()`), holding a module-local `pendingItems`:

- On load: pre-fill `#playlist-key` from `localStorage` (`oped-yt-key`) and tick
  `#playlist-remember` when a key is stored.
- `#playlist-api-btn` → resolve the ID via `parsePlaylistId`, require a key, call
  `fetchPlaylist`, then `showExtracted(result)`.
- `#playlist-html-btn` and `#playlist-file` `change` → read the textarea / uploaded file,
  call `extractFromHtml`, then `showExtracted`.
- `showExtracted({ items, skipped })`:
  - Stores `pendingItems`.
  - Writes the status line (e.g. `Found 42 videos, skipped 3 unavailable.`) and toggles the
    Download/Use buttons' `disabled`.
- `#playlist-download-btn` → Blob of `toPlaylistCsv(pendingItems)` → download
  `yt-playlist.csv` (same `URL.createObjectURL` pattern as `#download-btn`).
- `#playlist-use-btn` → `useItems(pendingItems, 'YouTube playlist')` (existing function,
  which resets progress, persists the custom source, and returns to Start).
- Remember-key handling: on a successful API fetch, persist the key when the box is ticked,
  otherwise remove any stored key.

### `styles.css`

Reuse the existing card/disclosure, `.playlist-field`, `.shuffle-toggle`, `.load-csv`,
`.actions`, and status text styles. Only additive layout rules (spacing, the textarea's
size) are introduced; **tokens only**, no inline colours/fonts. The disclosure inherits
the Start screen's Fight Card look.

## Data flow

```
input (link + route)
  → parsePlaylistId(link)
  → fetchPlaylist(id, key) | extractFromHtml(html)
  → items: [{ title, url }]
  → showExtracted({ items, skipped })   // status + enable actions
  → Download CSV  (toPlaylistCsv → Blob → yt-playlist.csv)
    | Use this list (useItems(items, 'YouTube playlist'))
```

## Error handling

| Condition | Message |
| --- | --- |
| Unparseable link | "That doesn't look like a playlist link." |
| API key missing on API route | "Enter your YouTube API key, or use the saved page." |
| API HTTP 400 | "The API key was rejected." |
| API HTTP 403 | "Quota exceeded, or the YouTube Data API isn't enabled for that key." |
| API HTTP 404 | "That playlist wasn't found." |
| No videos in HTML | "Couldn't find videos in that page — save the playlist page, not the home page." |
| Network failure | "Couldn't reach YouTube. Check your connection, or use the saved page." |

All messages are written to `#playlist-status`. Extraction never throws into a blank
screen; failures keep the previous status/buttons state.

## Testing

`test/playlist.test.js` (new), using `node --test`, no network:

- `parsePlaylistId`: `playlist?list=`, `youtu.be/…?list=`, `watch?v=…&list=…`, `m.`/`music.`
  hosts, bare ID, and invalids (no `list`, empty, non-URL) → `null`.
- `watchUrl`: builds the expected URL.
- `toPlaylistCsv`: no header; exact `title,link` lines; a title containing a comma stays on
  one line and round-trips through `parseCsv`.
- `extractFromHtml`: fixtures containing (a) `playlistVideoRenderer` and (b) `lockupViewModel`
  produce titles in order; the regex fallback works when `ytInitialData` is absent; duplicate
  IDs collapse; a page with no videos returns `[]`.
- `mapApiItems`: builds URLs, skips `Deleted video`/`Private video`/missing IDs, and returns
  `nextPageToken`.
- `fetchPlaylist`: with a **stubbed `fetchImpl`** — two-page pagination aggregates and
  de-duplicates, `skipped` is counted, and HTTP error statuses map to `.code` values.

The existing 76 tests must stay green.

## Constraints carried forward

- Zero dependencies; static site served over HTTP; no build step.
- No inline colours/fonts in `styles.css` — tokens only.
- The API route adds network usage only when the user opts in; the offline route keeps the
  app fully offline.
- `test/styles.test.js` layout contracts are untouched.
- No changes to the tournament, results, or match screens.
