# Krisgo Opening List — Ranking Site Design

Date: 2026-10-09
Status: Approved (design)

## Purpose

A local static website that reads the anime openings/endings from `krisgo opening list.csv` (100 entries) and lets the user rank them into a definitive **Top 100** by repeatedly choosing the better of two openings. Ranking is done with a tournament that produces a true, fully-sorted order. The user previews each opening via embedded video players, and progress is saved so they can resume later and export the final ranking.

## Goals

- Read and parse all 100 entries from the CSV at runtime.
- Show two openings side by side as embedded, non-intrusive video players.
- Rank all 100 items with a **true sort** (not an approximation) using a bracket/tournament of pairwise picks.
- Auto-save progress; allow resume after closing the tab and a Reset.
- Present and export the final Top 100.

## Non-Goals

- No account system, backend, or database.
- No live re-fetch of the CSV from a remote source; the local file is the source of truth.
- No mobile app, no offline PWA.
- No editing of the CSV from the UI.

## Key Constraints & Findings

- `animethemes.moe` pages set `X-Frame-Options: SAMEORIGIN`, so the **web pages cannot be iframed**.
- The public API `api.animethemes.moe` returns **direct video URLs** (e.g. `https://v.animethemes.moe/Noragami-OP1.webm`) and **permits browser CORS**, so videos can be played in native `<video>` elements.
- Because the site fetches both the CSV and the API, it must be served over HTTP (not opened via `file://`). A local static server is required.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Ranking thoroughness | Bracket/tournament, exact sort |
| Tournament mechanic | **Merge-sort tournament** (Approach A) |
| Preview method | Two `<video>` players side by side, **muted by default**, each with unmute |
| Stack | Plain static site (HTML/CSS/JS ES modules) + local server, no build step |
| Progress | Auto-save to localStorage + resume + Reset |
| Output | Ranked list + Copy + Download (CSV/text) |
| Ties | None — every matchup must produce a winner |

## Architecture

Plain static site using ES modules, no build tooling. Pure logic lives in `src/` modules that are importable both by the browser and by Node's test runner, keeping logic independent of the DOM.

```
index.html              markup; loads app.js as type="module"
styles.css              layout & styling
app.js                  UI wiring: screens, video players, event handling
src/csv.js              parseCsv(text) -> items[]
src/resolve.js          resolveVideos(items) -> Map<id, {videoUrl, pageUrl}>
src/tournament.js       pure, deterministic merge-sort comparison engine
src/storage.js          localStorage load/save/reset helpers
test/csv.test.js        node --test, zero dependencies
test/tournament.test.js
package.json            { "type": "module" }, no dependencies
serve.ps1               convenience local server launcher
README.md               how to run and use
```

### Unit boundaries

- `csv.js` — input: raw CSV text. Output: ordered array of `{ id, title, url }`. Depends on nothing.
- `resolve.js` — input: items. Output: map from item id to a playable video URL (and fallback page URL). Depends on the fetch API only.
- `tournament.js` — input: seed order + recorded winners. Output: next matchup, ranking, progress, undo. Pure, DOM-free, no side effects.
- `storage.js` — read/write/clear a single namespaced localStorage record.
- `app.js` — orchestration only; contains no ranking or parsing logic.

## Data Loading & Video Resolution

1. Fetch `krisgo opening list.csv` with the space URL-encoded (`krisgo%20opening%20list.csv`).
2. Parse each non-empty line by splitting at the **last comma** so titles containing commas are preserved: everything before the last comma is the title, everything after is the URL.
3. Assign each item a stable `id` equal to its zero-based line index, so progress survives re-parsing. (Editing the CSV invalidates saved progress; the Reset button covers this.)
4. From a URL of the form `https://animethemes.moe/anime/<slug>/<THEME>-<TAGS>` extract `slug` and `theme` (e.g. `noragami`, `OP1`; `fate-zero-2nd-season`, `ED3`).
5. Request `https://api.animethemes.moe/anime/<slug>?include=animethemes.animethemeentries.videos`.
6. Locate the animation theme whose slug equals `theme`, then choose the entry/video that best matches the CSV tags/resolution; otherwise fall back to the first available video.
7. Cache the resolved map in memory and localStorage to avoid repeat requests.
8. On any failure, mark the item as unresolved: no video player, but show the animethemes page link and the title so it can still be ranked.

## Tournament Engine (Merge-Sort Tournament)

Bottom-up merge sort presented as bracket rounds.

- Rounds merge sorted runs pairwise: 1 → 2 → 4 → 8 → 16 → 32 → 64 → 100 (one odd merge at the end).
- Within a merge of sorted runs `L` and `R`, compare the current front item of `L` against the current front item of `R`. The winner is appended to the merged output; the loser's run stays with the same front item, so its next element becomes the new challenger.
- Deterministic: given the recorded winner history, the engine can reconstruct the exact in-progress state.

Engine interface (pure module):

- `createTournament(items)` → state seeded with the items in order.
- `nextMatchup(state)` → `{ a, b }` or `{ done: true }`.
- `recordWinner(state, winnerId)` → advances the merge.
- `getRanking(state)` → fully sorted `items[]` when complete.
- `undo(state)` → reverts the last recorded winner.
- `getProgress(state)` → `{ round, comparisonsDone, comparisonsEstimated, percent }`.

Comparison count: approximately `n·⌈log₂ n⌉ − n + 1` ≈ 565 for n = 100.

## UI / UX Flow

### Start screen
- Title and item count.
- Primary button: **Start** (or **Resume — 37%** when saved progress exists).
- **Reset** button (with confirmation) to clear saved progress.

### Match screen
- Progress header: bar plus "Round 3 · 214/565".
- Two panels side by side (stacked vertically on narrow screens). Each panel shows:
  - the opening title,
  - a `<video>` element (muted, looping, autoplay, preload metadata) with minimal custom controls: Play/Pause and a scrub bar,
  - an **Unmute** toggle (the only way to enable sound),
  - fallback link when no video is available.
- Choosing: click the whole panel, or press the Left/Right arrow keys.
- **Undo** button to revert the last pick.

### Results screen
- Ranked list 1–100: rank, title, link.
- **Copy** to clipboard and **Download** CSV (`rank,title,url`).
- **Play again** / Reset.

### Accessibility / ergonomics
- Keyboard: Left/Right to pick, `U` to unmute the focused side, `R` to replay.
- Videos muted by default to avoid overlapping audio.
- Responsive layout for narrow windows.

## Persistence & Export

- Single namespaced localStorage record containing: parsed `items`, `resolved` video map, `winners[]`, and a `cursor`.
- Autosave after every recorded winner; restore exact state on load.
- Reset clears the record.
- Export produces CSV with columns `rank,title,url`; Copy places the ranked `1. Title` lines on the clipboard.

## Serving & Testing

### Running locally
The site requires an HTTP origin for `fetch()`. Provide:
- `serve.ps1` that starts `python -m http.server 8000` (or documents `npx serve` as an alternative).
- README instructions: run the server, open `http://localhost:8000`.

### Testing
- `node --test` with zero dependencies over the pure modules:
  - `csv.test.js`: parses all 100 rows; correctly preserves titles containing commas; ignores blank lines.
  - `tournament.test.js`: with a synthetic comparator/taste function, completing the tournament yields the exact expected sorted order; undo restores the prior matchup; resume from a partial winner history reconstructs the same state.
- Manual verification: run the server and confirm videos load and a full run produces a sorted list.

## Error Handling

- CSV fetch failure → clear error message on the start screen.
- Malformed CSV line → skipped and counted; a summary is shown if any rows fail.
- Video resolution/load failure → item remains rankable via title and page link.
- localStorage unavailable/full → site still works in-memory, with a warning that progress won't persist.

## Success Criteria

- Loads the 100 CSV entries.
- Presents two embedded, muted video players per matchup.
- Completing all matchups yields a genuinely sorted Top 100 exactly matching a correct comparator.
- Progress survives a page reload; Reset works.
- Results can be copied and downloaded.
- Pure modules pass `node --test`.
