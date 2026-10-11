# 001 — Reduced motion keeps color/opacity feedback

- **Status**: TODO
- **Commit**: 05cc1f0
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (`styles.css`), ~10 lines

## Problem

The `prefers-reduced-motion` block removes *all* transitions by forcing
`transition-duration: 0.001ms` on every element. That is broader than
reduced motion requires — it also deletes the colour/opacity feedback that
aids comprehension, leaving hover and press states as instant hard cuts.

`styles.css:481-488` — current:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after { transition-duration: 0.001ms !important; }
  .screen,
  .modal-card { animation: none; }
  .panel .loading::before { animation: none; }
}
```

Reduced motion means **fewer and gentler** animations, not zero. Keep colour
and opacity feedback; drop movement (transform-based transitions and
transform/translate keyframes).

## Target

Replace the block with a targeted override that only removes movement. The
`button` rule below keeps its colour transitions and drops the `1px` press
translate; the two `animation: none` lines stay to remove the screen-slide
and loading-spin movement:

```css
@media (prefers-reduced-motion: reduce) {
  .screen,
  .modal-card { animation: none; }
  .panel .loading::before { animation: none; }
  button {
    transition: background-color var(--dur-micro) var(--ease-out),
      border-color var(--dur-micro) var(--ease-out);
  }
}
```

`.panel:hover` keeps its `background-color`/`border-color` transition
(colour only — it does not move), so no override is needed for it.

## Repo conventions to follow

- Easing/duration come from `tokens.css` tokens — use `var(--ease-out)` and
  `var(--dur-micro)` (120ms); never inline a cubic-bezier.
- There is exactly one `@media (prefers-reduced-motion: reduce)` block and it
  lives at the end of `styles.css`. Extend it; do not add a second one.

## Steps

1. In `styles.css`, replace the entire `@media (prefers-reduced-motion: reduce) { … }` block (currently at the end of the file, lines 481-488) with the target block above, verbatim.
2. Confirm no other rule still relies on the removed `*` reset (grep `transition-duration` — it should return nothing after this edit).

## Boundaries

- Do NOT change any transition outside this media block.
- Do NOT change markup or JS.
- Files out of scope: `app.js`, `index.html`, `tokens.css`.
- If the block differs from the excerpt above (drift since `05cc1f0`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `node --test` → 67 pass, 0 fail. `Select-String -Path styles.css -Pattern 'transition-duration'` → no matches.
- **Feel check**: run the site (`python -m http.server 8000`), open DevTools → Rendering → **Emulate prefers-reduced-motion: reduce**, then:
  - Hover a duel panel → the background still fades in (not an instant cut).
  - Click a button → no `1px` vertical shift.
  - Start / resume → the match screen appears instantly (no slide).
  - The loading spinner does not rotate but the “Loading preview…” text remains.
- **Done when**: with reduced motion on, colour feedback is preserved and no element translates or scales.

## Dependencies

- None. Apply this plan **first** — plans 002 and 003 append rules inside the same block.
