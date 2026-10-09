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

## Test

    node --test
