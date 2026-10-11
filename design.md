# Design system — Anime OP/ED Ranker

Locked by an Impeccable `redesign` pass (superseding the earlier Hallmark "Sakura" pass).
This document is the source of truth for every screen. New screens must reuse these
tokens, shapes, motion, and voice rather than inventing new ones.

## Brief

- **What it is:** a head-to-head duel app that turns a list of anime openings and
  endings into a personal ranking.
- **Who it's for:** anime fans ranking OP/EDs, and the friends they share a ranking
  with.
- **Tone:** bold-playful — a broadcast fight card. Confident and game-like, never
  corporate or generic.
- **Audience action per screen:** Start → begin or resume a ranking. Duel → pick a
  winner. Results → read, copy, or download the finished ranking.

## Theme — "Versus" (custom, dual light/dark)

A tuned OKLCH duotone system, not a catalog theme: the app must run offline with
system fonts only, so colour, shape, and motion carry the personality instead.

The core idea is **two sides of a duel, colour-coded for instant recognition**:

- **Team A / accent — warm** (hue **34**, vermillion-coral). Also the primary action
  colour, the left panel, and the `←` keycap.
- **Team B — cool** (hue **200–220**, teal). The right panel and the `→` keycap.
- **Ground — neutral indigo-plum** (hue **285**). Paper, rules, ink.

Warm/cool holds in *both* axes, so a side always reads the same. The two fills are
near-complementary, so the diptych separates at a glance.

Axes: **light → dark (dual, user-toggleable)** · **system-native type** ·
**chromatic-duotone (warm ↔ cool)**.

### Palette tokens (`tokens.css`)

| token | dark (default) | light |
| --- | --- | --- |
| `--color-paper` | `oklch(15% 0.020 285)` | `oklch(97% 0.010 285)` |
| `--color-paper-2` | `oklch(19% 0.024 285)` | `oklch(94% 0.014 285)` |
| `--color-paper-3` | `oklch(24% 0.028 285)` | `oklch(90% 0.018 285)` |
| `--color-rule` | `oklch(31% 0.030 285)` | `oklch(85% 0.016 285)` |
| `--color-rule-strong` | `oklch(48% 0.032 285)` | `oklch(68% 0.030 285)` |
| `--color-neutral` | `oklch(60% 0.018 285)` | `oklch(50% 0.020 285)` |
| `--color-muted` | `oklch(72% 0.016 285)` | `oklch(44% 0.020 285)` |
| `--color-ink-soft` | `oklch(85% 0.012 285)` | `oklch(35% 0.024 285)` |
| `--color-ink` | `oklch(96% 0.008 285)` | `oklch(23% 0.026 285)` |
| `--color-accent` (= team A) | `oklch(70% 0.185 34)` | `oklch(46% 0.185 34)` |
| `--color-accent-strong` | `oklch(76% 0.160 40)` | `oklch(41% 0.180 34)` |
| `--color-accent-soft` | `oklch(28% 0.080 34)` | `oklch(93% 0.045 40)` |
| `--color-accent-ink` | `oklch(17% 0.040 34)` | `oklch(99% 0.010 40)` |
| `--color-team-b` | `oklch(74% 0.125 200)` | `oklch(46% 0.120 220)` |
| `--color-team-b-soft` | `oklch(28% 0.060 210)` | `oklch(92% 0.040 215)` |
| `--color-team-b-ink` | `oklch(16% 0.030 210)` | `oklch(99% 0.010 215)` |
| `--color-focus` | `oklch(80% 0.160 40)` | `oklch(50% 0.200 34)` |
| `--color-media` | `oklch(11% 0.012 285)` | `oklch(20% 0.020 285)` |
| `--color-media-ink` | `oklch(92% 0.008 285)` | `oklch(92% 0.008 285)` |

Team A is an alias of `--color-accent`; Team B has its own `--team-b*` family. Panels
remap `--team*` per side, so one rule styles both. Semantic tokens (`--danger*`,
`--crown-*`, `--shadow-*`) follow the same axis.

Contrast targets: body ink ≥ 4.5:1 on paper, accent/team as text ≥ 4.5:1 on paper,
and team-ink ≥ 4.5:1 on its team fill (light accents are held at L ≤ 46% so white
keys/caps stay legible).

## Type

System stacks only — no web fonts (offline constraint, documented exception).

- **Display:** `system-ui` (heavy weight, tight tracking).
- **Body:** `system-ui`.
- **Outlier:** `ui-monospace` — the round counter, ladder figures, keycaps, the `VS`
  mark, and rank numerals (tabular figures).

Broadcast feel comes from **uppercase letterspaced kickers**, mono numerals, and the
duotone colour, not from a special display face. A vendored rounded face could be
added later; it is not required.

## Shape

- Cards, media panels, podium stands: `--radius-lg` (18px) / `--radius-md`.
- Buttons: pill (`--radius-pill`).
- Inputs, keycaps, badges, rungs: `--radius-sm` (8px) / pill.
- Panels carry a **3px team-coloured top rail** and a soft team-tinted top wash.

## Macrostructures

- **Start — Fight Card:** an uppercase kicker over the wordmark, one clear call to
  action, a statement footer.
- **Duel — Split Arena:** a diptych of two duotone panels with a split-ring `VS`
  medallion, a round ladder in the HUD, and a per-side **Pick** call to action.
- **Results — Podium Poster:** a kicker'd heading, a crowning podium, and an
  index-first ranked list.

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

- One reveal per screen (`.screen` entrance) plus a light stagger on the Start card.
- **Incoming side:** when a pick replaces one panel, the changed panel slides in from
  its outer edge (`panel-enter-a` / `panel-enter-b`, `backwards` fill so hover-lift
  still works afterwards). The unchanged side is never re-rendered, so its video
  keeps playing — picks feel instant.
- Hover: panels tint their surface, deepen their border, and lift 3px
  (transform only, `@media (hover: hover)`).
- Instant focus ring: `:focus-visible` outline, no delay.
- Every animation is disabled under `prefers-reduced-motion: reduce`.

## Microinteractions

- Buttons dip 1px on `:active`; the primary CTA is a filled pill that deepens on hover.
- The per-side **Pick** button is a full-width, team-filled action pinned to the
  panel's foot — the explicit "this one" affordance.
- Panels lift and warm on hover; both the panel and its Pick button use the team
  colour.
- Results rows tint on hover; the champion's stand uses `--accent-soft`.
- Theme chip swaps sun/moon icon per active theme.

## Keyboard & assistive tech

- `←` / `→` pick A / B; `U` toggles mute on side A; `Esc` closes the preview dialog.
- Panels are `role="group"` with the entry title as their accessible name; the Pick
  button carries `aria-label="Pick {title}"`, so picking is reachable by Tab + Enter.
- The preview is a `role="dialog"` `aria-modal` with a Tab focus trap and focus
  restored to the trigger on close.
- A `role="status"` `aria-live="polite"` region announces each new round and matchup.

## CTA voice

- **Primary** (Start / Resume): filled accent pill, `--color-accent-ink` text.
- **Pick A / Pick B:** filled team pill, full width, at the panel foot.
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
- The match screen shows only the **round** (known up front), never an estimated
  percentage — the comparison count is choice-dependent.
