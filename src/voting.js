export function createPoll(key) {
  return { key, ballots: new Map() };
}

export function castVote(poll, username, side) {
  if (!poll || !(poll.ballots instanceof Map)) return poll;
  if (side !== 'a' && side !== 'b') return poll;
  const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!name) return poll;
  if (poll.ballots.get(name) === side) return poll;
  const ballots = new Map(poll.ballots);
  ballots.set(name, side);
  return { key: poll.key, ballots };
}

export function tally(poll) {
  let a = 0;
  let b = 0;
  const ballots = poll?.ballots;
  if (ballots instanceof Map) {
    for (const side of ballots.values()) {
      if (side === 'a') a += 1;
      else if (side === 'b') b += 1;
    }
  }
  const total = a + b;
  const percentA = total > 0 ? Math.round((a / total) * 100) : 0;
  const percentB = total > 0 ? 100 - percentA : 0;
  return { a, b, total, percentA, percentB };
}

export function clearPoll(poll) {
  return createPoll(poll?.key ?? '');
}
