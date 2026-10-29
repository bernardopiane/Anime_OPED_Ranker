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
  winner. Results → read, copy, or download the finished ranking. Library → manage,
  edit, share, or activate a list.

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
| `--color-champion` | `oklch(83% 0.140 84)` | `oklch(78% 0.130 84)` |
| `--color-stage` | `oklch(11% 0.020 300)` | `oklch(94% 0.035 85)` |

Team A is an alias of `--color-accent`; Team B has its own `--team-b*` family. Panels
remap `--team*` per side, so one rule styles both. Semantic tokens (`--danger*`,
`--crown-*`, `--shadow-*`) follow the same axis.

The **champion family** (`--color-champion`, `-strong`, `-soft`, `-ink`, `-text`, plus
`--color-stage`) is the gold used only by the Results screen. It is a fill
(`--color-champion` + `--color-champion-ink` text) and a text tone
(`--color-champion-text`, ≥ 4.5:1 on paper); never gold body text on gold fill.

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
- Every interactive control keeps a **44×44 CSS-px hit target**, including the
  compact panel controls and the editor's row actions. Repetitive list actions and
  editor controls carry contextual `aria-label`s for screen readers.
- Panels carry a **3px team-coloured top rail** and a soft team-tinted top wash.

## Macrostructures

- **Start — Fight Card:** an uppercase kicker over the wordmark, one clear call to
  action, a statement footer.
- **Duel — Split Arena:** an `h1` **Duel** heading in the HUD, a round ladder, and a
  diptych of two duotone panels with `h2` contestant headings, a split-ring `VS`
  medallion, and a per-side **Pick** call to action. The arena rests on the clean
  neutral ground paper, elevating the panels as distinct cards with card shadows
  instead of leaking blotchy ambient radial washes into the margins.
- **Results — Awards Stage:** a heading over a spotlighted gold stage; the
  three-step podium stands on it (2nd left / 1st centre / 3rd right), then the
  index-first **Full ranking** board. This is the one screen that leaves the duel's
  warm/cool duotone for a gold "reveal" world — see below.

### Results — the reveal world

The payoff diverges from the duel on purpose. It is its own contained world:

- **Stage:** a `--color-stage` panel lit by two stacked `--color-champion` spotlights
  (a wide cone plus a tight core) with a bottom floor-glow, a masked dot field, a
  `--color-rule-strong` border, and a champion-tinted inset top edge.
- **Podium:** unchanged behaviour (top three, crowns, thumbnails). Each slot remaps
  `--medal` / `--medal-text` — `--crown-gold` (champion), `--crown-silver`,
  `--crown-bronze`. The 1st slot's crown and figure are larger, its figure carries a
  gold ring + glow, and its stand wears a `--color-champion` top rail. Stands are
  step blocks whose rank numeral uses `--color-champion-text` for the champion.
  Place labels: **Champion / Runner-up / Third place**.
- **Board:** an `h2` `Full ranking` rule, then rows with pill rank chips. Row 1 gets a
  `--color-champion` tint and a filled gold chip; ranks 2–3 take silver/bronze chip
  borders.
- **Actions:** centred; **Play again** is the gold `--color-champion` primary, Copy and
  Download CSV stay outlined chips.

## Lists — the library world

The library is a quiet, workmanlike room next to the duel, not a third arena. It
uses the same neutral ground, card surfaces, rules, and accent action as the Start
screen; no new colours, fonts, or motion are introduced.

- **Macro — Shelf:** an uppercase `YOUR LIBRARY` kicker over an `h1` **Lists**, one
  line of voice ("Build a YouTube ranking list, reuse it, or share it as one code."),
  then a toolbar with **Back** on the left and **New list** / **Import code** on the
  right. Below it, a vertical stack of list cards inside a borderless
  `--color-paper-2` layer (`--radius-lg`) — the list cards are the only bordered
  surfaces, so the panel never reads as a card inside a card.
- **List card:** a `--color-paper` surface with a `--color-rule` border and
  `--radius-md`. The head row pairs the list name (`--text-md`, wraps anywhere) with
  a mono uppercase pill badge — filled `--color-accent` + `--color-accent-ink` for
  **Active**, outlined `--color-paper-2` + `--color-muted` for **Starter**. The meta
  line is mono `--text-xs` in `--color-muted` ("12 videos"). The active card swaps
  its border for `--color-accent` and adds a 1px inset accent ring, so activation is
  legible without a dropdown.
- **Card actions:** a wrapped row of pill buttons at the card foot. **Use** is the
  filled accent primary and appears only on inactive lists; **Edit**, **Share**, and
  **Duplicate** / **Duplicate to edit** are outlined chips; **Delete** is an outlined
  danger chip. The starter offers no Delete and no Use while active.
- **Editor:** the same panel, swapped in place: toolbar with **Back to library**,
  **Duplicate**, and a mono video count, then the name field (capped at 32rem), the
  add-video form (URL + optional title, separated by rules above and below), and the
  numbered rows. Each row is a grid of a pill counter, two stacked fields, and a
  wrapped action group (up/down/remove); at ≤ 560px the actions drop under the fields
  and the panel padding tightens. The starter editor renders read-only: name and
  rows are disabled, the add form is hidden, and the status line explains **Duplicate
  to edit**.
- **Status line:** `role="status"` `aria-live="polite"` under the toolbar, sharing
  `--text-sm` / `--color-muted`; validation and structural warnings switch to
  `--color-danger`. Messages are terse and in-voice: "Title saved.", "Video removed.",
  "That video is already in this list.", "Link updated. The ranking was reset."
- **Share modal:** reuses the dialog shell at `min(42rem, 100%)`. Two `share-block`
  sections divided by a rule: export on top (mono, read-only textarea showing the
  `oped1:` code, note naming the list and count, **Copy code**), import below (mono
  textarea plus **Import**, note "Paste a code to add that list to your library.").
  The modal traps focus, closes on Escape/backdrop, and returns focus to the Share
  trigger. Imported lists are added without activating them.
- **Motion:** no bespoke animation. The library and editor arrive with the shared
  `.screen` reveal, the modal scales in with the existing `.modal-card` transition,
  and everything obeys `prefers-reduced-motion: reduce`.
- **Copy:** dry and practical — "The starter list is read-only. Duplicate it to make
  changes." · "A list needs a name." · "Enter a valid YouTube link." · "That code is
  not a valid list."

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

- One reveal per screen (`.screen` entrance) plus a light stagger on the Start card
  and a rise-in stagger for the three podium slots.
- **Incoming side:** when a pick replaces one panel, the changed panel slides in from
  its outer edge (`panel-enter-a` / `panel-enter-b`, `backwards` fill so hover-lift
  still works afterwards). The unchanged side is never re-rendered, so its video
  keeps playing — picks feel instant.
- Hover: panels deepen their border and lift a soft shadow (no surface tint, no
  transform, `@media (hover: hover)`).
- Instant focus ring: `:focus-visible` outline, no delay.
- Every animation is disabled under `prefers-reduced-motion: reduce`.

## Microinteractions

- Buttons dip 1px on `:active`; the primary CTA is a filled pill that deepens on hover.
- The per-side **Pick** button is a full-width, team-filled action pinned to the
  panel's foot — the explicit "this one" affordance.
- Panels deepen their border and shadow on hover; both the panel and its Pick
  button use the team colour.
- Results rows tint on hover; the champion's figure, stand rail, rank chip, and row
  all carry the gold `--color-champion` treatment.
- Theme chip swaps sun/moon icon per active theme.

## Twitch chat voting

An optional audience layer that never changes the duel's hierarchy: the Pick button
stays the loudest thing on screen.

- **Start card:** a compact **Twitch chat voting** card below the start card's
  controls, on `--color-paper-2` with `--color-rule`, `--radius-lg`, and the shared
  card shadow. A pill input (`your_channel`) sits beside the **Connect** button, which
  becomes **Disconnect** while active. The status line is a polite live region with
  five states: **Not connected**, **Connecting…**, **Connected to #name**,
  **Reconnecting in Ns…** (with "still trying" after repeated failures), and a
  terminal error in `--color-danger`. While active the input is disabled.
- **HUD chat chip:** a mono, pill-shaped `--color-paper-2` chip that reads **Chat
  off** at rest, **#channel** with an `--color-accent` live dot when connected,
  **Connecting… / Reconnecting…** in the muted tone otherwise, and **Chat error** in
  `--color-danger`. Its dot is a pseudo-element, so the text is the only content.
- **Vote meter:** inside each panel, under the head row and above the media. A
  `--team-soft` surface with a `--team` border and `--radius-sm`, showing the count in
  mono `--team-strong` tabular figures, a small **votes** unit, the percentage in
  `--color-ink-soft`, and a 4px pill fill bar in `--team` that animates width with
  `--dur-short` / `--ease-out`. Meters are hidden when chat is off.
- **VS total:** the split-ring medallion stays decorative and `aria-hidden`; the total
  ("N votes") sits beneath it as mono `--text-xs` in `--color-muted`, outside the
  `aria-hidden` medallion so it is readable.
- **Clear votes:** an outlined chip in the match actions, shown only while chat is
  active, resetting the current poll without touching tournament progress.
- **Advisory rule:** votes are colour and information only. Pick A / Pick B remain the
  sole winner control, so the team-filled Pick pill always outranks the meter. Meter
  and VS never use the champion gold.
- **Copy:** a one-line hint — "Chat votes with `!1` for the left and `!2` for the
  right. You always make the final pick." — in `--color-muted`, with `!1` / `!2` set
  in mono on a `--color-paper-3` chip.
- **Tokens only:** `--team*` via the panel remap, `--color-rule`, `--color-muted`,
  `--color-ink-soft`, `--color-paper-2/3`, `--color-danger`, `--font-mono`,
  `--radius-sm/pill`, and the existing radii. No new colours or fonts.
- **Motion:** only the fill bar transitions; it is disabled under
  `prefers-reduced-motion: reduce` along with the rest.

## Keyboard & assistive tech

- `←` / `→` pick A / B; `U` toggles mute on side A; `Esc` closes the preview dialog.
- Panels are `role="group"` with the entry title as their accessible name; the Pick
  button carries `aria-label="Pick {title}"`, so picking is reachable by Tab + Enter.
- The preview is a `role="dialog"` `aria-modal` with a Tab focus trap and focus
  restored to the trigger on close.
- The share modal follows the same dialog contract: Tab cycles its controls, Escape
  and the backdrop close it, and focus returns to the Share button.
- Library actions are real buttons in source order; the editor status, share status,
  and start-screen status are polite live regions, so saves and validation failures
  are announced without moving focus.
- A `role="status"` `aria-live="polite"` region announces each new round and matchup.
- Each vote meter carries an `aria-label` with its side, vote count, and percentage;
  the chat status line and HUD chip are polite live regions.

## CTA voice

- **Primary** (Start / Resume): filled accent pill, `--color-accent-ink` text. On the
  Results screen, **Play again** is the filled gold `--color-champion` primary.
- **Pick A / Pick B:** filled team pill, full width, at the panel foot.
- **Secondary** (Reset, Copy, Download, Undo, Preview, Pause, Clear votes): outlined chip.
- **Library:** **Use** is the filled accent primary for an inactive list; **Edit**,
  **Share**, and **Duplicate** stay outlined, and **Delete** is outlined danger.

## Copy

Honest, warm, dry-humoured. No invented metrics, no hype. Examples: "Rank every opening
and ending, one duel at a time." · "Everything you ranked, best first." ·
"Built for the eternal rewatch — rank the bangers, settle the debates." ·
"Chat votes with `!1` for the left and `!2` for the right. You always make the final pick."

## Constraints carried forward

- `test/styles.test.js` layout contracts are preserved (app width cap, 100dvh match
  screen, letterboxed media, phone stacking).
- No inline colours/fonts in `styles.css` — tokens only.
- Mobile-ready at 320 / 375 / 414 / 768.
- The match screen shows only the **round** (known up front), never an estimated
  percentage — the comparison count is choice-dependent.
