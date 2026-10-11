function merge(left, right, compare, onPlace) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const winner = compare(left[i], right[j]);
    if (winner === left[i]) out.push(left[i++]);
    else out.push(right[j++]);
    onPlace();
  }
  while (i < left.length) { out.push(left[i++]); onPlace(); }
  while (j < right.length) { out.push(right[j++]); onPlace(); }
  return out;
}

function mergeWork(n) {
  let sizes = Array(n).fill(1);
  let work = 0;
  while (sizes.length > 1) {
    const next = [];
    for (let i = 0; i < sizes.length; i += 2) {
      if (i + 1 < sizes.length) {
        next.push(sizes[i] + sizes[i + 1]);
        work += sizes[i] + sizes[i + 1];
      } else {
        next.push(sizes[i]);
      }
    }
    sizes = next;
  }
  return work;
}

function replay(state) {
  const totalRounds = state.ids.length <= 1 ? 1 : Math.ceil(Math.log2(state.ids.length));
  let wi = 0;
  let round = 1;
  let pending = null;
  let placed = 0;
  let placedAtPending = null;
  const onPlace = () => { placed += 1; };
  const compare = (a, b) => {
    if (wi < state.winners.length) {
      const winner = state.winners[wi++];
      if (winner !== a && winner !== b) throw new Error('Corrupt winner history');
      return winner;
    }
    if (!pending) {
      pending = { a, b, round };
      placedAtPending = placed;
    }
    return a;
  };

  let runs = state.ids.map((id) => [id]);
  while (runs.length > 1) {
    const next = [];
    for (let i = 0; i < runs.length; i += 2) {
      next.push(i + 1 < runs.length ? merge(runs[i], runs[i + 1], compare, onPlace) : runs[i]);
    }
    runs = next;
    round += 1;
  }

  return {
    pending,
    ranking: runs[0] || [],
    totalRounds,
    round: Math.min(round, totalRounds),
    placedAtPending,
  };
}

export function createTournament(ids) {
  return { ids: [...ids], winners: [] };
}

export function shuffleIds(ids, rng = Math.random) {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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

export function getCurrentRanking(state) {
  return replay(state).ranking;
}

export function getProgress(state) {
  const r = replay(state);
  const complete = r.pending === null;
  const done = state.winners.length;
  const total = Math.max(mergeWork(state.ids.length), 1);
  const placed = complete ? total : (r.placedAtPending === null ? 0 : r.placedAtPending);
  return {
    done,
    total,
    percent: complete || state.ids.length <= 1 ? 100 : Math.min(99, Math.round((placed / total) * 100)),
    round: r.pending ? r.pending.round : r.totalRounds,
    totalRounds: r.totalRounds,
    complete,
  };
}
