# Widescreen Video Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the match screen's two preview panels fill the viewport height on widescreen monitors, with videos letterboxed (`object-fit: contain`) and the whole layout capped at 1800px.

**Architecture:** Pure CSS change in `styles.css`. `#match-screen` becomes a full-height flex column; `#panels` and each media region become flexible so videos grow to fit. Fixed 16:9 aspect boxes are removed. A small `node --test` suite reads `styles.css` and asserts the required rules, giving automated regression coverage without adding any dependencies.

**Tech Stack:** Vanilla CSS, ES module Node test (`node:test`, `node:assert`). No dependencies added.

**Spec:** `docs/superpowers/specs/2026-10-11-widescreen-video-layout-design.md`

## Global Constraints

- Pure CSS — do not modify `app.js`, `index.html`, or any `src/` module.
- Content ratio behavior: letterbox (`object-fit: contain`), never crop.
- Ultrawide cap: `#app` max-width `1800px` (raised from `1200px`), still centered.
- No new npm dependencies; project remains zero-dependency.
- The existing `@media (max-width: 720px)` phone-stacking rule stays.

---

### Task 1: Height-filling panels with letterboxed videos

**Files:**
- Create: `test/styles.test.js`
- Modify: `styles.css` (root vars, `#app`, new `#match-screen`, `#panels`, `.panel` and its media/control children)

**Interfaces:**
- Consumes: the current `styles.css` (lines referenced below are the pre-edit content).
- Produces: layout rules in `styles.css` live-tested in the browser; a `test/styles.test.js` suite run by `node --test`.

- [ ] **Step 0: Confirm the checkpoint and clean tree**

Run: `git status`
Expected: clean working tree except for `opening list.csv` (the user's own edit — leave it unstaged; never commit it). The spec commit `9e2f79e` is the checkpoint/rollback point.

- [ ] **Step 1: Write the failing CSS-contract test**

Create `test/styles.test.js`:

```js
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('match screen fills the viewport height', () => {
  const block = css.match(/#match-screen\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(block, /min-height:\s*calc\(100dvh/);
});

test('app cap is raised for widescreen', () => {
  const block = css.match(/#app\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(block, /max-width:\s*1800px/);
});

test('video uses object-fit contain with flexible sizing', () => {
  const block = css.match(/\.panel\s+video\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(block, /object-fit:\s*contain/);
  assert.match(block, /flex:\s*1/);
});

test('fixed 16:9 aspect ratios are removed in favour of height-fill', () => {
  assert.ok(!css.includes('aspect-ratio: 16 / 9'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test`
Expected: the 4 new tests FAIL (no `#match-screen` rule exists, `#app` is `1200px`, `.panel video` has no `object-fit`, and `aspect-ratio: 16 / 9` is present). All pre-existing tests still pass.

- [ ] **Step 3: Implement the CSS**

Apply the following edits to `styles.css` (line numbers are the current file's):

1. `:root` block (lines 1–8): add the page-padding variable:

```css
:root {
  --bg: #101014;
  --panel: #1b1b22;
  --panel-hover: #26262f;
  --text: #f2f2f5;
  --muted: #9a9aa8;
  --accent: #ff5a7a;
  --page-pad: 1.5rem;
}
```

2. `#app` (line 19): raise the cap and use the variable:

```css
#app { max-width: 1800px; margin: 0 auto; padding: var(--page-pad); }
```

3. Add the match-screen height-fill rule just above the `#panels` rule (line 44):

```css
#match-screen {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--page-pad) - var(--page-pad));
  min-height: calc(100dvh - var(--page-pad) - var(--page-pad));
}
```

4. `#panels` (line 44): let it absorb leftover height:

```css
#panels { display: flex; gap: 1rem; flex: 1; min-height: 0; }
```

5. `.panel` (lines 45–53): add `min-width: 0;` so children can shrink below content width:

```css
.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  text-align: left;
  background: var(--panel);
  min-width: 0;
}
```

6. `.panel video` (line 54): fill the panel and letterbox:

```css
.panel video { width: 100%; flex: 1 1 auto; min-height: 0; object-fit: contain; background: #000; border-radius: 6px; }
```

7. `.panel .yt` (line 55): fill the panel height:

```css
.panel .yt { width: 100%; flex: 1 1 auto; min-height: 0; background: #000; border-radius: 6px; overflow: hidden; }
```

8. `.panel iframe` (line 56): fill the `.yt` holder instead of forcing 16:9:

```css
.panel iframe { display: block; width: 100%; height: 100%; border: 0; }
```

9. `.panel .scrub` (line 57): never allow the scrub bar to stretch:

```css
.panel .scrub { width: 100%; flex: 0 0 auto; accent-color: var(--accent); }
```

10. `.panel .title` (line 58): keep it compact:

```css
.panel .title { flex: 0 0 auto; font-weight: 600; }
```

11. `.panel .controls` (line 59): keep it compact:

```css
.panel .controls { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; flex: 0 0 auto; }
```

12. `.panel .fallback` (line 61): fill the media region and center its contents:

```css
.panel .fallback {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  color: var(--muted);
  font-size: 0.85rem;
}
```

13. `.panel .loading` (lines 79–89): remove the fixed 16:9 box and fill instead:

```css
.panel .loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  background: var(--panel-hover);
  border-radius: 6px;
  color: var(--muted);
  font-size: 0.85rem;
}
```

Leave the `@media (max-width: 720px)` rule untouched.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test`
Expected: ALL tests pass — the 4 new CSS-contract tests and the pre-existing suite.

- [ ] **Step 5: Manual visual verification**

Start the site (`Start.cmd`, or `python -m http.server 8000`) and open `http://localhost:8000`. Confirm:
- On a wide window: both videos fill the screen height, letterboxed with black bars when the video is 4:3; no aspect distortion; the pair is capped/centered at 1800px on ultrawide.
- Resize below 720px width: panels stack vertically, each video fits its half-height panel, page does not scroll as long as the footer fits.
- Loading state, fallback state (open a broken link if convenient), YouTube embed, and the scrub/controls all still render inside the panels.

- [ ] **Step 6: Commit**

```bash
git add styles.css test/styles.test.js
git commit -m "feat: make preview panels fill the screen on widescreen"
```