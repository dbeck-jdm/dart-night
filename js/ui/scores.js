// Scores tab: tonight's totals, RR standings, all-time totals.
import { S, currentSeason, nameOf } from '../store.js';
import { seasonNights, seasonStandings, nightPlacement } from '../logic/seasons.js';
import { standingsTableHTML } from './history.js';
import { casualPts, rrPts, bracketPts, rankBy } from '../logic/scoring.js';
import { $, pName, esc } from './dom.js';

export function renderScores() {
  const el = $('section-scores');
  const cPts = casualPts(S.games), rPts = rrPts(S.rr.matches), bPts = bracketPts(S.bracket);
  const total = cPts.map((p, i) => p + rPts[i] + bPts[i]);
  const ranked = rankBy(total);
  let html = `<div class="sec-label">Tonight — ${S.active ? (esc(S.nightName) || 'Active Night') : 'No active night'}</div>`;
  html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;"><table class="stbl"><thead><tr><th>#</th><th>Player</th><th class="ctr">Cas</th><th class="ctr">RR</th><th class="ctr">Brkt</th><th>Total</th></tr></thead><tbody>`;
  ranked.forEach((idx, r) => { html += `<tr><td><strong style="${r === 0 ? 'color:var(--accent)' : ''}">${r + 1}</strong></td><td class="bold">${pName(idx)}</td><td class="ctr">${cPts[idx]}</td><td class="ctr">${rPts[idx]}</td><td class="ctr">${bPts[idx] || '—'}</td><td><span class="pts-big">${total[idx]}</span></td></tr>`; });
  html += `</tbody></table></div>`;
  if (S.rr.going || S.rr.done) {
    const rr2 = rankBy(rPts);
    html += `<div class="sec-label" style="margin-top:14px;">Round Robin Standings</div><div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;"><table class="stbl"><thead><tr><th>#</th><th>Player</th><th class="ctr">Wins</th><th class="ctr">Played</th></tr></thead><tbody>`;
    rr2.forEach((idx, r) => { const played = (S.rr.matches || []).filter(m => (m.p1 === idx || m.p2 === idx) && m.winner != null).length; html += `<tr><td><strong style="${r === 0 ? 'color:var(--accent)' : ''}">${r + 1}</strong></td><td class="bold">${pName(idx)}</td><td class="ctr"><span class="pts-big">${rPts[idx]}</span></td><td class="ctr" style="color:var(--muted)">${played}</td></tr>`; });
    html += `</tbody></table></div>`;
  }
  if (S.active && S.bracket.done) html += `<div style="margin-top:14px;"><button class="btn btn-primary btn-full" onclick="window._saveNight()">SAVE NIGHT & CLOSE</button></div>`;
  const season = currentSeason();
  if (seasonNights(S.history, season.id).length) {
    html += `<div class="sec-label" style="margin-top:14px;">${esc(season.name)} Standings</div>` + standingsTableHTML(season, seasonStandings(season, S.history));
  }
  if ((S.history || []).length) {
    // All-time, per person (not per seat)
    const t = {};
    S.history.forEach(n => {
      const win = nightPlacement(n)[0];
      (n.playerIds || []).forEach((pid, slot) => {
        const r = t[pid] = t[pid] || { pid, pts: 0, nights: 0, wins: 0 };
        r.pts += (n.scores || [])[slot] || 0; r.nights++; if (slot === win) r.wins++;
      });
    });
    const rows = Object.values(t).sort((a, b) => b.pts - a.pts);
    const nights = S.history.length;
    html += `<div class="sec-label" style="margin-top:14px;">All-Time (${nights} night${nights !== 1 ? 's' : ''})</div><div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;"><table class="stbl"><thead><tr><th>#</th><th>Player</th><th class="ctr">Pts</th><th class="ctr">Avg</th><th class="ctr" title="Nights won">W</th></tr></thead><tbody>`;
    rows.forEach((r, i) => { html += `<tr><td><strong style="${i === 0 ? 'color:var(--accent)' : ''}">${i + 1}</strong></td><td class="bold">${esc(nameOf(r.pid))}</td><td class="ctr"><span class="pts-big">${r.pts}</span></td><td class="ctr" style="color:var(--muted);font-size:0.82rem;">${(r.pts / r.nights).toFixed(1)}</td><td class="ctr">${r.wins}</td></tr>`; });
    html += `</tbody></table></div>`;
  }
  el.innerHTML = html;
}
