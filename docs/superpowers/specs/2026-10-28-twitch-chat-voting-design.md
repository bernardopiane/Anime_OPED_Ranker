# Twitch chat voting — design

## Intent

Let a streamer run a ranking live with an audience. Chatters vote on the current
duel with `!1` (left) or `!2` (right), and the streamer uses those live totals
to make the final pick. Voting is advisory: chat never advances the bracket.

## Goals

- Connect to one Twitch channel by typing its name; no login, token, or server.
- Read chat commands and show a live count for each side of the current duel.
- Open voting automatically whenever a new duel appears; no time limit.
- Keep the streamer in control: only **Pick A / Pick B** records a winner.
- Work exactly as today when chat voting is not connected.
- Keep the app static, zero-dependency, and ES-module based.

## Non-goals

- Sending messages to Twitch chat, moderation, or reading anything except chat.
- Auto-advancing the tournament, timed rounds, or weighted/paid votes.
- OAuth, Twitch EventSub, a backend, or a client secret.
- Persisting vote counts across reloads or showing vote history on the results
  screen.
- Authenticating the streamer. The existing app has no accounts; the person
  operating the page is the admin.

## Anti-goals

- Chat must never be able to pick the winner on its own.
- A vote must never count toward a different duel than the one on screen.
- A chat message must never be rendered as HTML or stored as a transcript.
- A dropped connection must not lose the current tournament or freeze the app.

## Constraints

- `index.html`, `app.js`, `styles.css`, and `src/*.js` with no build step.
- `node --test` for tests.
- Design system in `design.md`: existing tokens, duotone team colours, system
  fonts, reduced-motion behaviour, 320 px mobile support.
- Only the anonymous Twitch IRC WebSocket is used:
  `wss://irc-ws.chat.twitch.tv:443`.
- Anonymous read-only IRC is not the officially recommended Twitch path. Keep
  it behind a narrow module so it can be replaced by a relay later.

## Approaches considered

1. **Direct anonymous IRC WebSocket (chosen).** Browser opens the Twitch IRC
   socket, requests `twitch.tv/tags`, joins `#channel`, and reads `PRIVMSG`.
   Small custom parser and vote counter in `src/`. No backend, token, or
   dependency. Trade-off: unofficial read-only access; needs reconnect/backoff
   and a clear connection status.
2. **tmi.js from a CDN.** Less parser code, but adds a runtime dependency and a
   legacy library for little benefit. Rejected.
3. **Own relay using EventSub + OAuth.** Official and more robust, and could
   post messages to chat, but adds hosting, secrets, and token handling.
   Rejected for this scope; the connection layer stays swappable.

## How it works

### Connection

- The start screen gets a **Twitch chat voting** field: channel input, a
  **Connect / Disconnect** button, and a status line.
- Accepted input: `name`, `@name`, `#name`, `twitch.tv/name`, or a full Twitch
  URL. Normalise to the lowercase login, `[a-z0-9_]{1,25}`. Invalid input shows
  an inline error and does not connect.
- On connect:
  1. Open `wss://irc-ws.chat.twitch.tv:443`.
  2. Send `CAP REQ :twitch.tv/tags twitch.tv/commands`.
  3. Send `NICK justinfan<random digits>`.
  4. Send `JOIN #<channel>`.
- Reply to every `PING` with the matching `PONG`; handle Twitch `RECONNECT`.
- Parse CRLF-delimited IRC messages. Count by Twitch **username**: use the
  lowercase login from the `:login!login@login.tmi.twitch.tv` prefix. Tags are
  requested for `NOTICE` handling, but `user-id` is not used for deduplication.
  Ignore messages whose channel does not match the joined channel.
- A connection counts as successful when the server confirms the join with the
  `366` (end of `/NAMES`) reply for the requested channel. `JOIN` alone is not
  enough. If the socket opens but no `366` arrives within 10 seconds, close and
  retry.
- Reconnect automatically after an unexpected close or error, with backoff
  (1 s, 2 s, 4 s, 8 s, 15 s, then 30 s), resetting to 1 s after a successful
  `366`. Retries are indefinite; after three consecutive failures the status
  adds "still trying — check the channel name". **Disconnect** stops
  reconnecting.
- Invalid channel input, a browser without WebSocket support, and an explicit
  Twitch `NOTICE` that the channel cannot be joined are terminal errors: show
  the reason and do not retry until the streamer presses Connect again.
- The channel is saved in `localStorage` (key `oped-twitch-channel`) and
  prefilled next time. The app does not connect on page load by itself; the
  streamer presses Connect.
- Status values shown to the user: not connected, connecting, connected to
  `#name`, reconnecting in `N`s, still trying, and a terminal error. The status
  is a polite live region.

### Votes

- A poll exists only while a duel is on screen. It is created when
  `renderMatch()` renders a matchup and discarded when the streamer picks,
  undoes, pauses, resets, or reaches the results screen.
- A message counts only when:
  - the match screen is visible and a poll exists;
  - it is a `PRIVMSG` from the joined channel;
  - its **first two characters** are `!1` or `!2`. Anything after those two
    characters is ignored, so `!1`, `!1please`, `!12`, and `!2 let's go` all
    count. A message that does not start with those exact two characters —
    `1`, `vote !1`, ` !1`, or `!3` — does not count. Leading whitespace is not
    trimmed: the message must start with the command.
- One ballot per Twitch **username** (login, lowercased so casing cannot create
  a duplicate). A later vote replaces the earlier one. Repeating the same vote
  changes nothing.
- The streamer's own chat messages count like anyone else's; no bot filtering.
- Counts are derived from ballots: `a`, `b`, `total`, and percentages. With no
  votes both counts are `0` and both bars are empty. Percentages are rounded so
  they total 100 when at least one vote exists.
- Votes are not persisted. Reloading the page keeps the tournament through the
  existing save, but the current poll starts at zero.
- **Clear votes** resets the current poll without changing the tournament.
  **Undo** restores the previous matchup with a fresh poll (old ballots are not
  restored).

### Admin decision

The existing **Pick A / Pick B** buttons and arrow-key picks remain the only
way to record a winner. Vote totals never call `recordWinner()`. The streamer
can pick at any time, even with zero votes, and can pick the side chat did not
favour.

## UI

### Start screen

Add a compact card below the start card's existing controls (or as a section
inside it):

- Label: **Twitch chat voting**
- Input placeholder: `your_channel`
- Button: **Connect** (becomes **Disconnect** while connected)
- Status line: `Not connected` / `Connected to #name` / `Reconnecting…` / error
- Hint: `Chat votes with !1 for the left and !2 for the right. You always make
  the final pick.`

While connected, the input is disabled; disconnect to change channels. The
existing Start / Resume / Reset buttons are unchanged. Starting without a
connection is still allowed.

Connection is configured on the start screen only in this version. To connect
mid-tournament, use **Pause & exit**, connect, then **Resume**; the tournament
is preserved. The match-screen chat chip is informational, not a connect
control.

### Match screen

- A small chat status chip in the HUD: `#channel` with a live dot, or `Chat off`.
- Each panel gets a vote meter under its head: a large tabular count, the word
  "votes", and the side's percentage. A thin team-coloured fill bar shows that
  side's share, so the two panels read as a tug of war.
- The `VS` medallion gets the total vote count in small mono type.
- Counts update in place; panels and videos are never re-rendered by a vote.
  DOM writes are throttled (about 100 ms) so a busy chat cannot cause layout
  thrash.
- A **Clear votes** outlined chip joins Undo / Preview / Pause.
- Vote meters are visible whenever a chat connection is active. If chat is not
  connected, they are absent and the HUD reads `Chat off`. If the connection
  drops mid-duel, the last counts remain visible while the status says
  reconnecting.
- Styling uses existing `--team`, `--team-strong`, `--team-soft`, `--team-ink`,
  rule, muted, mono, and radius tokens. No new colours. The layout must survive
  320 px width with the panel head wrapping instead of overflowing.

### Results screen

No change. Vote totals are advisory and are not exported or stored.

## Module boundaries

### `src/twitch.js`

Pure/socket adapter, no DOM:

- `normalizeChannel(input)` → lowercase login or `null`.
- `parseIrcMessage(line)` → `{ tags, prefix, command, params, trailing }` or
  `null` for a keepalive/blank line.
- `parseTags(raw)` → plain object.
- `parseVoteCommand(text)` → `'a'`, `'b'`, or `null`, based only on the first
  two characters.
- `createChatConnection({ channel, onPrivmsg, onStatus, WebSocketImpl })` →
  `{ connect, disconnect }`. `WebSocketImpl` is injectable for tests. The
  callback receives `{ username, text }` only for valid `PRIVMSG` lines in the
  joined channel, where `username` is the lowercased login.

### `src/voting.js`

Pure vote state, no DOM:

- `createPoll(key)` → `{ key, ballots }`.
- `castVote(poll, userId, side)` → new poll (ignores empty ids and invalid
  sides; latest vote wins).
- `tally(poll)` → `{ a, b, total, percentA, percentB }`.
- `clearPoll(poll)` → empty poll with the same key.

### `app.js`

Wires the connection and poll into the existing screens:

- Owns the connection instance, current poll, and last-known chat status.
- Creates a poll in `renderMatch()`, resets it on `pick()`, `undo`, pause,
  reset, and results.
- Accepts a `PRIVMSG` only when the match screen is visible and the poll exists.
- Updates only the vote meter text/widths, throttled.
- Renders connection status on the start screen and HUD.
- Keeps all existing tournament, media, playlist, and persistence behaviour
  intact.

## Tests

New `test/twitch.test.js`:

- Channel normalisation for `name`, `@name`, `#name`, URLs, uppercase, invalid
  characters, too-long names.
- Tag parsing, including empty values and quoted/escaped values as needed.
- IRC parsing of tagged and untagged `PRIVMSG`, `PING`, and unknown commands.
- Vote extraction by first two characters: `!1`, `!2`, `!1 please`, `!2 let's
  go`, `!1please`, and `!12` count; `1`, `vote !1`, ` !1`, `!3`, and empty do
  not.
- Connection with a fake `WebSocketImpl`: sends CAP/NICK/JOIN, replies to PING,
  filters other channels, marks connected on `366`, reconnects after close,
  retries a join timeout, and stops after disconnect.

New `test/voting.test.js`:

- One ballot per username; latest vote replaces; same vote is idempotent.
- Counts and percentages for 0 votes, one-sided votes, ties, and odd totals.
- Invalid side, missing username, and clear.

Manual verification:

- Connect to a real channel, send `!1` and `!2` from another account, confirm
  the counts, change a vote, clear, pick, and confirm the poll resets for the
  next duel.
- Disconnect the network, confirm reconnect/backoff and the status chip, then
  confirm votes resume.
- Check 320 / 375 / 768 px layouts and reduced motion.

## Documentation

Update `README.md` with the Twitch voting feature, the `!1` / `!2` commands, the
advisory rule, and the anonymous-connection caveat. Add a short section to
`design.md` for the vote meters and chat chip so future screens reuse them.

## Risks and mitigations

- **Anonymous IRC changes or is blocked.** The adapter is isolated in
  `src/twitch.js`; the UI only depends on its small interface. A relay can
  replace it without touching tournament or voting logic.
- **Chat spam / high volume.** Ballots are one per username, updates are
  throttled, and message parsing ignores oversized lines. No chat text is
  stored.
- **Stale votes during a transition.** The poll is replaced synchronously with
  the new matchup; anything arriving after the render belongs to the new duel.
- **Twitch ToS / rate limits.** Read-only, no sending, one socket per tab.

## Left to the builder

- Exact spacing and responsive details of the vote meter within the existing
  panel layout.
- The exact throttling interval and reconnect UI wording.
- Whether to show percentages, counts, or both in the compact mobile layout
  (counts are required; percentages may move to the accessible label).
