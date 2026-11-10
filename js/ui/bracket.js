// Bracket tab for the nightly double-elimination bracket.
import { S, save } from '../store.js';
import { advanceBracket, ROUND_ORDER, ROUND_LABELS } from '../logic/bracket.js';
import { $, pName, rawName, toast, openM, closeM, pickerHTML, markPicked } from './dom.js';
import { championHTML } from './night.js';

let _bi = null, _bw = null;

export function renderBracket() {
  const el = $('section-bracket');
  if (!S.active || !S.bracket.going) { el.innerHTML = `<div class="empty-state"><div class="big">🏆</div><p>Complete the round robin to seed<br>and start the bracket.</p></div>`; return; }
  const b = S.bracket;
  let html = `<div class="pts-bar">`;
  (b.seeds || []).forEach(i => { const l = (b.losses && b.losses[i]) || 0, out = l >= 2; html += `<div class="pts-pill" style="${out ? 'opacity:0.4;border-color:var(--red);color:var(--red)' : ''}">${pName(i)}: ${l}L${out ? ' ❌' : ''}</div>`; });
  html += `</div>`;
  if (b.done) {
    html += championHTML(b.podium) + `<button class="btn btn-primary btn-full" onclick="window._saveNight()">SAVE NIGHT & CLOSE</button><div style="margin-top:8px;"></div>`;
  }
  ROUND_ORDER.forEach(r => {
    const rms = (b.matches || []).filter(m => m.round === r); if (!rms.length) return;
    html += `<div class="round-lbl">${ROUND_LABELS[r]}</div>`;
    rms.forEach(m => {
      const isDone = m.winner != null, canPlay = !isDone && m.p1 != null && m.p2 != null;
      html += `<div class="bmatch ${canPlay ? 'cur' : ''}"><div class="bmatch-lbl"><span>${m.label}</span>${isDone ? `<span style="color:var(--green)">✓</span>` : ''}</div>
        ${bPl(b, m, m.p1, isDone)}${bPl(b, m, m.p2, isDone)}
        ${canPlay ? `<div class="b-action"><button class="btn btn-primary btn-sm" onclick="window._openBM(${m.id})">Enter Result</button></div>` : ''}</div>`;
    });
  });
  el.innerHTML = html;
}

function bPl(b, m, idx, isDone) {
  if (idx == null) return `<div class="bplayer"><span class="bname" style="color:var(--muted)">TBD</span></div>`;
  const isW = isDone && m.winner === idx, isL = isDone && m.loser === idx, seed = (b.seeds || []).indexOf(idx) + 1;
  return `<div class="bplayer ${isW ? 'bwin' : ''} ${isL ? 'belim' : ''}"><div class="bseed">${seed}</div><div class="bname">${pName(idx)}${isW ? `<span class="crown">👑</span>` : ''}</div><div class="blosses">${(b.losses && b.losses[idx]) || 0}L</div></div>`;
}

window._openBM = id => {
  _bi = id; _bw = null;
  const m = S.bracket.matches.find(x => x.id === id);
  $('mBTitle').textContent = m.label.toUpperCase();
  $('mBSub').textContent = `${rawName(m.p1)} vs ${rawName(m.p2)}`;
  $('mBPlayers').innerHTML = pickerHTML('bp', [m.p1, m.p2], '_pickB');
  openM('mBracket');
};
window._pickB = idx => { _bw = idx; markPicked('mBPlayers', 'bp', idx); };
window.confirmBracket = () => {
  if (_bw === null) { toast('Pick a winner'); return; }
  closeM('mBracket');
  advanceBracket(S.bracket, _bi, _bw);
  save();
  toast(`${rawName(_bw)} advances! 🏹`);
};
