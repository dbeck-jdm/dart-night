// 4-player double-elimination bracket engine. Pure: operates on the bracket
// object passed in, so the nightly bracket and (later) a season playoff can
// share it.
//
// Rounds unlock in order: W1 (1v4, 2v3) → L1 + W2 → L2 → GF → GFR (only if the
// losers-bracket player wins GF). Podium: [champion, runner-up, L2 loser, L1 loser].
const emptyBracket = () => ({ going: false, seeds: [], losses: {}, matches: [], done: false, podium: [] });

export const ROUND_ORDER = ['W1', 'L1', 'W2', 'L2', 'GF', 'GFR'];
export const ROUND_LABELS = { W1: 'Winners · Round 1', W2: 'Winners · Final', L1: 'Losers · Elimination', L2: 'Losers · Final', GF: 'Grand Final', GFR: 'Grand Final · Reset' };

export function createBracket(seeds) {
  const b = { ...emptyBracket(), going: true, seeds: [...seeds] };
  seeds.forEach(i => b.losses[i] = 0);
  // W1: #1 vs #4, #2 vs #3 — these are independent so order is fine
  addMatch(b, 'Match A', seeds[0], seeds[3], 'W1');
  addMatch(b, 'Match B', seeds[1], seeds[2], 'W1');
  return b;
}

function addMatch(b, label, p1, p2, round) {
  b.matches.push({ id: b.matches.length, label, p1, p2, winner: null, loser: null, round });
}

export function advanceBracket(b, id, winnerId) {
  const m = b.matches.find(x => x.id === id);
  const loser = m.p1 === winnerId ? m.p2 : m.p1;
  m.winner = winnerId; m.loser = loser;
  b.losses[loser] = (b.losses[loser] || 0) + 1;
  const byR = r => b.matches.filter(x => x.round === r);
  const allDone = r => byR(r).length > 0 && byR(r).every(x => x.winner != null);
  if (allDone('W1') && !byR('W2').length) {
    const [wa, wb] = byR('W1');
    // L1 listed first so losers play while waiting
    addMatch(b, 'Elimination Match', wa.loser, wb.loser, 'L1');
    addMatch(b, 'Winners Final', wa.winner, wb.winner, 'W2');
  }
  if (allDone('W2') && allDone('L1') && !byR('L2').length) {
    const w2 = byR('W2')[0], l1 = byR('L1')[0];
    addMatch(b, 'Losers Final', l1.winner, w2.loser, 'L2');
  }
  if (allDone('L2') && !byR('GF').length) {
    const w2 = byR('W2')[0], l2 = byR('L2')[0];
    addMatch(b, 'Grand Final', w2.winner, l2.winner, 'GF');
  }
  if (allDone('GF') && !byR('GFR').length) {
    const gf = byR('GF')[0], w2 = byR('W2')[0];
    if (gf.winner !== w2.winner) {
      b.losses[gf.winner] = 1; b.losses[gf.loser] = 1;
      addMatch(b, 'Grand Final Reset', gf.winner, gf.loser, 'GFR');
    } else finishBracket(b);
  }
  if (allDone('GFR')) finishBracket(b);
  return b;
}

function finishBracket(b) {
  const byR = r => b.matches.filter(x => x.round === r);
  const fr = byR('GFR').length ? 'GFR' : 'GF';
  const gf = byR(fr)[0], l2 = byR('L2')[0], l1 = byR('L1')[0];
  b.done = true;
  b.podium = [gf.winner, gf.loser, l2.loser, l1.loser];
}
