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
- **List library** — keep several named YouTube lists, switch between them, and edit
  them in place.
- **Share as one code** — copy any list as a single string that imports with one paste.
- **Bring your own list** — load any `title,link` CSV file, or import a YouTube playlist.
- **Export** the final ranking as numbered text or a CSV download.
- **Fail-safe previews** — automatic retries with backoff and a per-preview Retry button.
- **Live Twitch chat voting** — chatters vote `!1` / `!2` on the current duel and the
  totals update in place, while you keep the final pick.

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

The list is read at load time, and the starter appears in the library as a
read-only list.

## List library

**Lists** on the start screen opens your library. Each list holds a set of video
links — YouTube links when you build or edit one — plus a title per item. That
title defaults to the video's own YouTube title and can be edited. The bundled
`opening list.csv` appears as the read-only **Starter list**, so there is always
something to rank.

- **Use** activates a list and returns you to the start screen. Only the active list
  carries a bracket.
- **Duplicate to edit** copies the starter into an editable list; **Duplicate** does
  the same for any other list.
- **New list** starts an empty editable list; **Edit** opens the editor for any list.
- **Delete** removes a list. Deleting the active list falls back to the starter.
- **Load your own CSV** and the playlist importer create a new list and activate it.
- Renaming a list or editing an item title keeps the current ranking progress.
- Adding, removing, reordering, or changing the link of an item is a structural
  change: it ends the active ranking with a warning and starts fresh. Editing an
  inactive list never touches the active bracket.
- **Reset** returns to the starter list and keeps the rest of your library.

The library, the active list, and the active bracket are saved together in
`localStorage` after every change.

### Importing a CSV

The file picker on the start screen accepts the same format as the bundled list:

```
Title,Link
```

- The line is split at the **last** comma, so commas inside titles are preserved.
- An uploaded CSV may mix YouTube and animethemes.moe links. Adding a row or
  changing a link in the editor requires a YouTube link.
- Blank lines and lines without a valid `http(s)` link are skipped, and each CSV
  upload becomes its own list named after the file.

## Share codes

**Share** on any list card produces a single string — a compressed, URL-safe
base64 code that starts with `oped1:`. Copy it and send it however you like; the
recipient opens **Import code** in their library, pastes it, and gets that list
added to their library with a de-duplicated name.

- Codes carry the list name and its videos only, never ranking progress.
- A list holds at most 500 videos. Codes that decode to more than that, or exceed
  the size limits, are rejected rather than partially imported.
- Malformed, truncated, or empty codes are rejected with a message instead of
  changing the library.
- Encoding and decoding happen locally, with compression where the browser supports
  `CompressionStream`; there is no server round trip and no account involved.

## Live Twitch chat voting

Run the ranking with an audience. On the start screen, type your Twitch channel
name and press **Connect** — the app joins that channel's chat read-only and
anonymous, with no login, token, or backend. The channel is remembered for next
time.

While a duel is on screen, chatters vote in chat:

- `!1` votes for the left entry, `!2` for the right.
- The message must **start** with `!1` or `!2`; trailing text is fine (`!1please`
  works). A leading space means the vote is ignored.
- One ballot per Twitch username — voting again replaces that user's earlier
  vote, so the latest vote wins.

Each panel shows the live count, percentage, and a team-coloured fill bar; the
`VS` badge shows the total. **Clear votes** resets the current poll.

Votes are **advisory only**. Only your **Pick A** / **Pick B** buttons (or `←` /
`→`) record a winner, and you can pick either side regardless of the vote. Votes
reset for every new duel and are not saved, so they never appear in a ranking or
survive a reload.

The connection is anonymous and read-only: the app only reads public chat, never
posts, and sees no account data. It needs network access, so it is the one
feature that is not fully offline.

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

When you add a video without a title, the editor asks YouTube's public oEmbed
endpoint for the video's title and fills it in; if that lookup fails, the video ID
is used instead and you can type a title yourself.

> Browsers may block automatic unmuting until you interact with the page. The
> **Unmute** button is the reliable way to hear a preview.

## Saving and resume

Your library, the active list, and that list's bracket live in one versioned
`localStorage` record and are written after every pick and every edit, so they
survive reloads, closing the browser, and restarting the server. Use **Pause & exit**
mid-match to return to the start screen, then **Resume** later. If you close the tab
or reload mid-match, the start screen offers Resume automatically.

Only the active list carries a bracket: switching lists, or structurally editing the
active list, ends the run and starts the new one fresh. Renaming a list or editing a
title keeps progress.

Saves from the previous single-list version are migrated on first load. The original
v2 record is copied to `anime-op-ed-ranker/backup/v2` before the migrated record is
written, so nothing is discarded.

## Project structure

```
index.html            Start, match, results, and lists screens plus modals
app.js                UI wiring, video adapters, list library, persistence
styles.css            Styling
opening list.csv      Bundled read-only starter list
serve.js              Zero-dependency Node static server
Start.cmd             Windows click-to-run launcher (visible console)
Start Hidden.vbs      Windows launcher with no console window
Stop.cmd              Stops the hidden server
src/
  csv.js              Parse "title,link" lines
  lists.js            List model, limits, v2 migration, structure checks
  share.js            Compress and encode a list as one share code
  tournament.js       Merge-sort tournament engine (stateless replay)
  resolve.js          Resolve a link to a playable video (with retries)
  youtube.js          Normalize YouTube links and look up video titles
  playlist.js         Playlist import helpers
  cache.js            URL-keyed preview cache
  storage.js          localStorage wrapper and v2 backup (never throws)
  twitch.js           Twitch IRC read-only chat adapter and vote parsing
  voting.js           Per-duel poll and username-keyed vote tally
test/                 Node test suites
```

## Development

Requirements: a modern browser, plus Python or Node.js to serve the files.

```sh
node --test        # run the test suite
```

## Deployment

This is a static site that can be deployed to any hosting platform. Configuration files are included for:

### Vercel

1. Push your code to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Deploy - Vercel will detect the static site automatically

### Netlify

1. Push your code to GitHub
2. Import the repository in [Netlify](https://netlify.com)
3. Deploy - Netlify will detect the static site automatically

### Cloudflare Pages

1. Push your code to GitHub
2. Create a new project in [Cloudflare Pages](https://pages.cloudflare.com)
3. Connect your GitHub repository
4. Build settings: leave empty (no build command needed)

All platforms will serve the site over HTTPS, which is required for ES modules and localStorage to work correctly.

## Notes

- Everything runs client-side; there is no backend and no build step.
- Network access is needed only to resolve and play previews, to look up YouTube
  titles when adding a video, and to read Twitch chat when chat voting is connected.
- Share codes are compressed in the browser and contain only list names and links;
  no progress, account, or analytics data is included.
- Twitch chat is joined anonymously over a read-only WebSocket; no OAuth, token, or
  chat-writing permission is involved.
- The app requires HTTPS or HTTP (not file://) to function properly due to ES module restrictions.
