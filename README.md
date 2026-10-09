# Anime OP/ED Ranker

Rank a list of anime openings and endings into a definitive order — from best to
worst — by repeatedly choosing the one you prefer from a pair. Each pick is made
against embedded video previews, so you can watch and compare before deciding.

The result is a **full ranking** of every entry, not just a top-N. It runs
entirely in your browser as a static site: vanilla JavaScript, zero dependencies.

![Vanilla JavaScript](https://img.shields.io/badge/JavaScript-ES%20modules-f7df1e?logo=javascript&logoColor=black)
![No dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

## Features

- **Definitive ranking** via a merge-sort tournament of pairwise comparisons.
- **Embedded previews** for [animethemes.moe](https://animethemes.moe) and YouTube.
- **Watch before you choose** — hover a side to unmute it, or lock playback with the Unmute button.
- **Master volume**, play/pause, and a scrub bar for each preview.
- **Preview ranking** at any time to see the provisional order so far.
- **Shuffle** the starting order to reduce bias.
- **Pause and resume** — progress is saved automatically and survives reloads and restarts.
- **Bring your own list** — load any `title,link` CSV file.
- **Export** the final ranking as numbered text or a CSV download.
- **Fail-safe previews** — automatic retries with backoff and a per-preview Retry button.

## Quick start

The site must be served over HTTP. Opening `index.html` directly as a `file://`
URL will not work (browsers block ES modules and local file fetches).

### Windows (click to run)

Double-click **`Start.cmd`**. It starts a local server on port 8000 and opens
your browser. Keep the window open while you use the app; close it to stop the
server. It uses Python if available, otherwise Node.js.

To run without a console window, double-click **`Start Hidden.vbs`** and use
**`Stop.cmd`** to shut the server down afterwards.

### Any platform (manual)

Serve the folder with any static file server and open `http://localhost:8000`:

```sh
python -m http.server 8000
# or
npx serve
# or, with Node installed, a built-in zero-dependency server:
node serve.js 8000
```

> Keep the same port between sessions. Progress is stored per origin
> (scheme + host + port), so a different port starts a separate save.

## CSV format

The bundled list is `opening list.csv`. Each line is a single entry:

```
Title,Link
```

- The line is split at the **last** comma, so commas inside titles are preserved.
- `Link` may be either an animethemes.moe page or a YouTube link.
- Blank lines and lines without a valid `http(s)` link are skipped.

Example:

```
Noragami,https://animethemes.moe/anime/noragami/OP1-NCBD1080
Some Show OP,https://www.youtube.com/watch?v=j9xlqXCSBIc
```

The list is read dynamically, so it works with any number of entries.

## Loading your own list

On the start screen, **Load your own CSV** lets you pick a local file that
follows the same format. Reordering or editing rows is fine. The loaded list is
saved so that Resume keeps working; **Reset** returns to the bundled list.

## How the ranking works

Entries are ranked with a merge sort whose comparison function is *you* — when
two entries are compared, the app shows them side by side and you pick the
better one. Because the comparison is a strict choice, the sort produces a true,
fully-ordered list of every entry.

Your decisions are the only state that is stored. The full bracket is rebuilt
from that decision history on every step, which makes **Undo**, **Pause/Resume**,
and reloads exact and deterministic. The number of comparisons is bounded by
`n·⌈log₂ n⌉ − n + 1`.

## Video previews

- **animethemes.moe** links resolve to a direct video file and play in a native
  `<video>` element.
- **YouTube** links play through the YouTube IFrame Player API, with the same
  hover-to-unmute, volume, play/pause, and scrub behaviour.

Resolved previews are cached in `localStorage`, keyed by the entry's URL, so
unchanged rows are never re-fetched — even if you add, remove, or reorder
entries. Requests that hit a rate limit (`429`) or server error (`5xx`) are
retried with exponential backoff.

> Browsers may block automatic unmuting until you interact with the page. The
> **Unmute** button is the reliable way to hear a preview.

## Saving and resume

Progress is saved to `localStorage` after every pick, so it survives reloads,
closing the browser, and restarting the server. Use **Pause & exit** mid-match to
return to the start screen, then **Resume** later. If you close the tab or reload
mid-match, the start screen offers Resume automatically.

## Project structure

```
index.html            Start screen, match screen, results, and modals
app.js                UI wiring, video adapters, persistence
styles.css            Styling
opening list.csv      The list to rank
serve.js              Zero-dependency Node static server
Start.cmd             Windows click-to-run launcher (visible console)
Start Hidden.vbs      Windows launcher with no console window
Stop.cmd              Stops the hidden server
src/
  csv.js              Parse "title,link" lines
  tournament.js       Merge-sort tournament engine (stateless replay)
  resolve.js          Resolve a link to a playable video (with retries)
  cache.js            URL-keyed preview cache + source fingerprints
  storage.js          localStorage wrapper (never throws)
test/                 Node test suites
```

## Development

Requirements: a modern browser, plus Python or Node.js to serve the files.

```sh
node --test        # run the test suite
```

## Notes

- Everything runs client-side; there is no backend and no build step.
- Network access is needed only to resolve and play previews.
