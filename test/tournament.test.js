import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTournament,
  nextMatchup,
  recordWinner,
  getRanking,
  getProgress,
  isComplete,
  undo,
} from '../src/tournament.js';

const choose = (a, b) => (a < b ? a : b);

function playAll(ids) {
  let s = createTournament(ids);
  let m;
  while ((m = nextMatchup(s))) s = recordWinner(s, choose(m.a, m.b));
  return s;
}

test('sorts ids into ascending preference order', () => {
  const ids = [5, 3, 9, 1, 7, 2, 8, 0, 6, 4];
  const sorted = getRanking(playAll(ids));
  assert.deepEqual(sorted, [...ids].sort((a, b) => a - b));
});

test('handles an odd number of items', () => {
  const ids = [4, 1, 3, 2, 5];
  const sorted = getRanking(playAll(ids));
  assert.deepEqual(sorted, [1, 2, 3, 4, 5]);
});

test('reports completion and returns null matchup when done', () => {
  let s = createTournament([3, 1, 2]);
  assert.equal(isComplete(s), false);
  s = playAll([3, 1, 2]);
  assert.equal(isComplete(s), true);
  assert.equal(nextMatchup(s), null);
});

test('recordWinner rejects a winner that is not in the matchup', () => {
  const s = createTournament([1, 2, 3]);
  assert.throws(() => recordWinner(s, 999), /Winner must be one of the current matchup/);
});

test('undo reverts the last decision', () => {
  let s = createTournament([3, 1, 2]);
  const m = nextMatchup(s);
  s = recordWinner(s, m.a);
  const before = s.winners.length;
  s = undo(s);
  assert.equal(s.winners.length, before - 1);
  assert.deepEqual(nextMatchup(s), m);
});

test('resume from partial winners reproduces the same next matchup', () => {
  const ids = [4, 1, 3, 2, 7, 6, 5];
  let a = createTournament(ids);
  const first = nextMatchup(a);
  a = recordWinner(a, choose(first.a, first.b));
  const saved = JSON.parse(JSON.stringify(a));
  const rebuilt = { ids: saved.ids, winners: saved.winners };
  assert.deepEqual(nextMatchup(rebuilt), nextMatchup(a));
});

test('progress starts at zero with a positive total estimate', () => {
  const p = getProgress(createTournament(Array.from({ length: 100 }, (_, i) => i)));
  assert.equal(p.done, 0);
  assert.equal(p.percent, 0);
  assert.ok(p.total >= 100);
  assert.equal(p.complete, false);
});
