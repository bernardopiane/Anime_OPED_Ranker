# 002 — Preview modal opens and closes symmetrically

- **Status**: TODO
- **Commit**: 05cc1f0
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: 2 files (`styles.css`, `app.js`), ~35 lines

## Problem

The “Preview ranking” modal animates **in** via a keyframe but disappears
instantly on close, because closing only toggles the `.hidden`
(`display: none`) class. An element that enters with motion should leave the
same way; the instant teardown reads as a glitch. Keyframes also restart from
zero if the modal is reopened quickly, whereas a transition retargets from the
current state.

`styles.css:417-422` — current:

```css
.modal-card {
  /* … */
  animation: modal-in var(--dur-long) var(--ease-out) both;
}
@keyframes modal-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
```

`app.js:654-673` — current:

```js
function openPreview() {
  /* … builds #preview-list … */
  el('preview-modal').classList.remove('hidden');
}

function closePreview() {
  el('preview-modal').classList.add('hidden');
}
```

(`.modal` at `styles.css:399-409` also has no opacity fade — the card animates
over an instantly-appearing scrim.)

## Target

Drive both the card and the scrim with **transitions** and an `is-open`
state class; add the `hidden` class only after the exit transition finishes.

`styles.css` — replace the `.modal` and `.modal-card` rules and delete
`@keyframes modal-in`:

```css
.modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: var(--space-xl) var(--space-md);
  overflow-y: auto;
  background: var(--color-scrim);
  opacity: 0;
  transition: opacity 200ms var(--ease-out);
}
.modal.is-open { opacity: 1; }

.modal-card {
  width: min(34rem, 100%);
  padding: var(--space-lg);
  background: var(--color-paper);
  border: 1px solid var(--color-rule-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-modal);
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
}
.modal.is-open .modal-card {
  opacity: 1;
  transform: none;
}
```

Modals are not anchored to a trigger, so the default `transform-origin: center`
is correct — do not change it.

`app.js` — replace `openPreview` / `closePreview` (add the `previewCloseTimer`
declaration near them):

```js
let previewCloseTimer = null;

function openPreview() {
  const items = getCurrentRanking(state.tournament).map(itemById);
  const list = el('preview-list');
  list.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = item.title;
    li.appendChild(link);
    list.appendChild(li);
  }
  const modal = el('preview-modal');
  clearTimeout(previewCloseTimer);
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('is-open'));
}

function closePreview() {
  const modal = el('preview-modal');
  modal.classList.remove('is-open');
  clearTimeout(previewCloseTimer);
  previewCloseTimer = setTimeout(() => modal.classList.add('hidden'), 200);
}
```

The `200` in `setTimeout` must match the `200ms` transition duration above.

Then, inside the existing `@media (prefers-reduced-motion: reduce)` block
(created/rewritten by plan 001), add a movement reset for the modal so it only
fades:

```css
  .modal-card { transform: none; }
```

## Repo conventions to follow

- State classes: the app toggles `hidden` via `classList` (see `showScreen`,
  `app.js:26-30`). Follow that pattern; add `is-open` the same way.
- Easing/duration from tokens — use `var(--ease-out)`. The `200ms` modal
  duration is written literally here because it also appears in the JS
  `setTimeout`; keep the two in sync.
- The single `@media (prefers-reduced-motion: reduce)` block lives at the end
  of `styles.css`; append to it, don’t add another.

## Steps

1. `styles.css`: replace the `.modal` rule (currently lines 399-409) with the target `.modal` + `.modal.is-open` rules.
2. `styles.css`: replace the `.modal-card` rule (410-418) with the target, and delete the `@keyframes modal-in` block (419-422).
3. `styles.css`: inside the `@media (prefers-reduced-motion: reduce)` block, add `.modal-card { transform: none; }`.
4. `app.js`: replace `openPreview` (654-669) and `closePreview` (671-673) with the target versions, and add `let previewCloseTimer = null;` above `openPreview`.

## Boundaries

- Do NOT change the modal’s HTML structure (`index.html:69-78`) or its IDs (`#preview-modal`, `#preview-modal` click-outside handler at `app.js:677-679`).
- Do NOT add dependencies.
- Do NOT touch other screens or their animation.
- If the cited code differs from these excerpts (drift since `05cc1f0`), STOP and report.

## Verification

- **Mechanical**: `node --test` → 67 pass, 0 fail.
- **Feel check**: run the site, start a tournament, then:
  - Click “Preview ranking” → the scrim fades and the card eases in from `translateY(-6px) scale(0.98)`.
  - Click “Close” (or press Escape, or click the backdrop) → the card and scrim fade **out** before disappearing — no instant pop.
  - Click “Preview ranking” twice in rapid succession → the modal does not get stuck hidden and does not restart from a blank frame.
  - In the DevTools Animations panel set playback to 10% and confirm the in and out paths are mirror images.
  - Toggle **prefers-reduced-motion** → the modal fades with **no** translate/scale.
- **Done when**: open and close are visually symmetric and the dialog never hard-cuts.

## Dependencies

- **Depends on 001** — both edit the `prefers-reduced-motion` block; apply 001 first, then append here.
