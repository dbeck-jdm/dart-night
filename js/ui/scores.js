// Scores tab: tonight's totals, RR standings, all-time totals.
import { S } from '../store.js';
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
  if ((S.history || []).length) {
    const allTime = [0, 0, 0, 0]; (S.history || []).forEach(n => (n.scores || []).forEach((s, i) => allTime[i] += s));
    const aR = rankBy(allTime);
    const nights = (S.history || []).length;
    html += `<div class="sec-label" style="margin-top:14px;">All-Time (${nights} night${nights !== 1 ? 's' : ''})</div><div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;"><table class="stbl"><thead><tr><th>#</th><th>Player</th><th class="ctr">Total</th><th class="ctr">Avg</th></tr></thead><tbody>`;
    aR.forEach((idx, r) => { html += `<tr><td><strong style="${r === 0 ? 'color:var(--accent)' : ''}">${r + 1}</strong></td><td class="bold">${pName(idx)}</td><td class="ctr"><span class="pts-big">${allTime[idx]}</span></td><td class="ctr" style="color:var(--muted);font-size:0.82rem;">${(allTime[idx] / nights).toFixed(1)}</td></tr>`; });
    html += `</tbody></table></div>`;
  }
  el.innerHTML = html;
}
