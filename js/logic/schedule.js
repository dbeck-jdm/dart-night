import { PAIRS } from './scoring.js';

// Build round-robin matches (each pair once per leg).
export function buildRRMatches(legs) {
  const raw = [];
  for (let leg = 1; leg <= legs; leg++) PAIRS.forEach(([a, b]) => raw.push({ p1: a, p2: b, winner: null, skipped: false, leg }));
  return scheduledMatches(raw);
}

// Reorder matches so no player appears in back-to-back matches
export function scheduledMatches(matches) {
  const result = [];
  const remaining = [...matches];
  let lastPlayers = [];
  while (remaining.length > 0) {
    // Find first match where neither player was in the last match
    let idx = remaining.findIndex(m => !lastPlayers.includes(m.p1) && !lastPlayers.includes(m.p2));
    // If none found (everyone played last), just take the first
    if (idx === -1) idx = 0;
    const m = remaining.splice(idx, 1)[0];
    result.push(m);
    lastPlayers = [m.p1, m.p2];
  }
  return result;
}
