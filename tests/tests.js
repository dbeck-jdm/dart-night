// Unit tests for the pure logic. Run: pwsh tools/serve.ps1, then open
// http://localhost:8080/tests/ (or run tools/test.ps1 for a headless run).
import { casualPts, rrPts, rrSeeds, bracketPts, h2hWins, PAIRS } from '../js/logic/scoring.js';
import { buildRRMatches } from '../js/logic/schedule.js';
import { createBracket, advanceBracket } from '../js/logic/bracket.js';
import { firebaseShape } from '../js/db/local.js';
import { normalize, fresh } from '../js/store.js';

const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e.message }); }
};
const eq = (a, b, msg = '') => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg} expected ${jb}, got ${ja}`);
};
const ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy'); };

const fixture = await (await fetch('fixtures/sample-state.json')).json();
const nights = fixture.history;

// ── Scoring ──────────────────────────────────────────────────────────────────
await test('casualPts counts only points-on games with a winner', () => {
  eq(casualPts([{ pts: true, winnerId: 1 }, { pts: false, winnerId: 1 }, { pts: true, winnerId: null }, { pts: true, winnerId: 3 }]), [0, 1, 0, 1]);
  eq(casualPts(undefined), [0, 0, 0, 0]);
});

await test('rrPts ignores skipped matches', () => {
  eq(rrPts([{ p1: 0, p2: 1, winner: 0 }, { p1: 2, p2: 3, skipped: true }]), [1, 0, 0, 0]);
});

await test('rrSeeds: wins, then head-to-head, then casual points', () => {
  // 0 and 1 tied on wins; 1 beat 0 head-to-head
  const m = [{ p1: 0, p2: 1, winner: 1 }, { p1: 0, p2: 2, winner: 0 }, { p1: 1, p2: 3, winner: 3 }];
  eq(rrSeeds(m, []).slice(0, 2), [1, 0]);
  // 2 and 3 tied on wins and no h2h: casual points decide
  const m2 = [{ p1: 0, p2: 2, winner: 2 }, { p1: 1, p2: 3, winner: 3 }];
  eq(rrSeeds(m2, [{ pts: true, winnerId: 3 }]).slice(0, 2), [3, 2]);
});

await test('h2hWins counts both directions', () => {
  eq(h2hWins([{ p1: 0, p2: 1, winner: 0 }, { p1: 1, p2: 0, winner: 0 }, { p1: 1, p2: 0, winner: 1 }], 0, 1), { wa: 2, wb: 1 });
});

await test('bracketPts awards 8/6/3/1 only when done', () => {
  eq(bracketPts({ done: true, podium: [2, 0, 3, 1] }), [6, 1, 8, 3]);
  eq(bracketPts({ done: false, podium: [2, 0, 3, 1] }), [0, 0, 0, 0]);
});

// ── Real nights replayed (regression against saved history) ─────────────────
for (const n of nights) {
  await test(`${n.name}: recomputed scores match saved scores`, () => {
    const c = casualPts(n.games), r = rrPts(n.rrMatches), b = bracketPts({ done: true, podium: n.bracketPodium });
    eq(c, n.casualPts, 'casual'); eq(r, n.rrPts, 'rr'); eq(b, n.bracketPts, 'bracket');
    eq(c.map((x, i) => x + r[i] + b[i]), n.scores, 'total');
  });
  await test(`${n.name}: bracket engine replays to the same matches and podium`, () => {
    const w1 = n.bracketMatches.filter(m => m.round === 'W1');
    // Seeds as the engine expects: Match A = #1 v #4, Match B = #2 v #3
    const seeds = [w1[0].p1, w1[1].p1, w1[1].p2, w1[0].p2];
    const b = createBracket(seeds);
    for (const saved of n.bracketMatches) {
      const live = b.matches.find(m => m.label === saved.label);
      ok(live, `${saved.label} was not created`);
      eq([live.p1, live.p2], [saved.p1, saved.p2], `${saved.round} players`);
      advanceBracket(b, live.id, saved.winner);
    }
    eq(b.matches.length, n.bracketMatches.length, 'match count');
    ok(b.done, 'bracket should be done');
    eq(b.podium, n.bracketPodium, 'podium');
  });
}

// ── Bracket edge cases ───────────────────────────────────────────────────────
await test('bracket: no reset when winners-bracket player wins GF', () => {
  const b = createBracket([0, 1, 2, 3]);
  const play = (round, w) => advanceBracket(b, b.matches.find(m => m.round === round && m.winner == null).id, w);
  play('W1', 0); play('W1', 1); play('L1', 3); play('W2', 0); play('L2', 3); play('GF', 0);
  ok(b.done); eq(b.podium, [0, 3, 1, 2]); ok(!b.matches.some(m => m.round === 'GFR'));
});

await test('bracket: reset match when losers-bracket player wins GF', () => {
  const b = createBracket([0, 1, 2, 3]);
  const play = (round, w) => advanceBracket(b, b.matches.find(m => m.round === round && m.winner == null).id, w);
  play('W1', 0); play('W1', 1); play('L1', 3); play('W2', 0); play('L2', 3); play('GF', 3);
  ok(!b.done, 'not done before reset'); eq(b.losses[0], 1); eq(b.losses[3], 1);
  play('GFR', 3);
  ok(b.done); eq(b.podium, [3, 0, 1, 2]);
});

// ── Round robin schedule ─────────────────────────────────────────────────────
for (const legs of [1, 2]) {
  await test(`round robin ${legs}x: every pair plays ${legs} time(s), order matches real nights`, () => {
    const ms = buildRRMatches(legs);
    eq(ms.length, PAIRS.length * legs);
    PAIRS.forEach(([a, b]) => eq(ms.filter(m => (m.p1 === a && m.p2 === b)).length, legs, `pair ${a}-${b}`));
    // With 4 players some back-to-back matches are unavoidable; just pin the order the app has always produced
    const saved = nights.find(n => n.rrMatches.length === PAIRS.length * legs);
    eq(ms.map(m => [m.p1, m.p2, m.leg]), saved.rrMatches.map(m => [m.p1, m.p2, m.leg]));
  });
}

// ── Persistence shape ────────────────────────────────────────────────────────
await test('firebaseShape drops nulls and empty containers like Firebase', () => {
  eq(firebaseShape({ a: [], b: {}, c: null, d: 1, e: { f: [] } }), { d: 1 });
});

await test('normalize restores containers dropped by Firebase', () => {
  const s = normalize(firebaseShape(fresh()));
  eq(s.games, []); eq(s.history, []); eq(s.rr.matches, []); eq(s.bracket.losses, {}); eq(s.bracket.podium, []);
  eq(s.players.length, 4);
});

await test('normalize keeps the fixture history intact', () => {
  const s = normalize(JSON.parse(JSON.stringify(fixture)));
  eq(s.history, fixture.history);
});

// ── Report ───────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);
const out = document.getElementById('results');
out.textContent = results.map(r => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n      ' + r.err}`).join('\n')
  + `\n\n${results.length - failed.length}/${results.length} passed`;
document.title = failed.length ? `FAIL (${failed.length})` : 'PASS';
document.body.dataset.status = failed.length ? 'fail' : 'pass';
