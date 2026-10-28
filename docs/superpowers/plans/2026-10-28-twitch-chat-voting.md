# Twitch Chat Voting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let chatters vote `!1` / `!2` on the current duel while the streamer keeps the final pick.

**Architecture:** A zero-dependency Twitch IRC WebSocket adapter feeds a pure, username-keyed poll. The existing tournament engine is untouched: only the streamer's Pick A / Pick B calls `recordWinner()`. Vote counts update in place so videos keep playing.

**Tech Stack:** Vanilla ES modules, browser WebSocket, `node --test`, existing design tokens.

**Spec:** `docs/superpowers/specs/2026-10-28-twitch-chat-voting-design.md`

## Global Constraints

- No dependencies, build step, backend, OAuth token, or Twitch client secret.
- Connect only to `wss://irc-ws.chat.twitch.tv:443`.
- Vote command = the message's first two characters are `!1` or `!2`; trailing text is ignored; leading whitespace is not trimmed.
- Ballots are keyed by lowercased Twitch username; latest vote replaces the previous one.
- Only `recordWinner()` advances the tournament. Chat can never auto-pick.
- Votes open automatically with every duel, have no time limit, and reset per duel.
- Existing app behaviour, tournament persistence, media, playlist, and accessibility must keep working.
- Use existing `tokens.css` variables only; no inline colours in `styles.css`.

## Review Focus

- `!1please`, `!12`, and `!2 let's go` count; ` !1`, `vote !1`, `1`, and `!3` do not. Tested in Task 1.
- One user switching `!1` → `!2` moves a ballot instead of adding one; casing does not duplicate. Tested in Task 3.
- A vote arriving after Pick must not leak into the next duel; `pick()` discards the poll before `recordWinner()` and `renderMatch()` creates a new one synchronously. Verified manually in Task 5.
- A dropped connection must not lose the tournament; counts stay visible while reconnecting and resume after `366`. Covered in Task 2 and manual checks in Task 5.
- With chat off, the app and its 320 px layout must look and behave as before. Manual checks in Tasks 4–6.

---

### Task 1: Channel, IRC, and vote parsing

**Files:**
- Create: `src/twitch.js`
- Test: `test/twitch.test.js`

**Interfaces:**
- Produces:
  - `normalizeChannel(input: unknown) -> string | null` — lowercase login, `[a-z0-9_]{1,25}`.
  - `parseTags(raw: string) -> Record<string, string>` — IRCv3 tag unescaping.
  - `parseIrcMessage(line: string) -> { tags, prefix, command, params, trailing } | null`.
  - `parseVoteCommand(text: unknown) -> 'a' | 'b' | null`.

- [ ] **Step 1: Write the failing tests**

Create `test/twitch.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChannel,
  parseTags,
  parseIrcMessage,
  parseVoteCommand,
} from '../src/twitch.js';

test('normalizeChannel accepts names and Twitch URLs', () => {
  assert.equal(normalizeChannel('Example_Channel'), 'example_channel');
  assert.equal(normalizeChannel('@Example_Channel'), 'example_channel');
  assert.equal(normalizeChannel('#Example_Channel'), 'example_channel');
  assert.equal(normalizeChannel('twitch.tv/Example_Channel'), 'example_channel');
  assert.equal(normalizeChannel('https://www.twitch.tv/Example_Channel?x=1'), 'example_channel');
  assert.equal(normalizeChannel('  Example_Channel  '), 'example_channel');
});

test('normalizeChannel rejects invalid names and URLs', () => {
  for (const value of ['', '   ', 'bad-name', 'a'.repeat(26), 'example.com/name', null, 42]) {
    assert.equal(normalizeChannel(value), null, String(value));
  }
});

test('parseTags reads and unescapes IRCv3 tags', () => {
  assert.deepEqual(parseTags('msg-id=msg_channel_suspended;display-name=A\\sB;empty='), {
    'msg-id': 'msg_channel_suspended',
    'display-name': 'A B',
    empty: '',
  });
});

test('parseIrcMessage parses tagged PRIVMSG', () => {
  const message = parseIrcMessage(
    '@user-id=42;display-name=Alice :alice!alice@alice.tmi.twitch.tv PRIVMSG #chan :!1 let\'s go',
  );
  assert.deepEqual(message, {
    tags: { 'user-id': '42', 'display-name': 'Alice' },
    prefix: 'alice!alice@alice.tmi.twitch.tv',
    command: 'PRIVMSG',
    params: ['#chan'],
    trailing: "!1 let's go",
  });
});

test('parseIrcMessage parses PING and join confirmation', () => {
  assert.deepEqual(parseIrcMessage('PING :tmi.twitch.tv'), {
    tags: {},
    prefix: null,
    command: 'PING',
    params: [],
    trailing: 'tmi.twitch.tv',
  });
  assert.equal(
    parseIrcMessage(':tmi.twitch.tv 366 justinfan123 #chan :End of /NAMES list').command,
    '366',
  );
  assert.equal(parseIrcMessage(''), null);
});

test('parseVoteCommand checks only the first two characters', () => {
  assert.equal(parseVoteCommand('!1'), 'a');
  assert.equal(parseVoteCommand('!1please'), 'a');
  assert.equal(parseVoteCommand('!12'), 'a');
  assert.equal(parseVoteCommand('!2 let\'s go'), 'b');
  assert.equal(parseVoteCommand('!2'), 'b');
  for (const value of ['1', 'vote !1', ' !1', '!3', '', null]) {
    assert.equal(parseVoteCommand(value), null, String(value));
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/twitch.test.js`
Expected: FAIL because `../src/twitch.js` does not exist.

- [ ] **Step 3: Implement the parsing module**

Create `src/twitch.js` with the four exports above. Implementation notes:

- `normalizeChannel` trims, strips `http(s)://`, an optional `www.`/`m.` `twitch.tv/` prefix, then a leading `@` or `#`; takes the first path segment; lowercases; validates `/^[a-z0-9_]{1,25}$/`.
- `parseTags` splits on `;`, splits each pair at the first `=`, and unescapes `\s` → space, `\:` → `;`, `\\` → `\`, `\r`, `\n`.
- `parseIrcMessage` handles an optional `@tags` prefix, optional `:prefix`, an optional ` :trailing` segment, and returns `null` for blank input.
- `parseVoteCommand` returns `'a'` when `text` is a string starting with `'!1'`, `'b'` when it starts with `'!2'`, otherwise `null` (guard non-strings first). Do not trim.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/twitch.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/twitch.js test/twitch.test.js
git commit -m "Add Twitch IRC parsing helpers"
```

---

### Task 2: Twitch IRC connection adapter

**Files:**
- Modify: `src/twitch.js`
- Test: `test/twitch.test.js`

**Interfaces:**
- Consumes: `normalizeChannel`, `parseIrcMessage` from Task 1.
- Produces: `createChatConnection({ channel, onPrivmsg, onStatus, WebSocketImpl, setTimeoutImpl, clearTimeoutImpl }) -> { connect, disconnect }`.
  - `onPrivmsg({ username, text })`, where `username` is the lowercased login.
  - `onStatus({ state, channel, delay, attempt, message })`, where `state` is `'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'`.

- [ ] **Step 1: Write the failing connection tests**

Append to `test/twitch.test.js`:

```js
import { createChatConnection } from '../src/twitch.js';

class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    FakeSocket.instances.push(this);
  }
  send(data) { this.sent.push(data); }
  close() { this.closed = true; this.onclose?.(); }
}

function makeConnection(overrides = {}) {
  FakeSocket.instances = [];
  const statuses = [];
  const messages = [];
  const timeouts = [];
  const connection = createChatConnection({
    channel: 'chan',
    onPrivmsg: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    WebSocketImpl: FakeSocket,
    setTimeoutImpl: (fn, ms) => { const id = { fn, ms }; timeouts.push(id); return id; },
    clearTimeoutImpl: (id) => { const i = timeouts.indexOf(id); if (i >= 0) timeouts.splice(i, 1); },
    ...overrides,
  });
  return { connection, statuses, messages, timeouts };
}

function join(socket) {
  socket.onopen?.();
  socket.onmessage?.({ data: ':tmi.twitch.tv 366 justinfan123 #chan :End of /NAMES list\r\n' });
}

test('connection sends CAP, NICK, and JOIN and reports connected on 366', () => {
  const { connection, statuses } = makeConnection();
  connection.connect();
  const socket = FakeSocket.instances[0];
  assert.equal(socket.url, 'wss://irc-ws.chat.twitch.tv:443');
  socket.onopen?.();
  assert.ok(socket.sent.some((line) => line.startsWith('CAP REQ')));
  assert.ok(socket.sent.some((line) => line.startsWith('NICK justinfan')));
  assert.ok(socket.sent.includes('JOIN #chan\r\n'));
  socket.onmessage?.({ data: ':tmi.twitch.tv 366 justinfan123 #chan :End of /NAMES list\r\n' });
  assert.equal(statuses.at(-1).state, 'connected');
  connection.disconnect();
});

test('connection answers PING and forwards matching PRIVMSG only', () => {
  const { connection, messages } = makeConnection();
  connection.connect();
  const socket = FakeSocket.instances[0];
  join(socket);
  socket.onmessage?.({ data: 'PING :tmi.twitch.tv\r\n' });
  assert.ok(socket.sent.includes('PONG :tmi.twitch.tv\r\n'));
  socket.onmessage?.({ data: ':Alice!alice@alice.tmi.twitch.tv PRIVMSG #other :!1\r\n' });
  socket.onmessage?.({ data: ':Alice!alice@alice.tmi.twitch.tv PRIVMSG #chan :!2 yes\r\n' });
  assert.deepEqual(messages, [{ username: 'alice', text: '!2 yes' }]);
  connection.disconnect();
});

test('connection reconnects after a close and stops after disconnect', () => {
  const { connection, statuses, timeouts } = makeConnection();
  connection.connect();
  const first = FakeSocket.instances[0];
  first.onclose?.();
  assert.equal(statuses.at(-1).state, 'reconnecting');
  assert.equal(statuses.at(-1).delay, 1000);
  const retry = timeouts.find((t) => t.ms === 1000);
  retry.fn();
  assert.equal(FakeSocket.instances.length, 2);
  connection.disconnect();
  assert.equal(FakeSocket.instances[1].closed, true);
  const before = statuses.length;
  FakeSocket.instances[1].onclose?.();
  assert.equal(statuses.length, before);
});

test('connection retries when the join confirmation never arrives', () => {
  const { connection, statuses, timeouts } = makeConnection();
  connection.connect();
  const socket = FakeSocket.instances[0];
  socket.onopen?.();
  const joinTimer = timeouts.find((t) => t.ms === 10000);
  assert.ok(joinTimer);
  joinTimer.fn();
  assert.equal(socket.closed, true);
  assert.equal(statuses.at(-1).state, 'reconnecting');
  connection.disconnect();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/twitch.test.js`
Expected: FAIL because `createChatConnection` is not exported.

- [ ] **Step 3: Implement `createChatConnection`**

Add to `src/twitch.js`:

- Constants: `IRC_URL`, `JOIN_TIMEOUT_MS = 10000`, `RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000]`.
- Random nickname `justinfan` + five digits.
- Use `socket.onopen`, `socket.onmessage`, `socket.onerror`, `socket.onclose`.
- On open: send `CAP REQ :twitch.tv/tags twitch.tv/commands\r\n`, `NICK ...\r\n`, `JOIN #channel\r\n`, and start the 10 s join timer.
- `connect()` emits `{ state: 'connecting', channel }` before opening the socket. Repeated calls while a socket exists are ignored.
- On `PING`: send `PONG :<trailing>\r\n`.
- On `366` for `#channel`: clear join timer, set `attempt = 0`, mark joined, emit `connected`.
- On `PRIVMSG` for `#channel` while joined: emit `{ username: prefixLogin.toLowerCase(), text: trailing }`.
- On `NOTICE`: emit a terminal `error` only for `msg_channel_suspended`, `msg_banned`, or text containing `Login authentication failed`; do not retry those.
- On unexpected close/error or join timeout: call one guarded `scheduleReconnect()` that emits `reconnecting` with `delay`/`attempt` and schedules `openSocket` again. Guard against double scheduling: `onerror` is usually followed by `onclose`, and closing from the join timeout fires `onclose`. Ignore events from stale sockets (`if (socket !== current) return`) and never schedule two timers at once.
- `disconnect()` sets a manual flag, clears timers, removes handlers, closes the socket, and emits `idle`. Its `onclose` must not schedule a reconnect.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/twitch.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/twitch.js test/twitch.test.js
git commit -m "Connect to Twitch IRC read-only"
```

---

### Task 3: Username-keyed vote state

**Files:**
- Create: `src/voting.js`
- Test: `test/voting.test.js`

**Interfaces:**
- Produces:
  - `createPoll(key: string) -> { key: string, ballots: Map<string, 'a' | 'b'> }`.
  - `castVote(poll, username: string, side: 'a' | 'b') -> poll` — immutable; latest vote wins.
  - `tally(poll) -> { a, b, total, percentA, percentB }`.
  - `clearPoll(poll) -> poll`.

- [ ] **Step 1: Write the failing tests**

Create `test/voting.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoll, castVote, tally, clearPoll } from '../src/voting.js';

test('one ballot per username, latest vote wins', () => {
  let poll = createPoll('duel-1');
  poll = castVote(poll, 'Alice', 'a');
  poll = castVote(poll, 'alice', 'b');
  poll = castVote(poll, 'bob', 'a');
  assert.deepEqual(tally(poll), { a: 1, b: 1, total: 2, percentA: 50, percentB: 50 });
});

test('repeating the same vote is idempotent', () => {
  const poll = castVote(createPoll('duel-1'), 'alice', 'a');
  assert.equal(castVote(poll, 'ALICE', 'a'), poll);
});

test('tally handles empty, one-sided, and odd totals', () => {
  assert.deepEqual(tally(createPoll('x')), { a: 0, b: 0, total: 0, percentA: 0, percentB: 0 });
  let poll = createPoll('x');
  poll = castVote(poll, 'a', 'a');
  poll = castVote(poll, 'b', 'a');
  poll = castVote(poll, 'c', 'b');
  assert.deepEqual(tally(poll), { a: 2, b: 1, total: 3, percentA: 67, percentB: 33 });
});

test('invalid votes are ignored and clear empties the poll', () => {
  let poll = createPoll('x');
  poll = castVote(poll, '', 'a');
  poll = castVote(poll, 'alice', 'c');
  assert.equal(tally(poll).total, 0);
  poll = castVote(poll, 'alice', 'a');
  const cleared = clearPoll(poll);
  assert.equal(cleared.key, 'x');
  assert.equal(tally(cleared).total, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/voting.test.js`
Expected: FAIL because `../src/voting.js` does not exist.

- [ ] **Step 3: Implement the vote state**

Create `src/voting.js`. Use a `Map` keyed by `String(username).toLowerCase()`. Return a new poll and a copied `Map` for changed votes; return the same poll when the ballot is unchanged. `tally` computes `percentA = Math.round((a / total) * 100)` and `percentB = 100 - percentA` when `total > 0`; otherwise both are `0`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/voting.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/voting.js test/voting.test.js
git commit -m "Add username-keyed vote tally"
```

---

### Task 4: Start-screen Twitch connection UI

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`

**Interfaces:**
- Consumes: `normalizeChannel`, `createChatConnection` from Tasks 1–2.
- Produces: a connected `chat` instance, `chatState`, `chatChannel`, and a saved channel in `localStorage` under `oped-twitch-channel`.

- [ ] **Step 1: Add the start-screen markup**

In `index.html`, after `</div>` closing `.start-card` and before `<details id="playlist-tool">`, add:

```html
<section class="twitch-card" aria-labelledby="twitch-title">
  <p id="twitch-title" class="twitch-title">Twitch chat voting</p>
  <div class="twitch-row">
    <label class="twitch-field">
      <span class="sr-only">Twitch channel</span>
      <input id="twitch-channel" type="text" placeholder="your_channel" autocomplete="off" spellcheck="false" />
    </label>
    <button id="twitch-connect-btn" type="button">Connect</button>
  </div>
  <p id="twitch-status" class="twitch-status" role="status" aria-live="polite">Not connected</p>
  <p class="twitch-help">
    Chat votes with <code>!1</code> for the left and <code>!2</code> for the right. You always make the final pick.
  </p>
</section>
```

- [ ] **Step 2: Add the matching styles**

In `styles.css`, add `.twitch-card`, `.twitch-title`, `.twitch-row`, `.twitch-field`, `.twitch-field input`, `.twitch-status`, `.twitch-status.is-error`, `.twitch-help`, and `.twitch-help code` using only existing tokens. Match `.start-card` spacing, paper-2 surface, rule border, radius, and shadow. Keep the row wrapping at narrow widths.

- [ ] **Step 3: Wire the connection in `app.js`**

Import `normalizeChannel` and `createChatConnection` at the top of `app.js`. Add the channel storage key (`oped-twitch-channel`), saved-channel read/write helpers wrapped in `try/catch`, and module state for `chat`, `chatState`, and `chatChannel`. Add `initTwitch()` and call it from the end of `init()`, immediately before `showScreen('start')`:

- Prefill `#twitch-channel` from `localStorage`/`normalizeChannel`.
- On Connect: if a connection is active, call `disconnect()`, set `chat = null`, and stop. Otherwise normalize the input; on failure show `Enter a valid Twitch channel name.` in `#twitch-status` plus `.is-error`; on success clear the error, save the channel, create the connection, store it in `chat`, and call `connect()`.
- Allow Enter in the input to trigger Connect.
- Map status events to `#twitch-status`: `Not connected` (idle), `Connecting…`, `Connected to #name`, `Reconnecting in Ns…` (and `Still trying — check the channel name.` when `attempt >= 3`), or the terminal error message. Toggle `.is-error` for `error`.
- Map the same state to the Connect/Disconnect label (`Disconnect` while connecting/connected/reconnecting, `Connect` otherwise) and disable the input while a connection is active.
- On `connected`, save the normalized channel and record `chatChannel`.
- On `idle`, restore the Connect button and editable input.
- Keep `chatState` and `chatChannel` module-level so Task 5 can read them; Task 5 will extend the same `onStatus` handler to update the HUD chip.

- [ ] **Step 4: Run the suite and manually verify**

Run: `node --test`
Expected: all existing tests plus the new parser/connection/voting tests PASS.

Manual: serve with `node serve.js 8000`, open the page, connect to a real channel, confirm the status changes to `Connected to #name`; disconnect and confirm the input becomes editable. Start a tournament and confirm nothing else changed.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css app.js
git commit -m "Add Twitch chat connection controls"
```

---

### Task 5: Live vote meters and poll lifecycle

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`

**Interfaces:**
- Consumes: `createChatConnection`'s `onPrivmsg`, `parseVoteCommand` from Task 1, and `createPoll`, `castVote`, `tally`, `clearPoll` from Task 3.
- Produces: a per-duel `chatPoll`, vote meter DOM in each panel, total in the VS badge, and `Clear votes`.

- [ ] **Step 1: Add the match-screen markup**

In `index.html`:

- Inside `.hud`, after the `#match-status` paragraph (the sr-only live region), add:
  ```html
  <p id="chat-status" class="chat-status" role="status" aria-live="polite">Chat off</p>
  ```
- Replace the whole `.vs-badge` element with:
  ```html
  <div class="vs-badge">
    <span class="vs-medallion" aria-hidden="true">VS</span>
    <span id="vs-votes" class="vs-votes hidden"></span>
  </div>
  ```
  The medallion stays decorative, but the total is no longer inside an `aria-hidden` wrapper.
- Add `Clear votes` to `.match-actions` after Undo and before `Preview ranking`:
  ```html
  <button id="clear-votes-btn" class="hidden">Clear votes</button>
  ```

- [ ] **Step 2: Add the vote meter markup in `renderPanel`**

In `renderPanel` (`app.js:469`), after `panel.appendChild(head)` and before the media branch, create:

```html
<div class="vote-meter hidden">
  <span class="vote-count">0</span>
  <span class="vote-unit">votes</span>
  <span class="vote-percent">0%</span>
  <span class="vote-bar"><span class="vote-fill"></span></span>
</div>
```

Use `document.createElement` and `textContent`, never chat text. Note that `renderPanel` early-returns when `panel.dataset.sig` is unchanged, so the meter element survives transitions that reuse a panel; `updateVoteVisibility()` must tolerate a missing meter rather than assuming it was just created.

- [ ] **Step 3: Add the styles**

In `styles.css`:

- `.vote-meter` uses the panel's `--team-soft` surface, `--team` border/fill, a two-row grid (count/unit/percent, then bar), `--radius-sm`, and `--space-*` tokens.
- `.vote-count` uses `--font-mono`, tabular numerals, and `--text-md`; `.vote-unit` and `.vote-percent` use `--text-xs` and muted/ink-soft tokens.
- `.vote-bar` is a 4 px `--radius-pill` track; `.vote-fill` is `--team` with a width transition under `--dur-short` and is disabled by the existing reduced-motion block.
- `.hidden` already exists with `display: none !important`; do not add `[hidden]` rules.
- `.vs-votes` is mono, `--text-xs`, muted, tabular numerals.
- Change `.vs-badge` to `flex-direction: column` with a small gap; scope the old medallion rules currently on `.vs-badge span` to `.vs-medallion` and update the mobile override that targets the old span.
- `.chat-status` is a small mono chip with a dot via `::before` (rule-strong default, accent when `.is-live`, danger when `.is-error`); add `flex-wrap: wrap` to `.hud` so it cannot overflow at 320 px.

- [ ] **Step 4: Wire the poll lifecycle in `app.js`**

- Import `parseVoteCommand` and `createPoll`, `castVote`, `tally`, `clearPoll`. Add module state `chatPoll = null` and `voteRenderTimer = null`.
- Add `chatActive()` returning true for `connecting`, `connected`, or `reconnecting`; add `chatLive()` returning true only for `connected`.
- In `renderMatch()` (`app.js:677`), after the panels render, set `chatPoll = createPoll(`${state.tournament.winners.length}:${matchup.a}:${matchup.b}`)`, then call `renderVotesNow()` and `updateVoteVisibility()`.
- In the `onPrivmsg` handler created in Task 4, ignore anything unless `chatLive()`, `chatPoll` exists, and `#match-screen` is not `.hidden`; run `parseVoteCommand(text)`; if it returns a side, set `chatPoll = castVote(chatPoll, username, side)` and schedule the throttled render. Do not call `recordWinner()`.
- `renderVotesNow()` reads `tally(chatPoll)`, updates `#vs-votes` (`N votes`), each panel's `.vote-count`, `.vote-percent`, and `.vote-fill` width, and each meter's `aria-label` (`A: N votes, P%` / `B: N votes, P%`). It never re-renders a panel or video.
- Throttle with a single `voteRenderTimer`: on the first vote after idle, render immediately and set a 100 ms timer; further votes within the window only update state. Clear the timer when the poll is discarded so a late render cannot touch the next duel.
- `Clear votes` replaces the poll with `clearPoll(chatPoll)` and re-renders. It does not change the tournament and does not close the connection.
- Discard the poll and clear the timer at these exact hooks:
  - `pick()` (`app.js:653`) before `recordWinner()`;
  - Undo (`app.js:247`) before `renderMatch()`;
  - Pause & exit (`app.js:253`);
  - Reset and `useItems` (`app.js:143`, `app.js:209`) so no votes survive a new item set;
  - `renderResults()` (`app.js:854`) and Play again (`app.js:897`).
  `renderMatch()` is the only place that creates a poll, so the next duel always starts at zero.
- `updateVoteVisibility()` hides each `.vote-meter`, `#vs-votes`, and `#clear-votes-btn` when `chatActive()` is false; shows them when chat is connecting/connected/reconnecting. It runs after `renderMatch()` and on every status change. If the connection drops mid-duel, existing counts stay visible while the chip says reconnecting.
- In the Task 4 `onStatus` handler, also map the HUD chip: `#channel` with `.is-live`, `Connecting…`, `Reconnecting…`, `Chat error` with `.is-error`, or `Chat off`. Prefer updating only the chip text/classes; never rebuild the HUD.

- [ ] **Step 5: Run the suite and manually verify**

Run: `node --test`
Expected: all tests PASS.

Manual:

1. Connect to a channel; start a duel; send `!1`, `!1please`, `!12`, `!2 let's go` from another account. Confirm A/B counts and the VS total.
2. Send `!1` then `!2` from the same account; confirm the ballot moves, not duplicates.
3. Confirm ` !1`, `vote !1`, and `!3` do nothing.
4. Pick a winner; confirm the next duel starts at zero. Undo; confirm a fresh zero poll for the restored duel.
5. Disconnect the network; confirm the counts stay visible, the HUD says reconnecting, and votes resume after reconnect. Disconnect manually; confirm meters and Clear votes hide.
6. Check 320 / 375 / 768 px and reduced motion.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css app.js
git commit -m "Show live Twitch votes on the duel screen"
```

---

### Task 6: Documentation and final verification

**Files:**
- Modify: `README.md`
- Modify: `design.md`

- [ ] **Step 1: Update `README.md`**

Add a feature bullet for live Twitch chat voting. Add a short usage section: connect with the channel name, `!1` left / `!2` right, one ballot per username, latest vote wins, votes are advisory, the streamer always picks, votes reset per duel and do not persist. Add `src/twitch.js` and `src/voting.js` to the project structure. Note the anonymous read-only caveat.

- [ ] **Step 2: Update `design.md`**

Add a **Twitch chat voting** section describing:

- the start-screen card and its status states;
- the per-panel vote meter (count, percentage, team fill) and VS total;
- the HUD chat chip;
- the advisory rule and `!1` / `!2` copy;
- reuse of `--team*`, rule, muted, mono, and radius tokens.

- [ ] **Step 3: Run the complete suite**

Run: `node --test`
Expected: all tests PASS.

- [ ] **Step 4: Final manual check**

Serve with `node serve.js 8000`. Confirm the app starts without a Twitch connection, the existing tournament flow still works, the start-screen card does not crowd the 320 px layout, and the results screen is unchanged.

- [ ] **Step 5: Commit**

```bash
git add README.md design.md
git commit -m "Document Twitch chat voting"
```
