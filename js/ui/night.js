// Night tab: casual games, round robin, bracket hand-off, save night.
import { S, save, emptyRR, emptyBracket } from '../store.js';
import { casualPts, rrPts, rrSeeds, bracketPts, BRACKET_PTS } from '../logic/scoring.js';
import { buildRRMatches } from '../logic/schedule.js';
import { createBracket } from '../logic/bracket.js';
import { $, pName, rawName, esc, toast, openM, closeM, pickerHTML, markPicked } from './dom.js';

export const GAME_TYPES = ['Cricket', 'Shanghai', 'Halve-It', 'Gotcha', 'Hammer Cricket', 'Killer', '301'];

// Add-game form (UI only, not synced)
let ag;
export function resetAddForm() { ag = { type: null, numPlayers: 4, pts: true, p1: null, p2: null, _open: true }; }
resetAddForm();

let _wi = null, _ww = null, _ri = null, _rw = null, _fmt = 1;

export function renderNight() {
  const el = $('section-night');
  if (!S.active) { el.innerHTML = `<div class="empty-state"><div class="big">🎯</div><p>Go to Setup, enter player names and night name,<br>then tap Start Night.</p></div>`; return; }
  const cPts = casualPts(S.games);
  let html = `<div class="pts-bar">`;
  (S.players || []).forEach((p, i) => html += `<div class="pts-pill">${esc(p)}: ${cPts[i]}pt${cPts[i] !== 1 ? 's' : ''}</div>`);
  html += `</div>`;

  if ((S.games || []).length > 0) {
    html += `<div class="sec-label">Games Played</div>`;
    (S.games || []).forEach((g, i) => {
      const done = g.winnerId != null, is4p = (g.players || []).length === 4;
      html += `<div class="game-card ${done ? 'done' : ''}">
        <div class="game-head"><span class="game-num">${i + 1}</span><span class="game-name">${g.type}</span>
          <span class="gtag ${is4p ? 'gtag-4p' : 'gtag-1v1'}">${is4p ? '4 Players' : '1v1'}</span>
          ${!g.pts ? `<span class="gtag gtag-nopt" style="margin-left:3px;">No Pts</span>` : ''}
        </div>
        <div class="game-body">
          ${done
            ? `<div class="winner-row"><div class="winner-disp">🏆 ${pName(g.winnerId)}${g.pts ? ' +1pt' : ''}</div><button class="btn btn-secondary btn-sm" onclick="window._undoGame(${i})">Undo</button></div>`
            : `<div class="action-row"><span class="players-hint">${(g.players || []).map(idx => pName(idx)).join(' · ')}</span><button class="btn btn-ghost btn-sm" onclick="window._removeGame(${i})">✕</button><button class="btn btn-primary btn-sm" onclick="window._openWinnerM(${i})">Result</button></div>`}
        </div>
      </div>`;
    });
  }

  if (!S.rr.going && !S.bracket.going) {
    html += `<div class="sec-label">Add Game</div>`;
    html += renderAddPanel(ag._open);
  }

  html += `<div class="sec-label" style="margin-top:16px;">Round Robin <span style="font-size:0.63rem;color:var(--muted);font-family:'Barlow',sans-serif;letter-spacing:0;font-weight:400;margin-left:4px;">1v1 · Seeds the bracket</span></div>`;
  if (!S.rr.going && !S.rr.done) {
    html += `<div class="card" style="text-align:center;"><p style="font-size:0.8rem;color:var(--muted);margin-bottom:10px;">Everyone plays everyone. Ready when you are.</p><button class="btn btn-primary" onclick="window.openM('mRRConfirm')">SELECT FORMAT & START</button></div>`;
  } else if (S.rr.going && !S.rr.done) {
    const played = (S.rr.matches || []).filter(m => m.winner != null || m.skipped).length;
    html += `<div style="padding:9px 11px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:0.8rem;color:var(--muted);">${S.rr.rounds}x format in progress</span><span style="font-family:'Bebas Neue',sans-serif;color:var(--accent);">${played}/${(S.rr.matches || []).length}</span></div>`;
    html += renderRRMatches();
    html += `<button class="btn btn-secondary btn-full" style="margin-top:6px;" onclick="window._finishRR()">FINISH ROUND ROBIN EARLY</button>`;
  } else if (S.rr.done) {
    const seeds = rrSeeds(S.rr.matches, S.games), rp = rrPts(S.rr.matches);
    html += `<div class="card"><h3>RR Complete — Seedings</h3>${seeds.map((idx, r) => `<div class="info-row"><span><strong style="color:var(--accent)">#${r + 1}</strong>&nbsp;&nbsp;${pName(idx)}</span><span style="color:var(--muted);font-size:0.78rem;">${rp[idx]} win${rp[idx] !== 1 ? 's' : ''}</span></div>`).join('')}</div>`;
  }

  html += `<div class="sec-label" style="margin-top:16px;">Tournament <span style="font-size:0.63rem;color:var(--muted);font-family:'Barlow',sans-serif;letter-spacing:0;font-weight:400;margin-left:4px;">1v1 · Double elim · 8/6/3/1 pts</span></div>`;
  if (!S.rr.done) {
    html += `<div style="padding:11px;text-align:center;color:var(--muted);font-size:0.82rem;background:var(--surface);border:1px solid var(--border);border-radius:8px;">Complete the round robin to unlock the bracket.</div>`;
  } else if (!S.bracket.going) {
    const seeds = rrSeeds(S.rr.matches, S.games), rp = rrPts(S.rr.matches);
    html += `<div class="card"><h3>Bracket Seedings</h3><p style="font-size:0.74rem;color:var(--muted);margin-bottom:8px;">RR wins · H2H tiebreaker · Total pts fallback</p>${seeds.map((idx, r) => `<div class="info-row"><span><strong style="color:var(--accent)">#${r + 1}</strong>&nbsp;&nbsp;${pName(idx)}</span><span style="color:var(--muted);font-size:0.78rem;">${rp[idx]}W</span></div>`).join('')}<button class="btn btn-primary btn-full" style="margin-top:10px;" onclick="window._startBracket()">START BRACKET</button></div>`;
  } else if (S.bracket.done) {
    html += championHTML(S.bracket.podium) + `<button class="btn btn-primary btn-full" onclick="window._saveNight()">SAVE NIGHT & CLOSE</button>`;
  } else {
    html += `<div style="padding:11px;text-align:center;font-size:0.82rem;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:8px;">Bracket in progress → Bracket tab</div>`;
  }
  el.innerHTML = html;
}

export function championHTML(podium) {
  return `<div class="champ"><div class="champ-title">🏆 Champion</div><div class="champ-name">${pName(podium[0])}</div><div class="champ-sub">${(podium || []).map((idx, r) => `${r + 1}. ${pName(idx)} — ${BRACKET_PTS[r]}pts`).join('<br>')}</div></div>`;
}

function renderAddPanel(isOpen) {
  let html = `<div class="add-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${isOpen ? '10' : '0'}px;">
      <h4 style="margin-bottom:0;">+ ADD GAME</h4>
      <button class="btn btn-ghost btn-sm" onclick="window._toggleAddPanel()">${isOpen ? '▲ Hide' : '▼ Show'}</button>
    </div>`;
  if (isOpen) {
    html += `<div class="lbl">Game Type</div>
    <div class="gt-grid">${GAME_TYPES.map(t => `<div class="gt-btn ${ag.type === t ? 'sel' : ''}" onclick="window._agType('${t}')">${t}</div>`).join('')}</div>`;
    if (ag.type) {
      html += `<div class="lbl">Players</div>
      <div class="tog-row">
        <div class="tog-btn ${ag.numPlayers === 4 ? 'sel' : ''}" onclick="window._agPlayers(4)">All 4</div>
        <div class="tog-btn ${ag.numPlayers === 2 ? 'sel' : ''}" onclick="window._agPlayers(2)">Head to Head</div>
      </div>`;
      if (ag.numPlayers === 2) {
        html += `<div class="lbl">Select 2 Players</div><div class="p2-grid">${(S.players || []).map((_, i) => `<div class="p2-btn ${(ag.p1 === i || ag.p2 === i) ? 'sel' : ''}" onclick="window._agP2(${i})">${pName(i)}</div>`).join('')}</div>`;
      }
      html += `<div class="lbl">Points</div>
      <div class="tog-row">
        <div class="tog-btn ${ag.pts ? 'sel' : ''}" onclick="window._agPts(true)">Points On</div>
        <div class="tog-btn ${!ag.pts ? 'sel' : ''}" onclick="window._agPts(false)">No Points</div>
      </div>
      <button class="btn btn-primary btn-full" onclick="window._addGame()">ADD GAME</button>`;
    }
  }
  return html + `</div>`;
}

window._toggleAddPanel = () => { ag._open = !ag._open; renderNight(); };
window._agType = t => { ag.type = t; ag.pts = (t !== 'Killer'); renderNight(); };
window._agPlayers = n => { ag.numPlayers = n; if (n === 4) { ag.p1 = null; ag.p2 = null; } renderNight(); };
window._agPts = v => { ag.pts = v; renderNight(); };
window._agP2 = i => {
  if (ag.p1 === null) ag.p1 = i;
  else if (ag.p2 === null && i !== ag.p1) ag.p2 = i;
  else if (i === ag.p1) { ag.p1 = ag.p2; ag.p2 = null; }
  else ag.p2 = i;
  renderNight();
};
window._addGame = () => {
  if (!ag.type) { toast('Pick a game type'); return; }
  if (ag.numPlayers === 2 && (ag.p1 === null || ag.p2 === null || ag.p1 === ag.p2)) { toast('Select 2 different players'); return; }
  const players = ag.numPlayers === 4 ? [0, 1, 2, 3] : [ag.p1, ag.p2], type = ag.type;
  if (!S.games) S.games = [];
  S.games.push({ id: Date.now(), type, players, pts: ag.pts, winnerId: null });
  const open = ag._open; resetAddForm(); ag._open = open;
  save(); toast(`${type} added!`);
};
window._removeGame = i => { S.games.splice(i, 1); save(); };
window._undoGame = i => { S.games[i].winnerId = null; save(); };

// ── Casual winner modal ──────────────────────────────────────────────────────
window._openWinnerM = i => {
  _wi = i; _ww = null;
  const g = S.games[i];
  $('mWTitle').textContent = `GAME ${i + 1}: ${g.type}`;
  $('mWSub').textContent = g.pts ? 'Winner gets 1pt' : 'No points — just glory';
  $('mWPlayers').innerHTML = pickerHTML('wp', g.players || [], '_pickW');
  openM('mWinner');
};
window._pickW = idx => { _ww = idx; markPicked('mWPlayers', 'wp', idx); };
window.confirmCasualW = () => {
  if (_ww === null) { toast('Pick a winner'); return; }
  S.games[_wi].winnerId = _ww;
  save(); closeM('mWinner');
  toast(`${rawName(_ww)} wins!${S.games[_wi].pts ? ' +1pt 🎯' : ' 🎯'}`);
};

// ── Round robin ──────────────────────────────────────────────────────────────
function renderRRMatches() {
  let html = '';
  const nxt = (S.rr.matches || []).findIndex(x => x.winner == null && !x.skipped);
  (S.rr.matches || []).forEach((m, i) => {
    const done = m.winner != null, skip = m.skipped, cur = i === nxt;
    html += `<div class="game-card ${cur ? 'current' : ''} ${done ? 'done' : ''} ${skip ? 'skipped' : ''}">
      <div class="game-head"><span class="game-num">${i + 1}</span><span class="game-name">301</span><span class="gtag gtag-rr">RR${m.leg === 2 ? ' L2' : ''}</span></div>
      <div class="game-body">
        ${done ? `<div class="winner-row"><div class="winner-disp">🏆 ${pName(m.winner)}</div><button class="btn btn-secondary btn-sm" onclick="window._undoRR(${i})">Undo</button></div>`
          : skip ? `<div class="winner-row"><div style="color:var(--muted);font-size:0.8rem;">— Skipped —</div><button class="btn btn-secondary btn-sm" onclick="window._undoRR(${i})">Restore</button></div>`
          : `<div class="action-row"><span class="players-hint">${pName(m.p1)} vs ${pName(m.p2)}</span><button class="btn btn-primary btn-sm" onclick="window._openRRM(${i})">Result</button></div>`}
      </div>
    </div>`;
  });
  return html;
}

const rrAllPlayed = () => (S.rr.matches || []).every(m => m.winner != null || m.skipped);

window._openRRM = i => {
  _ri = i; _rw = null;
  const m = S.rr.matches[i];
  $('mRRTitle').textContent = `RR MATCH ${i + 1}${m.leg === 2 ? ' · LEG 2' : ''}`;
  $('mRRSub').textContent = `${rawName(m.p1)} vs ${rawName(m.p2)} · Win = 1 RR point`;
  $('mRRPlayers').innerHTML = pickerHTML('rp', [m.p1, m.p2], '_pickRR');
  openM('mRR');
};
window._pickRR = idx => { _rw = idx; markPicked('mRRPlayers', 'rp', idx); };
window.confirmRR = () => {
  if (_rw === null) { toast('Pick a winner'); return; }
  S.rr.matches[_ri].winner = _rw; S.rr.matches[_ri].skipped = false;
  if (rrAllPlayed()) { S.rr.done = true; toast('Round robin complete! 🎯'); }
  save(); closeM('mRR'); toast(`${rawName(_rw)} wins the match!`);
};
window.skipRR = () => {
  S.rr.matches[_ri].skipped = true; S.rr.matches[_ri].winner = null;
  if (rrAllPlayed()) S.rr.done = true;
  save(); closeM('mRR'); toast('Match skipped');
};
window._undoRR = i => { S.rr.matches[i].winner = null; S.rr.matches[i].skipped = false; S.rr.done = false; save(); };
window._finishRR = () => { if (!confirm('Mark round robin complete?')) return; S.rr.done = true; save(); toast('Round robin complete!'); };

// ── RR format modal ──────────────────────────────────────────────────────────
function pickFmt(n) { _fmt = n; $('fmt1').classList.toggle('sel', n === 1); $('fmt2').classList.toggle('sel', n === 2); }
window.pickFmt = pickFmt;
window._openFormatM = () => { pickFmt(1); openM('mFormat'); };
window.confirmFormat = () => {
  // Interleaved so no player plays consecutive matches
  S.rr = { going: true, rounds: _fmt, matches: buildRRMatches(_fmt), done: false };
  save(); closeM('mFormat'); toast(`Round robin started — ${_fmt === 1 ? '6' : '12'} matches!`);
};

// ── Bracket start / save night ───────────────────────────────────────────────
window._startBracket = () => {
  S.bracket = createBracket(rrSeeds(S.rr.matches, S.games));
  save(); toast('Bracket started!');
};

window._saveNight = () => {
  const cPts = casualPts(S.games), rPts = rrPts(S.rr.matches), bPts = bracketPts(S.bracket);
  if (!S.history) S.history = [];
  S.history.push({
    name: S.nightName,
    date: S.nightDate,
    players: [...S.players],
    scores: cPts.map((p, i) => p + rPts[i] + bPts[i]),
    casualPts: [...cPts],
    rrPts: [...rPts],
    bracketPts: [...bPts],
    games: (S.games || []).map(g => ({ type: g.type, players: [...g.players], pts: g.pts, winnerId: g.winnerId })),
    rrMatches: (S.rr.matches || []).map(m => ({ p1: m.p1, p2: m.p2, winner: m.winner ?? null, skipped: m.skipped || false, leg: m.leg || 1 })),
    bracketMatches: (S.bracket.matches || []).map(m => ({ label: m.label, p1: m.p1 ?? null, p2: m.p2 ?? null, winner: m.winner ?? null, loser: m.loser ?? null, round: m.round })),
    bracketPodium: [...(S.bracket.podium || [])],
  });
  S.active = false;
  S.games = [];
  S.nightName = '';
  S.nightDate = '';
  S.rr = emptyRR();
  S.bracket = emptyBracket();
  save();
  toast('Night saved! 🎉');
  const histTab = document.querySelectorAll('.tab')[3];
  if (histTab) histTab.click();
};
