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

## Test

    node --test
