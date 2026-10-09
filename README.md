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
