// History tab + night summary modal.
import { S } from '../store.js';
import { $, esc, openM } from './dom.js';

const rankScores = n => [...Array(n.players.length).keys()].sort((a, b) => n.scores[b] - n.scores[a]);

export function renderHistory() {
  const el = $('section-history');
  if (!(S.history || []).length) { el.innerHTML = `<div class="empty-state"><div class="big">📅</div><p>No completed nights yet.</p></div>`; return; }
  let html = '';
  [...(S.history || [])].reverse().forEach((n, idx2) => {
    const ranked = rankScores(n);
    const ni = S.history.length - 1 - idx2;
    html += `<div class="hist-card" style="cursor:pointer;" onclick="window._showNightSummary(${ni})">
      <div class="hist-head">
        <div><div class="hist-title">${esc(n.name || n.date)}</div><div style="font-size:0.63rem;color:var(--muted);margin-top:1px;">${esc(n.date || '')}</div></div>
        <div style="text-align:right;"><span style="font-size:0.76rem;color:var(--muted);">🏆 ${esc(n.players[ranked[0]])}</span><div style="font-size:0.6rem;color:var(--border);margin-top:2px;">tap for details</div></div>
      </div>
      <div class="hist-body">${ranked.map((idx, r) => `<div class="hist-row"><span><strong style="color:var(--accent)">${r + 1}.</strong>&nbsp;${esc(n.players[idx])}</span><span style="font-family:'Bebas Neue',sans-serif;font-size:0.98rem;color:var(--accent)">${n.scores[idx]} pts</span></div>`).join('')}</div>
    </div>`;
  });
  el.innerHTML = html;
}

window._showNightSummary = idx => {
  const n = (S.history || [])[idx];
  if (!n) return;
  const P = i => esc(n.players[i]);
  const ranked = rankScores(n);
  const gameWins = {};
  (n.games || []).forEach(g => {
    if (g.winnerId != null) { if (!gameWins[g.type]) gameWins[g.type] = {}; gameWins[g.type][g.winnerId] = (gameWins[g.type][g.winnerId] || 0) + 1; }
  });
  const rrW = [0, 0, 0, 0]; (n.rrMatches || []).forEach(m => { if (m.winner != null) rrW[m.winner]++; });
  const rrKing = rrW.indexOf(Math.max(...rrW));
  $('mSumSub').textContent = `${n.name} · ${n.date}`;
  const th = 'padding:6px 8px;color:var(--muted);border-bottom:1px solid var(--border);';
  const td = 'padding:7px 8px;border-bottom:1px solid var(--border);';
  let html = `<div class="champ" style="margin-bottom:10px;"><div class="champ-title">🏆 Champion</div><div class="champ-name">${P(ranked[0])}</div></div>`;
  // Scores breakdown
  html += `<div style="background:var(--surface2);border-radius:8px;overflow:hidden;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
    <thead><tr><th style="${th}text-align:left;">Player</th><th style="${th}text-align:center;">Cas</th><th style="${th}text-align:center;">RR</th><th style="${th}text-align:center;">Brkt</th><th style="${th}text-align:center;">Total</th></tr></thead><tbody>`;
  ranked.forEach((pi, r) => {
    html += `<tr><td style="${td}font-weight:700;">${r === 0 ? '🏆 ' : ''}${P(pi)}</td>
      <td style="${td}text-align:center;">${(n.casualPts || [])[pi] || 0}</td>
      <td style="${td}text-align:center;">${(n.rrPts || [])[pi] || 0}</td>
      <td style="${td}text-align:center;">${(n.bracketPts || [])[pi] || 0}</td>
      <td style="${td}text-align:center;font-family:'Bebas Neue',sans-serif;font-size:1.1rem;color:var(--accent);">${n.scores[pi]}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  // Highlights
  html += `<div style="font-family:'Bebas Neue',sans-serif;font-size:0.82rem;letter-spacing:2px;color:var(--accent2);margin-bottom:6px;">HIGHLIGHTS</div>`;
  const hlItems = [];
  Object.entries(gameWins).forEach(([type, wins]) => {
    const top = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) hlItems.push(`🎯 ${P(top[0])} won ${type} (${top[1]}x)`);
  });
  if ((n.rrMatches || []).length > 0) hlItems.push(`🏹 RR leader: ${P(rrKing)} (${rrW[rrKing]} wins)`);
  if ((n.bracketPodium || []).length) {
    hlItems.push(`🥇 Bracket winner: ${P(n.bracketPodium[0])}`);
    if (n.bracketPodium[1] != null) hlItems.push(`🥈 Runner-up: ${P(n.bracketPodium[1])}`);
  }
  if (!hlItems.length) hlItems.push('No detailed data — played before v1.2');
  html += hlItems.map(h => `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:0.82rem;">${h}</div>`).join('');
  $('mSumContent').innerHTML = html;
  openM('mSummary');
};
