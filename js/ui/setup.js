import { S, fresh, normalize, replaceState, applyImport, save, emptyRR, emptyBracket, currentSeason, nameOf } from '../store.js';
import { THEMES, applyTheme } from '../themes.js';
import { APP_VERSION } from '../config.js';
import { $, esc, toast, dateStr } from './dom.js';
import { resetAddForm } from './night.js';
import { STATUS, DEFAULT_SEASON_NIGHTS, seasonNights, endRegularSeason, makeSeason, newPlayerId } from '../logic/seasons.js';

function seasonCardHTML() {
  const season = currentSeason();
  const played = seasonNights(S.history, season.id).length;
  let html = `<div class="card"><h3>${esc(season.name)}</h3>`;
  if (season.status === STATUS.REGULAR) {
    html += `<div class="info-row"><span>Nights played</span><span class="bold">${played} of ${season.nights}</span></div>
      <div class="info-row" style="align-items:center;"><span>Nights in regular season</span>
        <input type="number" min="${Math.max(1, played)}" max="99" value="${season.nights}" onchange="window._setSeasonNights(this.value)"/></div>
      <p class="note" style="margin:10px 0;line-height:1.6;">The regular season ends automatically after the last night. End it early to crown the champion now and unlock the playoff.</p>
      <button class="btn btn-secondary btn-full btn-sm" onclick="window._endSeason()">END REGULAR SEASON NOW</button>`;
  } else {
    const done = season.status === STATUS.COMPLETE;
    html += `<div class="info-row"><span>Regular season</span><span class="bold">👑 ${esc(nameOf(season.regularChampion))}</span></div>
      <div class="info-row"><span>Playoff</span><span class="bold">${done ? '🏆 ' + esc(nameOf(season.playoffChampion)) : 'Pending'}</span></div>`;
    html += newSeasonFormHTML(season);
  }
  return html + `</div>`;
}

function newSeasonFormHTML(season) {
  const roster = Object.values(S.roster);
  const slot = i => `<div class="player-row">
      <div class="player-num">${i + 1}</div>
      <select id="ns-sel-${i}" style="flex:1" onchange="document.getElementById('ns-new-${i}').style.display=this.value==='__new'?'block':'none'">
        ${roster.map(p => `<option value="${p.id}" ${S.playerIds[i] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        <option value="__new">+ New player…</option>
      </select>
    </div>
    <input type="text" id="ns-new-${i}" placeholder="New player's name" style="display:none;width:100%;margin:-2px 0 8px 34px;width:calc(100% - 34px);"/>`;
  return `<div class="lbl" style="margin-top:14px;">Start Season ${season.number + 1}</div>
    <p class="note" style="margin-bottom:8px;line-height:1.6;">Stats start fresh; all history is kept. ${season.status === STATUS.PLAYOFFS ? 'The playoff can still be played afterwards.' : ''}</p>
    ${[0, 1, 2, 3].map(slot).join('')}
    <div class="info-row" style="align-items:center;margin-bottom:8px;"><span>Nights in regular season</span><input type="number" id="ns-nights" min="1" max="99" value="${DEFAULT_SEASON_NIGHTS}"/></div>
    <button class="btn btn-primary btn-full" onclick="window._startSeason()">START SEASON ${season.number + 1}</button>`;
}

export function renderSetup() {
  $('section-setup').innerHTML = `
    ${seasonCardHTML()}
    <div class="card"><h3>Players</h3>
      ${(S.players || []).map((p, i) => `<div class="player-row"><div class="player-num">${i + 1}</div>
        <input type="text" value="${esc(p)}" oninput="window._setPlayer(${i},this.value)" placeholder="Player ${i + 1}"/></div>`).join('')}
      <p class="note" style="margin-top:4px;line-height:1.6;">Editing a name renames that player everywhere, including history. To swap someone out, start a new season.</p>
    </div>
    <div class="card"><h3>Night Name</h3>
      <input type="text" value="${esc(S.nightName || '')}" placeholder="e.g. April Dart Night" style="width:100%" oninput="window._setNightName(this.value)"/>
    </div>
    <div class="card"><h3>Points Guide</h3>
      <div style="font-size:0.78rem;color:var(--muted);line-height:2.2;">
        <div>Casual games: <strong style="color:var(--text)">Winner = 1pt (if points on)</strong></div>
        <div>Round robin: <strong style="color:var(--text)">Win = 1pt · Seeds bracket</strong></div>
        <div>Bracket (double-elim): <strong style="color:var(--text)">1st=8 · 2nd=6 · 3rd=3 · 4th=1</strong></div>
        <div>Night winner: <strong style="color:var(--text)">Bracket winner (points tracked separately)</strong></div>
        <div>Season: <strong style="color:var(--text)">4/3/2/1 per night by bracket finish · seeds playoff</strong></div>
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="window._startNight()">START NIGHT</button>
    <div style="margin-top:8px;"><button class="btn btn-danger btn-full btn-sm" onclick="window._resetAll()">RESET ALL DATA</button></div>
    <div class="card" style="margin-top:12px;">
      <h3>Color Theme</h3>
      <div class="theme-chooser">${Object.entries(THEMES).map(([k, t]) => `
        <div class="theme-swatch ${(S.theme || 'gold') === k ? 'sel' : ''}" onclick="window._setTheme('${k}')">
          <div class="theme-dot"><span style="background:${t.a}"></span><span style="background:${t.b}"></span></div>
          <div class="theme-lbl">${t.name}</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="card" style="margin-top:0px;">
      <h3>Backup & Restore</h3>
      <p style="font-size:0.78rem;color:var(--muted);margin-bottom:10px;line-height:1.6;">Export saves all history and settings to a JSON file. Import restores from a previous export.</p>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" style="flex:1" onclick="window._exportData()">⬇ Export</button>
        <label style="flex:1;cursor:pointer;">
          <span class="btn btn-secondary btn-sm" style="width:100%;display:inline-flex;align-items:center;justify-content:center;gap:5px;">⬆ Import</span>
          <input type="file" accept=".json" style="display:none" onchange="window._importData(this)"/>
        </label>
      </div>
    </div>
    <div style="margin-top:20px;text-align:center;color:var(--muted);font-size:0.68rem;letter-spacing:1px;">${APP_VERSION}</div>`;
}

let _pTimer = null, _nnTimer = null;
window._setPlayer = (i, v) => {
  S.players[i] = v;
  const pid = S.playerIds[i];
  if (S.roster[pid]) S.roster[pid].name = v; // rename the person, not just the seat
  clearTimeout(_pTimer); _pTimer = setTimeout(() => save(), 1000);
};
window._setNightName = v => { S.nightName = v; clearTimeout(_nnTimer); _nnTimer = setTimeout(() => save(), 1000); };

window._setSeasonNights = v => {
  const season = currentSeason();
  const n = Math.max(1, Math.min(99, parseInt(v, 10) || season.nights));
  const played = seasonNights(S.history, season.id).length;
  if (n < played) { toast(`${played} nights already played`); renderSetup(); return; }
  season.nights = n;
  if (n === played && !S.active) { window._endSeason(true); return; }
  save(); toast(`Season length: ${n} nights`);
};

window._endSeason = (skipConfirm = false) => {
  const season = currentSeason();
  if (season.status !== STATUS.REGULAR) return;
  if (S.active) { toast('Save or finish tonight first'); return; }
  const played = seasonNights(S.history, season.id).length;
  if (!played) { toast('Play at least one night first'); return; }
  if (!skipConfirm && !confirm(`End the ${season.name} regular season after ${played} night${played !== 1 ? 's' : ''}? This crowns the regular-season champion and unlocks the playoff.`)) return;
  endRegularSeason(season, S.history, dateStr());
  save();
  toast(`👑 ${nameOf(season.regularChampion)} wins the ${season.name} regular season!`);
  document.querySelectorAll('.tab')[0].click();
};

window._startSeason = () => {
  const prev = currentSeason();
  if (prev.status === STATUS.REGULAR) return;
  if (S.active) { toast('Save or finish tonight first'); return; }
  const ids = [], names = [];
  for (let i = 0; i < 4; i++) {
    const sel = $(`ns-sel-${i}`).value;
    if (sel === '__new') {
      const name = $(`ns-new-${i}`).value.trim();
      if (!name) { toast(`Enter a name for player ${i + 1}`); return; }
      if (Object.values(S.roster).some(p => p.name.toLowerCase() === name.toLowerCase())) { toast(`${name} already exists — pick them from the list`); return; }
      ids.push({ newName: name }); names.push(name);
    } else { ids.push(sel); names.push(nameOf(sel)); }
  }
  if (new Set(names.map(n => n.toLowerCase())).size !== 4) { toast('Pick 4 different players'); return; }
  const nights = Math.max(1, Math.min(99, parseInt($('ns-nights').value, 10) || DEFAULT_SEASON_NIGHTS));
  if (!confirm(`Start Season ${prev.number + 1} with ${names.join(', ')} (${nights} nights)?`)) return;
  const pids = ids.map(x => {
    if (typeof x === 'string') return x;
    const id = newPlayerId();
    S.roster[id] = { id, name: x.newName };
    return id;
  });
  const season = makeSeason(prev.number + 1, pids, dateStr(), nights);
  S.seasons.push(season);
  S.currentSeasonId = season.id;
  S.playerIds = pids;
  S.players = pids.map(nameOf);
  save(); toast(`${season.name} started! 🎯`);
  document.querySelectorAll('.tab')[0].click();
};

window._startNight = () => {
  if (currentSeason().status !== STATUS.REGULAR) { toast(`${currentSeason().name} is over — start the next season below`); return; }
  if ((S.players || []).some(p => !p.trim())) { toast('Enter all 4 player names'); return; }
  if (!S.nightName || !S.nightName.trim()) { toast('Enter a night name first'); return; }
  S.games = []; S.rr = emptyRR(); S.bracket = emptyBracket();
  S.active = true; S.nightDate = dateStr();
  resetAddForm();
  save(); toast('Night started! 🎯');
  document.querySelectorAll('.tab')[0].click();
};

window._exportData = () => {
  const exportObj = {
    exportedAt: new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' }) + ' EDT',
    version: '2.0',
    players: S.players,
    playerIds: S.playerIds,
    roster: S.roster,
    seasons: S.seasons,
    currentSeasonId: S.currentSeasonId,
    history: S.history || [],
  };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dartnight-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Exported! 📁');
};

window._importData = input => {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.history || !data.players) { toast('Invalid export file'); return; }
      if (!confirm(`Import ${data.history.length} night(s) from ${data.exportedAt || 'unknown date'}? This will merge with existing history.`)) return;
      const newNights = applyImport(S, data);
      save(); toast(`Imported ${newNights.length} new night(s)! 🎉`);
    } catch (err) {
      toast('Failed to read file'); console.error(err);
    }
  };
  reader.readAsText(file);
  input.value = '';
};

window._setTheme = key => {
  S.theme = key;
  applyTheme(key);
  save();
  renderSetup();
  toast(`Theme updated!`);
};

window._resetAll = () => {
  if (!confirm('Erase ALL data, including every saved night, for everyone? Export first if unsure.')) return;
  replaceState(normalize(fresh())); save(); toast('Reset complete');
};
