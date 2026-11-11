// Bracket tab: the nightly double-elimination bracket and any pending season
// playoff. Both use the same engine and the same result modal.
import { S, save, seasonById, nameOf } from '../store.js';
import { advanceBracket, ROUND_ORDER, ROUND_LABELS } from '../logic/bracket.js';
import { STATUS, completePlayoff } from '../logic/seasons.js';
import { BRACKET_PTS } from '../logic/scoring.js';
import { $, esc, pName, rawName, toast, openM, closeM, pickerHTML, markPicked, dateStr } from './dom.js';

// Which bracket the result modal is editing: { kind: 'night' } or { kind: 'playoff', seasonId }
let _ctx = null, _bi = null, _bw = null;

export const playoffSeasons = () => S.seasons.filter(x => x.status === STATUS.PLAYOFFS);
const playoffName = season => slot => esc(nameOf(season.playerIds[slot]));
const playoffRaw = season => slot => nameOf(season.playerIds[slot]);

export function championHTML(podium, nameFn = pName, { title = '🏆 Champion', pts = true } = {}) {
  return `<div class="champ"><div class="champ-title">${title}</div><div class="champ-name">${nameFn(podium[0])}</div><div class="champ-sub">${(podium || []).map((idx, r) => `${r + 1}. ${nameFn(idx)}${pts ? ` — ${BRACKET_PTS[r]}pts` : ''}`).join('<br>')}</div></div>`;
}

// Loss pills + rounds for any bracket object.
export function bracketBodyHTML(b, nameFn, openCall) {
  let html = `<div class="pts-bar">`;
  (b.seeds || []).forEach(i => { const l = (b.losses && b.losses[i]) || 0, out = l >= 2; html += `<div class="pts-pill" style="${out ? 'opacity:0.4;border-color:var(--red);color:var(--red)' : ''}">${nameFn(i)}: ${l}L${out ? ' ❌' : ''}</div>`; });
  html += `</div>`;
  ROUND_ORDER.forEach(r => {
    const rms = (b.matches || []).filter(m => m.round === r); if (!rms.length) return;
    html += `<div class="round-lbl">${ROUND_LABELS[r]}</div>`;
    rms.forEach(m => {
      const isDone = m.winner != null, canPlay = !isDone && m.p1 != null && m.p2 != null;
      const isFinal = m.round === 'GF' || m.round === 'GFR';
      const banner = isFinal ? `<div class="final-banner">🏆 Championship${m.round === 'GFR' ? ' · Reset' : ''}</div>` : '';
      html += `<div class="bmatch ${canPlay ? 'cur' : ''} ${isFinal ? 'final' : ''}">${banner}<div class="bmatch-lbl"><span>${m.label}</span>${isDone ? `<span style="color:var(--green)">✓</span>` : ''}</div>
        ${bPl(b, m, m.p1, isDone, nameFn)}${bPl(b, m, m.p2, isDone, nameFn)}
        ${canPlay ? `<div class="b-action"><button class="btn btn-primary btn-sm" onclick="${openCall(m.id)}">Enter Result</button></div>` : ''}</div>`;
    });
  });
  return html;
}

function bPl(b, m, idx, isDone, nameFn) {
  if (idx == null) return `<div class="bplayer"><span class="bname" style="color:var(--muted)">TBD</span></div>`;
  const isW = isDone && m.winner === idx, isL = isDone && m.loser === idx, seed = (b.seeds || []).indexOf(idx) + 1;
  return `<div class="bplayer ${isW ? 'bwin' : ''} ${isL ? 'belim' : ''}"><div class="bseed">${seed}</div><div class="bname">${nameFn(idx)}${isW ? `<span class="crown">👑</span>` : ''}</div><div class="blosses">${(b.losses && b.losses[idx]) || 0}L</div></div>`;
}

// Champion block for a finished season: playoff champion, regular-season champion, final order with seeds.
export function seasonResultHTML(season) {
  const seedOf = pid => season.standings.findIndex(r => r.pid === pid) + 1;
  const pod = season.playoffPodium || [];
  const double = season.playoffChampion && season.playoffChampion === season.regularChampion;
  return `<div class="champ champ-season">
    <div class="champ-kicker">${esc(season.name)} Playoff</div>
    <div class="champ-title">🏆 Champion</div>
    <div class="champ-name">${esc(nameOf(season.playoffChampion))}</div>
    ${double ? `<div class="title-badge" style="margin-top:4px;">👑 + 🏆 Double — won the regular season too</div>` : ''}
    <div class="champ-sub">${pod.map((pid, r) => `${r + 1}. ${esc(nameOf(pid))} <span style="opacity:0.6">(seed #${seedOf(pid)})</span>`).join('<br>')}</div>
    <div class="champ-sub" style="border-top:1px solid var(--border);margin-top:8px;padding-top:6px;">👑 Regular season: <strong style="color:var(--text)">${esc(nameOf(season.regularChampion))}</strong></div>
  </div>`;
}

// Most recently finished playoff, shown on the Bracket tab until something else is in play.
export const lastCompletedPlayoff = () => [...S.seasons].reverse().find(x => x.status === STATUS.COMPLETE && x.playoff && x.playoff.done);

export function renderBracket() {
  const el = $('section-bracket');
  let html = '';
  playoffSeasons().filter(x => x.playoff && x.playoff.going).forEach(season => {
    html += `<div class="sec-label">${esc(season.name)} Playoff <span style="opacity:0.6">· double elimination</span></div>`;
    html += bracketBodyHTML(season.playoff, playoffName(season), id => `window._openPM('${season.id}',${id})`);
  });
  const recent = lastCompletedPlayoff();
  if (!html && !(S.active && S.bracket.going) && recent) {
    html += seasonResultHTML(recent);
    html += `<div class="sec-label">${esc(recent.name)} Playoff · Final</div>`;
    html += bracketBodyHTML(recent.playoff, playoffName(recent), () => '');
    html += `<div class="note" style="text-align:center;margin-top:8px;">Season results are also in History.</div>`;
  }
  if (S.active && S.bracket.going) {
    if (html) html += `<div class="sec-label" style="margin-top:18px;">Tonight's Bracket</div>`;
    if (S.bracket.done) html += championHTML(S.bracket.podium) + `<button class="btn btn-primary btn-full" onclick="window._saveNight()">SAVE NIGHT & CLOSE</button><div style="margin-top:8px;"></div>`;
    html += bracketBodyHTML(S.bracket, pName, id => `window._openBM(${id})`);
  }
  el.innerHTML = html || `<div class="empty-state"><div class="big">🏆</div><p>Complete the round robin to seed<br>and start the bracket.</p></div>`;
}

function openResult(ctx, b, id, rawFn) {
  _ctx = ctx; _bi = id; _bw = null;
  const m = b.matches.find(x => x.id === id);
  $('mBTitle').textContent = (ctx.kind === 'playoff' ? 'PLAYOFF · ' : '') + m.label.toUpperCase();
  $('mBSub').textContent = `${rawFn(m.p1)} vs ${rawFn(m.p2)}`;
  // Playoff slots map to the season's roster, not tonight's seats
  $('mBPlayers').innerHTML = pickerHTML('bp', [m.p1, m.p2], '_pickB', slot => esc(rawFn(slot)));
  openM('mBracket');
}

window._openBM = id => openResult({ kind: 'night' }, S.bracket, id, rawName);
window._openPM = (seasonId, id) => { const season = seasonById(seasonId); openResult({ kind: 'playoff', seasonId }, season.playoff, id, playoffRaw(season)); };
window._pickB = idx => { _bw = idx; markPicked('mBPlayers', 'bp', idx); };
window.confirmBracket = () => {
  if (_bw === null) { toast('Pick a winner'); return; }
  closeM('mBracket');
  if (_ctx.kind === 'playoff') {
    const season = seasonById(_ctx.seasonId);
    advanceBracket(season.playoff, _bi, _bw);
    if (season.playoff.done) {
      completePlayoff(season, dateStr());
      save();
      $('mChampContent').innerHTML = seasonResultHTML(season);
      openM('mChampion');
      return;
    }
    save(); toast(`${playoffRaw(season)(_bw)} advances! 🏹`);
    return;
  }
  advanceBracket(S.bracket, _bi, _bw);
  save();
  toast(`${rawName(_bw)} advances! 🏹`);
};
