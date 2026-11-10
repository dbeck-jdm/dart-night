// Shared app state. `S` is a single object that is mutated in place (never
// reassigned) so every module that imports it always sees current data.
// All synced state lives in S and is written as a whole by save().
import { ENV, DB_PATH, LOCAL_RESET } from './config.js';

export const emptyRR = () => ({ going: false, rounds: 1, matches: [], done: false });
export const emptyBracket = () => ({ going: false, seeds: [], losses: {}, matches: [], done: false, podium: [] });

export function fresh() {
  return {
    players: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
    active: false, nightName: '', nightDate: '',
    games: [],
    rr: emptyRR(),
    bracket: emptyBracket(),
    history: []
  };
}

// Firebase drops empty arrays/objects. Fill every container back in after a
// load. Any new array/object field added to S needs a default here.
export function normalize(data) {
  if (!data) return fresh();
  const s = data;
  s.players = s.players || fresh().players;
  s.games = s.games || [];
  s.history = s.history || [];
  s.rr = s.rr || emptyRR();
  s.rr.matches = s.rr.matches || [];
  s.bracket = s.bracket || emptyBracket();
  s.bracket.matches = s.bracket.matches || [];
  s.bracket.seeds = s.bracket.seeds || [];
  s.bracket.podium = s.bracket.podium || [];
  s.bracket.losses = s.bracket.losses || {};
  return s;
}

export const S = fresh();

export function replaceState(next) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, next);
}

// ── Sync ─────────────────────────────────────────────────────────────────────
let adapter = null;
let statusListener = () => {};

export function onSyncStatus(fn) { statusListener = fn; }

export async function connect(onChange) {
  statusListener('connecting');
  if (ENV === 'local') {
    const { createLocalAdapter } = await import('./db/local.js');
    adapter = createLocalAdapter({ reset: LOCAL_RESET });
  } else {
    const { createFirebaseAdapter } = await import('./db/firebase.js');
    adapter = createFirebaseAdapter(DB_PATH);
  }
  adapter.subscribe(data => {
    statusListener('live');
    replaceState(normalize(data));
    onChange();
  }, e => { statusListener('error'); console.error(e); });
}

export async function save() {
  statusListener('saving');
  // Firebase rejects undefined values — sanitize by round-tripping through JSON
  const clean = JSON.parse(JSON.stringify(S, (k, v) => v === undefined ? null : v));
  try { await adapter.write(clean); statusListener('live'); }
  catch (e) { statusListener('error'); console.error(e); }
}
