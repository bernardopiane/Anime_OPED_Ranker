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
