# Centered Widescreen Results Page — Design

- **Date:** 2026-10-11
- **Status:** Approved (ready for implementation plan)
- **Feature:** Center the final ranking (results) screen and give it a two-column widescreen layout.

## Problem

`#results-screen` is a `52rem` block (`styles.css:355`) that sits at the **left** edge of the
`1800px`-capped `#app` shell (`styles.css:22`). On a wide viewport everything — the "Your
ranking" heading, the podium, the numbered list, and the Copy / Download CSV / Play again
buttons — hugs the left with a large empty gutter on the right, and the single-column list
gets long.

## Requirements

1. On a wide viewport, the results block is **horizontally centered** in the `#app` shell.
2. The "Your ranking" heading and the action buttons are **center-aligned**; the numbered
   list stays **left-aligned** (numbers in a clean column).
3. The results content uses more of the available width: `max-width` rises from `52rem` to
   **`72rem`**.
4. At viewports **≥ `72rem`** the numbered list flows into **2 columns** (newspaper /
   column-major order: ranks `1…N/2` down the left column, then the rest down the right).
5. **Below `72rem`** (including phones) the page is unchanged except that it is now
   centered: a single-column list.
6. The podium remains a full-width centered hero above the list.
7. Copy / Download CSV / Play again behavior is unchanged; the start and match screens are
   untouched.

## Approach (chosen)

**CSS-only**, single file (`styles.css`). No markup, JS, or behavioral changes. The list
reflows via CSS multi-column (`column-count`), so the DOM and the existing CSS rank counter
(`#results-list li::before`, `styles.css:377`) are untouched — numbers stay `1…N` in DOM
order regardless of visual columns.

Rejected alternatives:
- **B — two-pane (winners left, list right):** bolder width usage but shrinks the podium
  slots; not chosen.
- **C — 3-column list:** denser than needed for the target widths.
- **Markup change / JS split:** unnecessary; CSS columns achieve the reflow with no risk to
  the counter or the Copy/Download output (both read the DOM).

## Components

All edits are in `styles.css`.

### `#results-screen` (existing rule at `styles.css:355`)

- `max-width: 52rem` → `max-width: 72rem`
- add `margin-inline: auto` (center the block within `#app`, which already has
  `margin: 0 auto` and `max-width: 1800px`)
- keep `padding-block-start: clamp(var(--space-md), 5vh, var(--space-xl))`

### Heading and actions

```css
#results-screen h1 { text-align: center; }
#results-screen .actions { justify-content: center; }
```

- `.actions` is shared with the start screen (`index.html:28`), so the override **must be
  scoped** to `#results-screen .actions`; the start-screen buttons stay left-aligned.

### Widescreen two-column list (new media block)

Add near the other media queries:

```css
@media (min-width: 72rem) {
  #results-list {
    column-count: 2;
    column-gap: var(--space-2xl);
  }
  #results-list li { break-inside: avoid; }
}
```

- Column-major fill is the CSS multi-column default (balanced columns); reading order is
  top-to-bottom of the left column, then the right.
- `break-inside: avoid` keeps each rank row intact within a column.

### Unchanged

- `#podium` (its own grid) stays a centered hero; it simply becomes `72rem` wide.
- The existing `@media (max-width: 720px)` block is untouched — `#panels {
  flex-direction: column; }` remains its first rule.

## Data flow

No change: `renderResults()` renders `#podium` + `#results-list` exactly as today. Only the
presentation layer (CSS) changes.

## Edge cases

- **< `72rem`:** single column, centered — visually the same list as today.
- **Very long titles:** the list item already wraps (`line-height: 1.45`); two narrower
  columns mean more wrapping, which is acceptable.
- **Fewer than 3 items:** podium already handles this (renders only the available slots).
- **`72rem` boundary:** the `min-width: 72rem` media query and the `max-width: 72rem` cap
  meet exactly; at/above `1152px` (default root size) two columns engage.

## Out of scope

- Changing `#results-list` DOM, Copy, Download CSV, or Play again.
- Restyling the podium internals or the start/match screens.
- Animation (the podium is intentionally static).

## Verification

- `node --test` stays green (currently 75 tests).
- Optionally add CSS contract tests to `test/styles.test.js`:
  - `#results-screen` contains `max-width: 72rem` and `margin-inline: auto`.
  - the 2-column rule sits inside a `@media (min-width: 72rem)` block.
- Manual: at a viewport ≥ `1152px`, the results block is centered, the list shows two
  newspaper columns, heading and buttons are centered; below `1152px` it is a centered
  single column. Copy / Download CSV / Play again still work.
