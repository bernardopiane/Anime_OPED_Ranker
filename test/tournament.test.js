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
  shuffleIds,
  getCurrentRanking,
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

test('getRanking returns null while the tournament is incomplete', () => {
  const s = createTournament([3, 1, 2]);
  assert.equal(getRanking(s), null);
});

test('progress reports exactly 100 percent when complete with an even count', () => {
  const s = playAll([0, 3, 4, 5, 1, 2]);
  const p = getProgress(s);
  assert.equal(p.complete, true);
  assert.equal(p.percent, 100);
});

test('progress reports exactly 100 percent when complete with an odd count', () => {
  const s = playAll([1, 2, 0]);
  const p = getProgress(s);
  assert.equal(p.complete, true);
  assert.equal(p.percent, 100);
});

test('progress never reaches 100 percent before completion', () => {
  let s = createTournament([0, 2, 1, 3]);
  let m;
  while ((m = nextMatchup(s))) {
    const p = getProgress(s);
    assert.equal(p.complete, false);
    assert.ok(p.percent <= 99);
    s = recordWinner(s, choose(m.a, m.b));
  }
});

test('progress total is an upper bound matching the spec estimate', () => {
  const ids = Array.from({ length: 100 }, (_, i) => i);
  assert.equal(getProgress(createTournament(ids)).total, 100 * 7 - 100 + 1);
  let s = createTournament([...ids].reverse());
  let m;
  while ((m = nextMatchup(s))) {
    assert.ok(getProgress(s).done <= getProgress(s).total);
    s = recordWinner(s, choose(m.a, m.b));
  }
  assert.equal(getProgress(s).percent, 100);
});

test('shuffleIds returns a permutation without mutating the input', () => {
  const ids = [0, 1, 2, 3, 4, 5, 6, 7];
  const original = [...ids];
  const shuffled = shuffleIds(ids);
  assert.deepEqual(ids, original);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), original);
});

test('shuffleIds is deterministic for a given rng', () => {
  const seq = [0.1, 0.9, 0.4, 0.7, 0.2];
  const makeRng = () => {
    let i = 0;
    return () => seq[i++ % seq.length];
  };
  const ids = [0, 1, 2, 3, 4, 5];
  assert.deepEqual(shuffleIds(ids, makeRng()), shuffleIds(ids, makeRng()));
});

test('a shuffled order still ranks to a valid complete ranking', () => {
  const ids = [0, 1, 2, 3, 4, 5, 6];
  const shuffled = shuffleIds(ids, () => 0.42);
  const s = playAll(shuffled);
  assert.deepEqual(getRanking(s), [...ids].sort((a, b) => a - b));
  assert.equal(getProgress(s).percent, 100);
});

test('getCurrentRanking is a full permutation even while incomplete', () => {
  const ids = [3, 1, 2, 0];
  const preview = getCurrentRanking(createTournament(ids));
  assert.equal(preview.length, ids.length);
  assert.deepEqual([...preview].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
});

test('getCurrentRanking respects decisions already made', () => {
  let s = createTournament([2, 1, 0]);
  const m = nextMatchup(s);
  const winner = Math.min(m.a, m.b);
  const loser = Math.max(m.a, m.b);
  s = recordWinner(s, winner);
  const preview = getCurrentRanking(s);
  assert.deepEqual([...preview].sort((a, b) => a - b), [0, 1, 2]);
  assert.ok(preview.indexOf(winner) < preview.indexOf(loser));
});

test('getCurrentRanking matches getRanking once complete', () => {
  const s = playAll([4, 0, 3, 1, 2]);
  assert.deepEqual(getCurrentRanking(s), getRanking(s));
});
