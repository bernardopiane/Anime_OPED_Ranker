# Krisgo Opening List

Ranks the anime openings/endings in `krisgo opening list.csv` into a definitive
ordering through a merge-sort tournament of pairwise picks, with embedded video
previews. The list is read dynamically, so it works with any number of entries.

## Run

The site must be served over HTTP (opening it as `file://` will not work).

    python -m http.server 8000

or on Windows:

    ./serve.ps1

Then open http://localhost:8000

## Entry links

Each CSV row is `Title,URL`. The URL can be either:

- an animethemes.moe page (e.g. `https://animethemes.moe/anime/noragami/OP1-NCBD1080`), or
- a YouTube link (e.g. `https://www.youtube.com/watch?v=j9xlqXCSBIc`).

Animethemes previews use a native video player; YouTube previews use the YouTube
IFrame Player API. Both respond to hover-to-unmute, the master volume slider, and
the Play/Pause control.

## Pause and resume

Progress is saved to browser `localStorage` after every pick, so it survives
reloads, closing the browser, and restarting the server. Use **Pause & exit**
mid-match to return to the start screen, then **Resume — N%** later. If you close
the tab or reload mid-match, the start screen offers Resume automatically.

localStorage is scoped to the origin (scheme, host, and port), so resume with the
same URL (e.g. `http://localhost:8000`). Serving on a different port starts a
separate save; editing `krisgo opening list.csv` invalidates older saves by design.

## Caching

Resolved previews are cached in `localStorage`, keyed by the entry's URL, so
unchanged rows are never fetched again — even if you add, remove, or reorder
entries. This keeps the number of requests to the animethemes.moe API low. If the
API replies with a rate-limit (429) or server error (5xx), the app retries with
exponential backoff before giving up; a failed preview can always be re-fetched
with the Retry button.

## Test

    node --test
