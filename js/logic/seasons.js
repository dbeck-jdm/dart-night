// Seasons, permanent player IDs, and season standings. Pure (no DOM, no
// globals) so it can be unit tested.
//
// Data model (all additive to the original state):
//   S.roster          { [pid]: { id, name } }  — every person who has ever played
//   S.playerIds       [pid×4]                  — who sits in slots 0–3 now (parallel to S.players)
//   S.seasons         [{ id, number, name, nights, status, playerIds, startDate,
//                        endDate, regularChampion, standings, playoff, playoffChampion, playoffPodium }]
//   S.currentSeasonId id of the season new nights are saved into
//   history[n].seasonId / history[n].playerIds — added when a night is saved
//
// Within a night or a playoff bracket, players are still referred to by slot
// (0–3); playerIds maps a slot to a person.

export const DEFAULT_SEASON_NIGHTS = 8;
export const PLACEMENT_PTS = [4, 3, 2, 1]; // nightly finish 1st..4th → season points
export const STATUS = { REGULAR: 'regular', PLAYOFFS: 'playoffs', COMPLETE: 'complete' };

export const newSeasonId = number => `s${number}`;
export const newPlayerId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function makeSeason(number, playerIds, startDate, nights = DEFAULT_SEASON_NIGHTS) {
  return {
    id: newSeasonId(number), number, name: `Season ${number}`, nights,
    status: STATUS.REGULAR, playerIds: [...playerIds], startDate: startDate || '', endDate: '',
    regularChampion: null, standings: [], playoff: null, playoffChampion: null, playoffPodium: [],
  };
}

// ── Migration / normalization ────────────────────────────────────────────────
// Deterministic, so every device derives the same result without having to
// write anything: existing players become p1–p4, existing nights become Season 1.
// Also repairs nights saved by an older app version (no seasonId / playerIds).
export function migrateSeasons(s) {
  s.roster = s.roster || {};
  const byName = name => Object.values(s.roster).find(p => p.name === name);
  const ensurePlayer = (name, preferredId) => {
    const found = byName(name);
    if (found) return found.id;
    let id = preferredId && !s.roster[preferredId] ? preferredId : null;
    for (let k = Object.keys(s.roster).length + 1; !id; k++) if (!s.roster['p' + k]) id = 'p' + k;
    s.roster[id] = { id, name };
    return id;
  };

  if (!Array.isArray(s.playerIds) || s.playerIds.length !== (s.players || []).length || s.playerIds.some(id => !s.roster[id])) {
    s.playerIds = (s.players || []).map((name, i) => ensurePlayer(name, 'p' + (i + 1)));
  }

  s.seasons = (s.seasons || []).map(normalizeSeason);
  if (!s.seasons.length) {
    const first = (s.history || [])[0];
    s.seasons.push(makeSeason(1, s.playerIds, first ? first.date : ''));
  }
  if (!s.seasons.some(x => x.id === s.currentSeasonId)) s.currentSeasonId = s.seasons[s.seasons.length - 1].id;

  (s.history || []).forEach(n => {
    if (!n.seasonId || !s.seasons.some(x => x.id === n.seasonId)) n.seasonId = s.currentSeasonId;
    if (!Array.isArray(n.playerIds) || n.playerIds.length !== (n.players || []).length) {
      n.playerIds = (n.players || []).map(name => ensurePlayer(name));
    }
  });

  // Self-heal: a regular season's people are whoever played its latest night
  // (the roster can't change mid-season). Repairs seasons left pointing at placeholders.
  s.seasons.forEach(x => {
    if (x.status !== STATUS.REGULAR) return;
    const last = (s.history || []).filter(n => n.seasonId === x.id).pop();
    if (!last || last.playerIds.length !== x.playerIds.length || last.playerIds.every(pid => x.playerIds.includes(pid))) return;
    x.playerIds = [...last.playerIds];
    if (x.id === s.currentSeasonId && !s.active) {
      s.playerIds = [...last.playerIds];
      s.players = s.playerIds.map(pid => s.roster[pid].name);
    }
  });
  return s;
}

function normalizeSeason(x) {
  x.playerIds = x.playerIds || [];
  x.standings = x.standings || [];
  x.playoffPodium = x.playoffPodium || [];
  x.playoff = x.playoff || null;
  if (x.playoff) {
    x.playoff.matches = x.playoff.matches || [];
    x.playoff.seeds = x.playoff.seeds || [];
    x.playoff.podium = x.playoff.podium || [];
    x.playoff.losses = x.playoff.losses || {};
  }
  x.regularChampion = x.regularChampion ?? null;
  x.playoffChampion = x.playoffChampion ?? null;
  x.nights = x.nights || DEFAULT_SEASON_NIGHTS;
  x.status = x.status || STATUS.REGULAR;
  return x;
}

// ── Nights ───────────────────────────────────────────────────────────────────
// A night's finishing order (slots). The bracket decides the night; nights with
// no bracket result (not possible today) fall back to points.
export function nightPlacement(n) {
  if ((n.bracketPodium || []).length === (n.players || []).length && n.bracketPodium.length) return [...n.bracketPodium];
  return [...Array((n.players || []).length).keys()].sort((a, b) => ((n.scores || [])[b] || 0) - ((n.scores || [])[a] || 0));
}

export const nightWinnerSlot = n => nightPlacement(n)[0];

// The slot with the most points, or null when that's also the night winner
// (or when it's tied).
export function pointsLeaderIfDifferent(n) {
  const sc = n.scores || [];
  const max = Math.max(...sc);
  const leaders = sc.map((v, i) => v === max ? i : -1).filter(i => i >= 0);
  if (leaders.length !== 1 || leaders[0] === nightWinnerSlot(n)) return null;
  return leaders[0];
}

export const seasonNights = (history, seasonId) => (history || []).filter(n => n.seasonId === seasonId);

// ── Standings ────────────────────────────────────────────────────────────────
// Ranking: placement points → nights won → total points → bracket head-to-head.
export function seasonStandings(season, history) {
  const nights = seasonNights(history, season.id);
  const pids = [...season.playerIds];
  nights.forEach(n => (n.playerIds || []).forEach(pid => { if (!pids.includes(pid)) pids.push(pid); }));
  const rows = Object.fromEntries(pids.map(pid => [pid, { pid, placementPts: 0, nightsWon: 0, totalPts: 0, nightsPlayed: 0, finishes: [] }]));
  const h2h = {}; // h2h[a][b] = bracket wins of a over b
  const addH2h = (a, b) => { h2h[a] = h2h[a] || {}; h2h[a][b] = (h2h[a][b] || 0) + 1; };

  nights.forEach(n => {
    const ids = n.playerIds || [];
    nightPlacement(n).forEach((slot, place) => {
      const r = rows[ids[slot]]; if (!r) return;
      r.placementPts += PLACEMENT_PTS[place] || 0;
      r.finishes.push(place + 1);
      r.nightsPlayed++;
      if (place === 0) r.nightsWon++;
    });
    (n.scores || []).forEach((v, slot) => { if (rows[ids[slot]]) rows[ids[slot]].totalPts += v || 0; });
    (n.bracketMatches || []).forEach(m => { if (m.winner != null && m.loser != null) addH2h(ids[m.winner], ids[m.loser]); });
  });

  const list = Object.values(rows);
  list.forEach(r => { r.avgFinish = r.finishes.length ? r.finishes.reduce((a, b) => a + b, 0) / r.finishes.length : null; });
  list.sort((a, b) =>
    (b.placementPts - a.placementPts) ||
    (b.nightsWon - a.nightsWon) ||
    (b.totalPts - a.totalPts) ||
    (((h2h[b.pid] || {})[a.pid] || 0) - ((h2h[a.pid] || {})[b.pid] || 0)) ||
    (season.playerIds.indexOf(a.pid) - season.playerIds.indexOf(b.pid)));
  list.forEach((r, i) => r.rank = i + 1);
  return list;
}

export function regularSeasonComplete(season, history) {
  return seasonNights(history, season.id).length >= season.nights;
}

// Close the regular season: freeze standings, crown the regular-season
// champion, and prepare playoff seeds (as slots into season.playerIds).
export function endRegularSeason(season, history, endDate) {
  const standings = seasonStandings(season, history).filter(r => season.playerIds.includes(r.pid));
  season.standings = standings.map(r => ({ pid: r.pid, rank: r.rank, placementPts: r.placementPts, nightsWon: r.nightsWon, totalPts: r.totalPts, nightsPlayed: r.nightsPlayed }));
  season.regularChampion = standings.length ? standings[0].pid : null;
  season.status = STATUS.PLAYOFFS;
  season.regularEndDate = endDate || '';
  season.playoff = null;
  return season;
}

// Playoff seeds: slots into season.playerIds in regular-season order.
export const playoffSeeds = season => season.standings.map(r => season.playerIds.indexOf(r.pid));

export function completePlayoff(season, endDate) {
  const podium = season.playoff.podium.map(slot => season.playerIds[slot]);
  season.playoffPodium = podium;
  season.playoffChampion = podium[0];
  season.status = STATUS.COMPLETE;
  season.endDate = endDate || '';
  return season;
}

// ── Remapping nights into a stats "view" ─────────────────────────────────────
// Stats code works on slot indices. To aggregate across nights whose slots may
// hold different people, translate every night into one shared index space
// (view index = position in `pids`).
export function viewPids(nights, preferredOrder = []) {
  if (!nights.length) return [...preferredOrder];
  const out = preferredOrder.filter(pid => nights.some(n => (n.playerIds || []).includes(pid)));
  nights.forEach(n => (n.playerIds || []).forEach(pid => { if (!out.includes(pid)) out.push(pid); }));
  return out;
}

export function remapNight(n, pids) {
  const k = pids.length;
  const map = slot => slot == null ? null : (() => { const v = pids.indexOf((n.playerIds || [])[slot]); return v < 0 ? null : v; })();
  const spread = arr => { const out = Array(k).fill(0); (arr || []).forEach((v, slot) => { const i = map(slot); if (i != null) out[i] = v; }); return out; };
  return {
    ...n,
    present: (n.playerIds || []).map(pid => pids.indexOf(pid)).filter(i => i >= 0),
    scores: spread(n.scores), casualPts: spread(n.casualPts), rrPts: spread(n.rrPts), bracketPts: spread(n.bracketPts),
    games: (n.games || []).map(g => ({ ...g, players: (g.players || []).map(map).filter(i => i != null), winnerId: map(g.winnerId) })),
    rrMatches: (n.rrMatches || []).map(m => ({ ...m, p1: map(m.p1), p2: map(m.p2), winner: map(m.winner) })),
    bracketMatches: (n.bracketMatches || []).map(m => ({ ...m, p1: map(m.p1), p2: map(m.p2), winner: map(m.winner), loser: map(m.loser) })),
    bracketPodium: (n.bracketPodium || []).map(map).filter(i => i != null),
    placement: nightPlacement(n).map(map).filter(i => i != null),
  };
}

// ── Career (cross-season) stats per player ───────────────────────────────────
export function careerSeasonStats(seasons, history) {
  const out = {};
  const row = pid => out[pid] = out[pid] || { pid, seasonsPlayed: 0, regularTitles: 0, playoffTitles: 0, doubles: 0, seasonFinishes: [], playoffFinishes: [], nightFinishes: [], placementPts: 0, nights: 0, bestSeason: null, worstSeason: null };
  seasons.forEach(season => {
    const nights = seasonNights(history, season.id);
    if (!nights.length) return;
    const standings = season.status === STATUS.REGULAR ? seasonStandings(season, history) : (season.standings.length ? season.standings : seasonStandings(season, history));
    const final = season.status !== STATUS.REGULAR;
    standings.forEach(r => {
      const p = row(r.pid);
      p.seasonsPlayed++;
      if (final) {
        p.seasonFinishes.push({ season: season.number, rank: r.rank });
        if (!p.bestSeason || r.rank < p.bestSeason.rank) p.bestSeason = { season: season.number, rank: r.rank };
        if (!p.worstSeason || r.rank > p.worstSeason.rank) p.worstSeason = { season: season.number, rank: r.rank };
      }
    });
    if (final && season.regularChampion) row(season.regularChampion).regularTitles++;
    if (season.status === STATUS.COMPLETE) {
      if (season.playoffChampion) row(season.playoffChampion).playoffTitles++;
      if (season.playoffChampion && season.playoffChampion === season.regularChampion) row(season.playoffChampion).doubles++;
      season.playoffPodium.forEach((pid, i) => {
        const seed = season.standings.findIndex(r => r.pid === pid) + 1;
        row(pid).playoffFinishes.push({ season: season.number, finish: i + 1, seed });
      });
    }
    nights.forEach(n => nightPlacement(n).forEach((slot, place) => {
      const p = row((n.playerIds || [])[slot]);
      p.nightFinishes.push(place + 1); p.placementPts += PLACEMENT_PTS[place] || 0; p.nights++;
    }));
  });
  Object.values(out).forEach(p => {
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    p.avgSeasonFinish = avg(p.seasonFinishes.map(f => f.rank));
    p.avgNightFinish = avg(p.nightFinishes);
    p.placementPerNight = p.nights ? p.placementPts / p.nights : null;
    p.avgPlayoffVsSeed = avg(p.playoffFinishes.map(f => f.seed - f.finish)); // + means beat their seed
  });
  return out;
}
