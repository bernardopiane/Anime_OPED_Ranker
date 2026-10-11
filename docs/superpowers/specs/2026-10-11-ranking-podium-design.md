# Ranking Podium — Design

- **Date:** 2026-10-11
- **Status:** Approved (ready for implementation plan)
- **Feature:** After the ranking step finishes, show a top-three podium on the results screen.

## Problem

The results step currently renders only a flat numbered list (`#results-list`). There is
no celebratory, at-a-glance view of the top three. We want a "podium" — the classic
2nd-left / 1st-center-tallest / 3rd-right layout — that highlights the winners.

## Requirements

1. After the tournament completes and the results screen shows, display a podium **above**
   the existing `#results-list` (the full numbered list is kept).
2. Layout: **2nd on the left, 1st in the center on the tallest stand, 3rd on the right on
   the shortest stand.**
3. Each stand shows a **rank number** and the **anime/OP title** (as a link, matching the
   results list).
4. Each slot shows a **thumbnail/poster when one is available**; when it is not, the image
   is dropped and the **show information** (the title) is displayed instead.
5. Every podium slot displays a **crown**, all three, colored **gold (1st), silver (2nd),
   bronze (3rd)**, rendered as an **inline SVG icon**.
6. Styling follows the existing design system (Hallmark "Coral" dark theme, `tokens.css`).

## Thumbnail source

Entries are `{ id, title, url }`. URLs are either YouTube links or `animethemes.moe` links.

- YouTube links (`watch?v=`, `youtu.be/`, `embeds`, `shorts/`, `live/`) → thumbnail
  `https://img.youtube.com/vi/<id>/hqdefault.jpg`. `hqdefault.jpg` is chosen because
  YouTube always generates it (unlike `maxresdefault.jpg`).
- Non-YouTube links (e.g. animethemes.moe) → **no thumbnail**; render the text fallback.

## Approach (chosen: A)

Pure helper module + inline rendering, matching the repo's existing structure:

- **`src/podium.js` (new):** pure, unit-tested logic.
- **`app.js` `renderResults()`:** builds the podium DOM.
- **`index.html`:** static container.
- **`styles.css` / `tokens.css`:** styling + crown tokens.
- **`test/podium.test.js` (new):** unit tests.

Rejected alternatives: **B** (all inline in `app.js` — the ordering/thumbnail logic would
be untested), **C** (a DOM-building component module — not the existing pattern).

## Components

### `src/podium.js` (new)

```js
import { parseYouTubeUrl } from './resolve.js';

export function podiumThumbnail(url) { /* YouTube id → hqdefault.jpg URL, else null */ }

export function podiumEntries(rankedItems) { /* top 3 → [{ rank, item, thumbnail }] */ }
```

- `podiumThumbnail(url)`: returns the `hqdefault.jpg` URL when `url` parses as a YouTube
  link, otherwise `null`. Reuses `parseYouTubeUrl` (no duplicated regex).
- `podiumEntries(rankedItems)`:
  - Input is the existing rank-ordered array (index 0 = 1st place).
  - Returns **at most three** entries **in rank order**, each `{ rank, item, thumbnail }`.
  - `rank` is `1`, `2`, `3`.
  - Skips `undefined` entries (guards a bad `itemById` lookup).
  - Returns fewer than three when the ranking has fewer than three items.
  - `thumbnail` is `podiumThumbnail(item.url)` (may be `null`).
- The 2nd/1st/3rd visual arrangement is **CSS**, not this module (output stays in rank
  order).

### `index.html`

Insert between the heading and the list:

```html
<h1>Your ranking</h1>
<ol id="podium" class="podium" aria-label="Top three"></ol>
<ol id="results-list"></ol>
```

### `app.js` — `renderResults()`

After building `#results-list` (unchanged), populate `#podium` from
`podiumEntries(rankedItems())`. Per slot:

```html
<li class="podium-slot podium-slot--1">
  <svg class="podium-crown" aria-hidden="true">…</svg>
  <div class="podium-figure">                         <!-- only when a thumbnail exists -->
    <img class="podium-thumb" src="…" alt="" loading="lazy" />
  </div>
  <div class="podium-stand">
    <span class="podium-rank">1</span>
    <a class="podium-title" href="…" target="_blank" rel="noopener">Title</a>
  </div>
</li>
```

- **Thumbnail present:** render `.podium-figure` containing the `<img>`.
- **No thumbnail:** render **no** figure; the crown sits directly above the stand, which
  carries rank + title (the show information).
- **Image load failure:** the `<img>`'s `onerror` swaps the figure for a text tile
  (`<span class="podium-show">Title</span>`) so a broken thumbnail degrades to the
  no-image layout.
- `alt=""` on thumbnails (decorative); crown is `aria-hidden`.

### `tokens.css`

```css
  --crown-gold: oklch(85% 0.13 85);
  --crown-silver: oklch(85% 0.02 240);
  --crown-bronze: oklch(68% 0.10 55);
```

### `styles.css`

- `.podium`: `display: grid; grid-template-columns: repeat(3, 1fr); align-items: end;
  gap: var(--space-md);` list-style/padding reset.
- Placement (DOM stays in rank order):
  `.podium-slot--1 { grid-area: 1 / 2; }`,
  `.podium-slot--2 { grid-area: 1 / 1; }`,
  `.podium-slot--3 { grid-area: 1 / 3; }`.
- `.podium-slot`: flex column, centered. `--podium-h` per slot: `--1: 11rem`,
  `--2: 8rem`, `--3: 6rem`.
- `.podium-figure` / `.podium-show`: `aspect-ratio: 16 / 9`, rounded, `--color-media`
  background; `.podium-thumb` uses `object-fit: cover`.
- `.podium-stand`: `min-height: var(--podium-h)`, paper-2 surface, rule border, rank +
  title anchored to the bottom. 1st stand gets an `--color-accent` border.
- `.podium-rank`: mono, tabular-nums. `.podium-title`: title link, hover underline
  (consistent with `#results-list a:hover`).
- `.podium-crown`: `color` set per slot to gold/silver/bronze.
- **Responsive:** append podium rules to the existing `@media (max-width: 720px)` block
  **after** the `#panels` rule (preserving the test contract that `#panels` is the first
  rule there): smaller `--podium-h`, smaller crown, tighter gap. The podium stays 3-wide.
- **No new animation**, so no change to the reduced-motion block.

## Data flow

```
tournament complete → renderResults()
  → rankedItems()            (existing: rank-ordered items)
  → podiumEntries(items)     (new: top 3 with ranks + thumbnails)
  → build #podium DOM        (figures for thumbnails, text fallback otherwise)
  → showScreen('results')
```

## Edge cases

- Fewer than 3 entries: render only the available slots (e.g. a single 1st centered).
- `undefined` item from a bad id lookup: skipped by `podiumEntries`.
- Broken/unavailable thumbnail (offline, deleted video): `onerror` → text fallback.
- Non-YouTube entries: no figure, title-only stand.

## Out of scope

- Changing the existing `#results-list`, Copy, Download CSV, or Play again behavior.
- Persisting or evolving tournament data.
- Animating the podium (the recent motion audit intentionally leaves it static).

## Verification

- `node --test` stays green (currently 67 tests) plus the new `test/podium.test.js`.
- Manual: finish a ranking; podium shows 2nd-left / 1st-center / 3rd-right, gold/silver/
  bronze crowns, thumbnails for YouTube entries, title-only stands for animethemes entries;
  full list still below.
