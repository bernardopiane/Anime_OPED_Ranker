# Widescreen Video Layout — Design

Date: 2026-10-11
Status: Approved (design)

## Purpose

The match screen currently forces a 1200px page cap and fixed 16:9 video boxes, so on
large or widescreen monitors the previews stay small instead of using the available
screen. This change makes the two preview panels fill the viewport height, so videos
grow to fit the screen, while letterboxing content whose aspect ratio differs from the
panel (e.g. older 4:3 anime OPs).

## Goals

- Videos reach the largest size the screen allows on widescreen monitors.
- Non-16:9 content (4:3 anime OPs) is never distorted or cropped — letterbox bars.
- The layout degrades gracefully on small screens (existing stack-at-720px behavior).
- Pure CSS; no changes to `app.js` logic, tests keep passing.

## Non-Goals

- No JS-driven layout measurement or resize handling.
- No change to the start/results screens beyond the shared width cap.
- No change to playback behavior (hover-to-unmute, volume, scrub, adapters).

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Sizing behavior | Fill available viewport height, widths adapt |
| Non-16:9 content | `object-fit: contain` (letterbox, never crop) |
| Ultrawide width | Cap total layout at 1800px, centered (raised from 1200px) |
| Implementation | Pure CSS in `styles.css` |

## Design

### Container layout

- `#match-screen` becomes a full-viewport-height flex column:
  `height: 100dvh` with a `100vh` fallback line for older browsers.
- The progress header and the match footer keep their current auto height; the
  panels region between them absorbs all remaining space.
- `#panels` gets `flex: 1; min-height: 0` so the panel row fills the leftover height.
- `#app` max-width is raised from `1200px` to `1800px`, still centered with the
  existing `margin: 0 auto` and padding. This is the ultrawide cap.

### Panels

- `.panel` keeps `flex: 1` (half the row width), adds `min-width: 0`, and remains a
  flex column: title, media region, scrub bar, controls.
- The media region — `<video>`, `.yt`, `.loading`, and the fallback box — gets
  `flex: 1; min-height: 0; width: 100%` so it takes all available panel height and
  width. Title, scrub, and controls get `flex: 0 0 auto`.
- `<video>` gets explicit `object-fit: contain` (letterbox; the black panel background
  already provides the bars). No cropping of 4:3 content.
- The fixed `aspect-ratio: 16 / 9` declarations are removed from `.panel video`,
  `.panel .yt`, `.panel iframe`, and `.panel .loading`.
- YouTube iframes keep `width: 100%; height: 100%` inside the `.yt` holder; the player
  letterboxes internally on black, so no special handling is needed.

### Mobile

- The existing `@media (max-width: 720px)` rule still switches `#panels` to a
  column. Each stacked panel takes half the remaining height via `flex: 1`.
- No additional mobile rules are required.

## Files touched

- `styles.css` — all layout changes.

## Verification

- `node --test` — existing suite must still pass (CSS-only change; no logic touched).
- Manual visual check by resizing the browser window:
  - Wide window: videos at least as large as the old max, letterboxed when 4:3.
  - Narrow window (below 720px): stacked panels, videos watchable, no scrolling page.