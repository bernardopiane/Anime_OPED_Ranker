function merge(left, right, compare) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const winner = compare(left[i], right[j]);
    if (winner === left[i]) out.push(left[i++]);
    else out.push(right[j++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

function sortRuns(ids, compare) {
  let runs = ids.map((id) => [id]);
  while (runs.length > 1) {
    const next = [];
    for (let i = 0; i < runs.length; i += 2) {
      next.push(i + 1 < runs.length ? merge(runs[i], runs[i + 1], compare) : runs[i]);
    }
    runs = next;
  }
  return runs[0] || [];
}

function replay(state) {
  const totalRounds = state.ids.length <= 1 ? 1 : Math.ceil(Math.log2(state.ids.length));
  let wi = 0;
  let round = 1;
  let pending = null;
  const compare = (a, b) => {
    if (wi < state.winners.length) {
      const winner = state.winners[wi++];
      if (winner !== a && winner !== b) throw new Error('Corrupt winner history');
      return winner;
    }
    if (!pending) pending = { a, b, round };
    return a;
  };

  let runs = state.ids.map((id) => [id]);
  while (runs.length > 1) {
    const next = [];
    for (let i = 0; i < runs.length; i += 2) {
      next.push(i + 1 < runs.length ? merge(runs[i], runs[i + 1], compare) : runs[i]);
    }
    runs = next;
    round += 1;
  }

  return { pending, ranking: runs[0] || [], totalRounds, round: Math.min(round, totalRounds) };
}

function estimateTotal(ids) {
  let count = 0;
  const compare = (a) => {
    count += 1;
    return a;
  };
  sortRuns(ids, compare);
  return count;
}

export function createTournament(ids) {
  return { ids: [...ids], winners: [] };
}

export function nextMatchup(state) {
  return replay(state).pending;
}

export function recordWinner(state, winnerId) {
  const m = nextMatchup(state);
  if (!m) throw new Error('Tournament is already complete');
  if (winnerId !== m.a && winnerId !== m.b) throw new Error('Winner must be one of the current matchup');
  return { ids: state.ids, winners: [...state.winners, winnerId] };
}

export function undo(state) {
  return { ids: state.ids, winners: state.winners.slice(0, -1) };
}

export function isComplete(state) {
  return replay(state).pending === null;
}

export function getRanking(state) {
  const r = replay(state);
  return r.pending ? null : r.ranking;
}

export function getProgress(state) {
  const r = replay(state);
  const complete = r.pending === null;
  // total is an outcome-dependent estimate (always-left-wins simulation), not the exact comparison count.
  const total = Math.max(1, estimateTotal(state.ids));
  const done = state.winners.length;
  return {
    done,
    total,
    percent: complete || state.ids.length <= 1 ? 100 : Math.min(99, Math.round((done / total) * 100)),
    round: r.pending ? r.pending.round : r.totalRounds,
    totalRounds: r.totalRounds,
    complete,
  };
}
