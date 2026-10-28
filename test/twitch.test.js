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

