// Shared app state. `S` is a single object that is mutated in place (never
// reassigned) so every module that imports it always sees current data.
// All synced state lives in S and is written as a whole by save().
import { ENV, DB_PATH, LOCAL_RESET } from './config.js';
import { migrateSeasons } from './logic/seasons.js';

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
  return migrateSeasons(s); // roster, playerIds, seasons, currentSeasonId, night tags
}

// ── Season/roster accessors ──────────────────────────────────────────────────
// Merge an export file into state `s` (mutated in place). Returns the nights added.
// Nights already present (same name|date) are skipped. Into an app with no history
// it's a full restore: a v1 file then rebuilds people/seasons from scratch, exactly as
// the first load of the seasons version does, instead of reusing the placeholder roster.
export function applyImport(s, data) {
  const existing = s.history || [];
  const keys = new Set(existing.map(n => `${n.name}|${n.date}`));
  const added = data.history.filter(n => !keys.has(`${n.name}|${n.date}`));
  const restoring = !existing.length && !s.active;
  s.history = [...existing, ...added];
  if (data.roster && data.seasons) {
    if (restoring) {
      s.roster = data.roster; s.seasons = data.seasons; s.currentSeasonId = data.currentSeasonId;
      if (data.playerIds) { s.playerIds = data.playerIds; s.players = data.players; }
    } else {
      Object.values(data.roster).forEach(p => { if (!s.roster[p.id]) s.roster[p.id] = p; });
      data.seasons.forEach(x => { if (!s.seasons.some(y => y.id === x.id)) s.seasons.push(x); });
    }
  } else if (restoring) {
    s.players = [...data.players];
    s.playerIds = []; s.roster = {}; s.seasons = []; s.currentSeasonId = null;
    added.forEach(n => { delete n.seasonId; delete n.playerIds; });
  } else if (s.players.every(p => p.startsWith('Player '))) {
    s.players = [...data.players]; s.playerIds = [];
  }
  normalize(s); // fills ids/season tags in place
  return added;
}

export const currentSeason = () => S.seasons.find(x => x.id === S.currentSeasonId);
export const seasonById = id => S.seasons.find(x => x.id === id);
export const nameOf = pid => (S.roster[pid] && S.roster[pid].name) || '?';

export const S = normalize(fresh());

export function replaceState(next) {
  if (next === S) return; // replacing S with itself would wipe it
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
