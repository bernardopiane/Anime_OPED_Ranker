# 005 — Speed up the high-frequency panel hover fade

- **Status**: TODO
- **Commit**: 05cc1f0
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 1 file (`styles.css`), 2 lines

## Problem

The duel panels are hovered constantly during a round (moving the pointer
between the two to listen). Each hover fades the background and border over
`--dur-short` (220ms) on a large surface — too slow for something seen tens of
times per session. High-frequency hovers should be near-imperceptible.

`styles.css:192-193` — current:

```css
  transition: background-color var(--dur-short) var(--ease-out),
    border-color var(--dur-short) var(--ease-out);
```

## Target

Use the micro duration for a snappier, subtler fade:

```css
  transition: background-color var(--dur-micro) var(--ease-out),
    border-color var(--dur-micro) var(--ease-out);
```

`--dur-micro` is `120ms` in `tokens.css`. The easing and the animated
properties (colour only) are unchanged.

## Repo conventions to follow

- Duration/easing from `tokens.css` tokens — swap the token, do not inline a value.
- This rule lives in the `.panel { … }` block (the base panel style), not the
  `@media (hover: hover)` block.

## Steps

1. `styles.css`: in the `.panel` rule, change both `var(--dur-short)` occurrences in the `transition` (lines 192-193) to `var(--dur-micro)`.

## Boundaries

- Do NOT change the `.panel:hover` rule or the hover-gating media query.
- Do NOT change `button` transitions or any other duration.
- If the cited lines differ from this excerpt (drift since `05cc1f0`), STOP and report.

## Verification

- **Mechanical**: `node --test` → 67 pass, 0 fail.
- **Feel check**: run the site, start a tournament, and sweep the pointer across both panels:
  - The highlight follows the pointer without perceptible lag.
  - In DevTools → Animations, the panel hover transition reads 120ms.
- **Done when**: the panel hover colour transition runs at 120ms and nothing else changed.

## Dependencies

- None. Independent of the other plans.
