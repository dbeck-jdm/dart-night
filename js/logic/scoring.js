// Pure scoring helpers (no DOM, no global state) — unit tested in tests/.
export const NUM_PLAYERS = 4;
export const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
export const BRACKET_PTS = [8, 6, 3, 1]; // by bracket finish: 1st..4th

const zeros = () => Array(NUM_PLAYERS).fill(0);
const slots = () => [...Array(NUM_PLAYERS).keys()];

export function casualPts(games) {
  const p = zeros();
  (games || []).forEach(g => { if (g.pts && g.winnerId != null) p[g.winnerId]++; });
  return p;
}

export function rrPts(matches) {
  const p = zeros();
  (matches || []).forEach(m => { if (m.winner != null) p[m.winner]++; });
  return p;
}

export function h2hWins(matches, a, b) {
  let wa = 0, wb = 0;
  (matches || []).forEach(m => {
    if ((m.p1 === a && m.p2 === b) || (m.p1 === b && m.p2 === a)) {
      if (m.winner === a) wa++; else if (m.winner === b) wb++;
    }
  });
  return { wa, wb };
}

// Seed order: RR wins → head-to-head → casual points.
export function rrSeeds(rrMatches, games) {
  const rp = rrPts(rrMatches), cp = casualPts(games);
  return slots().sort((a, b) => {
    if (rp[b] !== rp[a]) return rp[b] - rp[a];
    const { wa, wb } = h2hWins(rrMatches, a, b);
    if (wa !== wb) return wa > wb ? -1 : 1;
    return cp[b] - cp[a];
  });
}

export function bracketPts(bracket) {
  const p = zeros();
  if (bracket && bracket.done) (bracket.podium || []).forEach((idx, r) => { if (BRACKET_PTS[r] != null) p[idx] = BRACKET_PTS[r]; });
  return p;
}

// Indices sorted by a numeric array, highest first (stable for ties).
export const rankBy = arr => slots().sort((a, b) => arr[b] - arr[a]);
