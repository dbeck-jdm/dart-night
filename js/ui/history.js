// History tab (season picker → season summary + its nights) and the night
// summary modal. A night's winner is its bracket winner; points are shown
// alongside but don't decide the night.
import { S, currentSeason, seasonById, nameOf } from '../store.js';
import { STATUS, seasonNights, seasonStandings, nightPlacement, pointsLeaderIfDifferent, PLACEMENT_PTS } from '../logic/seasons.js';
import { $, esc, openM } from './dom.js';

let _season = null, _seenCurrent = null; // selected season id (UI only); resets when a new season starts

// Display name for a slot in a saved night: current roster name, so renames carry through
export const nightPlayerName = (n, slot) => esc((n.playerIds && S.roster[n.playerIds[slot]] && S.roster[n.playerIds[slot]].name) || (n.players || [])[slot] || '?');

const statusLabel = s => ({ regular: 'In progress', playoffs: 'Playoff pending', complete: 'Complete' })[s.status];

export function seasonChipsHTML(selectedId, handler, { allTime = false } = {}) {
  const chips = [...S.seasons].reverse().map(x => `<button class="pf-btn ${selectedId === x.id ? 'sel' : ''}" onclick="window.${handler}('${x.id}')">${esc(x.name)}</button>`);
  if (allTime) chips.push(`<button class="pf-btn ${selectedId === 'all' ? 'sel' : ''}" onclick="window.${handler}('all')">All-time</button>`);
  return `<div class="chip-row">${chips.join('')}</div>`;
}

export function standingsTableHTML(season, rows) {
  const pidList = season.playerIds;
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;"><table class="stbl">
    <thead><tr><th>#</th><th>Player</th><th class="ctr" title="Placement points: 4/3/2/1 per night">Pts</th><th class="ctr" title="Nights won">W</th><th class="ctr" title="Night points (casual + RR + bracket)">Night pts</th><th class="ctr" title="Average nightly finish">Avg</th></tr></thead><tbody>
    ${rows.filter(r => pidList.includes(r.pid)).map((r, i) => `<tr><td><strong style="${i === 0 ? 'color:var(--accent)' : ''}">${i + 1}</strong></td>
      <td class="bold">${esc(nameOf(r.pid))}${season.regularChampion === r.pid ? ' 👑' : ''}${season.playoffChampion === r.pid ? ' 🏆' : ''}</td>
      <td class="ctr"><span class="pts-big">${r.placementPts}</span></td><td class="ctr">${r.nightsWon}</td>
      <td class="ctr" style="color:var(--muted)">${r.totalPts}</td>
      <td class="ctr" style="color:var(--muted)">${r.avgFinish != null ? r.avgFinish.toFixed(1) : '—'}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function seasonSummaryHTML(season) {
  const nights = seasonNights(S.history, season.id);
  const rows = seasonStandings(season, S.history);
  let html = `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;"><h3 style="margin:0">${esc(season.name)}</h3><span class="title-badge">${statusLabel(season)}</span></div>
    <div class="note" style="margin-bottom:8px;">${esc(season.startDate || '')}${season.endDate ? ' – ' + esc(season.endDate) : ''} · ${nights.length} of ${season.nights} nights</div>`;
  if (season.regularChampion) html += `<div class="info-row"><span>👑 Regular season champion</span><span class="bold">${esc(nameOf(season.regularChampion))}</span></div>`;
  if (season.playoffChampion) html += `<div class="info-row"><span>🏆 Playoff champion</span><span class="bold">${esc(nameOf(season.playoffChampion))}</span></div>`;
  html += `</div>`;
  if (nights.length) {
    html += `<div class="sec-label">${season.status === STATUS.REGULAR ? 'Standings' : 'Final Standings'}</div>` + standingsTableHTML(season, rows);
    html += `<div class="note" style="margin:6px 2px 0;">Pts = ${PLACEMENT_PTS.join('/')} for each night's 1st–4th (bracket finish). Ties: nights won, night points, bracket head-to-head.</div>`;
  }
  if (season.status === STATUS.COMPLETE && season.playoffPodium.length) {
    html += `<div class="sec-label" style="margin-top:14px;">Playoff Results</div><div class="card">`;
    html += season.playoffPodium.map((pid, i) => {
      const seed = season.standings.findIndex(r => r.pid === pid) + 1;
      return `<div class="info-row"><span><strong style="color:var(--accent)">${i + 1}.</strong>&nbsp;${esc(nameOf(pid))}</span><span class="note">seed #${seed}</span></div>`;
    }).join('') + `</div>`;
  }
  return html;
}

function nightCardHTML(n, ni) {
  const order = nightPlacement(n);
  const pl = pointsLeaderIfDifferent(n);
  return `<div class="hist-card" style="cursor:pointer;" onclick="window._showNightSummary(${ni})">
    <div class="hist-head">
      <div><div class="hist-title">${esc(n.name || n.date)}</div><div style="font-size:0.63rem;color:var(--muted);margin-top:1px;">${esc(n.date || '')}</div></div>
      <div style="text-align:right;"><span style="font-size:0.76rem;color:var(--muted);">🏆 ${nightPlayerName(n, order[0])}</span><div style="font-size:0.6rem;color:var(--border);margin-top:2px;">tap for details</div></div>
    </div>
    <div class="hist-body">${order.map((slot, r) => `<div class="hist-row"><span><strong style="color:var(--accent)">${r + 1}.</strong>&nbsp;${nightPlayerName(n, slot)}${slot === pl ? ' <span class="title-badge" style="margin-left:4px;">Most pts</span>' : ''}</span><span style="font-family:'Bebas Neue',sans-serif;font-size:0.98rem;color:var(--accent)">${(n.scores || [])[slot] ?? 0} pts</span></div>`).join('')}</div>
  </div>`;
}

export function renderHistory() {
  const el = $('section-history');
  if (!_season || !seasonById(_season) || _seenCurrent !== S.currentSeasonId) { _season = S.currentSeasonId; _seenCurrent = S.currentSeasonId; }
  const season = seasonById(_season);
  let html = S.seasons.length > 1 ? seasonChipsHTML(_season, '_histSeason') : '';
  html += seasonSummaryHTML(season);
  const idxs = (S.history || []).map((n, i) => n.seasonId === season.id ? i : -1).filter(i => i >= 0).reverse();
  html += `<div class="sec-label" style="margin-top:14px;">Nights</div>`;
  html += idxs.length ? idxs.map(i => nightCardHTML(S.history[i], i)).join('') : `<div class="empty-state"><div class="big">📅</div><p>No nights played this season yet.</p></div>`;
  el.innerHTML = html;
}

window._histSeason = id => { _season = id; renderHistory(); };

window._showNightSummary = idx => {
  const n = (S.history || [])[idx];
  if (!n) return;
  const P = slot => nightPlayerName(n, slot);
  const order = nightPlacement(n);
  const pl = pointsLeaderIfDifferent(n);
  const gameWins = {};
  (n.games || []).forEach(g => {
    if (g.winnerId != null) { if (!gameWins[g.type]) gameWins[g.type] = {}; gameWins[g.type][g.winnerId] = (gameWins[g.type][g.winnerId] || 0) + 1; }
  });
  const rrW = (n.players || []).map(() => 0); (n.rrMatches || []).forEach(m => { if (m.winner != null) rrW[m.winner]++; });
  const rrKing = rrW.indexOf(Math.max(...rrW));
  const season = seasonById(n.seasonId);
  $('mSumSub').textContent = `${n.name} · ${n.date}${season ? ' · ' + season.name : ''}`;
  const th = 'padding:6px 8px;color:var(--muted);border-bottom:1px solid var(--border);';
  const td = 'padding:7px 8px;border-bottom:1px solid var(--border);';
  let html = `<div class="champ" style="margin-bottom:10px;"><div class="champ-title">🏆 Night Winner</div><div class="champ-name">${P(order[0])}</div><div class="champ-sub">Won the bracket${pl != null ? ` · most points: ${P(pl)}` : ''}</div></div>`;
  html += `<div style="background:var(--surface2);border-radius:8px;overflow:hidden;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
    <thead><tr><th style="${th}text-align:left;">Finish</th><th style="${th}text-align:center;">Cas</th><th style="${th}text-align:center;">RR</th><th style="${th}text-align:center;">Brkt</th><th style="${th}text-align:center;">Total</th></tr></thead><tbody>`;
  order.forEach((pi, r) => {
    html += `<tr><td style="${td}font-weight:700;">${r + 1}. ${P(pi)}</td>
      <td style="${td}text-align:center;">${(n.casualPts || [])[pi] || 0}</td>
      <td style="${td}text-align:center;">${(n.rrPts || [])[pi] || 0}</td>
      <td style="${td}text-align:center;">${(n.bracketPts || [])[pi] || 0}</td>
      <td style="${td}text-align:center;font-family:'Bebas Neue',sans-serif;font-size:1.1rem;color:var(--accent);">${(n.scores || [])[pi] ?? 0}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  html += `<div style="font-family:'Bebas Neue',sans-serif;font-size:0.82rem;letter-spacing:2px;color:var(--accent2);margin-bottom:6px;">HIGHLIGHTS</div>`;
  const hlItems = [];
  Object.entries(gameWins).forEach(([type, wins]) => {
    const top = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) hlItems.push(`🎯 ${P(+top[0])} won ${type} (${top[1]}x)`);
  });
  if ((n.rrMatches || []).length > 0) hlItems.push(`🏹 RR leader: ${P(rrKing)} (${rrW[rrKing]} wins)`);
  if ((n.bracketPodium || []).length > 1) hlItems.push(`🥈 Bracket runner-up: ${P(n.bracketPodium[1])}`);
  if (pl != null) hlItems.push(`💯 Most points: ${P(pl)} (${n.scores[pl]})`);
  if (!hlItems.length) hlItems.push('No detailed data — played before v1.2');
  html += hlItems.map(h => `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:0.82rem;">${h}</div>`).join('');
  $('mSumContent').innerHTML = html;
  openM('mSummary');
};
