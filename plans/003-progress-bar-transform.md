# 003 — Animate the round progress bar with transform

- **Status**: TODO
- **Commit**: 05cc1f0
- **Severity**: MEDIUM
- **Category**: State indication (missed opportunity)
- **Estimated scope**: 2 files (`styles.css`, `app.js`), ~6 lines

## Problem

The round progress bar is driven by writing `style.width` directly with no
transition, so it jumps to each new value. It is a state indicator the user
reads after every pick; a snapped fill gives no sense of movement between
rounds.

`styles.css:153-157` — current:

```css
.progress .bar > div {
  width: 0;
  height: 100%;
  background: var(--color-accent);
}
```

`app.js:610` — current:

```js
el('progress-bar').style.width = `${progress.percent}%`;
```

Animating `width` itself is banned (it triggers layout + paint). Animate
`transform: scaleX()` instead — GPU-composited, no layout.

## Target

`styles.css` — replace the fill rule:

```css
.progress .bar > div {
  width: 100%;
  height: 100%;
  background: var(--color-accent);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform var(--dur-short) var(--ease-out);
}
```

`app.js:610` — replace the width write with a scale write:

```js
el('progress-bar').style.transform = `scaleX(${progress.percent / 100})`;
```

Then, inside the existing `@media (prefers-reduced-motion: reduce)` block
(created by plan 001), drop the movement so reduced-motion users get an
instant update:

```css
  .progress .bar > div { transition: none; }
```

## Repo conventions to follow

- The bar element keeps its `id="progress-bar"` (`index.html:39`); only the
  property written changes (`width` → `transform`).
- Duration/easing from tokens — `var(--dur-short)` is `220ms` in `tokens.css`.
- `transform-origin: left center` is required so the fill grows from the left
  rather than from the centre.
- Append the reduced-motion rule to the single existing block; do not add a
  second media query.

## Steps

1. `styles.css`: replace the `.progress .bar > div` rule (153-157) with the target.
2. `app.js`: change line 610 from the `style.width` assignment to the `style.transform` assignment.
3. `styles.css`: inside the `@media (prefers-reduced-motion: reduce)` block, add `.progress .bar > div { transition: none; }`.

## Boundaries

- Do NOT change `.progress` or `.progress .bar` (the track) — only the `> div` fill.
- Do NOT change the progress label (`app.js:611-612`) or the tournament logic.
- Do NOT animate `width`, `height`, `margin`, or `padding` anywhere.
- If the cited code differs from these excerpts (drift since `05cc1f0`), STOP and report.

## Verification

- **Mechanical**: `node --test` → 67 pass, 0 fail. Confirm `app.js` no longer contains `style.width` for `progress-bar`.
- **Feel check**: run the site, start a tournament, and pick winners:
  - The bar grows smoothly from left to right between rounds (no jump).
  - Inspect the element: only `transform` changes; there is no layout/paint work.
  - In DevTools → Rendering → **prefers-reduced-motion: reduce**: the bar updates instantly with no transition.
- **Done when**: the fill animates on `scaleX` and the reduced-motion path is instant.

## Dependencies

- **Depends on 001** — appends to the same `prefers-reduced-motion` block; apply 001 first.
