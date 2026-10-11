# Design system — Anime OP/ED Ranker

Locked by a Hallmark `redesign` pass. This document is the source of truth for every
screen. New screens must reuse these tokens, shapes, motion, and voice rather than
inventing new ones.

## Brief

- **What it is:** a head-to-head duel app that turns a list of anime openings and
  endings into a personal ranking.
- **Who it's for:** anime fans ranking OP/EDs, and the friends they share a ranking
  with.
- **Tone:** playful — soft and warm, the quieter end. Clever and light, never loud or
  corporate.
- **Audience action per screen:** Start → begin or resume a ranking. Duel → pick a
  winner. Results → read, copy, or download the finished ranking.

## Theme — "Sakura" (custom, dual light/dark)

A tuned OKLCH system, not a catalog theme: playful's canonical theme depends on web
fonts, and this app must run offline with system fonts only. Colour and shape carry
the personality instead.

Muted rose / sakura accent, hue **352** — warm, distinct from generic red, and clear of
the gold/silver/bronze medal hues used on the podium.

Axes: **light → dark (dual, user-toggleable)** · **system-native type** ·
**chromatic-other (rose)**.

### Palette tokens (`tokens.css`)

| token | dark (default) | light |
| --- | --- | --- |
| `--color-paper` | `oklch(17% 0.012 352)` | `oklch(97% 0.012 352)` |
| `--color-paper-2` | `oklch(21% 0.014 352)` | `oklch(94% 0.016 352)` |
| `--color-paper-3` | `oklch(25% 0.016 352)` | `oklch(91% 0.020 352)` |
| `--color-rule` | `oklch(33% 0.014 352)` | `oklch(86% 0.020 352)` |
| `--color-rule-strong` | `oklch(52% 0.016 352)` | `oklch(70% 0.030 352)` |
| `--color-neutral` | `oklch(64% 0.012 352)` | `oklch(46% 0.020 352)` |
| `--color-muted` | `oklch(73% 0.013 352)` | `oklch(44% 0.020 352)` |
| `--color-ink-soft` | `oklch(84% 0.010 352)` | `oklch(36% 0.020 352)` |
| `--color-ink` | `oklch(95% 0.008 352)` | `oklch(24% 0.022 352)` |
| `--color-accent` | `oklch(74% 0.13 352)` | `oklch(47% 0.16 352)` |
| `--color-accent-strong` | `oklch(80% 0.11 352)` | `oklch(43% 0.17 352)` |
| `--color-accent-soft` | `oklch(30% 0.06 352)` | `oklch(92% 0.040 352)` |
| `--color-accent-ink` | `oklch(18% 0.04 352)` | `oklch(99% 0.010 352)` |
| `--color-focus` | `oklch(78% 0.14 352)` | `oklch(52% 0.18 352)` |
| `--color-media` | `oklch(12% 0.008 352)` | `oklch(22% 0.010 352)` |
| `--color-media-ink` | `oklch(90% 0.010 352)` | `oklch(90% 0.010 352)` |

Semantic tokens (`--danger*`, `--crown-*`, `--shadow-modal`) follow the same axis.
Contrast targets: body ink ≥ 4.5:1 on paper, accent text ≥ 4.5:1, ink-on-accent ≥ 4.5:1.

## Type

System stacks only — no web fonts (offline constraint, documented exception).

- **Display:** `system-ui` (heavy weight, tight tracking).
- **Body:** `system-ui`.
- **Outlier:** `ui-monospace` — rank numerals, the `VS` mark, tabular figures.

Playful personality comes from **shape, colour, motion, and copy**, not from a rounded
display face. A vendored free rounded face (e.g. Bricolage, Satoshi) could be added
later; it is not required.

## Shape

- Cards and media panels: `--radius-lg` (18px).
- Buttons: pill (`--radius-pill`).
- Inputs, badges, small chips: `--radius-sm` (8px).
- Soft, low-contrast shadows (`--shadow-card`) — depth without heaviness.

## Macrostructures

- **Start — Marquee Hero:** name-forward, one clear call to action, a statement footer.
- **Duel — Split Studio:** a diptych of two panels with a central `VS` mark.
- **Results — Index-First:** the ranking is the page; a podium crowns the top three.

## Navigation & footer

- **Nav — N2 Floating chip:** a single out-of-flow theme chip (fixed top-right) that
  toggles light/dark. It is the one persistent control outside the flow.
- **Footer — Ft5 Statement:** one closing line on the Start screen.

## Theme toggle

- Default follows `prefers-color-scheme`.
- Explicit choice persists in `localStorage` (`oped-theme`).
- A no-FOUC inline script in `<head>` sets `data-theme="light|dark"` on `<html>`
  before first paint.
- The chip exposes `aria-pressed` and a live `aria-label`.

## Motion

- One reveal per screen (`.screen` entrance), with a light stagger on the Start card's
  children and on the podium slots.
- Hover: panels warm their surface and border; podium slots lift 2px (transform only,
  `@media (hover: hover)`).
- Instant focus ring: `:focus-visible` outline, no delay.
- Every animation is disabled under `prefers-reduced-motion: reduce`.

## Microinteractions

- Buttons dip 1px on `:active`; primary CTA is a filled pill that deepens on hover.
- Panels lift 2px and warm their border on hover.
- Results rows tint on hover; the champion's stand uses `--accent-soft`.
- Theme chip swaps sun/moon icon per active theme.

## CTA voice

- **Primary** (Start / Resume): filled accent pill, `--color-accent-ink` text.
- **Secondary** (Reset, Copy, Download, Play again, Undo, Preview, Pause): outlined chip.

## Copy

Honest, warm, dry-humoured. No invented metrics, no hype. Examples: "Rank every opening
and ending, one duel at a time." · "Everything you ranked, best first." ·
"Built for the eternal rewatch — rank the bangers, settle the debates."

## Constraints carried forward

- `test/styles.test.js` layout contracts are preserved (app width cap, 100dvh match
  screen, letterboxed media, phone stacking).
- No inline colours/fonts in `styles.css` — tokens only.
- Mobile-ready at 320 / 375 / 414 / 768.
