# 004 — Bring the screen entrance under the 300ms budget

- **Status**: TODO
- **Commit**: 05cc1f0
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 1 file (`tokens.css`), 1 line added + 1 changed (`styles.css`)

## Problem

Every screen entrance (start → match → results) runs at `--dur-long` = `420ms`.
UI animations should stay under 300ms; a 420ms slide makes the app feel
sluggish at exactly the moment the user is watching for the next view.

`tokens.css:53` — current:

```css
  --dur-long: 420ms;
```

`styles.css:43` — current:

```css
.screen { animation: screen-in var(--dur-long) var(--ease-out) both; }
```

## Target

Add a dedicated screen-transition token and use it for `.screen`.

`tokens.css` — add after `--dur-long`:

```css
  --dur-screen: 250ms;
```

`styles.css:43` — change the duration token:

```css
.screen { animation: screen-in var(--dur-screen) var(--ease-out) both; }
```

`250ms` sits inside the UI budget and still reads as a deliberate screen
change. The easing (`var(--ease-out)`) and the `screen-in` keyframe
(`opacity` + `translateY(6px)`) are unchanged.

## Repo conventions to follow

- Durations live as tokens in `tokens.css` under the existing
  `--dur-micro` / `--dur-short` / `--dur-long` group. Add `--dur-screen`
  next to them; do not inline a millisecond value in `styles.css`.
- Use the existing `var(--ease-out)`; introduce no new curve.

## Steps

1. `tokens.css`: add `--dur-screen: 250ms;` immediately after the `--dur-long: 420ms;` line (53).
2. `styles.css`: change the `.screen` rule (43) to use `var(--dur-screen)`.

## Boundaries

- Do NOT change the `screen-in` keyframe (44-48).
- Do NOT change other duration tokens.
- `--dur-long` may become unused after plan 002 (the modal) — leave it in place here; plan 006 handles dead-token cleanup.
- If the cited lines differ from these excerpts (drift since `05cc1f0`), STOP and report.

## Verification

- **Mechanical**: `node --test` → 67 pass, 0 fail.
- **Feel check**: run the site, start a tournament, finish it:
  - The results screen eases in noticeably quicker than before, with no visible lag.
  - In DevTools → Animations, the `screen-in` animation reads 250ms.
- **Done when**: the screen entrance runs at 250ms and no screen transition is over 300ms.

## Dependencies

- None. Independent of the other plans.
