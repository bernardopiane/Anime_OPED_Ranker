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
